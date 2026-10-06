package com.comboauto

import kotlin.math.max

object BoardEngine {
    private val playRows = Board.PLAY_ROW_START until Board.ROWS

    fun evaluate(board: Board, skyfall: Boolean, rules: RuleProfile): Evaluation {
        var working = board.copy()
        val evaluation = Evaluation()
        val initial = findGroups(working, Phase.INITIAL, rules)
        record(initial, working, evaluation, true)
        evaluation.rectangles.putAll(rectangleCounts(working))
        if (initial.isEmpty()) return evaluation
        working = collapsed(working, initial.flatten().toHashSet(), 0)
        if (!skyfall) return evaluation
        for (cascade in 1..8) {
            val groups = findGroups(working, Phase.SKYFALL, rules)
            if (groups.isEmpty()) break
            record(groups, working, evaluation, false)
            working = collapsed(working, groups.flatten().toHashSet(), cascade)
        }
        return evaluation
    }

    fun theoreticalMax(board: Board, rules: RuleProfile): Int = Orb.values().sumOf { board.count(it) / max(1, rules.orbRules[it.ordinal].minimum) }

    fun potential(board: Board): Double {
        var score = 0.0
        for (row in playRows) for (col in 0 until Board.COLS) {
            val orb = board[Coord(row, col)].orb ?: continue
            if (col + 1 < Board.COLS && board[Coord(row, col + 1)].orb == orb) score += 1.2
            if (row + 1 < Board.ROWS && board[Coord(row + 1, col)].orb == orb) score += 1.2
            if (col + 2 < Board.COLS && board[Coord(row, col + 2)].orb == orb) score += 0.45
            if (row + 2 < Board.ROWS && board[Coord(row + 2, col)].orb == orb) score += 0.45
        }
        return score
    }

    fun hash(board: Board, current: Coord? = null, held: BoardCell? = null): Long {
        var value = -3750763034362895579L
        board.cells.flatten().forEach { cell ->
            value = (value xor ((cell.orb?.ordinal ?: 6) + cell.mark.ordinal * 8 + 1).toLong()) * 1099511628211L
        }
        current?.let { value = (value xor (it.row * 31L + it.col + 101L)) * 1099511628211L }
        held?.let { value = (value xor ((it.orb?.ordinal ?: 6) + 211L)) * 1099511628211L }
        return value
    }

    fun neighbors(coord: Coord, diagonal: Boolean): List<Coord> {
        val moves = mutableListOf(0 to 1, 0 to -1, 1 to 0, -1 to 0)
        if (diagonal) moves += listOf(1 to 1, 1 to -1, -1 to 1, -1 to -1)
        return moves.mapNotNull { (dr, dc) ->
            val r = coord.row + dr; val c = coord.col + dc
            if (r in 0 until Board.ROWS && c in 0 until Board.COLS) Coord(r, c) else null
        }
    }

    fun ruleSatisfied(evaluation: Evaluation, profile: RuleProfile): Boolean = profile.requirements.all { requirement ->
        val got = evaluation.comboSizeCountsByOrb[requirement.orb.ordinal][requirement.size.coerceIn(0, 11)]
        if (requirement.match == RequirementMatch.AT_LEAST) got >= requirement.count else got == requirement.count
    }

    fun specialValue(special: SpecialPriority, evaluation: Evaluation): Int = when (special.type) {
        SpecialType.NONE -> 0
        SpecialType.COMBO -> evaluation.initialGroups
        SpecialType.CROSS -> evaluation.crossCount
        SpecialType.L_SHAPE -> evaluation.lCount
        SpecialType.T_SHAPE -> evaluation.tCount
        SpecialType.CLEAR_COUNT -> evaluation.initialCleared
        SpecialType.RECTANGLE -> evaluation.rectangles["${special.rectRows}x${special.rectCols}"] ?: 0
        SpecialType.EQUAL_FIRST -> {
            val values = special.equalOrbs.map { evaluation.comboCountsByOrb[it.ordinal] }
            if (values.isNotEmpty() && values.all { it > 0 && it == values.first() }) values.first() else 0
        }
    }

    fun specialsSatisfied(evaluation: Evaluation, specials: List<SpecialPriority>): Boolean = specials.filter { it.type != SpecialType.NONE }.all { special ->
        val value = specialValue(special, evaluation)
        when (special.type) {
            SpecialType.EQUAL_FIRST, SpecialType.RECTANGLE -> value > 0
            SpecialType.CLEAR_COUNT -> value == special.clearCount
            SpecialType.NONE -> true
            else -> value >= special.count
        }
    }

    private enum class Phase { INITIAL, SKYFALL }

    private fun findGroups(board: Board, phase: Phase, rules: RuleProfile): List<List<Coord>> {
        val groups = mutableListOf<List<Coord>>()
        for (row in playRows) {
            var col = 0
            while (col < Board.COLS) {
                val orb = matchOrb(board[Coord(row, col)], phase)
                if (orb == null) { col++; continue }
                var end = col + 1
                while (end < Board.COLS && matchOrb(board[Coord(row, end)], phase) == orb) end++
                if (rules.orbRules[orb.ordinal].mode == ClearMode.LINE && end - col >= rules.orbRules[orb.ordinal].minimum) groups += (col until end).map { Coord(row, it) }
                col = end
            }
        }
        for (col in 0 until Board.COLS) {
            var row = Board.PLAY_ROW_START
            while (row < Board.ROWS) {
                val orb = matchOrb(board[Coord(row, col)], phase)
                if (orb == null) { row++; continue }
                var end = row + 1
                while (end < Board.ROWS && matchOrb(board[Coord(end, col)], phase) == orb) end++
                if (rules.orbRules[orb.ordinal].mode == ClearMode.LINE && end - row >= rules.orbRules[orb.ordinal].minimum) groups += (row until end).map { Coord(it, col) }
                row = end
            }
        }
        for (orb in Orb.values()) if (rules.orbRules[orb.ordinal].mode == ClearMode.CONNECTED) {
            val candidates = playRows.flatMap { row -> (0 until Board.COLS).mapNotNull { col -> Coord(row, col).takeIf { matchOrb(board[it], phase) == orb } } }.toHashSet()
            val visited = hashSetOf<Coord>()
            for (start in candidates) if (visited.add(start)) {
                val component = mutableListOf<Coord>(); val queue = ArrayDeque<Coord>(); queue.add(start)
                while (queue.isNotEmpty()) {
                    val next = queue.removeFirst(); component += next
                    neighbors(next, false).filter { it in candidates && visited.add(it) }.forEach { queue.add(it) }
                }
                if (component.size >= rules.orbRules[orb.ordinal].minimum) groups += component
            }
        }
        return groups
    }

    private fun matchOrb(cell: BoardCell, phase: Phase): Orb? {
        val orb = cell.orb ?: return null
        if (phase == Phase.INITIAL && (cell.mark == CellMark.N1 || cell.mark == CellMark.N2)) return null
        if (phase == Phase.SKYFALL && cell.mark == CellMark.N1) return null
        return orb
    }

    private fun record(groups: List<List<Coord>>, board: Board, evaluation: Evaluation, initial: Boolean) {
        if (initial) evaluation.initialGroups += groups.size else evaluation.skyfallGroups += groups.size
        val unique = groups.flatten().toHashSet()
        if (initial) evaluation.initialCleared += unique.size else evaluation.skyfallCleared += unique.size
        groups.forEach { group -> group.firstOrNull()?.let { board[it].orb }?.let { orb ->
            evaluation.comboCountsByOrb[orb.ordinal]++
            if (group.size < 12) evaluation.comboSizeCountsByOrb[orb.ordinal][group.size]++
            val cells = group.toHashSet()
            if (isCross(cells)) evaluation.crossCount++
            if (isL(cells)) evaluation.lCount++
            if (isT(cells)) evaluation.tCount++
        } }
    }

    private fun collapsed(board: Board, removing: Set<Coord>, cascade: Int): Board {
        val next = board.copy()
        for (col in 0 until Board.COLS) {
            val survivors = playRows.mapNotNull { row ->
                val coordinate = Coord(row, col)
                if (coordinate in removing) null else board[coordinate].copy()
            }
            val missing = Board.ROWS - Board.PLAY_ROW_START - survivors.size
            val generated = (0 until missing).map { row -> BoardCell(Orb.values()[(cascade * 997 + row * 37 + col * 17).mod(Orb.values().size)]) }
            val compacted = generated + survivors
            playRows.forEachIndexed { index, row -> next[Coord(row, col)] = compacted[index] }
        }
        return next
    }

    private fun isCross(cells: Set<Coord>): Boolean = cells.any { center ->
        listOf(Coord(center.row - 1, center.col), Coord(center.row + 1, center.col), Coord(center.row, center.col - 1), Coord(center.row, center.col + 1)).all { it in cells }
    }
    private fun isL(cells: Set<Coord>): Boolean { if (cells.size < 5 || isCross(cells)) return false; return cells.groupingBy { it.row }.eachCount().values.any { it >= 3 } && cells.groupingBy { it.col }.eachCount().values.any { it >= 3 } }
    private fun isT(cells: Set<Coord>): Boolean = cells.any { center ->
        val horizontal = cells.count { it.row == center.row } >= 3
        val vertical = cells.count { it.col == center.col } >= 3
        horizontal && vertical && ((Coord(center.row - 1, center.col) in cells) != (Coord(center.row + 1, center.col) in cells))
    }

    private fun rectangleCounts(board: Board): Map<String, Int> = buildMap {
        for (rows in 3..5) for (cols in 3..5) {
            var count = 0
            for (top in Board.PLAY_ROW_START..(Board.ROWS - rows)) for (left in 0..(Board.COLS - cols)) {
                val cells = (top until top + rows).flatMap { row -> (left until left + cols).map { col -> board[Coord(row, col)].orb } }
                if (cells.all { it != null } && cells.toSet().size == 1) count++
            }
            put("${rows}x${cols}", count)
        }
    }

}
