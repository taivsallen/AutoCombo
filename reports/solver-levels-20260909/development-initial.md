# Solver levels comparison

Native Web solver core from ready inputs through returned Top10, using each level budget. Browser postMessage/rendering are outside this clock.

Cases: 6; independent boards: 6; repeats: 1; source unchanged: false.

| Level | Budget ms | Core p50 | Core p95 | Core max | Late | All requirements Top10 | Mean combo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lv1 | 160 | 142.10 | 142.17 | 142.17 | 0/6 | 66.67% | 6.00 |
| Lv2 | 400 | 378.70 | 388.84 | 388.84 | 0/6 | 66.67% | 6.50 |
| Lv3 | 800 | 721.07 | 776.15 | 776.15 | 0/6 | 66.67% | 6.33 |
| Lv4 | 1600 | 1464.07 | 1530.63 | 1530.63 | 0/6 | 83.33% | 6.83 |
| Lv5 | 3200 | 2171.21 | 3118.29 | 3118.29 | 0/6 | 83.33% | 7.00 |

| Comparison | Higher level wins | Lower level wins | Tie | Equal-quality signature pairs | Shorter | Equal | Longer | Mean step delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lv1_to_Lv2 | 3 | 1 | 2 | 43 | 7 | 29 | 7 | -0.44 |
| Lv1_to_Lv3 | 4 | 1 | 1 | 38 | 14 | 16 | 8 | -0.74 |
| Lv2_to_Lv3 | 1 | 3 | 2 | 44 | 12 | 22 | 10 | -0.50 |
| Lv1_to_Lv4 | 5 | 0 | 1 | 34 | 21 | 9 | 4 | -4.15 |
| Lv3_to_Lv4 | 5 | 0 | 1 | 44 | 20 | 12 | 12 | -3.59 |
| Lv1_to_Lv5 | 5 | 0 | 1 | 28 | 17 | 8 | 3 | -2.50 |
| Lv4_to_Lv5 | 1 | 4 | 1 | 44 | 14 | 12 | 18 | 4.20 |

- Saved fixtures are development evidence, not a fresh holdout.
- All late/empty/error runs remain included. More budget does not certify global optimality or monotonic improvement.
- Every common Top10 signature is compared only at equal higher-priority quality; correlated groups/repeats are not independent boards.
- No observer, artificial early interruption, or substituted result pool is used.
- Cold UI delivery, device throttling, and universal hard deadlines require separate browser measurements.
