import Foundation
import Combine
import UIKit

@MainActor
final class AutoComboViewModel: ObservableObject {
    @Published var board: Board
    @Published var originalBoard: Board
    @Published var settings: SolverSettings
    @Published var rules: RuleProfile
    @Published var specials: [SpecialPriority]
    @Published var language: AppLanguage
    @Published var isManual = false
    @Published var showTopBuffer = true

    @Published private(set) var isSolving = false
    @Published private(set) var isReplaying = false
    @Published private(set) var isReplayPaused = false
    @Published private(set) var isManualDragging = false
    @Published private(set) var manualRemaining = 100
    @Published private(set) var progress = SolverProgress()
    @Published private(set) var results: [SolverResult] = []
    @Published var selectedResultIndex = 0
    @Published private(set) var stats = SolverStats()
    @Published private(set) var needsSolve = true
    @Published var editorBoard: Board
    @Published var editorTool: EditorTool = .orb(.water)
    @Published var importConfidence: Double?
    @Published var isImporting = false
    @Published var toastMessage: String?
    @Published var exportURL: URL?
    @Published var solverError: String?

    let networkMonitor = NetworkMonitor()
    private let store = PersistenceStore()
    private var solveTask: Task<Void, Never>?
    private var replayTask: Task<Void, Never>?
    private var manualTimerTask: Task<Void, Never>?
    private var manualPath: [Coordinate] = []
    private var manualWorkingBoard: Board?
    private var manualHeld: BoardCell?
    private var manualCurrent: Coordinate?

    enum EditorTool: Hashable {
        case orb(Orb)
        case mark(CellMark)
        case empty
    }

    init() {
        let persisted = PersistenceStore().load()
        let loadedBoard = persisted?.board ?? Board.sample()
        board = loadedBoard
        originalBoard = loadedBoard
        settings = persisted?.settings ?? SolverSettings()
        rules = persisted?.rules ?? RuleProfile()
        specials = persisted?.specials ?? Array(repeating: SpecialPriority(), count: 3)
        language = persisted?.language ?? .traditionalChinese
        isManual = persisted?.manualMode ?? false
        showTopBuffer = persisted?.showTopBuffer ?? true
        editorBoard = loadedBoard
    }

    deinit {
        solveTask?.cancel()
        replayTask?.cancel()
        manualTimerTask?.cancel()
    }

    var activeResult: SolverResult? { results[safe: selectedResultIndex] }

    var currentPath: [Coordinate] {
        if isManual && !manualPath.isEmpty { return manualPath }
        return activeResult?.path ?? []
    }

    var canSolve: Bool {
        !isSolving && !isManual && !isReplaying && rules.requirements.allSatisfy { $0.count > 0 && $0.size > 0 }
    }

    var boardValidationMessage: String? {
        for requirement in rules.requirements where board.count(requirement.orb) < requirement.size * requirement.count {
            return "The current orb stock may be too small for this requirement."
        }
        return nil
    }

    func randomizeBoard() {
        stopReplay()
        settings.boardSeed &+= 1
        board = Board.random(seed: settings.boardSeed)
        originalBoard = board
        resetSearchState()
    }

    func setMode(manual: Bool) {
        stopReplay()
        isManual = manual
        if manual { board = clearMarks(board) } else { originalBoard = board }
        clearPath()
        persist()
    }

    func markDirty() {
        needsSolve = true
        results = []
        selectedResultIndex = 0
        persist()
    }

    func solve() {
        guard canSolve else { return }
        guard boardValidationMessage == nil else { solverError = boardValidationMessage; return }
        stopReplay()
        solverError = nil
        isSolving = true
        needsSolve = false
        originalBoard = board
        results = []
        progress = SolverProgress(current: 0, maximum: nodeBudget(for: settings.performanceLevel), elapsed: 0)
        let boardSnapshot = board
        let settingsSnapshot = settings
        let rulesSnapshot = rules
        let specialsSnapshot = specials
        let started = Date()
        solveTask?.cancel()
        solveTask = Task { [weak self] in
            let output = await Task.detached(priority: .userInitiated) {
                SolverEngine.solve(board: boardSnapshot, settings: settingsSnapshot, rules: rulesSnapshot, specials: specialsSnapshot)
            }.value
            guard let self, !Task.isCancelled else { return }
            self.progress = SolverProgress(current: output.nodes, maximum: max(1, output.nodes), elapsed: Date().timeIntervalSince(started))
            self.results = output.results
            self.stats.theoreticalMax = output.theoreticalMax
            self.isSolving = false
            self.selectedResultIndex = 0
            if let first = output.results.first { self.apply(result: first, shouldPersist: false) }
            if output.results.isEmpty { self.toastMessage = "No route matched the current constraints." }
        }
    }

    func cancelSolve() {
        solveTask?.cancel()
        solveTask = nil
        isSolving = false
        progress = SolverProgress()
        needsSolve = true
    }

    func selectResult(_ index: Int) {
        guard results.indices.contains(index) else { return }
        selectedResultIndex = index
        apply(result: results[index])
    }

    func apply(result: SolverResult, shouldPersist: Bool = true) {
        stopReplay()
        board = result.board
        clearPath()
        updateStats(from: result.evaluation, steps: result.path.count)
        if shouldPersist { persist() }
    }

    func beginReplay() {
        guard let result = activeResult, result.path.count > 1, !isSolving else { return }
        replayTask?.cancel()
        isReplaying = true
        isReplayPaused = false
        board = replayFrame(for: result, step: 0)
        replayTask = Task { [weak self] in
            guard let self else { return }
            for step in 1..<result.path.count {
                while self.isReplayPaused && !Task.isCancelled { try? await Task.sleep(nanoseconds: 80_000_000) }
                if Task.isCancelled { return }
                let delay = UInt64(max(15, 100 - self.settings.replaySpeed) * 1_000_000)
                try? await Task.sleep(nanoseconds: delay)
                if Task.isCancelled { return }
                self.board = self.replayFrame(for: result, step: step)
            }
            self.isReplaying = false
            self.isReplayPaused = false
            self.board = result.board
        }
    }

    func toggleReplayPause() { if isReplaying { isReplayPaused.toggle() } }

    func stopReplay() {
        replayTask?.cancel()
        replayTask = nil
        isReplaying = false
        isReplayPaused = false
        if let result = activeResult { board = result.board }
    }

    func exportGIF() {
        guard let result = activeResult else { return }
        let source = originalBoard
        let path = result.path
        let speed = settings.replaySpeed
        Task { [weak self] in
            do {
                let url = try await Task.detached(priority: .userInitiated) {
                    try ReplayExporter.export(board: source, path: path, speed: speed)
                }.value
                self?.exportURL = url
            } catch { self?.toastMessage = "GIF export failed." }
        }
    }

    func openEditor() { editorBoard = board; editorTool = .orb(.water) }

    func editCell(_ coordinate: Coordinate) {
        switch editorTool {
        case .orb(let orb): editorBoard[coordinate] = BoardCell(orb: orb, mark: editorBoard[coordinate].mark)
        case .mark(let mark): editorBoard[coordinate].mark = mark
        case .empty: editorBoard[coordinate] = .empty
        }
    }

    func clearEditorMarks() { editorBoard = editorBoard.map { BoardCell(orb: $0.orb) } }

    func saveEditor() {
        board = editorBoard
        originalBoard = editorBoard
        markDirty()
    }

    func useTemplate(_ board: Board) { editorBoard = board }

    func importImage(_ image: UIImage) {
        isImporting = true
        Task { [weak self] in
            let recognition = await Task.detached(priority: .userInitiated) { BoardImageRecognizer.recognize(image) }.value
            guard let self else { return }
            self.isImporting = false
            guard let recognition else {
                self.toastMessage = "The image could not be recognized. Use a complete front-facing 6x6 image."
                return
            }
            self.importConfidence = recognition.confidence
            self.editorBoard = recognition.board
            self.toastMessage = "Imported with \(Int(recognition.confidence * 100))% confidence. Please verify each cell."
        }
    }

    func beginManual(at coordinate: Coordinate) {
        guard isManual, !isManualDragging, !isSolving, !isReplaying, board[coordinate].orb != nil else { return }
        manualPath = [coordinate]
        manualWorkingBoard = board
        manualHeld = board[coordinate]
        manualCurrent = coordinate
        if var working = manualWorkingBoard { working[coordinate] = .empty; manualWorkingBoard = working }
        isManualDragging = true
        manualRemaining = 100
        startManualTimer()
    }

    func continueManual(to coordinate: Coordinate) {
        guard isManualDragging, let current = manualCurrent, let held = manualHeld, var working = manualWorkingBoard else { return }
        guard coordinate != current, BoardEngine.neighbors(of: current, diagonal: true).contains(coordinate) else { return }
        let target = working[coordinate]
        working[coordinate] = held
        manualHeld = target
        manualCurrent = coordinate
        manualWorkingBoard = working
        manualPath.append(coordinate)
        board = SolverEngine.makeFinalBoard(working, held: target, current: coordinate)
    }

    func endManual() {
        guard isManualDragging, let working = manualWorkingBoard, let held = manualHeld, let current = manualCurrent else { return }
        manualTimerTask?.cancel()
        isManualDragging = false
        board = SolverEngine.makeFinalBoard(working, held: held, current: current)
        originalBoard = board
        updateStats(from: BoardEngine.evaluate(board, skyfall: settings.skyfallEnabled, rules: rules), steps: manualPath.count)
        clearPath()
        persist()
    }

    func updateSpecial(at index: Int, _ update: (inout SpecialPriority) -> Void) {
        guard specials.indices.contains(index) else { return }
        update(&specials[index])
        markDirty()
    }

    func addRequirement() { rules.requirements.append(RuleRequirement()); markDirty() }
    func removeRequirement(at index: Int) { guard rules.requirements.indices.contains(index) else { return }; rules.requirements.remove(at: index); markDirty() }

    func persist() {
        store.save(PersistedState(board: board, settings: settings, rules: rules, specials: specials, language: language, manualMode: isManual, showTopBuffer: showTopBuffer))
    }

    func copyBoard(_ board: Board) {
        UIPasteboard.general.string = board.cells.map { row in row.map { $0.orb?.englishName.prefix(1) ?? "-" }.joined(separator: " ") }.joined(separator: "\n")
        toastMessage = "Board copied to the clipboard."
    }

    private func resetSearchState() { originalBoard = board; clearPath(); needsSolve = true; results = []; stats = SolverStats(); persist() }
    private func clearPath() { manualPath = [] }
    private func clearMarks(_ board: Board) -> Board { board.map { BoardCell(orb: $0.orb) } }
    private func updateStats(from evaluation: Evaluation, steps: Int) {
        stats = SolverStats(theoreticalMax: stats.theoreticalMax, combos: evaluation.initialGroups, skyfallCombos: evaluation.skyfallGroups, initialCleared: evaluation.initialCleared, skyfallCleared: evaluation.skyfallCleared, steps: steps, crossCount: evaluation.crossCount, lCount: evaluation.lCount, tCount: evaluation.tCount)
    }
    private func nodeBudget(for level: Int) -> Int { [0, 2_500, 5_000, 10_000, 18_000, 30_000][min(max(level, 1), 5)] }
    private func startManualTimer() {
        manualTimerTask?.cancel()
        manualTimerTask = Task { [weak self] in
            guard let self else { return }
            while self.isManualDragging && self.manualRemaining > 0 {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if Task.isCancelled { return }
                self.manualRemaining -= 1
            }
            if self.isManualDragging && self.manualRemaining == 0 { self.endManual(); self.toastMessage = "Move time ended." }
        }
    }
    private func replayFrame(for result: SolverResult, step: Int) -> Board {
        guard !result.path.isEmpty else { return originalBoard }
        let clamped = min(max(0, step), result.path.count - 1)
        var frame = originalBoard
        if clamped > 0 {
            for index in 1...clamped {
                let from = result.path[index - 1]
                let to = result.path[index]
                let cell = frame[from]
                frame[from] = frame[to]
                frame[to] = cell
            }
        }
        return frame
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? { indices.contains(index) ? self[index] : nil }
}
