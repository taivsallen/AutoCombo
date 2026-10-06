package com.comboauto

import android.graphics.Color
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

enum class Orb(val label: String, val assetName: String, val tint: Int) {
    WATER("Water", "orb_water", Color.rgb(40, 170, 245)),
    FIRE("Fire", "orb_fire", Color.rgb(245, 65, 55)),
    EARTH("Earth", "orb_earth", Color.rgb(55, 195, 90)),
    LIGHT("Light", "orb_light", Color.rgb(250, 205, 35)),
    DARK("Dark", "orb_dark", Color.rgb(145, 85, 220)),
    HEART("Heart", "orb_heart", Color.rgb(245, 80, 145));

    companion object { fun fromId(id: Int): Orb? = values().getOrNull(id) }
}

enum class CellMark(val label: String, val tint: Int) {
    NONE("None", Color.TRANSPARENT), X1("X1", Color.rgb(255, 160, 50)), X2("X2", Color.RED),
    START("Start", Color.CYAN), END("End", Color.MAGENTA), N1("N1", Color.BLUE), N2("N2", Color.rgb(100, 80, 220))
}

/**
 * App.jsx stores X/Q/N states in one encoded integer.  Keep the decoded mark
 * for the Android UI, but retain the original integer whenever a board came
 * from the JS solver so a later solve does not lose combined marks.
 */
data class BoardCell(
    var orb: Orb?,
    var mark: CellMark = CellMark.NONE,
    var encodedValue: Int? = null
)
data class Coord(val row: Int, val col: Int)

class Board(val cells: Array<Array<BoardCell>>) {
    companion object {
        const val ROWS = 6
        const val COLS = 6
        const val PLAY_ROW_START = 1

        fun sample() = Board(arrayOf(
            arrayOf(Orb.WATER, Orb.FIRE, Orb.EARTH, Orb.LIGHT, Orb.DARK, Orb.HEART),
            arrayOf(Orb.WATER, Orb.WATER, Orb.FIRE, Orb.EARTH, Orb.LIGHT, Orb.DARK),
            arrayOf(Orb.FIRE, Orb.EARTH, Orb.EARTH, Orb.LIGHT, Orb.DARK, Orb.HEART),
            arrayOf(Orb.WATER, Orb.FIRE, Orb.LIGHT, Orb.LIGHT, Orb.HEART, Orb.HEART),
            arrayOf(Orb.EARTH, Orb.EARTH, Orb.WATER, Orb.DARK, Orb.DARK, Orb.FIRE),
            arrayOf(Orb.HEART, Orb.WATER, Orb.FIRE, Orb.EARTH, Orb.LIGHT, Orb.WATER)
        ))

        fun random(seed: Long): Board {
            val random = Random(seed)
            return Board(Array(ROWS) { Array(COLS) { BoardCell(Orb.values()[random.nextInt(Orb.values().size)]) } })
        }

        private fun markFromEncoded(value: Int): CellMark {
            if (value < 0) return CellMark.NONE
            return when {
                (value / 100) % 10 == 1 -> CellMark.START
                (value / 100) % 10 == 2 -> CellMark.END
                (value / 10) % 10 == 1 -> CellMark.X1
                (value / 10) % 10 == 2 -> CellMark.X2
                (value / 1000) % 10 == 1 -> CellMark.N1
                (value / 1000) % 10 == 2 -> CellMark.N2
                else -> CellMark.NONE
            }
        }

        fun decode(encoded: String): Board? {
            return try {
                val rows = encoded.split(';')
                if (rows.size != ROWS) return null
                val cells = Array(ROWS) { row ->
                    val values = rows[row].split(',')
                    if (values.size != COLS) return null
                    Array(COLS) { col ->
                        val parts = values[col].split(':')
                        val orbValue = parts[0].toInt()
                        val mark = CellMark.values().getOrElse(parts.getOrNull(1)?.toInt() ?: 0) { CellMark.NONE }
                        val rawValue = parts.getOrNull(2)?.takeIf { it.isNotBlank() }?.toIntOrNull()
                        BoardCell(
                            Orb.fromId(orbValue),
                            if (rawValue != null) markFromEncoded(rawValue) else mark,
                            rawValue
                        )
                    }
                }
                Board(cells)
            } catch (_: Exception) { null }
        }
    }

    constructor(orbs: Array<Array<Orb>>) : this(Array(ROWS) { row -> Array(COLS) { col -> BoardCell(orbs[row][col]) } })

    operator fun get(coord: Coord): BoardCell = cells[coord.row][coord.col]
    operator fun set(coord: Coord, value: BoardCell) { cells[coord.row][coord.col] = value }

    fun copy(): Board = Board(Array(ROWS) { row -> Array(COLS) { col -> cells[row][col].copy() } })
    fun map(transform: (BoardCell) -> BoardCell): Board = Board(Array(ROWS) { row -> Array(COLS) { col -> transform(cells[row][col]) } })
    fun count(orb: Orb): Int = cells.sumOf { row -> row.count { it.orb == orb } }
    fun encode(): String = cells.joinToString(";") { row ->
        row.joinToString(",") {
            "${it.orb?.ordinal ?: -1}:${it.mark.ordinal}:${it.encodedValue ?: ""}"
        }
    }

}

enum class ClearMode { LINE, CONNECTED }
data class OrbRule(var minimum: Int = 3, var mode: ClearMode = ClearMode.LINE)
enum class RequirementMatch { EXACT, AT_LEAST }
data class RuleRequirement(var orb: Orb = Orb.WATER, var size: Int = 3, var count: Int = 1, var match: RequirementMatch = RequirementMatch.EXACT)
data class RuleProfile(
    val orbRules: MutableList<OrbRule> = MutableList(Orb.values().size) { OrbRule() },
    val requirements: MutableList<RuleRequirement> = mutableListOf()
)

enum class SpecialType { NONE, COMBO, CROSS, L_SHAPE, T_SHAPE, RECTANGLE, CLEAR_COUNT, EQUAL_FIRST }
data class SpecialPriority(
    var type: SpecialType = SpecialType.NONE,
    var count: Int = 1,
    var orb: Orb? = null,
    var clearCount: Int = 3,
    var rectRows: Int = 3,
    var rectCols: Int = 3,
    val equalOrbs: MutableList<Orb> = mutableListOf()
)

enum class SolverPriority { COMBO, STEPS }

/**
 * Android always runs the Combo-first branch.  Keep a finite internal search
 * guard so a malformed board can never make the worker search forever; it is
 * deliberately not exposed as a user-facing step limit or scoring target.
 */
object AndroidSolverTuning {
    // Low-latency Android preset. The App.jsx BeamSolve ranking and all
    // constraints remain unchanged; only the amount of candidate expansion
    // is reduced to keep SEARCH responsive on a phone.
    const val BEAM_WIDTH = 640
    const val MAX_NODES = 110000
    const val SEARCH_STEP_GUARD = 120
    const val REPLAY_SPEED = 50
}

data class SolverSettings(
    var priority: SolverPriority = SolverPriority.COMBO,
    var targetCombo: Int = 8,
    /** When false, initTargetCombo is intentionally omitted from the solver payload. */
    var targetComboEnabled: Boolean = false,
    var initTargetCombo: Int = 1,
    /** Optional soft objective; Android never rejects a route only because of this target. */
    var targetStepEnabled: Boolean = false,
    var targetStep: Int = 1,
    var skyfallEnabled: Boolean = true,
    var diagonalEnabled: Boolean = true,
    var row0Enabled: Boolean = true,
    // One fixed Android budget: balanced enough for a quick response while
    // retaining the same Combo-first BeamSolve selection logic.
    var performanceLevel: Int = 3,
    var maxSteps: Int = AndroidSolverTuning.SEARCH_STEP_GUARD,
    var hardStepLimitEnabled: Boolean = false,
    var hardStepLimit: Int = AndroidSolverTuning.SEARCH_STEP_GUARD,
    var beamWidth: Int = AndroidSolverTuning.BEAM_WIDTH,
    var maxNodes: Int = AndroidSolverTuning.MAX_NODES,
    var humanPlanner: Boolean = true,
    var reversePlanner: Boolean = true,
    var reverseMaxSteps: Int = 60,
    var stepPenalty: Int = 0,
    var potentialWeight: Int = 10,
    var clearedWeight: Int = 300,
    // Kept for replay/export migration; live auto-rotation uses the fixed
    // Android speed and does not expose a speed selector.
    var replaySpeed: Int = AndroidSolverTuning.REPLAY_SPEED,
    // App.jsx DEFAULT_CONFIG.searchSeed is 0.  Keep the same deterministic
    // tie-breaking seed; board randomization is a separate concern.
    var boardSeed: Long = 0L,
    var startRow: Int = -1,
    var startCol: Int = -1,
    var endRow: Int = -1,
    var endCol: Int = -1,
    var shieldType: SpecialType = SpecialType.NONE,
    var shieldCount: Int = 1,
    var shieldOrb: Int = -1,
    var shieldClearCount: Int = 3,
    var shieldRectRows: Int = 3,
    var shieldRectCols: Int = 3,
    var equalFirstMask: Int = 63
) {
    fun applyPerformance(level: Int) {
        // The Android build intentionally has one tuned budget.  Keep this
        // method for persisted-state/legacy-panel compatibility, but never
        // let a stale Lv1~Lv5 value change the search quality.
        performanceLevel = 3
        beamWidth = AndroidSolverTuning.BEAM_WIDTH
        maxNodes = AndroidSolverTuning.MAX_NODES
    }
    fun startCoord(): Coord? = if (startRow in 0 until Board.ROWS && startCol in 0 until Board.COLS) Coord(startRow, startCol) else null
    fun endCoord(): Coord? = if (endRow in 0 until Board.ROWS && endCol in 0 until Board.COLS) Coord(endRow, endCol) else null
    fun startLabel(): String = startCoord()?.let { "${it.row + 1},${it.col + 1}" } ?: "Auto"
    fun endLabel(): String = endCoord()?.let { "${it.row + 1},${it.col + 1}" } ?: "Auto"
}

data class PerformanceProfile(val beamWidth: Int, val maxNodes: Int, val humanPlanner: Boolean, val reversePlanner: Boolean) {
    companion object {
        fun forLevel(level: Int): PerformanceProfile =
            PerformanceProfile(AndroidSolverTuning.BEAM_WIDTH, AndroidSolverTuning.MAX_NODES, true, true)
    }
}

data class SolverStats(
    var theoreticalMax: Int = 0,
    var combos: Int = 0,
    var skyfallCombos: Int = 0,
    var initialCleared: Int = 0,
    var skyfallCleared: Int = 0,
    var steps: Int = 0,
    var crossCount: Int = 0,
    var lCount: Int = 0,
    var tCount: Int = 0
)

data class Evaluation(
    var initialGroups: Int = 0,
    var skyfallGroups: Int = 0,
    var initialCleared: Int = 0,
    var skyfallCleared: Int = 0,
    val comboCountsByOrb: IntArray = IntArray(Orb.values().size),
    val comboSizeCountsByOrb: Array<IntArray> = Array(Orb.values().size) { IntArray(12) },
    var crossCount: Int = 0,
    var lCount: Int = 0,
    var tCount: Int = 0,
    val rectangles: MutableMap<String, Int> = mutableMapOf()
) {
    val totalCombos: Int get() = initialGroups + skyfallGroups
    val cleared: Int get() = initialCleared + skyfallCleared
}

data class SolverResult(
    val board: Board,
    val path: List<Coord>,
    val evaluation: Evaluation,
    val hardSatisfied: Boolean,
    val score: Double,
    /** App.jsx's specialTuple stores [done, guide] for each configured slot. */
    val specialStatus: List<Boolean> = emptyList()
)
