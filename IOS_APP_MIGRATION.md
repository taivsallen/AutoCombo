# iOS App 移植完成說明

已新增 `ios/AutoCombo` 原生 iOS 專案。網頁版的核心操作被重新設計為手機介面：底部容易觸碰的動作區、可拖曳盤面、候選路徑橫向卡片、設定以分組表單呈現，並以 Safe Area、動態字體與橫向尺寸調整避免桌面固定寬度問題。

## 對應關係

| 網頁功能 | iOS 實作 |
| --- | --- |
| 自動／手動模式 | `ContentView` + `AutoComboViewModel` |
| 轉珠與路徑預覽 | `BoardGrid` + SwiftUI `DragGesture` / `Canvas` |
| 求解與背景 worker | `SolverEngine` + `Task.detached` |
| 盤面評估、疊消、條件驗證 | `BoardEngine` |
| 編輯、圖片、相機 | `BoardEditorView`、`BoardImportView` |
| 特殊盾牌與規則 | `SettingsView`、`SpecialPriority`、`RuleProfile` |
| 播放與 GIF | `ReplayExporter` + `ShareLink` |
| 本機狀態保存 | `PersistenceStore` |

這個 iOS 版本是獨立的原生程式，不會依賴原網頁的 JavaScript、WebView、Cookie 或 LocalStorage。若要讓 iOS 與網頁版在每一個極端搜尋案例得到逐步一致的路徑，下一階段應將現有 JS `solverCore` 以固定測試盤面與驗證器逐案對拍；目前 App 已具備可執行的本機 bounded-beam solver 與完整手機操作流程。
