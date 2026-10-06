# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: development_fixture_reuse; independent boards: 12; repeats: 2; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 132.952 | 142.077 |
| Core p95 ms | 150.197 | 147.367 |
| Core p99 ms | 150.482 | 152.197 |
| Core max ms | 150.482 | 152.197 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 29.17% | 29.17% |
| On-time all-requirements Top10 delivery | 29.17% | 29.17% |

Returned quality W/L/T: {"candidate":10,"baseline":0,"tie":14,"neither":0}.
On-time quality W/L/T: {"candidate":10,"baseline":0,"tie":14,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":181,"comparableTrialPairs":24,"shorter":14,"equal":161,"longer":6,"meanBaselineSteps":7.895027624309392,"meanCandidateSteps":7.895027624309392,"pooledMeanStepDelta":0,"meanOfTrialPairMeanStepDeltas":-0.013955026455026462}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":181,"comparableTrialPairs":24,"shorter":14,"equal":161,"longer":6,"meanBaselineSteps":7.895027624309392,"meanCandidateSteps":7.895027624309392,"pooledMeanStepDelta":0,"meanOfTrialPairMeanStepDeltas":-0.013955026455026462}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
