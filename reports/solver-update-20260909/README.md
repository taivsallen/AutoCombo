# Web 求解器更新與驗證結果

本次已實作 160ms 預算的最佳已找到解、統一需求排序、Top10 分組與路徑縮短，並建立可重跑的比較工具。**實測需求達成率提高，但尚未達成「所有執行都不超過 160ms」或「同 combo 全面更短」；不能判定為全面升級通過。**

最終 Web 來源 SHA256：`cf02dfa0e8701bfb5083c052e6bf1244272fee73845e4fb4ec523e3edd70c7ca`。

## 最終版本的實測幅度

核心比較使用 30 個全新盤面、六種情境、每盤三次，共 90 配對。前後版同預算並交錯執行；新盤排除既有與中間版合計 4,130 盤。這些是描述統計，沒有宣稱統計顯著性。

| 指標 | 更新前 | 最終版 | 解讀 |
|---|---:|---:|---|
| Top10 中找到全需求解 | 6/90，6.67% | 29/90，32.22% | +25.56 個百分點 |
| 嚴格需求順位的勝／負／平 | — | 61／24／5 | 有改善，也有明確退步 |
| 平均合法 combo 分組數 | 8.46 | 8.86 | 不足十組時不造假湊數 |
| 同品質、同分組代表步數，僅 8 對 | 7.75 | 13.75 | 平均多 6 步；6 對更長、2 對相同 |
| 新版核心 p50／p95 | — | 133.92／146.24ms | 核心觀測包含搜尋收尾 |
| 新版核心最慢／超時 | — | 174.67ms／1次 | 89/90 準時，尚非硬保證 |
| 新版原生 Top10 非法／重複／排序／劣代表違規 | — | 全部 0 | 獨立重播、檢查回傳順序 |

核心測量對前版加了端點觀察及協作式截止，並非前版原始 Web UI 體驗。不能將前版在這個實驗中的截止超時率當成原 UI 的超時率，也不能用它宣稱同幅度的瀏覽器加速。完整逐例資料：[最終 A/B 報告](core-ab-delivery.md)、[原始 JSON](core-ab-delivery.json)。

分情境的新版勝／負／平：普通 8/7/0、不斜轉 12/3/0、不疊消 12/3/0、row0 與標記 12/0/3、排序需求 10/3/2、形狀盾 7/8/0。形狀盾和同分組縮步仍是弱項。未知可解性的失敗盤，不標為無解。

實際 production Web 另做 7 次按鈕操作，包含首次求解、斜轉開關與疊消開關；結果 DOM 提交為 **135.7～156.3ms，中位 140.5ms，0/7 超時**。另一次快取命中為 3.2ms；選擇第三組候選及回放正常。此為小量 UI 冒煙測試，不等於 p99 保證，也沒有與前版 UI 直接配對。詳見 [Web 原始計時](browser-delivery.json)。

## 演算法與行為修改

- 先計算首消及總消的庫存上界。row0 最多替換一顆既有珠的種類；不增加總珠數。首消排除 N1/N2，總消排除 N1。上界放寬了形狀、路徑及解盾限制，顯示「首消上界」，不稱已知可達極限。
- 使用有截止時間的 beam search，保留找到的合法候選；在展開、評估與收尾間檢查時間，預留收尾及畫面時間。限時模式縮小搜尋寬度，避免整個預算耗在淺層，並停用無法受同一截止管理的其他 planner／平行評估分支。
- 過程中維護 `首消+疊消` 分組候選。固定比較符石需求清單、解盾、首消目標、總 combo，再比較步數；`7+1` 與 `6+2` 是不同組。未達首消目標不再回報全需求成功。
- 保留最優候選直到截止或其他搜尋上限，不因剛達成目標就提早結束全部搜尋。路徑只在需要交付時展開，降低每次候選都複製整條路徑的成本。
- 最後一段預算嘗試刪除中間繞路、多餘起手段及尾段。每次都從原盤重播，只有同 combo 分組、不犧牲更高層需求、且步數更少才採用。這是局部縮路，不等於全域最短路徑演算法。
- row0 只複製珠種類、保留目的珠標記；row0 起手後禁止再次進入 row0。同步修正核心、手動交換、預覽／回放相關路徑。斜轉維持允許／不允許兩種，不採比例等級。
- 沒有候選時回傳 `no_candidate`；有合法候選但未滿足需求時清楚顯示未滿足。最多顯示十個實際找到的組。

主要修改為 `src/App.jsx`；新增正式模組 `src/solver/solutionRanking.js`、`pathReplay.js`、`comboBound.js`。沒有改 Android/iOS 的求解核心。

## 已驗證 Verified

- 58 個 JavaScript 規則、排序、重播、上界、oracle 與核心整合測試通過。
- 23 個 Python 評測器測試通過，包含「combo 降低但步數變短不能通過」「同總 combo 不同首消/疊消不能算縮步」「缺路徑不能假成功」。
- 500 個固定種子盤面 × 疊消開關，**1,000 次正式消除器與獨立消除器完全相符**；包含六色門檻 1～5、直橫／相連、N1/N2、形狀統計。另 2,000 次庫存上界檢查沒有違反。盤面、設定、雜湊与結果見 [差異檢查 JSON](reference-differential.json)。
- 18 個 2～3 步、唯一 START＋不同 END 的完整枚舉案例，最佳需求順位、最短步數、Top10 分組與代表均符合 oracle；差距為 0。這個證明只適用該範圍，詳见 [精確比較](oracle-comparison.md)。
- 最終版 production build 通過；新增／修改的獨立求解與評測 JS 模組 ESLint 通過。建置仍有原有的大 bundle 提醒。
- 最終 A/B 與 oracle 的來源執行期間未變更；瀏覽器讀取最終 bundle `index-xHgFhQjn.js`。

## 合理推論 Inferred

限時模式較窄的搜尋寬度提高了深層候選的探索機會，也會漏掉某些較短路徑；本次結果與這種取捨一致，但還沒有用消融實驗證明各改動的獨立貢獻。

174.67ms 的超時案例，最佳解在約 131.44ms 已被觀察到。當次沒有足夠階段計時，不能確定後續延遲由縮路、排序、GC 或系統排程造成；評測工具已補未來用的階段診斷欄位，沒有回填舊數據。

## 尚未驗證 Not Verified

- 任意盤面在 160ms 內必定找到全需求解。
- 每次都在 160ms 內交付；本次確實觀察到一次核心超時。
- 任意長路徑的全域最大 combo 與全域最短步數。
- 所有三盾組合、所有設定交互、其他電腦與手機 Web、長時間熱降頻／背景分頁，以及實體螢幕顯示延遲。
- 同分組步數全面改善：此次實測反而存在退步。

因此本次沒有把總 combo、成功率、速度和步數揉成一個百分比，也沒有給出「全面提升 X%」的結論。後續驗收應以 [完整衡量協定](MEASUREMENT_PROTOCOL.md) 執行，先定位超時尾段與形狀盾／短路徑反例，再用新盤驗證，不能反覆調整同一測試集後宣稱泛化進步。

## 重跑與證據檔

```powershell
node --test tools/test_solution_ranking.mjs tools/test_solver_reference.mjs tools/test_solver_oracle.mjs tools/test_combo_bound.mjs tools/test_web_solver.mjs
python -B -m unittest discover -s tools -p test_perf_eval.py -v
node tools/check_solver_reference.mjs
node tools/compare_solver_oracle.mjs
node tools/compare_web_solver_update.mjs --boards 5 --repeats 3 --seed 539363594 --exclude-report reports/solver-update-20260909/core-ab-final.json --out reports/solver-update-20260909/core-ab-reproduction.json
npm run build
npm run preview -- --host 127.0.0.1
```

`core-ab-smoke`、`beam-width-diagnostic`、`core-ab-final` 是中間版／開發診斷資料；最終版本以 `core-ab-delivery`、`oracle-comparison`、`reference-differential`、`browser-delivery` 為準。重跑限時搜尋受 JIT、GC 與排程影響，不保證逐次得到相同候選或耗時。
