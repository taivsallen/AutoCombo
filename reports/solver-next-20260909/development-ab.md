# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: development_fixture_reuse; independent boards: 12; repeats: 2; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 133.351 | 133.401 |
| Core p95 ms | 145.091 | 142.201 |
| Core p99 ms | 146.072 | 142.224 |
| Core max ms | 146.072 | 142.224 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 41.67% | 41.67% |
| On-time all-requirements Top10 delivery | 41.67% | 41.67% |

Returned quality W/L/T: {"candidate":10,"baseline":1,"tie":13,"neither":0}.
On-time quality W/L/T: {"candidate":10,"baseline":1,"tie":13,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":194,"comparableTrialPairs":24,"shorter":11,"equal":164,"longer":19,"meanBaselineSteps":9.654639175257731,"meanCandidateSteps":9.860824742268042,"pooledMeanStepDelta":0.20618556701030927,"meanOfTrialPairMeanStepDeltas":0.18521825396825395}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":194,"comparableTrialPairs":24,"shorter":11,"equal":164,"longer":19,"meanBaselineSteps":9.654639175257731,"meanCandidateSteps":9.860824742268042,"pooledMeanStepDelta":0.20618556701030927,"meanOfTrialPairMeanStepDeltas":0.18521825396825395}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
