# ComboAuto performance evaluator

For the September Web solver update, use
`node tools/compare_web_solver_update.mjs --boards 5 --repeats 3` to compare
the frozen pre-update inline solver with the current one. This wrapper extracts
the actual `src/App.jsx` solver, replays candidates independently, records source
hashes, and reports native Top10 ordering separately. It is an instrumented core
experiment, not browser latency. Use `node tools/compare_solver_oracle.mjs` for
small bounded exact comparisons. The complete measurement protocol is in
`reports/solver-update-20260909/MEASUREMENT_PROTOCOL.md`.

`perf_eval.py` compares baseline/candidate attempts on identical cases and
seeds. It checks protocol consistency and path shape, then applies conservative
regression gates. **It does not independently replay game rules, eliminations,
shield shapes, ordered partial requirements, or Top10 results. A `PASS` here is
not a correctness or global-optimality certificate.**

## Start the graphical interface

From the repository root:

```powershell
python tools/perf_eval.py
```

Enter two long-lived adapter commands, for example:

```powershell
python tools/perf_eval_demo_adapter.py --variant baseline
python tools/perf_eval_demo_adapter.py --variant candidate
```

The old demo adapter is not a solver and omits paths. It now deliberately fails
strict validation; it cannot support an improvement claim. To smoke-test the
evaluator and real JavaScript warmup calls, run:

```powershell
python -B -m unittest discover -s tools -p test_perf_eval.py -v
```

## Benchmark the current inline App solver

The current `beamSolve` still lives inside `src/App.jsx`, so the app also has
a development-only paired benchmark that exercises that exact function. Start
Vite and open one of these URLs:

```text
http://127.0.0.1:5173/AutoCombo/?solverBench=1
http://127.0.0.1:5173/AutoCombo/?solverBench=full
http://127.0.0.1:5173/AutoCombo/?solverBench=settings
http://127.0.0.1:5173/AutoCombo/?solverBench=shields
http://127.0.0.1:5173/AutoCombo/?solverBench=levels
```

`solverBench=1` runs a short, three-repeat timing check. `solverBench=full`
runs 18 independent boards across ordinary Combo, steps, direction,
no-diagonal, exact/at-least/connected requirements, representative special
shields, exact initial-Combo targets, hard step limits, and combined settings.
Both variants receive the same board, seed, budget, and interleaved
execution order. The full matrix reports settings achievement separately from
target-Combo success, plus paired wins/losses and common-success step deltas.
`solverBench=settings` is the faster diagnostic subset containing every
priority-clear requirement, initial-Combo combination, and hard-step-limit
combination. It is intended for tuning requirement-preserving portfolio quotas
before paying for another full matrix.

`solverBench=shields` exhaustively covers the six active shield types in every
unordered selection of one, two, or three slots (41 combinations). The seventh
UI choice is `none`; ordinary scenarios cover the zero-shield case. Shield
fixtures guarantee enough orb stock without pre-solving the requested shape.
The browser report also includes normalized mean shield progress and
bottleneck-shield progress for incomplete cases. These are diagnostics only and
never count as a completed requirement.
`solverBench=levels` exercises all five complete performance policies at scaled
budgets so level behavior can be compared without waiting for production-size
node ceilings.

Use the App benchmark while the solver remains inline. If `beamSolve` is later
extracted to an importable module, point the Python evaluator at that module
through `perf_eval_adapter.mjs` to gain bootstrap confidence intervals and the
full 73-stratum gate suite. This includes all 15 two-shield and 20 three-shield
type combinations generated from the scenario matrix.

## Run from the command line

```powershell
python tools/perf_eval.py --run `
  --baseline "python tools/perf_eval_demo_adapter.py --variant baseline" `
  --candidate "python tools/perf_eval_demo_adapter.py --variant candidate" `
  --boards 8 --repeats 3 --warmup 2 `
  --out reports/perf_eval_latest.json
```

The evaluator uses the same cases, seed, board and scenario for both solver
processes. Execution order is interleaved and rotated so one solver does not
always pay the first-run or thermal cost.

## Adapter protocol

The adapter is a persistent process. Read one JSON request per line from
stdin, then write one JSON response per line to stdout. Send logs to stderr.

Required response fields:

```json
{
  "case_id": "b0001:ordinary_combo",
  "legal": true,
  "requirements_satisfied": true,
  "special_satisfied": true,
  "initial_satisfied": true,
  "combo": 1,
  "initialCombos": 1,
  "skyfallCombos": 0,
  "steps": 1,
  "path": [[1, 0], [1, 1]],
  "success": true,
  "nodes": 12345,
  "runtime_ms": 123.4
}
```

`success` is checked against the hard fields. If it says true while legality,
requirements, special conditions, an enabled initial-Combo target, a hard step
limit, or target Combo are not satisfied, the case is recorded as a false
success and the candidate fails the hard gate. `initial_satisfied` is required
only for scenarios containing `init_target_combo`; the step-limit result is
recomputed from `steps` and `max_steps`. A nonempty `path` is mandatory for a
candidate result, coordinates must be integral JSON numbers within the board,
successive coordinates must be adjacent, and `steps` must equal
`path.length - 1`. A one-point path represents zero steps. Fractional values
are rejected rather than rounded. These checks do **not** establish row0,
diagonal permissions, marks, exchanges, or elimination legality.

An unsuccessful search may return `{"found": false, "success": false}` or
`{"status": "no_candidate", "success": false}` without a path. This is a valid
unsuccessful trial, counted in the denominator, not a fabricated solved board.
An `error` response always prevents success even if its other fields say true.

The optional `initialCombos`/`skyfallCombos` (also snake_case) pair identifies a
combo group; their sum must equal total `combo`. Only matched attempts with
the same group and same reported constraint outcomes compete on step count.
Without both group fields, step improvement is unavailable. Equal totals with
different splits, such as `7+1` and `6+2`, never qualify as same-group reduction.

For JavaScript solver modules, use:

```powershell
node tools/perf_eval_adapter.mjs --module path/to/solver-module.mjs
```

The module must export `solveCase(request)` or a default function. The current
inline solver in `src/App.jsx` is not yet an importable adapter module; it must
be extracted or wrapped before it can be compared directly. The adapter calls
`solveCase` for warmup requests too; the solver must perform its normal work
when `warmup` is true. The flag excludes those calls from measurement, not from
execution. Warmup errors abort the run.

`core_runtime_ms` (preferred), `runtime_ms`, `elapsed_ms`, or `elapsedMs` are
**solver-reported core timing**. The Node adapter preserves that value and adds
its own `adapter_wall_ms`; it never substitutes its elapsed time into a missing
core time. The evaluator separately records `wall_ms`, measured around process
request/response including IPC. All raw response fields, including `stats`,
remain in the JSON report.

## What is measured

The report contains overall, per-stratum and per-case paired results:

- hard success rate and feasible rate;
- first-repeat, all-repeat and any-repeat success rates;
- p50/p95/p99 wall time;
- median and mean Combo among usable results;
- paired-per-trial combo deltas and same-group step deltas (primary);
- best-of-R maximum combo and steps per case (diagnostic only);
- errors, timeouts, illegal returns, invalid protocol responses;
- false success reports and node/step budget violations;
- repeated-case instability;
- bootstrap confidence intervals clustered by source board, keeping repeats
  and scenarios from the same board together;
- `latency.process_wall`, `latency.adapter_wall`, and `latency.reported_core`,
  each with coverage, p50/p95/p99/max, result-delivery and success rates at 160ms.

Missing core timing is unknown, not zero. Deadline rates retain all trials in
the denominator; missing or late timings cannot count as success. The report
labels core values as self-reported. Process and adapter measurements are not
browser end-to-end measurements and cannot certify Web delivery within 160ms.
`no_candidate` can count as an on-time response but cannot count as an on-time
candidate or successful solution.

The comparison pairs `(case_id, repeat, seed)` before aggregating. It blocks
promotion on any observed constraint, success, usable-result, comparable combo,
or same-group step regression. This intentionally conservative policy does not
allow an improvement on another board or a lower-priority metric to hide a loss.
Detailed partial requirement-priority vectors require the separate game verifier;
this evaluator currently compares the reported condition booleans.

The retained **best-of-R diagnostic** metric follows:

```text
requirements/specials present:
    only feasible results compete on (maximum Combo, minimum steps)
no requirements/specials:
    legal results compete on (maximum Combo, minimum steps)
```

## Anti-false-optimization gates

The evaluator does not produce one artificial weighted score. By default a
candidate fails if it returns errors, invalid responses, path-shape failures,
false successes, budget violations, unmatched/duplicate trials, or any paired
quality regression. Important strata list their own regressions even when the
overall average improves. The default aggregate success tolerances are zero.
An invalid baseline makes improvement claims inconclusive until repaired.

After those hard checks pass, a run is `PASS` only if at least one practical
improvement is visible:

- success rate improves by at least 1 point;
- paired combo improves by at least 0.25 on comparable attempts;
- steps at the same initial+skyfall group fall by at least 1;
- p95 latency falls by at least 10% without a quality regression.

If a higher-priority success/quality objective improves but p95 latency grows
by more than 10%, the run is `PASS_WITH_TRADEOFF`, not a silent pass. Otherwise
the run is `INCONCLUSIVE`, not a promotion. Inspect the paired case and stratum
tabs before changing the solver.

The old JSON keys such as `mean_max_combo_delta`,
`mean_steps_at_max_combo_delta`, and `paired_cases` remain for compatibility and
are explicitly diagnostic. New decisions use `paired_trials`,
`paired_mean_combo_delta`, and `paired_mean_steps_same_signature_delta`.
Same-total best-of-R step differences are separately exposed as
`same_total_best_steps_diagnostic_delta` and cannot trigger a step gain.
The GUI labels best-of-R summaries as diagnostic; the failure pane records the
independent-verification limitation on every run.

Freeze both versions' source/configuration/model files and hashes before A/B
runs. Keep tuning data separate from the evaluation suite. This tool records
the case fingerprint and commands, but does not automatically snapshot source
or verify that a named baseline is the previous released version.

## Extending the matrix

Edit `tools/perf_eval_scenarios.json`. The default matrix includes ordinary,
steps, no-skyfall, no-diagonal, horizontal/vertical, row0, exact/at-least
requirements, connected/min-clear rules, shape/rectangle/equal-first/clear
count specials, and X/Q/N marked cases.

Mark a scenario as `"important": true` when its success rate must never be
traded away for a nicer average. Add new scenarios instead of replacing old
ones; otherwise a regression can disappear simply because the failing stratum
was removed.
