# Web solver update: descriptive paired core comparison

Paired instrumented Web core search under the same 160 ms budget; not original browser UI latency.

Seed: 539363593; independent boards: 6; repeats: 1. No statistical PASS is claimed.

| Metric | Baseline | Candidate |
|---|---:|---:|
| Core p50 ms | 160.12 | 134.57 |
| Core p95 ms | 167.74 | 154.04 |
| Core p99 ms | 167.74 | 154.04 |
| Core max ms | 167.74 | 154.04 |
| Deadline miss rate | 100.0% | 0.0% |
| All requirements met in Top10 | 0.0% | 0.0% |
| On-time Top10 all-requirements delivery | 0.0% | 0.0% |
| Replayed endpoint errors | 0 | 0 |
| Mean legal groups in Top10 | 8.50 | 8.83 |

Paired quality outcomes: {"candidate":2,"baseline":3,"tie":1,"neither":0}.
Step-comparable pairs: 2; mean candidate minus baseline steps: 1.

- Endpoint hooks and candidate capture add symmetric instrumentation overhead; baseline interruption is cooperative at observed endpoints.
- No candidate first observed at or after 160 ms is scored; late core returns are always counted as deadline misses.
- Native pools retain their original order. An interrupted baseline snapshot may have an unflushed pending batch.
- Common portfolios are independently replayed and ranked; native pool violations are reported separately.
- No global optimum, minimum-step proof, statistical significance, or browser end-to-end latency claim is made.
- Repeated runs of one board are paired repeated measurements, not additional independent boards.
