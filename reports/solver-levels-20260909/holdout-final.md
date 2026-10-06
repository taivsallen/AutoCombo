# Solver levels comparison

Native Web solver core from ready inputs through returned Top10, using each level budget. Browser postMessage/rendering are outside this clock.

Cases: 12; independent boards: 12; repeats: 3; source unchanged: true.

| Level | Budget ms | Core p50 | Core p95 | Core max | Late | All requirements Top10 | Mean combo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Lv1 | 160 | 142.07 | 142.14 | 144.71 | 0/36 | 19.44% | 6.11 |
| Lv2 | 400 | 380.08 | 382.96 | 383.30 | 0/36 | 41.67% | 6.56 |
| Lv3 | 800 | 557.26 | 683.52 | 759.38 | 0/36 | 58.33% | 6.75 |
| Lv4 | 1600 | 1442.44 | 1562.40 | 1562.87 | 0/36 | 58.33% | 6.33 |
| Lv5 | 3200 | 1573.89 | 2313.52 | 2326.22 | 0/36 | 58.33% | 6.33 |

| Comparison | Higher level wins | Lower level wins | Tie | Equal-quality signature pairs | Shorter | Equal | Longer | Mean step delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lv1_to_Lv2 | 22 | 0 | 14 | 234 | 20 | 214 | 0 | -0.32 |
| Lv1_to_Lv3 | 30 | 0 | 6 | 196 | 45 | 151 | 0 | -0.81 |
| Lv2_to_Lv3 | 16 | 0 | 20 | 301 | 40 | 261 | 0 | -0.39 |
| Lv1_to_Lv4 | 30 | 6 | 0 | 139 | 57 | 46 | 36 | 1.55 |
| Lv3_to_Lv4 | 27 | 9 | 0 | 214 | 123 | 42 | 49 | -6.26 |
| Lv1_to_Lv5 | 30 | 6 | 0 | 138 | 57 | 46 | 35 | 1.46 |
| Lv4_to_Lv5 | 3 | 0 | 33 | 344 | 12 | 332 | 0 | -0.03 |

- Saved fixtures are development evidence, not a fresh holdout.
- All late/empty/error runs remain included. More budget does not certify global optimality or monotonic improvement.
- Every common Top10 signature is compared only at equal higher-priority quality; correlated groups/repeats are not independent boards.
- No observer, artificial early interruption, or substituted result pool is used.
- Cold UI delivery, device throttling, and universal hard deadlines require separate browser measurements.
