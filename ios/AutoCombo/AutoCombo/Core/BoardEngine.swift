import Foundation

enum BoardEngine {
    static let playRows = Board.playRowStart..<Board.rows

    static func evaluate(_ board: Board, skyfall: Bool, rules: RuleProfile) -> Evaluation {
        var working = board
        let initial = findGroups(in: working, phase: .initial, rules: rules)
        var evaluation = Evaluation(
            comboCountsByOrb: Array(repeating: 0, count: Orb.allCases.count),
            comboSizeCountsByOrb: Array(repeating: Array(repeating: 0, count: 12), count: Orb.allCases.count)
        )
        record(groups: initial, board: working, in: &evaluation, initial: true)
        evaluation.rectangles = rectangleCounts(in: working)

        guard !initial.isEmpty else { return evaluation }
        let firstMatches = Set(initial.flatMap { $0 })
        working = collapsed(board: working, removing: firstMatches, cascade: 0)

        guard skyfall else { return evaluation }
        for cascade in 1...8 {
            let groups = findGroups(in: working, phase: .skyfall, rules: rules)
            guard !groups.isEmpty else { break }
            record(groups: groups, board: working, in: &evaluation, initial: false)
            working = collapsed(board: working, removing: Set(groups.flatMap { $0 }), cascade: cascade)
        }
        return evaluation
    }

    static func theoreticalMax(_ board: Board, rules: RuleProfile) -> Int {
        var result = 0
        for orb in Orb.allCases {
            let stock = board.count(orb)
            let minimum = max(1, rules.rule(for: orb).minimum)
            result += stock / minimum
        }
        return result
    }

    static func potential(_ board: Board, rules: RuleProfile) -> Double {
        var score = 0.0
        for row in playRows {
            for col in 0..<Board.cols {
                guard let orb = board[Coordinate(row: row, col: col)].orb else { continue }
                if col + 1 < Board.cols, board[Coordinate(row: row, col: col + 1)].orb == orb { score += 1.2 }
                if row + 1 < Board.rows, board[Coordinate(row: row + 1, col: col)].orb == orb { score += 1.2 }
                if col + 2 < Board.cols, board[Coordinate(row: row, col: col + 2)].orb == orb { score += 0.45 }
                if row + 2 < Board.rows, board[Coordinate(row: row + 2, col: col)].orb == orb { score += 0.45 }
            }
        }
        return score
    }

    static func hash(_ board: Board, current: Coordinate? = nil, held: BoardCell? = nil) -> UInt64 {
        var value: UInt64 = 0xcbf29ce484222325
        for cell in board.cells.flatMap({ $0 }) {
            let part = UInt64((cell.orb?.rawValue ?? 6) + cell.mark.rawValue * 8 + 1)
            value ^= part
            value &*= 0x100000001b3
        }
        if let current {
            value ^= UInt64(current.row * 31 + current.col + 101)
            value &*= 0x100000001b3
        }
        if let held {
            value ^= UInt64((held.orb?.rawValue ?? 6) + 211)
            value &*= 0x100000001b3
        }
        return value
    }

    private enum EvaluationPhase { case initial, skyfall }

    private static func findGroups(in board: Board, phase: EvaluationPhase, rules: RuleProfile) -> [[Coordinate]] {
        var groups: [[Coordinate]] = []

        for row in playRows {
            var col = 0
            while col < Board.cols {
                guard let orb = matchOrb(board[Coordinate(row: row, col: col)], phase: phase) else {
                    col += 1
                    continue
                }
                var end = col + 1
                while end < Board.cols, matchOrb(board[Coordinate(row: row, col: end)], phase: phase) == orb { end += 1 }
                if rules.rule(for: orb).mode == .line, end - col >= rules.rule(for: orb).minimum {
                    groups.append((col..<end).map { Coordinate(row: row, col: $0) })
                }
                col = end
            }
        }

        for col in 0..<Board.cols {
            var row = Board.playRowStart
            while row < Board.rows {
                guard let orb = matchOrb(board[Coordinate(row: row, col: col)], phase: phase) else {
                    row += 1
                    continue
                }
                var end = row + 1
                while end < Board.rows, matchOrb(board[Coordinate(row: end, col: col)], phase: phase) == orb { end += 1 }
                if rules.rule(for: orb).mode == .line, end - row >= rules.rule(for: orb).minimum {
                    groups.append((row..<end).map { Coordinate(row: $0, col: col) })
                }
                row = end
            }
        }

        for orb in Orb.allCases {
            guard rules.rule(for: orb).mode == .connected else { continue }
            let candidates = Set((playRows).flatMap { row in
                (0..<Board.cols).compactMap { col in
                    let coordinate = Coordinate(row: row, col: col)
                    return matchOrb(board[coordinate], phase: phase) == orb ? coordinate : nil
                }
            })
            var visited = Set<Coordinate>()
            for start in candidates where !visited.contains(start) {
                var component: [Coordinate] = []
                var queue = [start]
                visited.insert(start)
                while let next = queue.first {
                    queue.removeFirst()
                    component.append(next)
                    for neighbor in neighbors(of: next, diagonal: false) where candidates.contains(neighbor) && !visited.contains(neighbor) {
                        visited.insert(neighbor)
                        queue.append(neighbor)
                    }
                }
                if component.count >= rules.rule(for: orb).minimum {
                    groups.append(component)
                }
            }
        }

        return groups
    }

    private static func matchOrb(_ cell: BoardCell, phase: EvaluationPhase) -> Orb? {
        guard let orb = cell.orb else { return nil }
        if phase == .initial, (cell.mark == .n1 || cell.mark == .n2) { return nil }
        if phase == .skyfall, cell.mark == .n1 { return nil }
        return orb
    }

    private static func record(groups: [[Coordinate]], board: Board, in evaluation: inout Evaluation, initial: Bool) {
        if initial { evaluation.initialGroups += groups.count } else { evaluation.skyfallGroups += groups.count }
        let all = groups.flatMap { $0 }
        let unique = Set(all)
        if initial { evaluation.initialCleared += unique.count } else { evaluation.skyfallCleared += unique.count }

        for group in groups {
            if let first = group.first, let orb = board[first].orb {
                recordGroup(orb, group: group, evaluation: &evaluation)
            }
        }
    }

    private static func recordGroup(_ orb: Orb, group: [Coordinate], evaluation: inout Evaluation) {
        evaluation.comboCountsByOrb[orb.rawValue] += 1
        if group.count < evaluation.comboSizeCountsByOrb[orb.rawValue].count {
            evaluation.comboSizeCountsByOrb[orb.rawValue][group.count] += 1
        }
        let cells = Set(group)
        if isCross(cells) { evaluation.crossCount += 1 }
        if isL(cells) { evaluation.lCount += 1 }
        if isT(cells) { evaluation.tCount += 1 }
    }

    private static func collapsed(board: Board, removing: Set<Coordinate>, cascade: Int) -> Board {
        var next = board
        for col in 0..<Board.cols {
            let survivors = playRows.compactMap { row -> BoardCell? in
                let coordinate = Coordinate(row: row, col: col)
                return removing.contains(coordinate) ? nil : board[coordinate]
            }
            let missing = Board.rows - Board.playRowStart - survivors.count
            var values = Array(repeating: BoardCell.empty, count: missing)
            for row in 0..<missing {
                let seed = UInt64((cascade + 1) * 997 + row * 37 + col * 17)
                values[row] = BoardCell(orb: Orb(rawValue: Int(seed % UInt64(Orb.allCases.count))))
            }
            let compacted = values + survivors
            for (offset, row) in playRows.enumerated() {
                next[Coordinate(row: row, col: col)] = compacted[offset]
            }
        }
        return next
    }

    static func neighbors(of coordinate: Coordinate, diagonal: Bool) -> [Coordinate] {
        let base = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        let diagonalMoves = diagonal ? [(1, 1), (1, -1), (-1, 1), (-1, -1)] : []
        return (base + diagonalMoves).compactMap { move in
            let (rowDelta, colDelta) = move
            let row = coordinate.row + rowDelta
            let col = coordinate.col + colDelta
            guard row >= 0, row < Board.rows, col >= 0, col < Board.cols else { return nil }
            return Coordinate(row: row, col: col)
        }
    }

    private static func isCross(_ cells: Set<Coordinate>) -> Bool {
        cells.contains { center in
            let arms = [Coordinate(row: center.row - 1, col: center.col), Coordinate(row: center.row + 1, col: center.col), Coordinate(row: center.row, col: center.col - 1), Coordinate(row: center.row, col: center.col + 1)]
            return arms.allSatisfy(cells.contains)
        }
    }

    private static func isL(_ cells: Set<Coordinate>) -> Bool {
        guard cells.count >= 5 else { return false }
        let rows = Dictionary(grouping: cells, by: \Coordinate.row).values.map(\.count)
        let cols = Dictionary(grouping: cells, by: \Coordinate.col).values.map(\.count)
        return rows.contains { $0 >= 3 } && cols.contains { $0 >= 3 } && !isCross(cells)
    }

    private static func isT(_ cells: Set<Coordinate>) -> Bool {
        guard cells.count >= 5 else { return false }
        return cells.contains { center in
            let horizontal = cells.filter { $0.row == center.row }.count >= 3
            let vertical = cells.filter { $0.col == center.col }.count >= 3
            let up = cells.contains(Coordinate(row: center.row - 1, col: center.col))
            let down = cells.contains(Coordinate(row: center.row + 1, col: center.col))
            return horizontal && vertical && (up != down)
        }
    }

    private static func rectangleCounts(in board: Board) -> [String: Int] {
        var result: [String: Int] = [:]
        for rows in 3...5 {
            for cols in 3...5 {
                var count = 0
                for top in Board.playRowStart...(Board.rows - rows) {
                    for left in 0...(Board.cols - cols) {
                        let cells = (top..<(top + rows)).flatMap { row in (left..<(left + cols)).map { Coordinate(row: row, col: $0) } }
                        let orbs = cells.compactMap { board[$0].orb }
                        if orbs.count == cells.count, Set(orbs).count == 1 { count += 1 }
                    }
                }
                result["\(rows)x\(cols)"] = count
            }
        }
        return result
    }

    static func specialValue(_ special: SpecialPriority, evaluation: Evaluation) -> Int {
        switch special.type {
        case .none: return 0
        case .combo: return evaluation.initialGroups
        case .cross: return evaluation.crossCount
        case .lShape: return evaluation.lCount
        case .tShape: return evaluation.tCount
        case .clearCount: return evaluation.initialCleared
        case .rectangle:
            return evaluation.rectangles["\(special.rectRows)x\(special.rectCols)"] ?? 0
        case .equalFirst:
            guard let first = special.equalOrbs.first else { return 0 }
            let values = special.equalOrbs.map { evaluation.comboCountsByOrb[$0.rawValue] }
            return values.allSatisfy { $0 > 0 && $0 == evaluation.comboCountsByOrb[first.rawValue] } ? evaluation.comboCountsByOrb[first.rawValue] : 0
        }
    }

    static func ruleSatisfied(_ evaluation: Evaluation, profile: RuleProfile) -> Bool {
        profile.requirements.allSatisfy { requirement in
            let got = evaluation.comboSizeCountsByOrb[requirement.orb.rawValue][min(requirement.size, 11)]
            requirement.match == .atLeast ? got >= requirement.count : got == requirement.count
        }
    }

    static func specialsSatisfied(_ evaluation: Evaluation, specials: [SpecialPriority]) -> Bool {
        specials.filter { $0.type != .none }.allSatisfy { special in
            let value = specialValue(special, evaluation: evaluation)
            switch special.type {
            case .equalFirst, .rectangle: return value > 0
            case .clearCount: return value == special.clearCount
            case .none: return true
            default: return value >= special.count
            }
        }
    }
}
