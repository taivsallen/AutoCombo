package com.comboauto

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt

object BoardGeometry {
    // Keep the original Android green-guide spacing requested for row0/row1.
    // The playable crop still starts at row1; this only controls the full
    // guide's visual separation and the row1/path Y coordinate.
    const val ROW0_GAP_CELLS = 0.30f
    const val DEFAULT_HEIGHT_RATIO = 1f + ROW0_GAP_CELLS / Board.ROWS

    fun cellWidth(region: ScreenBoardRegion): Float = region.size / Board.COLS.toFloat()
    fun cellHeight(region: ScreenBoardRegion): Float = cellWidth(region)
    fun rowGap(region: ScreenBoardRegion): Float = cellWidth(region) * ROW0_GAP_CELLS

    fun fullHeightForSize(size: Int): Int =
        (size * DEFAULT_HEIGHT_RATIO).roundToInt().coerceAtLeast(size)

    fun centerX(region: ScreenBoardRegion, col: Int): Float {
        return region.left + (col + 0.5f) * cellWidth(region)
    }

    fun centerY(region: ScreenBoardRegion, row: Int): Float {
        return region.top + rowTopOffset(region, row) + cellHeight(region) * 0.5f
    }

    /** Use the saved grid bottom as the stable row1~row5 touch anchor. */
    fun touchCenterY(region: ScreenBoardRegion, row: Int): Float {
        val cell = cellHeight(region)
        if (row <= 0) return region.top + cell * 0.5f
        val playableTop = region.top + region.height - cell * (Board.ROWS - Board.PLAY_ROW_START)
        return playableTop + (row - Board.PLAY_ROW_START + 0.5f) * cell
    }

    fun rowTopOffset(region: ScreenBoardRegion, row: Int): Float {
        val cell = cellHeight(region)
        return row * cell + if (row >= 1) rowGap(region) else 0f
    }

    fun rowBottomOffset(region: ScreenBoardRegion, row: Int): Float {
        return rowTopOffset(region, row) + cellHeight(region)
    }

    /**
     * Converts the grid saved in display/window coordinates to the pixels of
     * a MediaProjection frame.  They are normally equal, but Android can
     * deliver a frame at a different physical size (density, display zoom,
     * or rotation).  Cropping with the unscaled values produces the exact
     * symptom of a moving grid whose crop is shifted or only contains a thin
     * strip of the board.
     */
    fun toBitmapRect(
        region: ScreenBoardRegion,
        bitmapWidth: Int,
        bitmapHeight: Int,
        displayWidth: Int,
        displayHeight: Int
    ): android.graphics.Rect? {
        if (bitmapWidth <= 0 || bitmapHeight <= 0 || displayWidth <= 0 || displayHeight <= 0) return null
        val scaleX = bitmapWidth.toFloat() / displayWidth.toFloat()
        val scaleY = bitmapHeight.toFloat() / displayHeight.toFloat()
        val cell = cellWidth(region)
        val displayLeft = region.left.toFloat()
        val displayTop = region.top + rowTopOffset(region, Board.PLAY_ROW_START)
        val displayWidthForCrop = region.size.toFloat()
        val displayHeightForCrop = cell * (Board.ROWS - Board.PLAY_ROW_START)
        val left = kotlin.math.floor(displayLeft * scaleX).toInt()
        val top = kotlin.math.floor(displayTop * scaleY).toInt()
        val right = kotlin.math.ceil((displayLeft + displayWidthForCrop) * scaleX).toInt()
        val bottom = kotlin.math.ceil((displayTop + displayHeightForCrop) * scaleY).toInt()
        val x = left.coerceIn(0, bitmapWidth - 1)
        val y = top.coerceIn(0, bitmapHeight - 1)
        val r = right.coerceIn(x + 1, bitmapWidth)
        val b = bottom.coerceIn(y + 1, bitmapHeight)
        if (r - x <= Board.COLS * 8 || b - y <= (Board.ROWS - Board.PLAY_ROW_START) * 8) return null
        return android.graphics.Rect(x, y, r, b)
    }
}
