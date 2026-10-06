import Foundation

enum SolverEngine {
    private struct SearchNode {
        var board: Board
        var held: BoardCell
        var current: Coordinate
        var path: [Coordinate]
        var heuristic: Double
    }

    struct Output {
        var results: [SolverResult]
        var nodes: Int
        var theoreticalMax: Int
    }

    static func solve(
        board: Board,
        settings: SolverSettings,
        rules: RuleProfile,
        specials: [SpecialPriority]
    ) -> Output {
        let width: Int
        let nodeBudget: Int
        switch settings.performanceLevel {
        case 1: width = 60; nodeBudget = 2_500
        case 2: width = 120; nodeBudget = 5_000
        case 3: width = 240; nodeBudget = 10_000
        case 4: width = 420; nodeBudget = 18_000
        default: width = 640; nodeBudget = 30_000
        }

        let theoretical = BoardEngine.theoreticalMax(board, rules: rules)
        let target = max(1, min(settings.targetCombo, max(theoretical, 1)))
        let startRows = settings.row0Enabled ? 0..<Board.rows : Board.playRowStart..<Board.rows
        var frontier: [SearchNode] = []

        for row in startRows {
            for col in 0..<Board.cols {
                let coordinate = Coordinate(row: row, col: col)
                let held = board[coordinate]
                guard held.orb != nil else { continue }
                var openBoard = board
                openBoard[coordinate] = .empty
                frontier.append(SearchNode(board: openBoard, held: held, current: coordinate, path: [coordinate], heuristic: 0))
            }
        }

        var output: [SolverResult] = []
        var resultHashes = Set<UInt64>()
        var visited: [UInt64: Int] = [:]
        var nodes = 0
        var depth = 0

        while !frontier.isEmpty, depth < settings.maxSteps, nodes < nodeBudget {
            var nextFrontier: [SearchNode] = []
            nextFrontier.reserveCapacity(min(nodeBudget - nodes, width * 8))

            for node in frontier {
                let neighbors = BoardEngine.neighbors(of: node.current, diagonal: settings.diagonalEnabled)
                for destination in neighbors {
                    guard destination.row >= Board.playRowStart || settings.row0Enabled else { continue }
                    nodes += 1

                    var nextBoard = node.board
                    let targetCell = nextBoard[destination]
                    nextBoard[destination] = node.held
                    var path = node.path
                    path.append(destination)

                    let nextHash = BoardEngine.hash(nextBoard, current: destination, held: targetCell)
                    if let oldDepth = visited[nextHash], oldDepth <= path.count { continue }
                    visited[nextHash] = path.count

                    let finalBoard = makeFinalBoard(nextBoard, held: targetCell, current: destination)
                    let evaluation = BoardEngine.evaluate(finalBoard, skyfall: settings.skyfallEnabled, rules: rules)
                    let score = score(evaluation: evaluation, pathCount: path.count, target: target, settings: settings, rules: rules, specials: specials)
                    let hardSatisfied = BoardEngine.ruleSatisfied(evaluation, profile: rules) && BoardEngine.specialsSatisfied(evaluation, specials: specials)

                    if path.count >= 2 {
                        let resultHash = BoardEngine.hash(finalBoard)
                        if !resultHashes.contains(resultHash) {
                            resultHashes.insert(resultHash)
                            output.append(SolverResult(board: finalBoard, path: path, evaluation: evaluation, hardSatisfied: hardSatisfied, score: score))
                            output.sort(by: resultSort(settings: settings))
                            if output.count > 12 { output.removeLast(output.count - 12) }
                        }
                    }

                    let potential = BoardEngine.potential(finalBoard, rules: rules)
                    nextFrontier.append(SearchNode(board: nextBoard, held: targetCell, current: destination, path: path, heuristic: score + potential * 120))
                    if nodes >= nodeBudget { break }
                }
                if nodes >= nodeBudget { break }
            }

            nextFrontier.sort { lhs, rhs in
                if lhs.heuristic != rhs.heuristic { return lhs.heuristic > rhs.heuristic }
                return stablePathKey(lhs.path) < stablePathKey(rhs.path)
            }
            if nextFrontier.count > width { nextFrontier.removeLast(nextFrontier.count - width) }
            frontier = nextFrontier
            depth += 1

            // A good short solution is already useful; the remaining search
            // continues only when it can improve the requested priority.
            if settings.priority == .steps,
               let best = output.first,
               best.hardSatisfied,
               best.evaluation.totalCombos >= target,
               best.path.count <= 6,
               depth >= 10 {
                break
            }
        }

        if output.isEmpty {
            let evaluation = BoardEngine.evaluate(board, skyfall: settings.skyfallEnabled, rules: rules)
            output = [SolverResult(board: board, path: [], evaluation: evaluation, hardSatisfied: BoardEngine.ruleSatisfied(evaluation, profile: rules) && BoardEngine.specialsSatisfied(evaluation, specials: specials), score: score(evaluation: evaluation, pathCount: 0, target: target, settings: settings, rules: rules, specials: specials))]
        }

        return Output(results: Array(output.prefix(10)), nodes: nodes, theoreticalMax: theoretical)
    }

    static func makeFinalBoard(_ board: Board, held: BoardCell, current: Coordinate) -> Board {
        var result = board
        result[current] = held
        return result
    }

    private static func score(
        evaluation: Evaluation,
        pathCount: Int,
        target: Int,
        settings: SolverSettings,
        rules: RuleProfile,
        specials: [SpecialPriority]
    ) -> Double {
        let hardRules = BoardEngine.ruleSatisfied(evaluation, profile: rules)
        let hardSpecials = BoardEngine.specialsSatisfied(evaluation, specials: specials)
        let combo = Double(evaluation.totalCombos)
        let miss = Double(max(0, target - evaluation.totalCombos))
        let hardBonus = (hardRules ? 100_000.0 : 0) + (hardSpecials ? 100_000.0 : 0)
        let specialProgress = Double(specials.filter { $0.type != .none && BoardEngine.specialValue($0, evaluation: evaluation) > 0 }.count) * 2_000
        let objective: Double
        if settings.priority == .combo {
            objective = combo * 15_000 - Double(pathCount) * 35
        } else {
            objective = combo * 5_000 - Double(pathCount) * 260
        }
        return hardBonus + specialProgress + objective - miss * miss * 4_500
    }

    private static func resultSort(settings: SolverSettings) -> (SolverResult, SolverResult) -> Bool {
        { lhs, rhs in
            if lhs.hardSatisfied != rhs.hardSatisfied { return lhs.hardSatisfied && !rhs.hardSatisfied }
            if lhs.evaluation.totalCombos != rhs.evaluation.totalCombos {
                return settings.priority == .combo ? lhs.evaluation.totalCombos > rhs.evaluation.totalCombos : lhs.evaluation.totalCombos > rhs.evaluation.totalCombos
            }
            if lhs.path.count != rhs.path.count { return lhs.path.count < rhs.path.count }
            return lhs.score > rhs.score
        }
    }

    private static func stablePathKey(_ path: [Coordinate]) -> String {
        path.map { "\($0.row)-\($0.col)" }.joined(separator: ".")
    }
}
