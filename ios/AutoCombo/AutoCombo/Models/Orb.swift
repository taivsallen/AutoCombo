import SwiftUI

enum Orb: Int, CaseIterable, Codable, Identifiable, Hashable {
    case water = 0, fire, earth, light, dark, heart
    var id: Int { rawValue }
    var name: String { englishName }
    var englishName: String {
        switch self { case .water: return "Water"; case .fire: return "Fire"; case .earth: return "Earth"; case .light: return "Light"; case .dark: return "Dark"; case .heart: return "Heart" }
    }
    var assetName: String { englishName.lowercased() }
    var tint: Color {
        switch self { case .water: return .cyan; case .fire: return .red; case .earth: return .green; case .light: return .yellow; case .dark: return .purple; case .heart: return .pink }
    }
}

enum CellMark: Int, CaseIterable, Codable, Hashable, Identifiable {
    case none = 0, x1, x2, start, end, n1, n2
    var id: Int { rawValue }
    var label: String {
        switch self { case .none: return "None"; case .x1: return "X1"; case .x2: return "X2"; case .start: return "Start"; case .end: return "End"; case .n1: return "N1"; case .n2: return "N2" }
    }
    var color: Color {
        switch self { case .none: return .clear; case .x1: return .orange; case .x2: return .red; case .start: return .cyan; case .end: return .pink; case .n1: return .blue; case .n2: return .indigo }
    }
}

struct BoardCell: Codable, Hashable {
    var orb: Orb?
    var mark: CellMark = .none
    static let empty = BoardCell(orb: nil)
}

struct Coordinate: Codable, Hashable { var row: Int; var col: Int }

struct Board: Codable, Hashable {
    static let rows = 6
    static let cols = 6
    static let playRowStart = 1
    var cells: [[BoardCell]]

    init(cells: [[BoardCell]]) { self.cells = cells }
    init(cells: [[Orb]]) { self.cells = cells.map { $0.map { BoardCell(orb: $0) } } }
    init(repeating orb: Orb = .water) { cells = Array(repeating: Array(repeating: BoardCell(orb: orb), count: Self.cols), count: Self.rows) }
    subscript(_ coordinate: Coordinate) -> BoardCell {
        get { cells[coordinate.row][coordinate.col] }
        set { cells[coordinate.row][coordinate.col] = newValue }
    }

    static func sample() -> Board {
        Board(cells: [
            [.water, .fire, .earth, .light, .dark, .heart],
            [.water, .water, .fire, .earth, .light, .dark],
            [.fire, .earth, .earth, .light, .dark, .heart],
            [.water, .fire, .light, .light, .heart, .heart],
            [.earth, .earth, .water, .dark, .dark, .fire],
            [.heart, .water, .fire, .earth, .light, .water]
        ])
    }

    static func random(seed: UInt64 = UInt64(Date().timeIntervalSince1970)) -> Board {
        var generator = SeededGenerator(seed: seed)
        let cells = (0..<rows).map { _ in (0..<cols).map { _ in BoardCell(orb: Orb(rawValue: generator.nextInt(upperBound: Orb.allCases.count)) ?? .water) } }
        return Board(cells: cells)
    }

    func map(_ transform: (BoardCell) -> BoardCell) -> Board { Board(cells: cells.map { $0.map(transform) }) }
    func count(_ orb: Orb) -> Int { cells.flatMap { $0 }.filter { $0.orb == orb }.count }
}

struct OrbRule: Codable, Hashable { var minimum: Int = 3; var mode: ClearMode = .line }
enum ClearMode: String, Codable, CaseIterable, Identifiable {
    case line, connected
    var id: String { rawValue }
    var title: String { self == .line ? "Line" : "Connected" }
}

struct RuleRequirement: Codable, Hashable, Identifiable {
    var id = UUID()
    var orb: Orb = .water
    var size: Int = 3
    var count: Int = 1
    var match: RequirementMatch = .exact
}
enum RequirementMatch: String, Codable, CaseIterable, Identifiable {
    case exact, atLeast
    var id: String { rawValue }
    var title: String { self == .exact ? "Exact" : "At least" }
}

struct RuleProfile: Codable, Hashable {
    var orbRules: [OrbRule] = Array(repeating: OrbRule(), count: Orb.allCases.count)
    var requirements: [RuleRequirement] = []
    func rule(for orb: Orb) -> OrbRule { orbRules[orb.rawValue] }
}

enum SpecialType: String, Codable, CaseIterable, Identifiable {
    case none, combo, cross, lShape, tShape, rectangle, clearCount, equalFirst
    var id: String { rawValue }
    var title: String {
        switch self { case .none: return "None"; case .combo: return "Combo count"; case .cross: return "Cross"; case .lShape: return "L shape"; case .tShape: return "T shape"; case .rectangle: return "Rectangle"; case .clearCount: return "First clear count"; case .equalFirst: return "Equal attributes" }
    }
}

struct SpecialPriority: Codable, Hashable, Identifiable {
    var id = UUID()
    var type: SpecialType = .none
    var count: Int = 1
    var orb: Orb?
    var clearCount: Int = 3
    var rectRows: Int = 3
    var rectCols: Int = 3
    var equalOrbs: [Orb] = []
    init() { orb = nil }
}

enum SolverPriority: String, Codable, CaseIterable, Identifiable {
    case combo, steps
    var id: String { rawValue }
    var title: String { self == .combo ? "Combo first" : "Steps first" }
}

enum AppLanguage: String, Codable, CaseIterable, Identifiable {
    case traditionalChinese = "zh-Hant", english = "en", japanese = "ja"
    var id: String { rawValue }
    var title: String { switch self { case .traditionalChinese: return "Traditional Chinese"; case .english: return "English"; case .japanese: return "Japanese" } }
}

struct SolverSettings: Codable, Hashable {
    var priority: SolverPriority = .steps
    var targetCombo = 8
    var skyfallEnabled = true
    var diagonalEnabled = true
    var row0Enabled = true
    var performanceLevel = 3
    var maxSteps = 80
    var replaySpeed = 50
    var boardSeed: UInt64 = 1
    mutating func applyPerformance(_ level: Int) {
        performanceLevel = min(max(level, 1), 5)
        switch performanceLevel { case 1: maxSteps = 24; case 2: maxSteps = 48; case 3: maxSteps = 80; case 4: maxSteps = 120; default: maxSteps = 180 }
    }
}

struct SolverStats: Equatable {
    var theoreticalMax = 0
    var combos = 0
    var skyfallCombos = 0
    var initialCleared = 0
    var skyfallCleared = 0
    var steps = 0
    var crossCount = 0
    var lCount = 0
    var tCount = 0
}
struct SolverProgress: Equatable {
    var current = 0
    var maximum = 1
    var elapsed: TimeInterval = 0
    var fraction: Double { min(1, max(0, Double(current) / Double(max(1, maximum)))) }
}

struct Evaluation {
    var initialGroups = 0
    var skyfallGroups = 0
    var initialCleared = 0
    var skyfallCleared = 0
    var comboCountsByOrb: [Int]
    var comboSizeCountsByOrb: [[Int]]
    var crossCount = 0
    var lCount = 0
    var tCount = 0
    var rectangles: [String: Int] = [:]
    var totalCombos: Int { initialGroups + skyfallGroups }
    var cleared: Int { initialCleared + skyfallCleared }
}

struct SolverResult: Identifiable {
    let id = UUID()
    let board: Board
    let path: [Coordinate]
    let evaluation: Evaluation
    let hardSatisfied: Bool
    let score: Double
}

private struct SeededGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    mutating func next() -> UInt64 { state &+= 0x9E3779B97F4A7C15; var z = state; z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
    mutating func nextInt(upperBound: Int) -> Int { Int(next() % UInt64(max(1, upperBound))) }
}
