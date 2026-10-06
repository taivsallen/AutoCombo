package com.comboauto

import android.content.Context
import android.graphics.Bitmap

object SolverEngine {
    data class Output(val results: List<SolverResult>, val nodes: Int, val theoreticalMax: Int)
    data class DetectionOutput(val board: Board, val confidence: Double, val error: String? = null, val debug: String? = null)
    data class DetectAndSolveOutput(val board: Board, val confidence: Double, val output: Output, val error: String? = null, val debug: String? = null)
    private var bridgeContext: Context? = null

    fun initialize(context: Context) { bridgeContext = context.applicationContext; JsSolverBridge.initialize(context) }
    fun shutdown() { JsSolverBridge.shutdown(); bridgeContext = null }

    fun solve(
        board: Board,
        settings: SolverSettings,
        rules: RuleProfile,
        specials: List<SpecialPriority>,
        onProgress: ((Int, Int) -> Unit)? = null
    ): Output {
        bridgeContext?.let { JsSolverBridge.solve(it, board, settings, rules, specials, onProgress) }?.let { return it }
        return Output(emptyList(), 0, 0)
    }

    fun detectAndSolve(bitmap: Bitmap, region: ScreenBoardRegion, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): DetectAndSolveOutput? {
        return bridgeContext?.let { JsSolverBridge.detectAndSolve(it, bitmap, region, currentBoard, settings, rules, specials) }
    }

    fun detectBoard(bitmap: Bitmap, region: ScreenBoardRegion, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): DetectionOutput? {
        return bridgeContext?.let { JsSolverBridge.detectBoard(it, bitmap, region, currentBoard, settings, rules, specials) }
    }

    fun detectBoard(bitmap: Bitmap, corners: ScreenBoardCorners, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): DetectionOutput? {
        return bridgeContext?.let { JsSolverBridge.detectBoard(it, bitmap, corners, currentBoard, settings, rules, specials) }
    }

    fun makeFinalBoard(board: Board, held: BoardCell, current: Coord): Board {
        val result = board.copy(); result[current] = held; return result
    }
}
