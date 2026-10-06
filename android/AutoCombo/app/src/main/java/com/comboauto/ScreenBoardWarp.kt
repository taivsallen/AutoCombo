package com.comboauto

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PointF
import kotlin.math.hypot
import kotlin.math.roundToInt

data class ScreenBoardCorners(
    val topLeft: PointF,
    val topRight: PointF,
    val bottomRight: PointF,
    val bottomLeft: PointF
)

object ScreenBoardWarp {
    fun fromFullRegionPlayableRows(region: ScreenBoardRegion): ScreenBoardCorners {
        val top = region.top + BoardGeometry.rowTopOffset(region, Board.PLAY_ROW_START)
        val bottom = region.top + BoardGeometry.rowBottomOffset(region, Board.ROWS - 1)
        val left = region.left.toFloat()
        val right = region.left + region.size.toFloat()
        return ScreenBoardCorners(
            PointF(left, top),
            PointF(right, top),
            PointF(right, bottom),
            PointF(left, bottom)
        )
    }

    fun approximateFullRegionFromPlayableRows(corners: ScreenBoardCorners): ScreenBoardRegion {
        val topWidth = distance(corners.topLeft, corners.topRight)
        val bottomWidth = distance(corners.bottomLeft, corners.bottomRight)
        val size = ((topWidth + bottomWidth) / 2f).roundToInt().coerceAtLeast(Board.COLS * 8)
        val cell = size / Board.COLS.toFloat()
        val minX = minOf(corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x)
        val playTop = minOf(corners.topLeft.y, corners.topRight.y)
        val fullTop = playTop - cell * (1f + BoardGeometry.ROW0_GAP_CELLS)
        val height = (size * BoardGeometry.DEFAULT_HEIGHT_RATIO).roundToInt()
        return ScreenBoardRegion(minX.roundToInt(), fullTop.roundToInt(), size, height)
    }

    fun playableFromCorners(source: Bitmap, corners: ScreenBoardCorners): Bitmap? {
        if (source.isRecycled) return null
        val topWidth = distance(corners.topLeft, corners.topRight)
        val bottomWidth = distance(corners.bottomLeft, corners.bottomRight)
        val leftHeight = distance(corners.topLeft, corners.bottomLeft)
        val rightHeight = distance(corners.topRight, corners.bottomRight)
        val cellByWidth = (topWidth + bottomWidth) / (2f * Board.COLS)
        val cellByHeight = (leftHeight + rightHeight) / (2f * (Board.ROWS - Board.PLAY_ROW_START))
        val cell = ((cellByWidth + cellByHeight) / 2f).roundToInt().coerceIn(10, 180)
        val width = cell * Board.COLS
        val height = cell * (Board.ROWS - Board.PLAY_ROW_START)
        if (width < Board.COLS * 10 || height < (Board.ROWS - Board.PLAY_ROW_START) * 10) return null

        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        for (y in 0 until height) {
            val v = (y + 0.5f) / height.toFloat()
            for (x in 0 until width) {
                val u = (x + 0.5f) / width.toFloat()
                val point = bilinearPoint(corners, u, v)
                output.setPixel(x, y, sampleNearest(source, point.x, point.y))
            }
        }
        return output
    }

    fun debugLabel(corners: ScreenBoardCorners, bitmap: Bitmap): String {
        return "corners=(${corners.topLeft.x.roundToInt()},${corners.topLeft.y.roundToInt()})" +
            "(${corners.topRight.x.roundToInt()},${corners.topRight.y.roundToInt()})" +
            "(${corners.bottomRight.x.roundToInt()},${corners.bottomRight.y.roundToInt()})" +
            "(${corners.bottomLeft.x.roundToInt()},${corners.bottomLeft.y.roundToInt()}) warp=${bitmap.width}x${bitmap.height}"
    }

    private fun bilinearPoint(corners: ScreenBoardCorners, u: Float, v: Float): PointF {
        val topX = lerp(corners.topLeft.x, corners.topRight.x, u)
        val topY = lerp(corners.topLeft.y, corners.topRight.y, u)
        val bottomX = lerp(corners.bottomLeft.x, corners.bottomRight.x, u)
        val bottomY = lerp(corners.bottomLeft.y, corners.bottomRight.y, u)
        return PointF(lerp(topX, bottomX, v), lerp(topY, bottomY, v))
    }

    private fun sampleNearest(bitmap: Bitmap, x: Float, y: Float): Int {
        val px = x.roundToInt().coerceIn(0, bitmap.width - 1)
        val py = y.roundToInt().coerceIn(0, bitmap.height - 1)
        if (px < 0 || py < 0 || px >= bitmap.width || py >= bitmap.height) return Color.TRANSPARENT
        return bitmap.getPixel(px, py)
    }

    private fun distance(a: PointF, b: PointF): Float = hypot(a.x - b.x, a.y - b.y)
    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t
}
