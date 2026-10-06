# Phase 1 Policy / Value / Target pipeline

Phase 1 keeps the existing Web Beam solver as the exact teacher and verifier.
The learned model is an optional prior: it ranks cheap move candidates, while
legal transitions, hard requirements, cascade evaluation, and final success
still come from the symbolic solver.

## Generate Teacher data

```powershell
node generate_teacher_dataset.mjs `
  --output teacher_data_policy_mixed `
  --prefix mixed `
  --scenario-file tools/policy_scenarios.json `
  --boards 5000 `
  --states-per-board 8 `
  --beam-width 120 `
  --max-nodes 20000 `
  --progress-every 100
```

Schema `comboauto.teacher.policy-value-target.v1` adds:

- `route` and `actions` for the teacher solution;
- `action_target` and soft `policy_target` over the eight directions;
- `value_target` for final combo, initial combo, clears, and route length;
- `terminal.board` and `terminal.initialClearMask` for the auxiliary target head;
- `scenario_id`, `priority`, `rule_profile`, and requirement completion labels;
- special fields remain reserved until the Teacher has an exact special verifier.

The default generator now uses a balanced scenario matrix when no scenario
flags are supplied. `tools/policy_scenarios.json` is an explicit, reproducible
matrix covering orthogonal/diagonal movement, skyfall, connected clears,
per-orb minimum clears, and initial combo-size requirements. Use
`--scenario-file` to provide a different matrix.
Dataset splits use `scenario-stratified-v1`: every scenario is assigned its own
deterministic 80/10/10 train/valid/test partition, so adding scenarios cannot
silently remove them from validation or test.

## Train and export ONNX

```powershell
python train_policy_value_target.py `
  --train teacher_data_policy/policy.train.jsonl `
  --valid teacher_data_policy/policy.valid.jsonl `
  --test teacher_data_policy/policy.test.jsonl `
  --checkpoint training_runs/policy_value_target.pt `
  --onnx public/policy_value_target.onnx
```

For mixed or intentionally imbalanced scenario data, enable inverse-frequency
sampling without changing the validation or test distribution:

```powershell
python train_policy_value_target.py `
  --train teacher_data_policy_mixed/mixed.train.jsonl `
  --valid teacher_data_policy_mixed/mixed.valid.jsonl `
  --test teacher_data_policy_mixed/mixed.test.jsonl `
  --checkpoint training_runs/policy_value_target_mixed_balanced.pt `
  --onnx public/policy_value_target_mixed_balanced.onnx `
  --scenario-sampling balanced
```

Training summaries now include dataset counts and validation/test metrics
grouped by `scenario_id`. Use those groups to identify a scenario regression
before considering a Web benchmark gate.

The exported model has one input, `state_features`, and four outputs:

```text
policy_logits       [batch, 8]
value_vector        [batch, 4]
target_board_logits [batch, 30, 6]
target_clear_logits [batch, 30]
```

## Web runtime behavior

`src/learnedPolicyRuntime.js` lazy-loads
`public/policy_value_target_expanded_stratified_balanced.onnx` for the current
production canary and falls back to `public/policy_value_target.onnx` if the
candidate model cannot be loaded. Inference failures still fall back to the
symbolic Beam guidance path.
At each Beam round it predicts a bounded batch of states and adds a small
top-k action prior to cheap move ranking. The exact Beam remains responsible
for transition legality and terminal verification. If the model file is
missing, incompatible, or throws during inference, the runtime disables itself
for the session and the solver continues with the existing symbolic guidance.

When the active rule profile contains hard requirements, the default
`learnedPolicyRequirementGate` disables the learned prior for that solve. The
symbolic Beam still runs normally, so requirement satisfaction remains governed
by exact rule evaluation. Set it to `false` only for an explicit experiment.
The separate `requirementSafeMode` additionally disables deferred board
materialization and cheap local guidance for those solves, keeping their search
budget aligned with the baseline symbolic path.

For non-requirement solves, the prior is also confidence-gated by default:
`learnedPolicyMinConfidence` is `0.5` and `learnedPolicyMinMargin` is `0.25`.
Predictions below either threshold contribute zero bias and the symbolic cheap
score is used unchanged. The default `learnedPolicyBatchSize` is `48`, which
also caps the number of states sent to ONNX in each Beam refresh; later states
fall back to symbolic ranking for a bounded latency budget.

Use `learnedPolicy: false` in a solver config to force the legacy path for
paired benchmarks.

The development benchmark is available at `?solverBench=1`; it runs the same
fixed boards with baseline plus learned-policy weights 160/80/40 and reports
overall and per-scenario metrics. This sweep is a measurement tool only; it
does not replace the default Web model or runtime settings. Treat a pilot
model's benchmark as a gate, not as proof of generalization: expand the
scenario and board distributions before replacing the deployed model.
Use `?solverBench=1&solverBenchSet=holdout` for the six-board holdout fixture;
the default `solverBenchSet=calibration` is the smaller tuning set.
Use `?solverBench=1&solverBenchSet=solvable` for the 36-board deterministic
near-target fixture (six seed boards plus 30 generated variants); this fixture
checks that the solver can complete known-easy cases before using success-rate
non-regression as a model gate.
Use `?solverBench=1&solverBenchSet=mixed` for the 24-board development mixed
holdout (six random holdout boards plus 18 deterministic solvable variants).
It uses the same solvable scenario definitions as the solvable fixture, so the
result includes both ordinary hard boards and known-easy boards in one run.
Use `?solverBench=1&solverBenchSet=corpus&solverBenchBoards=24` for an evenly
spaced sample from the existing `fixed_test_suite.json` corpus of 4,000 fixed
random boards. `solverBenchBoards` is clamped to 12–96; this is a development
corpus, not captured production traffic, and is not bundled into normal Web
runtime execution.
Use `?solverBench=1&solverBenchSet=teacher-test&solverBenchBoards=24` to load
the held-out `expanded_stratified.test.jsonl` data, deduplicate its
`board_filled` states, and sample boards with the same protocol. This measures
held-out training-distribution generalization; it is still synthetic data, not
captured user traffic.
Use `?solverBench=1&solverBenchSet=external&solverBenchCorpus=solver-bench/real.json`
to load a same-origin JSON or JSONL corpus from `public/solver-bench/` relative
to the current Web base path. Each
entry may be a 6×6 nested array, a flat 36-value array, or an object containing
`board` / `board_filled`. Invalid rows are skipped and duplicate boards are
removed before sampling. Run `node tools/validate_solver_bench_corpus.mjs
<path>` before using a real corpus.
To extract initial-state boards from the held-out full teacher JSONL into a
Web-served corpus, run:
`node tools/extract_solver_bench_corpus.mjs teacher_data_full/full200k.test.jsonl
public/solver-bench/full200k_test_initial.jsonl --state-index=0`.
For a board-phase-stratified production-like proxy, run:
`node tools/build_production_like_solver_corpus.mjs
teacher_data_full/full200k.test.jsonl
public/solver-bench/full200k_test_phase_stratified_proxy.jsonl
--boards=48 --state-indices=0,4,8,12`.
This proxy samples evenly spaced source boards and includes initial, early, mid,
and late trajectory states. It is not captured user traffic; use it to detect
state-distribution sensitivity before collecting real Web telemetry.
The Web UI also exposes an opt-in local capture panel. It is off by default and
does not upload samples: the user must enable `本機樣本記錄（不上傳）`. Enabled samples are kept in this browser's local storage until the user clears them.
and press `記錄目前盤面`. `下載 JSONL` exports only the samples kept in the
local browser storage; `複製 JSONL` copies the same content to the clipboard after an
explicit click. Each row uses `schema_version: 1`, a flat 36-value `board`, solver
settings, normalized `rule_profile`, and local result metadata. New captures
also include `skyfall_combos` and `total_combos` so target checks remain
interpretable. Reloading the
page restores the saved sample list; clearing the samples removes the local copy.
An optional `按下求解時自動記錄` checkbox records after a user-initiated solve
finishes; it is disabled unless the main local-capture opt-in is enabled and
resets when that opt-in is turned off.
The dev-only `Proxy 批次（合成資料）` control can run 30–100 random boards
using the current solver settings. It is useful for pipeline smoke tests and
distribution-sensitivity checks, but its output must not be treated as real
Web traffic for the production gate.
Validate a downloaded Web export with:
`node tools/validate_web_corpus_export.mjs <web-corpus.jsonl>`.
The validator reports malformed rows, duplicate-board rate, solver-setting
distribution, and whether at least 12 unique boards are ready for benchmark
sampling.
The checked-in format example is
`tools/fixtures/web_corpus_export.sample.jsonl`; it is intentionally only one
board and therefore reports `readyForBenchmark: false`.
To combine multiple validated sessions and deduplicate boards, run:
`node tools/merge_web_corpus_exports.mjs public/solver-bench/real_web.jsonl
capture-a.jsonl capture-b.jsonl --dedupe=board`.
For a single preparation step that merges, validates, and enforces the minimum
12-unique-board benchmark gate, run:
`node tools/prepare_web_corpus.mjs public/solver-bench/real_web.jsonl
capture-a.jsonl capture-b.jsonl`.
To compare the currently available proxy reports, run:
`node tools/compare_policy_benchmark_reports.mjs
reports/policy_external_full200k_yield_24x3_20260810.json
reports/policy_phase_stratified_proxy_20260810.json
reports/policy_distribution_sensitivity_20260810.json`.
Add `solverBenchRuns=5` to repeat the benchmark five times in the same page and
include `runSummaries` alongside the aggregate summary. These are repeated runs,
not independent browser runtime sessions; reload the page between runs when
measuring model or session initialization effects.
The dev benchmark enables solver yielding by default so long runs keep the Web
page responsive; use `solverBenchYield=0` only for a pure throughput comparison.
For this set, the output includes a `gate` object that evaluates every candidate
weight against the same criteria: success rate must not regress, requirement rate
must not regress, and p95 must stay within 110% of baseline. `trackedVariant`
tracks `candidate_w80` for the current production canary; `passingVariants`
and `recommendedVariant` expose passing candidates. The recommendation ranks
success rate first, then p95 latency, then lower learned-policy weight.
The benchmark only reports a recommendation; it does not automatically change
the Web default weight or model.
For a dev-only candidate model comparison, add
`policyModel=<filename>.onnx` remains available in development for comparing
another same-origin model. Without this parameter, the runtime uses the
expanded-stratified model above. The configured production canary weight is
`80`; a development-only `learnedPolicyWeight` query parameter can still
override it for comparison. The old model remains the load-time fallback and
the symbolic solver remains the inference-time fallback.
For example, a development benchmark can explicitly select the canary with
`?solverBench=1&solverBenchSet=calibration&policyModel=policy_value_target_expanded_stratified_balanced.onnx&learnedPolicyWeight=80`.
