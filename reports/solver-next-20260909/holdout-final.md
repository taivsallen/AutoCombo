# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: fresh_generated_holdout; independent boards: 30; repeats: 3; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 133.001 | 110.547 |
| Core p95 ms | 147.795 | 142.140 |
| Core p99 ms | 150.385 | 148.553 |
| Core max ms | 150.385 | 148.553 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 30.00% | 30.00% |
| On-time all-requirements Top10 delivery | 30.00% | 30.00% |

Returned quality W/L/T: {"candidate":6,"baseline":0,"tie":84,"neither":0}.
On-time quality W/L/T: {"candidate":6,"baseline":0,"tie":84,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":785,"comparableTrialPairs":90,"shorter":11,"equal":765,"longer":9,"meanBaselineSteps":11.489171974522293,"meanCandidateSteps":11.489171974522293,"pooledMeanStepDelta":0,"meanOfTrialPairMeanStepDeltas":0.0017548500881834203}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":785,"comparableTrialPairs":90,"shorter":11,"equal":765,"longer":9,"meanBaselineSteps":11.489171974522293,"meanCandidateSteps":11.489171974522293,"pooledMeanStepDelta":0,"meanOfTrialPairMeanStepDeltas":0.0017548500881834203}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
