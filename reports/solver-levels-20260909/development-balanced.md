# Solver levels comparison

Native Web solver core from ready inputs through returned Top10, using each level budget. Browser postMessage/rendering are outside this clock.

Cases: 6; independent boards: 6; repeats: 2; source unchanged: true.

| Level | Budget ms | Core p50 | Core p95 | Core max | Late | All requirements Top10 | Mean combo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lv1 | 160 | 142.08 | 143.06 | 143.06 | 0/12 | 66.67% | 6.25 |
| Lv2 | 400 | 372.16 | 380.14 | 380.14 | 0/12 | 83.33% | 6.67 |
| Lv3 | 800 | 656.14 | 776.12 | 776.12 | 0/12 | 66.67% | 6.67 |
| Lv4 | 1600 | 862.20 | 1487.49 | 1487.49 | 0/12 | 66.67% | 6.67 |
| Lv5 | 3200 | 1458.10 | 2948.00 | 2948.00 | 0/12 | 100.00% | 7.00 |

| Comparison | Higher level wins | Lower level wins | Tie | Equal-quality signature pairs | Shorter | Equal | Longer | Mean step delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lv1_to_Lv2 | 4 | 0 | 8 | 85 | 7 | 76 | 2 | -0.19 |
| Lv1_to_Lv3 | 6 | 2 | 4 | 84 | 11 | 56 | 17 | 0.71 |
| Lv2_to_Lv3 | 4 | 4 | 4 | 99 | 24 | 56 | 19 | -1.63 |
| Lv1_to_Lv4 | 8 | 2 | 2 | 78 | 23 | 30 | 25 | 0.38 |
| Lv3_to_Lv4 | 4 | 4 | 4 | 100 | 32 | 36 | 32 | -1.35 |
| Lv1_to_Lv5 | 10 | 0 | 2 | 64 | 34 | 18 | 12 | -2.75 |
| Lv4_to_Lv5 | 10 | 0 | 2 | 82 | 38 | 24 | 20 | -5.20 |

- Saved fixtures are development evidence, not a fresh holdout.
- All late/empty/error runs remain included. More budget does not certify global optimality or monotonic improvement.
- Every common Top10 signature is compared only at equal higher-priority quality; correlated groups/repeats are not independent boards.
- No observer, artificial early interruption, or substituted result pool is used.
- Cold UI delivery, device throttling, and universal hard deadlines require separate browser measurements.
