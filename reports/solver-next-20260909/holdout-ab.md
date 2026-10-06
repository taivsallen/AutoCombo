# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: fresh_generated_holdout; independent boards: 30; repeats: 3; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 136.999 | 133.291 |
| Core p95 ms | 150.075 | 142.215 |
| Core p99 ms | 163.220 | 146.466 |
| Core max ms | 163.220 | 146.466 |
| Deadline miss rate | 1.11% | 0.00% |
| All requirements met in returned Top10 | 40.00% | 45.56% |
| On-time all-requirements Top10 delivery | 40.00% | 45.56% |

Returned quality W/L/T: {"candidate":24,"baseline":15,"tie":51,"neither":0}.
On-time quality W/L/T: {"candidate":25,"baseline":14,"tie":51,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":758,"comparableTrialPairs":90,"shorter":31,"equal":612,"longer":115,"meanBaselineSteps":10.683377308707124,"meanCandidateSteps":10.905013192612138,"pooledMeanStepDelta":0.22163588390501318,"meanOfTrialPairMeanStepDeltas":0.22989417989417985}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":751,"comparableTrialPairs":89,"shorter":31,"equal":607,"longer":113,"meanBaselineSteps":10.684420772303595,"meanCandidateSteps":10.902796271637817,"pooledMeanStepDelta":0.21837549933422104,"meanOfTrialPairMeanStepDeltas":0.2260567148207597}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
