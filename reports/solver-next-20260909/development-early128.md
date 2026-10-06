# Native solver comparison

Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.

Mode: development_fixture_reuse; independent boards: 12; repeats: 2; budget: 160 ms.

| Metric | Previous version | Candidate |
|---|---:|---:|
| Core p50 ms | 134.301 | 134.025 |
| Core p95 ms | 143.827 | 142.290 |
| Core p99 ms | 150.292 | 152.547 |
| Core max ms | 150.292 | 152.547 |
| Deadline miss rate | 0.00% | 0.00% |
| All requirements met in returned Top10 | 41.67% | 25.00% |
| On-time all-requirements Top10 delivery | 41.67% | 25.00% |

Returned quality W/L/T: {"candidate":10,"baseline":12,"tie":2,"neither":0}.
On-time quality W/L/T: {"candidate":10,"baseline":12,"tie":2,"neither":0}.
All common signatures at equal quality: {"comparableGroupPairs":156,"comparableTrialPairs":24,"shorter":37,"equal":75,"longer":44,"meanBaselineSteps":8.326923076923077,"meanCandidateSteps":8.58974358974359,"pooledMeanStepDelta":0.26282051282051283,"meanOfTrialPairMeanStepDeltas":0.23030753968253967}.
Both on time, common signatures at equal quality: {"comparableGroupPairs":156,"comparableTrialPairs":24,"shorter":37,"equal":75,"longer":44,"meanBaselineSteps":8.326923076923077,"meanCandidateSteps":8.58974358974359,"pooledMeanStepDelta":0.26282051282051283,"meanOfTrialPairMeanStepDeltas":0.23030753968253967}.

- All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.
- Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.
- Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.
- Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.
- Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.
- Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.
