# Web solver update: descriptive paired core comparison

Paired instrumented Web core search under the same 160 ms budget; not original browser UI latency.

Seed: 539363594; independent boards: 30; repeats: 3. No statistical PASS is claimed.

| Metric | Baseline | Candidate |
|---|---:|---:|
| Core p50 ms | 160.09 | 133.92 |
| Core p95 ms | 166.16 | 146.24 |
| Core p99 ms | 200.05 | 174.67 |
| Core max ms | 200.05 | 174.67 |
| Deadline miss rate | 100.0% | 1.1% |
| All requirements met in Top10 | 6.7% | 32.2% |
| On-time Top10 all-requirements delivery | 0.0% | 32.2% |
| Replayed endpoint errors | 0 | 0 |
| Mean legal groups in Top10 | 8.46 | 8.86 |

Paired quality outcomes: {"candidate":61,"baseline":24,"tie":5,"neither":0}.
Step-comparable pairs: 8; mean candidate minus baseline steps: 6.

- Endpoint hooks and candidate capture add symmetric instrumentation overhead; baseline interruption is cooperative at observed endpoints.
- No candidate first observed at or after 160 ms is scored; late core returns are always counted as deadline misses.
- Native pools retain their original order. An interrupted baseline snapshot may have an unflushed pending batch.
- Common portfolios are independently replayed and ranked; native pool violations are reported separately.
- On-time delivery metrics require a successful native return and inspect its actual returned Top10, not the independently reconstructed research portfolio.
- No global optimum, minimum-step proof, statistical significance, or browser end-to-end latency claim is made.
- Case feasibility has not been proven; an unsuccessful search does not establish that its requirements are impossible.
- Repeated runs of one board are paired repeated measurements, not additional independent boards.
