import SwiftUI

@main
struct AutoComboApp: App {
    @StateObject private var model = AutoComboViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        switch url.host?.lowercased() {
        case "solve": model.solve()
        case "random": model.randomizeBoard()
        case "manual": model.setMode(manual: true)
        default: break
        }
    }
}
