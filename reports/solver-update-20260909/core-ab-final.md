# Web solver update: descriptive paired core comparison

Paired instrumented Web core search under the same 160 ms budget; not original browser UI latency.

Seed: 539363593; independent boards: 30; repeats: 3. No statistical PASS is claimed.

| Metric | Baseline | Candidate |
|---|---:|---:|
| Core p50 ms | 160.09 | 130.03 |
| Core p95 ms | 169.70 | 140.49 |
| Core p99 ms | 191.02 | 150.41 |
| Core max ms | 191.02 | 150.41 |
| Deadline miss rate | 100.0% | 0.0% |
| All requirements met in Top10 | 16.7% | 32.2% |
| On-time Top10 all-requirements delivery | 0.0% | 32.2% |
| Replayed endpoint errors | 0 | 0 |
| Mean legal groups in Top10 | 8.63 | 9.16 |

Paired quality outcomes: {"candidate":53,"baseline":34,"tie":3,"neither":0}.
Step-comparable pairs: 19; mean candidate minus baseline steps: 2.473684210526316.

- Endpoint hooks and candidate capture add symmetric instrumentation overhead; baseline interruption is cooperative at observed endpoints.
- No candidate first observed at or after 160 ms is scored; late core returns are always counted as deadline misses.
- Native pools retain their original order. An interrupted baseline snapshot may have an unflushed pending batch.
- Common portfolios are independently replayed and ranked; native pool violations are reported separately.
- On-time delivery metrics require a successful native return and inspect its actual returned Top10, not the independently reconstructed research portfolio.
- No global optimum, minimum-step proof, statistical significance, or browser end-to-end latency claim is made.
- Case feasibility has not been proven; an unsuccessful search does not establish that its requirements are impossible.
- Repeated runs of one board are paired repeated measurements, not additional independent boards.
