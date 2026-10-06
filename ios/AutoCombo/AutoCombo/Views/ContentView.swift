import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AutoComboViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSettings = false
    @State private var showEditor = false
    @State private var showImport = false
    @State private var showTemplates = false
    @State private var showFeedback = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    header
                    if !model.networkMonitor.isOnline { offlineBanner }
                    if !model.isManual { autoControls }
                    if !model.isManual && !model.results.isEmpty { resultCards }
                    StatStrip(model: model)
                    boardCard
                    actionGrid
                    if let message = model.boardValidationMessage { validationBanner(message) }
                    footer
                }
                .padding(14)
            }
            .scrollIndicators(.hidden)
            .background(Color.black.ignoresSafeArea())
            .navigationBarHidden(true)
            .overlay { if model.isSolving { solveOverlay } }
            .alert("Solver warning", isPresented: Binding(get: { model.solverError != nil }, set: { if !$0 { model.solverError = nil } })) {
                Button("OK", role: .cancel) { model.solverError = nil }
            } message: { Text(model.solverError ?? "Please check the settings.") }
            .overlay(alignment: .bottom) {
                if let toast = model.toastMessage {
                    Text(toast).font(.footnote.weight(.semibold)).multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 11).background(.ultraThinMaterial, in: Capsule()).padding(.bottom, 18)
                        .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { model.toastMessage = nil } }
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showSettings) { SettingsView(model: model) }
        .sheet(isPresented: $showEditor) { BoardEditorView(model: model) }
        .sheet(isPresented: $showImport) { BoardImportView(model: model) }
        .sheet(isPresented: $showTemplates) { TemplatesView(model: model) }
        .sheet(isPresented: $showFeedback) { FeedbackView(language: model.language) }
        .sheet(item: Binding(get: { model.exportURL.map { ExportItem(url: $0) } }, set: { _ in model.exportURL = nil })) { item in SharePreview(url: item.url) }
        .onChange(of: scenePhase) { _, phase in if phase == .background || phase == .inactive { model.persist() } }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles.square.filled.on.square").font(.title2.weight(.black)).foregroundStyle(.cyan)
            VStack(alignment: .leading, spacing: 1) {
                Text(AppText.title(model.language)).font(.headline.weight(.black))
                Text(model.isManual ? "Orb Solver / Manual" : "Orb Solver / Auto").font(.caption.weight(.bold)).foregroundStyle(model.isManual ? .orange : .indigo)
            }
            Spacer()
            Menu {
                Picker("Language", selection: Binding(get: { model.language }, set: { model.language = $0; model.persist() })) { ForEach(AppLanguage.allCases) { Text($0.title).tag($0) } }
                Divider()
                Button { showFeedback = true } label: { Label("Report issue", systemImage: "message") }
            } label: { Image(systemName: "globe").font(.headline.weight(.bold)).frame(width: 44, height: 44).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13)) }
            Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3").font(.headline.weight(.bold)).frame(width: 44, height: 44).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13)) }
        }
    }

    private var offlineBanner: some View {
        Label("Offline mode: local solving still works.", systemImage: "wifi.slash").font(.caption.weight(.semibold)).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading).padding(10).background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private var autoControls: some View {
        VStack(spacing: 10) {
            Picker("Priority", selection: Binding(get: { model.settings.priority }, set: { model.settings.priority = $0; model.markDirty() })) { ForEach(SolverPriority.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented)
            HStack(spacing: 8) {
                Toggle(isOn: Binding(get: { model.settings.skyfallEnabled }, set: { model.settings.skyfallEnabled = $0; model.markDirty() })) { Label("Skyfall", systemImage: "cloud.bolt.fill") }.tint(.purple)
                Toggle(isOn: Binding(get: { model.settings.diagonalEnabled }, set: { model.settings.diagonalEnabled = $0; model.markDirty() })) { Label("Diagonal", systemImage: "arrow.up.right") }.tint(.pink)
            }
            .font(.caption.weight(.bold)).padding(10).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var resultCards: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text("Candidate routes").font(.subheadline.weight(.black)); Spacer(); Text("Swipe to choose").font(.caption).foregroundStyle(.secondary) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 9) {
                    ForEach(model.results.indices, id: \.self) { index in
                        let result = model.results[index]
                        Button { model.selectResult(index) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                HStack { Text("#\(index + 1)").font(.headline.weight(.black)); Spacer(); Image(systemName: result.hardSatisfied ? "checkmark.seal.fill" : "exclamationmark.triangle.fill").foregroundStyle(result.hardSatisfied ? .green : .orange) }
                                Text("Combo \(result.evaluation.totalCombos)").font(.subheadline.weight(.bold))
                                Text("Steps \(max(0, result.path.count - 1)) / Clear \(result.evaluation.cleared)").font(.caption).foregroundStyle(.secondary)
                            }
                            .frame(width: 146, alignment: .leading).padding(12).background(index == model.selectedResultIndex ? Color.indigo.opacity(0.28) : Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 15)).overlay(RoundedRectangle(cornerRadius: 15).stroke(index == model.selectedResultIndex ? Color.indigo : Color.white.opacity(0.1), lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var boardCard: some View {
        VStack(spacing: 12) {
            HStack {
                Text(model.isManual ? "Manual board" : "Solver board").font(.headline.weight(.black))
                Spacer()
                if model.isManual { Label("\(model.manualRemaining / 10).\(model.manualRemaining % 10) sec", systemImage: "timer").font(.caption.monospacedDigit().weight(.bold)) }
                else { Button { model.showTopBuffer.toggle(); model.persist() } label: { Label(model.showTopBuffer ? "Hide top row" : "Show top row", systemImage: model.showTopBuffer ? "chevron.up" : "chevron.down").font(.caption.weight(.bold)) } }
            }
            BoardGrid(model: model).overlay(alignment: .bottom) { if model.isManual && model.isManualDragging { Text("Drag in progress").font(.caption.weight(.black)).padding(.horizontal, 11).padding(.vertical, 7).background(.black.opacity(0.72), in: Capsule()).padding(10) } }
            Text(model.isManual ? "Hold one orb and drag. Diagonal moves are supported." : "Tap a candidate route to apply it. The path is drawn on the board.").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12).background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 22, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }

    private var actionGrid: some View {
        VStack(spacing: 9) {
            Picker("Mode", selection: Binding(get: { model.isManual }, set: { model.setMode(manual: $0) })) { Text(AppText.modeAuto(model.language)).tag(false); Text(AppText.modeManual(model.language)).tag(true) }.pickerStyle(.segmented)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 9) {
                ActionButton(title: "Random", systemImage: "shuffle", tint: .gray) { model.randomizeBoard() }
                ActionButton(title: "Edit", systemImage: "pencil", tint: .gray) { model.openEditor(); showEditor = true }
                ActionButton(title: "Import", systemImage: "photo", tint: .gray) { model.openEditor(); showImport = true }
                ActionButton(title: "Templates", systemImage: "square.grid.3x3", tint: .gray) { model.openEditor(); showTemplates = true }
                ActionButton(title: model.isReplaying ? (model.isReplayPaused ? "Resume" : "Pause") : "Play", systemImage: model.isReplaying && !model.isReplayPaused ? "pause.fill" : "play.fill", tint: .indigo, disabled: model.activeResult?.path.count ?? 0 < 2) { if model.isReplaying { model.toggleReplayPause() } else { model.beginReplay() } }
                ActionButton(title: "GIF", systemImage: "film", tint: .pink, disabled: model.activeResult == nil) { model.exportGIF() }
            }
            if !model.isManual { ActionButton(title: model.needsSolve ? AppText.solve(model.language) : "Solve again", systemImage: "lightbulb.fill", tint: .green, disabled: !model.canSolve) { model.solve() } }
        }
    }

    private func validationBanner(_ message: String) -> some View { Label(message, systemImage: "exclamationmark.triangle.fill").font(.caption.weight(.semibold)).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4) }
    private var footer: some View { VStack(spacing: 6) { Text("All solving and image recognition run on-device. No login or upload is required.").font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center); Text("AutoCombo iOS / SwiftUI native").font(.caption2.monospaced()).foregroundStyle(.secondary.opacity(0.7)) }.padding(.vertical, 10) }
    private var solveOverlay: some View { ZStack { Color.black.opacity(0.82).ignoresSafeArea(); VStack(spacing: 16) { ProgressView(value: model.progress.fraction).tint(.cyan).frame(width: 230); Text("Analyzing board").font(.headline.weight(.black)); Text("Checked \(model.progress.current) states").font(.caption.monospacedDigit()).foregroundStyle(.secondary); Button("Stop") { model.cancelSolve() }.buttonStyle(.bordered).tint(.orange) }.padding(28).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24)) } }
}

private struct ExportItem: Identifiable { let id = UUID(); let url: URL }
private struct SharePreview: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    var body: some View { NavigationStack { VStack(spacing: 20) { Image(systemName: "checkmark.circle.fill").font(.system(size: 50)).foregroundStyle(.green); Text("GIF ready").font(.title2.weight(.black)); ShareLink(item: url) { Label("Share GIF", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 50) }.buttonStyle(.borderedProminent) }.padding(24).navigationTitle("Export").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } } } }
}
