# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: development_fixture_reuse; independent boards: 12; repeats: 2; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 133.640 | 137.030 |
| Core p95 ms | 144.681 | 145.211 |
| Core p99 ms | 145.956 | 145.250 |
| Core max ms | 145.956 | 145.250 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 41.67% | 33.33% |
| On-time all-requirements Top10 delivery | 41.67% | 33.33% |

Returned quality W/L/T: {"candidate":13,"baseline":10,"tie":1,"neither":0}.
On-time quality W/L/T: {"candidate":13,"baseline":10,"tie":1,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":145,"comparableTrialPairs":24,"shorter":43,"equal":70,"longer":32,"meanBaselineSteps":8.358620689655172,"meanCandidateSteps":8.055172413793104,"pooledMeanStepDelta":-0.30344827586206896,"meanOfTrialPairMeanStepDeltas":-0.39250992063492074}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":145,"comparableTrialPairs":24,"shorter":43,"equal":70,"longer":32,"meanBaselineSteps":8.358620689655172,"meanCandidateSteps":8.055172413793104,"pooledMeanStepDelta":-0.30344827586206896,"meanOfTrialPairMeanStepDeltas":-0.39250992063492074}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
