package com.comboauto

import android.graphics.Bitmap
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

data class ScreenBoardRegion(val left: Int, val top: Int, val size: Int, val height: Int = size)
data class ScreenBoardDetection(val board: Board, val region: ScreenBoardRegion, val confidence: Double)

object ScreenBoardDetector {
    private const val PLAYABLE_CELL_COUNT = (Board.ROWS - Board.PLAY_ROW_START) * Board.COLS

    fun detect(bitmap: Bitmap): ScreenBoardDetection {
        val width = bitmap.width
        val height = bitmap.height
        val maxSide = min((width * 0.96).toInt(), (height * 0.76).toInt()).coerceAtLeast(6 * 24)
        val minSide = min((width * 0.42).toInt(), maxSide)
        val sizes = (0..10).map { index ->
            (minSide + (maxSide - minSide) * index / 10).coerceAtLeast(6 * 8)
        }.distinct()
        var best: ScreenBoardDetection? = null
        var bestScore = Double.NEGATIVE_INFINITY

        for (size in sizes) {
            val maxLeft = max(0, width - size)
            val maxTop = max(0, height - size)
            val xStep = max(18, size / 5)
            val yStep = max(24, size / 6)
            val xCandidates = positions(maxLeft, xStep)
            val yCandidates = positions(maxTop, yStep)
            for (left in xCandidates) for (top in yCandidates) {
                val region = ScreenBoardRegion(left, top, size, (size * BoardGeometry.DEFAULT_HEIGHT_RATIO).toInt())
                val result = ImageImporter.recognize(bitmap, region)
                val counts = Orb.values().map { result.board.count(it) }
                val distinct = counts.count { it >= 2 }
                val entropy = counts.filter { it > 0 }.sumOf { count ->
                    val p = count / PLAYABLE_CELL_COUNT.toDouble()
                    -p * ln(p)
                } / ln(6.0)
                val dominant = counts.maxOrNull() ?: 0
                val dominancePenalty = max(0, dominant - 17) / PLAYABLE_CELL_COUNT.toDouble()
                val centerBias = 1.0 - (kotlin.math.abs(left + size / 2.0 - width / 2.0) / width) * 0.08
                val score = result.confidence * 5.0 + entropy * 0.75 + distinct * 0.12 - dominancePenalty * 0.55 + centerBias
                if (score > bestScore) {
                    bestScore = score
                    best = ScreenBoardDetection(result.board, region, result.confidence)
                }
            }
        }

        val fallbackSize = min((width * 0.9).toInt(), (height * 0.65).toInt()).coerceAtLeast(6 * 8)
        val fallbackHeight = (fallbackSize * BoardGeometry.DEFAULT_HEIGHT_RATIO).toInt()
        val fallback = ScreenBoardRegion((width - fallbackSize) / 2, (height - fallbackHeight) / 2, fallbackSize, fallbackHeight)
        val selected = best ?: ImageImporter.recognize(bitmap, fallback).let { ScreenBoardDetection(it.board, fallback, it.confidence) }
        return selected.copy(confidence = selected.confidence.coerceIn(0.0, 1.0))
    }

    private fun positions(maxValue: Int, step: Int): List<Int> {
        val values = mutableListOf<Int>()
        var value = 0
        while (value <= maxValue) { values += value; value += step }
        if (values.lastOrNull() != maxValue) values += maxValue
        return values.distinct()
    }
}
