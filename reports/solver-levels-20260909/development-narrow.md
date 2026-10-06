# Solver levels comparison

Native Web solver core from ready inputs through returned Top10, using each level budget. Browser postMessage/rendering are outside this clock.

Cases: 6; independent boards: 6; repeats: 1; source unchanged: true.

| Level | Budget ms | Core p50 | Core p95 | Core max | Late | All requirements Top10 | Mean combo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lv1 | 160 | 142.07 | 142.08 | 142.08 | 0/6 | 66.67% | 6.33 |
| Lv2 | 400 | 358.51 | 381.35 | 381.35 | 0/6 | 83.33% | 6.67 |
| Lv3 | 800 | 461.34 | 635.28 | 635.28 | 0/6 | 83.33% | 6.67 |
| Lv4 | 1600 | 475.66 | 670.28 | 670.28 | 0/6 | 83.33% | 6.67 |
| Lv5 | 3200 | 480.33 | 674.05 | 674.05 | 0/6 | 83.33% | 6.67 |

| Comparison | Higher level wins | Lower level wins | Tie | Equal-quality signature pairs | Shorter | Equal | Longer | Mean step delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lv1_to_Lv2 | 2 | 0 | 4 | 44 | 1 | 43 | 0 | -0.09 |
| Lv1_to_Lv3 | 2 | 0 | 4 | 41 | 6 | 35 | 0 | -0.44 |
| Lv2_to_Lv3 | 0 | 0 | 6 | 55 | 5 | 50 | 0 | -0.25 |
| Lv1_to_Lv4 | 2 | 0 | 4 | 41 | 6 | 35 | 0 | -0.44 |
| Lv3_to_Lv4 | 0 | 0 | 6 | 58 | 1 | 57 | 0 | -0.02 |
| Lv1_to_Lv5 | 2 | 0 | 4 | 41 | 7 | 34 | 0 | -0.51 |
| Lv4_to_Lv5 | 0 | 0 | 6 | 58 | 1 | 57 | 0 | -0.05 |

- Saved fixtures are development evidence, not a fresh holdout.
- All late/empty/error runs remain included. More budget does not certify global optimality or monotonic improvement.
- Every common Top10 signature is compared only at equal higher-priority quality; correlated groups/repeats are not independent boards.
- No observer, artificial early interruption, or substituted result pool is used.
- Cold UI delivery, device throttling, and universal hard deadlines require separate browser measurements.
