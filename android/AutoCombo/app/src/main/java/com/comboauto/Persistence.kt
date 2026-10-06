package com.comboauto

import android.content.Context
import android.graphics.PointF
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

data class SavedState(
    val board: Board,
    val settings: SolverSettings,
    val manualMode: Boolean,
    val rules: RuleProfile = RuleProfile(),
    val specials: List<SpecialPriority> = List(3) { SpecialPriority() }
)
data class SavedBoardRegion(
    val left: Int,
    val top: Int,
    val size: Int,
    val height: Int = BoardGeometry.fullHeightForSize(size)
)

class Persistence(private val context: Context) {
    private val prefs = context.getSharedPreferences("autocombo_state", Context.MODE_PRIVATE)
    private companion object {
        // Existing builds stored a 0.30-cell gap and also stored coordinates
        // produced by the old corner experiment.  Keep the user's new
        // calibration persistent, but discard that incompatible geometry once.
        const val GUIDE_GEOMETRY_VERSION = 3
        const val SETTINGS_VERSION = 3
    }

    fun load(): SavedState {
        val board = Board.decode(prefs.getString("board", null).orEmpty()) ?: Board.sample()
        // Builds before the App.jsx solver integration defaulted to the
        // heavyweight Android preset (800 beam / 145k nodes).  Migrate that
        // implicit default once so an existing installation behaves like the
        // main app after upgrade; explicit settings are preserved afterwards.
        val migrateLegacySolverDefaults = prefs.getInt("settings_version", 0) < SETTINGS_VERSION
        val settings = SolverSettings(
            priority = SolverPriority.COMBO,
            targetCombo = prefs.getInt("target_combo", 8),
            targetComboEnabled = prefs.getBoolean("target_combo_enabled", false),
            initTargetCombo = prefs.getInt("init_target_combo", 1),
            targetStepEnabled = prefs.getBoolean("target_step_enabled", false),
            targetStep = prefs.getInt("target_step", 1).coerceIn(1, AndroidSolverTuning.SEARCH_STEP_GUARD),
            skyfallEnabled = prefs.getBoolean("skyfall", true),
            diagonalEnabled = prefs.getBoolean("diagonal", true),
            row0Enabled = prefs.getBoolean("row0", true),
            performanceLevel = 3,
            maxSteps = AndroidSolverTuning.SEARCH_STEP_GUARD,
            hardStepLimitEnabled = false,
            hardStepLimit = AndroidSolverTuning.SEARCH_STEP_GUARD,
            beamWidth = AndroidSolverTuning.BEAM_WIDTH,
            maxNodes = AndroidSolverTuning.MAX_NODES,
            humanPlanner = prefs.getBoolean("human_planner", true),
            reversePlanner = prefs.getBoolean("reverse_planner", true),
            reverseMaxSteps = prefs.getInt("reverse_max_steps", 60),
            stepPenalty = prefs.getInt("step_penalty", 0),
            potentialWeight = prefs.getInt("potential_weight", 10),
            clearedWeight = prefs.getInt("cleared_weight", 300),
            replaySpeed = AndroidSolverTuning.REPLAY_SPEED,
            boardSeed = if (migrateLegacySolverDefaults) 0L else prefs.getLong("board_seed", 0L),
            startRow = prefs.getInt("start_row", -1),
            startCol = prefs.getInt("start_col", -1),
            endRow = prefs.getInt("end_row", -1),
            endCol = prefs.getInt("end_col", -1),
            shieldType = SpecialType.values().getOrElse(prefs.getInt("shield_type", 0)) { SpecialType.NONE },
            shieldCount = prefs.getInt("shield_count", 1),
            shieldOrb = prefs.getInt("shield_orb", -1),
            shieldClearCount = prefs.getInt("shield_clear_count", 3),
            shieldRectRows = prefs.getInt("shield_rect_rows", 3),
            shieldRectCols = prefs.getInt("shield_rect_cols", 3),
            equalFirstMask = prefs.getInt("equal_first_mask", 63)
        )
        val rules = decodeRules(prefs.getString("rules_json", null))
        val specials = decodeSpecials(prefs.getString("specials_json", null))
            ?: legacySpecials(settings)
        return SavedState(board, settings, prefs.getBoolean("manual", false), rules, specials)
    }

    fun save(board: Board, settings: SolverSettings, manual: Boolean, rules: RuleProfile, specials: List<SpecialPriority>) {
        prefs.edit()
            .putString("board", board.encode())
            .putBoolean("priority_combo", settings.priority == SolverPriority.COMBO)
            .putInt("target_combo", settings.targetCombo)
            .putBoolean("target_combo_enabled", settings.targetComboEnabled)
            .putInt("init_target_combo", settings.initTargetCombo)
            .putBoolean("target_step_enabled", settings.targetStepEnabled)
            .putInt("target_step", settings.targetStep.coerceIn(1, AndroidSolverTuning.SEARCH_STEP_GUARD))
            .putBoolean("skyfall", settings.skyfallEnabled)
            .putBoolean("diagonal", settings.diagonalEnabled)
            .putBoolean("row0", settings.row0Enabled)
            .putInt("performance", 3)
            .putInt("max_steps", AndroidSolverTuning.SEARCH_STEP_GUARD)
            .putBoolean("hard_step_limit_enabled", false)
            .putInt("hard_step_limit", AndroidSolverTuning.SEARCH_STEP_GUARD)
            .putInt("beam_width", AndroidSolverTuning.BEAM_WIDTH)
            .putInt("max_nodes", AndroidSolverTuning.MAX_NODES)
            .putBoolean("human_planner", settings.humanPlanner)
            .putBoolean("reverse_planner", settings.reversePlanner)
            .putInt("reverse_max_steps", settings.reverseMaxSteps)
            .putInt("step_penalty", settings.stepPenalty)
            .putInt("potential_weight", settings.potentialWeight)
            .putInt("cleared_weight", settings.clearedWeight)
            .putInt("replay_speed", AndroidSolverTuning.REPLAY_SPEED)
            .putLong("board_seed", settings.boardSeed)
            .putInt("start_row", settings.startRow)
            .putInt("start_col", settings.startCol)
            .putInt("end_row", settings.endRow)
            .putInt("end_col", settings.endCol)
            .putInt("shield_type", settings.shieldType.ordinal)
            .putInt("shield_count", settings.shieldCount)
            .putInt("shield_orb", settings.shieldOrb)
            .putInt("shield_clear_count", settings.shieldClearCount)
            .putInt("shield_rect_rows", settings.shieldRectRows)
            .putInt("shield_rect_cols", settings.shieldRectCols)
            .putInt("equal_first_mask", settings.equalFirstMask)
            .putInt("settings_version", SETTINGS_VERSION)
            .putString("rules_json", encodeRules(rules).toString())
            .putString("specials_json", encodeSpecials(specials).toString())
            .putBoolean("manual", manual)
            .apply()
    }

    private fun legacySpecials(settings: SolverSettings): List<SpecialPriority> {
        val first = SpecialPriority(
            type = settings.shieldType,
            count = settings.shieldCount,
            orb = Orb.fromId(settings.shieldOrb),
            clearCount = settings.shieldClearCount,
            rectRows = settings.shieldRectRows,
            rectCols = settings.shieldRectCols
        )
        for (orb in Orb.values()) {
            if ((settings.equalFirstMask and (1 shl orb.ordinal)) != 0) first.equalOrbs += orb
        }
        return listOf(first, SpecialPriority(), SpecialPriority())
    }

    private fun encodeRules(rules: RuleProfile): JSONObject {
        return JSONObject()
            .put("orbRules", JSONArray().apply {
                rules.orbRules.take(Orb.values().size).forEach { rule ->
                    put(JSONObject()
                        .put("minimum", rule.minimum)
                        .put("mode", rule.mode.name)
                    )
                }
            })
            .put("requirements", JSONArray().apply {
                rules.requirements.forEach { req ->
                    put(JSONObject()
                        .put("orb", req.orb.ordinal)
                        .put("size", req.size)
                        .put("count", req.count)
                        .put("match", req.match.name)
                    )
                }
            })
    }

    private fun decodeRules(raw: String?): RuleProfile {
        if (raw.isNullOrBlank()) return RuleProfile()
        return try {
            val root = JSONObject(raw)
            val orbRules = MutableList(Orb.values().size) { index ->
                val item = root.optJSONArray("orbRules")?.optJSONObject(index)
                OrbRule(
                    minimum = item?.optInt("minimum", 3)?.coerceIn(1, 5) ?: 3,
                    mode = runCatching { ClearMode.valueOf(item?.optString("mode", ClearMode.LINE.name) ?: ClearMode.LINE.name) }.getOrDefault(ClearMode.LINE)
                )
            }
            val requirements = mutableListOf<RuleRequirement>()
            val arr = root.optJSONArray("requirements") ?: JSONArray()
            for (i in 0 until arr.length()) {
                val item = arr.optJSONObject(i) ?: continue
                requirements += RuleRequirement(
                    orb = Orb.fromId(item.optInt("orb", 0)) ?: Orb.WATER,
                    size = item.optInt("size", 3).coerceIn(1, 5),
                    count = item.optInt("count", 1).coerceAtLeast(1),
                    match = runCatching { RequirementMatch.valueOf(item.optString("match", RequirementMatch.EXACT.name)) }.getOrDefault(RequirementMatch.EXACT)
                )
            }
            RuleProfile(orbRules, requirements)
        } catch (_: Exception) {
            RuleProfile()
        }
    }

    private fun encodeSpecials(specials: List<SpecialPriority>): JSONArray {
        return JSONArray().apply {
            specials.take(3).forEach { sp ->
                put(JSONObject()
                    .put("type", sp.type.name)
                    .put("count", sp.count)
                    .put("orb", sp.orb?.ordinal ?: -1)
                    .put("clearCount", sp.clearCount)
                    .put("rectRows", sp.rectRows)
                    .put("rectCols", sp.rectCols)
                    .put("equalOrbs", JSONArray().apply { sp.equalOrbs.distinct().forEach { put(it.ordinal) } })
                )
            }
        }
    }

    private fun decodeSpecials(raw: String?): List<SpecialPriority>? {
        if (raw.isNullOrBlank()) return null
        return try {
            val arr = JSONArray(raw)
            List(3) { index ->
                val item = arr.optJSONObject(index) ?: JSONObject()
                SpecialPriority(
                    type = runCatching { SpecialType.valueOf(item.optString("type", SpecialType.NONE.name)) }.getOrDefault(SpecialType.NONE),
                    count = item.optInt("count", 1).coerceAtLeast(1),
                    orb = Orb.fromId(item.optInt("orb", -1)),
                    clearCount = item.optInt("clearCount", 3).coerceIn(3, 30),
                    rectRows = item.optInt("rectRows", 3).coerceIn(2, 5),
                    rectCols = item.optInt("rectCols", 3).coerceIn(2, 6)
                ).also { sp ->
                    val eq = item.optJSONArray("equalOrbs") ?: JSONArray()
                    for (i in 0 until eq.length()) Orb.fromId(eq.optInt(i, -1))?.let { sp.equalOrbs += it }
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    fun loadBoardRegion(screenWidth: Int, screenHeight: Int): SavedBoardRegion {
        if (prefs.getInt("guide_geometry_version", 0) < GUIDE_GEOMETRY_VERSION) {
            prefs.edit()
                .remove("guide_left")
                .remove("guide_top")
                .remove("guide_size")
                .remove("guide_height")
                .putInt("guide_geometry_version", GUIDE_GEOMETRY_VERSION)
                .apply()
        }
        val density = context.resources.displayMetrics.density
        val bottomMargin = (96f * density).toInt()
        // The game board spans the screen width.  Leave only a tiny safety
        // margin for the overlay window instead of the old 8% shrinkage.
        val defaultSize = screenWidth.coerceAtLeast(360)
        val defaultHeight = BoardGeometry.fullHeightForSize(defaultSize)
        val defaultLeft = ((screenWidth - defaultSize) / 2).coerceAtLeast(0)
        val defaultTop = (screenHeight - defaultHeight - bottomMargin).coerceAtLeast(0)

        val savedScreenWidth = prefs.getInt("guide_screen_width", screenWidth).coerceAtLeast(1)
        val savedScreenHeight = prefs.getInt("guide_screen_height", screenHeight).coerceAtLeast(1)
        val resizeX = screenWidth.toFloat() / savedScreenWidth.toFloat()
        val resizeY = screenHeight.toFloat() / savedScreenHeight.toFloat()
        val size = (prefs.getInt("guide_size", defaultSize) * resizeX)
            .roundToInt()
            .coerceIn(Board.COLS * 8, screenWidth.coerceAtLeast(Board.COLS * 8))
        val height = BoardGeometry.fullHeightForSize(size)
        val left = (prefs.getInt("guide_left", defaultLeft) * resizeX)
            .roundToInt()
            .coerceIn(0, (screenWidth - size).coerceAtLeast(0))
        val top = (prefs.getInt("guide_top", defaultTop) * resizeY)
            .roundToInt()
            .coerceIn(0, (screenHeight - height).coerceAtLeast(0))
        return SavedBoardRegion(left, top, size, height)
    }

    fun saveBoardRegion(region: SavedBoardRegion) {
        val metrics = context.resources.displayMetrics
        val screenWidth = metrics.widthPixels
        val screenHeight = metrics.heightPixels
        val size = region.size.coerceIn(Board.COLS * 8, screenWidth.coerceAtLeast(Board.COLS * 8))
        val height = BoardGeometry.fullHeightForSize(size)
        val left = region.left.coerceIn(0, (screenWidth - size).coerceAtLeast(0))
        val top = region.top.coerceIn(0, (screenHeight - height).coerceAtLeast(0))
        prefs.edit()
            .putInt("guide_left", left)
            .putInt("guide_top", top)
            .putInt("guide_size", size)
            .putInt("guide_height", height)
            .putInt("guide_screen_width", screenWidth)
            .putInt("guide_screen_height", screenHeight)
            .putInt("guide_geometry_version", GUIDE_GEOMETRY_VERSION)
            .apply()
    }

    fun loadBoardCorners(screenWidth: Int, screenHeight: Int): ScreenBoardCorners {
        val hasCorners = prefs.contains("guide_tl_x") &&
            prefs.contains("guide_tl_y") &&
            prefs.contains("guide_tr_x") &&
            prefs.contains("guide_tr_y") &&
            prefs.contains("guide_br_x") &&
            prefs.contains("guide_br_y") &&
            prefs.contains("guide_bl_x") &&
            prefs.contains("guide_bl_y")
        if (hasCorners) {
            return ScreenBoardCorners(
                PointF(prefs.getInt("guide_tl_x", 0).toFloat(), prefs.getInt("guide_tl_y", 0).toFloat()),
                PointF(prefs.getInt("guide_tr_x", 0).toFloat(), prefs.getInt("guide_tr_y", 0).toFloat()),
                PointF(prefs.getInt("guide_br_x", 0).toFloat(), prefs.getInt("guide_br_y", 0).toFloat()),
                PointF(prefs.getInt("guide_bl_x", 0).toFloat(), prefs.getInt("guide_bl_y", 0).toFloat())
            )
        }
        val region = loadBoardRegion(screenWidth, screenHeight)
        return ScreenBoardWarp.fromFullRegionPlayableRows(ScreenBoardRegion(region.left, region.top, region.size, region.height))
    }

    fun saveBoardCorners(corners: ScreenBoardCorners) {
        val region = ScreenBoardWarp.approximateFullRegionFromPlayableRows(corners)
        prefs.edit()
            .putInt("guide_tl_x", corners.topLeft.x.toInt())
            .putInt("guide_tl_y", corners.topLeft.y.toInt())
            .putInt("guide_tr_x", corners.topRight.x.toInt())
            .putInt("guide_tr_y", corners.topRight.y.toInt())
            .putInt("guide_br_x", corners.bottomRight.x.toInt())
            .putInt("guide_br_y", corners.bottomRight.y.toInt())
            .putInt("guide_bl_x", corners.bottomLeft.x.toInt())
            .putInt("guide_bl_y", corners.bottomLeft.y.toInt())
            .putInt("guide_left", region.left)
            .putInt("guide_top", region.top)
            .putInt("guide_size", region.size)
            .putInt("guide_height", region.height)
            .apply()
    }
}
