import Foundation

enum AppText {
    static func title(_ language: AppLanguage) -> String { "AutoCombo" }
    static func modeAuto(_ language: AppLanguage) -> String { language == .japanese ? "Auto" : "Auto" }
    static func modeManual(_ language: AppLanguage) -> String { language == .japanese ? "Manual" : "Manual" }
    static func solve(_ language: AppLanguage) -> String { "Solve" }
    static func settings(_ language: AppLanguage) -> String { "Settings" }
}
