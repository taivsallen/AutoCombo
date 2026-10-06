# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: development_fixture_reuse; independent boards: 12; repeats: 2; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 131.936 | 114.556 |
| Core p95 ms | 145.938 | 142.193 |
| Core p99 ms | 148.823 | 146.519 |
| Core max ms | 148.823 | 146.519 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 41.67% | 41.67% |
| On-time all-requirements Top10 delivery | 41.67% | 41.67% |

Returned quality W/L/T: {"candidate":10,"baseline":0,"tie":14,"neither":0}.
On-time quality W/L/T: {"candidate":10,"baseline":0,"tie":14,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":191,"comparableTrialPairs":24,"shorter":13,"equal":177,"longer":1,"meanBaselineSteps":10.607329842931938,"meanCandidateSteps":10.534031413612565,"pooledMeanStepDelta":-0.07329842931937172,"meanOfTrialPairMeanStepDeltas":-0.08802910052910051}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":191,"comparableTrialPairs":24,"shorter":13,"equal":177,"longer":1,"meanBaselineSteps":10.607329842931938,"meanCandidateSteps":10.534031413612565,"pooledMeanStepDelta":-0.07329842931937172,"meanOfTrialPairMeanStepDeltas":-0.08802910052910051}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
