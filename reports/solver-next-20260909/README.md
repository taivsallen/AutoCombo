# Web 求解器第二輪：效能改善與完整比較

本輪已完成排序與配置成本優化、限時收尾調整及兩階段路徑縮短。**相較上次交付版，核心中位時間下降 16.9%，p95 下降 3.8%；本批 90 次都在 160ms 內。全需求達成率及共同分組平均步數持平，尚不能宣稱全面改善或全域最短。**

## 範圍與版本

- 平台：Web；延續 160ms 到時交付最佳已找到解。沒有修改 Android／iOS 求解核心，也沒有新增套件。
- 保持已確認的 row0、標記、消除門檻、需求優先序、形狀盾、斜轉二選一與疊消規則。
- 前版為上次交付的快照 `baseline/App.jsx`，SHA-256：`cf02dfa0e8701bfb5083c052e6bf1244272fee73845e4fb4ec523e3edd70c7ca`，相依求解模組也已凍結。
- 最終版為 `src/App.jsx`，SHA-256：`9326b1bc2472004edefd81afad2d8bc03cdcd19477c521ffa026ac00fc9b85e2`。
- 正式 Web 驗證載入的 bundle 為 `index-Be_cmFID.js`。程式與相依模組雜湊記錄於比較 JSON，量測期間來源未變更。
- 核心環境：Windows x64、Intel Core i5-9300H、Node 24.11.1。瀏覽器為 Codex 內建瀏覽器，未擷取確切引擎版號。

## 最終配對實驗

使用 30 個全新盤面，涵蓋普通、不斜轉、不疊消、row0 與標記、排序需求、形狀盾六種情境；每盤重複三次，共 90 組配對、180 次求解。前後版使用相同輸入、設定與種子，暖機後交錯 A/B、B/A 執行。兩版都使用自己的原生截止與 Top10，沒有加端點觀察器或人工強制中斷。核心時間不含 React 與 DOM 提交。

新盤排除既有固定資料、先前報告及中間實驗出現過的盤面；原始盤面、排除來源、排程、雜湊與逐次結果均已保存。正式證據為 [holdout-final.md](holdout-final.md) 與 [holdout-final.json](holdout-final.json)。

| 指標 | 上次交付版 | 本輪最終版 | 本次差異 |
|---|---:|---:|---|
| 核心中位時間 | 133.001ms | 110.547ms | 降低 16.88% |
| 核心 p95 | 147.795ms | 142.140ms | 降低 3.83% |
| 核心最慢 | 150.385ms | 148.553ms | 本批均低於 160ms |
| 超過 160ms | 0/90 | 0/90 | 持平，並非硬保證 |
| Top10 找到全需求解 | 27/90，30% | 27/90，30% | 持平 |
| 最佳解嚴格順位勝／負／平 | — | 6／0／84 | 新版 6 次較好 |
| 平均合法分組數 | 9.322 | 9.333 | 不足十組時不湊數 |
| 同品質共同分組平均步數 | 11.489 | 11.489 | 持平 |
| 原生 Top10 非法／重複／排序違規 | 全部 0 | 全部 0 | 獨立重播檢查 |

品質比較遵循合法性、按順序的符石需求、解盾、首消目標、總 combo，再比較步數。較低順位的 combo 增加不能抵銷較高順位需求的退步。

步數比較包含所有共同的 `首消+疊消` 分組，並要求更高層需求結果相同；例如 `7+1` 不會與 `6+2` 配成縮步比較。本次共 785 個可比較分組對：**11 個更短、765 個相同、9 個更長**。所以 Top1 沒有輸，不代表每個 Top10 分組都進步；這些分組也不是 785 個獨立盤面。

排序需求及形狀盾情境在本批都未找到全需求解。這些隨機題尚未證明可解，不能把失敗標為無解，也不能用全部題目的 30% 直接當作「可解題召回率」。

## 不確定性與統計方法

以原始顏色盤面為群組做 5,000 次配對 bootstrap，將同盤的重複量測保留在一起，共 30 個獨立群組。詳見 [cluster-bootstrap.json](cluster-bootstrap.json)。

| 指標 | 觀測值 | 95% bootstrap 區間 |
|---|---:|---:|
| 中位時間降低比例 | 16.88% | 3.75%～25.05% |
| p95 降低比例 | 3.83% | 0.71%～5.08% |
| 品質淨勝率 | +6.67 個百分點 | +1.11～+14.44 個百分點 |
| 每配對平均分組步數差，新版減前版 | +0.00175 步 | -0.03117～+0.03292 步 |

步數區間包含 0，沒有建立平均縮步改善。全需求達成差的 bootstrap 區間是退化的 `[0,0]`，因本批每一對的達成結果相同；這不代表未來盤面必然相等。以上區間只描述本題集與裝置，沒有做跨裝置推論，也沒有宣告整體升級驗收通過。

## 正式 Web 結果就緒時間

另外在 production 頁面依序操作七次，包括首次求解、隨機盤面、斜轉及疊消開關，沒有同時執行核心基準。計時分成三段：核心求解、呼叫端取得結果、結果 DOM 在 `useLayoutEffect` 提交完成。

| 計時範圍 | 中位時間 | 最慢 | 超過 160ms |
|---|---:|---:|---:|
| 核心求解 | 127.4ms | 131.4ms | 0/7 |
| 請求至取得結果 | 140.5ms | 142.4ms | 0/7 |
| 請求至結果 DOM 就緒 | 145.2ms | 151.7ms | 0/7 |

DOM 就緒範圍為 132.7～151.7ms。斜轉與疊消切換正常；停用疊消時顯示 `N+0`，未達全部需求時顯示部分達成狀態。詳見 [browser-final.json](browser-final.json)。

這七個未保存種子的 UI 隨機盤屬冒煙測試，不是可重播的前後版 UI 配對實驗，不能與上一輪不同盤面的 UI 時間直接比較。DOM 提交也不等於實體螢幕完成繪製。尚未驗證背景分頁、其他裝置、長時間熱降頻或大樣本尾端延遲。

## 實作內容與原因

1. **快取排序順位。** 原先排序比較器反覆建立相同節點的需求順位；現在快取節點順位與候選排序向量，避免在排序時重算。搜尋啟發分數仍不取代交付的需求優先序。
2. **減少消除評估配置。** 空形狀計數與空珠數直方圖共用不可變物件，實際命中時才配置可寫資料。沒有 N2 時共用已算好的 potential；有 N2 時直接以疊消階段讀取，避免複製解鎖盤面。首批沒有消除時直接回傳。
3. **控制限時搜尋成本。** 限時評估快取縮至 1,024 筆；時間已到時，不再排序接著不會使用的搜尋層。縮路截止預留最多 18ms 作收尾與交付，並提供初始化、搜尋、縮路、收尾的階段計時。
4. **先做便宜縮路，再試兩步接橋。** 先對各分組代表刪除多餘前段、尾段與中間路徑，幾何上無法接合的候選立即排除；剩餘時間才嘗試經另一個中間格接合。每次從原盤重播，只有合法、同 combo 分組、維持較高需求順位且嚴格更短才採用。已接受改良立即保存，跨過截止才完成的候選不採用。

這是局部改良；即使每次縮路只接受更短，限時搜尋在前後版找到的起始候選也可能不同，所以不能由此推導前後版每組步數都不退步。

## 診斷與捨棄的實驗

排序與 GC 診斷支持先減少重算及配置：六種診斷情境的平均 beam 選擇階段約由 14.03ms 降到 6.81ms，取樣的 GC 總時間由 98.19ms 降到 54.88ms。詳見 `profile-before-final.*` 與 `profile-after-final.*`。這組診斷的新版是加入最終「先刪路再接橋」前的中間版本，不能冒充最終版精確耗時，也不能把 GC 總量當作單次使用者延遲；等時預算下兩版探索量可能不同。

曾將早期搜尋寬度提高至 96、128。開發題集的全需求達成率由 41.7% 分別下降至 33.3%、25%，因此捨棄。另一個中間版本在 `holdout-ab` 的達成率由 40% 升至 45.6%，但共同分組平均路徑變長；其結果促成縮路順序調整，**不是本輪最終版的達成率**。

`development-*`、`holdout-ab`、`variants/` 與 profiler 檔案保留為開發紀錄。最終效果以 `holdout-final`、`browser-final`、`search-equivalence`、`reference-differential`、`oracle-comparison` 為準。未沿用早期 GC 觀察器錯誤產生的零值診斷。

## 已驗證 Verified

- 69 個 JavaScript 測試通過，包含既有規則與新增 11 個縮路測試；涵蓋截止跨越、立即保存、接橋、固定起終點、row0、X1/X2、N1/N2 及高順位需求保留。
- 23 個 Python 評測器測試通過；比較工具另有 11 個自我檢查斷言通過。
- 1,000 次正式消除器與獨立參考消除器結果相符；另 2,000 次庫存 combo 上界檢查無違反。見 [reference-differential.json](reference-differential.json)。
- 前後版在固定 1,200 節點、最多六步的等工作量搜尋中，30/30 例結果與路徑完全相同。此檢查排除限時縮路，用於驗證排序快取與配置優化的搜尋等價性。見 [search-equivalence.json](search-equivalence.json)。
- 18 個最多 2～3 步的完整枚舉案例，最佳需求順位、最短步數、Top10 分組及代表均符合 oracle，沒有非法路徑或最優差距。證明僅限枚舉範圍，見 [oracle-comparison.md](oracle-comparison.md)。
- 最終 production build、新增獨立 JS 模組及相關工具 ESLint、`git diff --check` 通過。沒有宣稱整個既有專案的全域 lint 通過；build 仍有既有大 bundle 提醒。

## 合理推論 Inferred 與尚未驗證 Not Verified

效能瓶頸資料與實驗支持「減少同一候選的排序重算和配置」可改善目前實作；各項優化的獨立貢獻尚未完全用消融實驗拆開。

接下來較有價值的方向是依未滿足的高順位符石需求、形狀缺口引導搜尋，並為難題建立已知可解的見證路徑。單純加寬搜尋在本批開發資料中並未改善。這些屬待驗證方向，本輪未將新啟發式加入正式求解器。

尚未證明任意盤面的所有需求必可達成、160ms 內必定找到全需求解、全域最大 combo、該 combo 的全域最少步數，或所有裝置每次都準時。已知上界仍只是上界；搜尋沒有找到解時不能回報已證無解。

## 如何持續準確衡量更新

沿用 [第一輪完整衡量協定](../solver-update-20260909/MEASUREMENT_PROTOCOL.md)，本輪補齊原生截止比較、全部共同分組與按盤面群組的信賴區間：

1. 凍結前版程式及依賴，用相同盤面與設定交錯配對；記錄硬體、版本、雜湊、冷暖機與執行順序。
2. 先驗證合法性與排名，再分別報需求達成率、嚴格順位勝負、Top10 分組數、同品質同分組步數差。不得只挑最佳一次或只比總 combo。
3. 核心、交付、DOM 就緒分開報；超時、空結果和錯誤保留於分母，不能丟棄慢樣本。
4. 用獨立消除器與短步數完整 oracle 驗證正確性；長路徑用已知可解題與離線強參考解衡量差距，不能把未證最優的參考解叫最優解。
5. 開發盤用於調參，最終比較使用未曝光新盤；保留所有試過的變體及退步案例。信賴區間按盤面分群，避免把重複試跑或多組候選當獨立樣本。
6. 部署驗收仍需補目標瀏覽器／裝置的大樣本端到端配對及難題集合。本輪不將速度、品質、正確性與步數揉成單一「進步百分比」。

## 修改檔案與重跑

正式修改為 `src/App.jsx`，新增 `src/solver/pathRefinement.js`。評測與測試包含 `tools/load_web_solver.mjs`、`test_path_refinement.mjs`、`compare_solver_round2.mjs`、`profile_solver_stages.mjs`、`check_solver_search_equivalence.mjs`、`summarize_solver_round2.py`；完整數據置於本目錄。

```powershell
node --test tools/test_solution_ranking.mjs tools/test_solver_reference.mjs tools/test_solver_oracle.mjs tools/test_combo_bound.mjs tools/test_web_solver.mjs tools/test_path_refinement.mjs
python -B -m unittest discover -s tools -p test_perf_eval.py -v
node tools/compare_solver_round2.mjs --self-test
node tools/check_solver_search_equivalence.mjs
node tools/check_solver_reference.mjs --out reports/solver-next-20260909/reference-differential.json
node tools/compare_solver_oracle.mjs --out reports/solver-next-20260909/oracle-comparison.json
node tools/compare_solver_round2.mjs --fixture-report reports/solver-next-20260909/holdout-final.json --repeats 3 --out reports/solver-next-20260909/reproduction.json
python tools/summarize_solver_round2.py
npm run build
npm run preview -- --host 127.0.0.1
```

`--fixture-report` 重用已保存的正式盤，屬複現檢查，不能再次稱為全新保留盤。省略它則產生排除已知盤面的新題，單靠同 seed 不會重現已被排除的舊盤。bootstrap 工具預設彙整保存的 `holdout-final.json`；不會自動改讀新實驗。限時搜尋受到 JIT、GC、排程影響，重跑不保證相同耗時或候選。
