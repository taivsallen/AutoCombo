# AutoCombo iOS

這是原本 AutoCombo 網頁版的原生 SwiftUI iOS 版本，不使用 WebView 包裝網站。

## 開啟與執行

1. 在 macOS 安裝 Xcode 15 或以上。
2. 開啟 `AutoCombo.xcodeproj`。
3. 在 target `AutoCombo` 的 Signing & Capabilities 填入自己的 Team；Bundle ID 預設為 `com.comboauto.ios`，可依需要更換。
4. 以 iOS 17 以上模擬器或真機執行。

圖片資產已放在 `AutoCombo/Resources`；相機和照片權限文字已放在 `Info.plist`。

## 已移植的功能

- 自動／手動轉珠模式、6×6 盤面與觸控拖曳路徑
- Combo 優先／步數優先、斜轉、疊消、頂層緩衝列
- 背景執行求解、進度、取消、候選路徑、路徑播放／暫停／停止
- 盤面編輯、X1/X2、Start/End、N1/N2、空格與珠子工具
- 圖片選取／相機匯入與本機盤面辨識、辨識信心度提示
- 盾牌特殊條件：十字、L、T、矩形、首消粒數、同屬性同組
- 每一屬性的最低消除數、直橫消／相連消、Exact／At least 需求
- 效能等級、目標 Combo、播放速度、模板盤面
- GIF 匯出與系統分享、剪貼簿複製、問題回報信件
- UserDefaults 狀態保存、離線提示、深層連結 `autocombo://solve`／`random`／`manual`
- Safe Area、Dynamic Type、VoiceOver label、Landscape／iPad 自適應盤面

## 架構

`Models` 保存盤面、珠子、規則與設定；`Core` 是純 Swift 盤面評估與 bounded beam solver；`AutoComboViewModel` 管理狀態與背景 Task；`Views` 是手機版 UI；`Services` 提供本機保存、圖片辨識、網路狀態和 GIF 匯出。

所有求解與圖片辨識都在裝置上執行，不需要登入或後端 API。發佈前仍應在真機做弱網、權限拒絕、背景恢復、長時間求解、低記憶體與不同 iPhone／iPad 尺寸測試。
