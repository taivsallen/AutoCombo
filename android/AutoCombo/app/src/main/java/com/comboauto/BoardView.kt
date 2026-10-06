package com.comboauto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import kotlin.math.max
import kotlin.math.min

class BoardView(context: Context) : View(context) {
    var board: Board = Board.sample(); var route: List<Coord> = emptyList(); var manualMode = false; var editMode = false
    var onManualStart: ((Coord) -> Unit)? = null; var onManualMove: ((Coord) -> Unit)? = null; var onManualEnd: (() -> Unit)? = null; var onEdit: ((Coord) -> Unit)? = null
    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG); private val orbPaint = Paint(Paint.ANTI_ALIAS_FLAG); private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER; typeface = android.graphics.Typeface.DEFAULT_BOLD }
    private val bitmapCache = mutableMapOf<Orb, Bitmap?>(); private var lastCoord: Coord? = null

    init { setLayerType(View.LAYER_TYPE_SOFTWARE, null) }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        setMeasuredDimension(width, BoardGeometry.fullHeightForSize(width))
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val cell = width.toFloat() / Board.COLS
        val gap = cell * BoardGeometry.ROW0_GAP_CELLS
        for (row in 0 until Board.ROWS) for (col in 0 until Board.COLS) {
            val x = col * cell
            val y = row * cell + if (row >= Board.PLAY_ROW_START) gap else 0f
            backgroundPaint.color = if ((row + col) % 2 == 0) Color.rgb(40, 40, 48) else Color.rgb(22, 22, 28)
            canvas.drawRect(x, y, x + cell, y + cell, backgroundPaint)
            val coordinate = Coord(row, col); val current = board[coordinate]
            current.orb?.let { orb ->
                val bitmap = bitmapCache.getOrPut(orb) { loadOrb(orb) }
                if (bitmap != null) canvas.drawBitmap(bitmap, null, RectF(x + 1, y + 1, x + cell - 1, y + cell - 1), orbPaint)
                else { orbPaint.color = orb.tint; canvas.drawCircle(x + cell / 2, y + cell / 2, cell * 0.34f, orbPaint) }
            }
            if (current.mark != CellMark.NONE) {
                linePaint.color = current.mark.tint; linePaint.style = Paint.Style.STROKE; linePaint.strokeWidth = max(2f, cell * 0.045f); canvas.drawRoundRect(RectF(x + 5, y + 5, x + cell - 5, y + cell - 5), 8f, 8f, linePaint); linePaint.style = Paint.Style.FILL
                textPaint.textSize = max(10f, cell * 0.13f); textPaint.color = current.mark.tint; canvas.drawText(current.mark.label, x + cell * 0.23f, y + cell * 0.2f, textPaint)
            }
        }
        if (route.size > 1) {
            val routeRegion = ScreenBoardRegion(0, 0, width, BoardGeometry.fullHeightForSize(width))
            val points = RoutePathGeometry.buildPoints(route, routeRegion, max(6f, cell / 10f))
            val path = Path()
            points.forEachIndexed { index, point ->
                if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
            }
            linePaint.color = Color.WHITE
            linePaint.style = Paint.Style.STROKE
            linePaint.strokeWidth = 4f
            linePaint.strokeCap = Paint.Cap.BUTT
            linePaint.strokeJoin = Paint.Join.MITER
            linePaint.setShadowLayer(max(3f, cell * 0.04f), 3f, 3f, Color.BLACK)
            canvas.drawPath(path, linePaint)
            linePaint.clearShadowLayer()
            linePaint.style = Paint.Style.FILL
            route.firstOrNull()?.let { point ->
                canvas.drawCircle(BoardGeometry.centerX(routeRegion, point.col), BoardGeometry.centerY(routeRegion, point.row), 14f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(34, 197, 94) })
            }
            route.lastOrNull()?.let { point ->
                canvas.drawCircle(BoardGeometry.centerX(routeRegion, point.col), BoardGeometry.centerY(routeRegion, point.row), 16f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(239, 68, 68) })
            }
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val coordinate = coordinateAt(event.x, event.y)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> { lastCoord = coordinate; if (editMode) onEdit?.invoke(coordinate) else if (manualMode) onManualStart?.invoke(coordinate); return true }
            MotionEvent.ACTION_MOVE -> { if (!editMode && manualMode && coordinate != lastCoord) { lastCoord = coordinate; onManualMove?.invoke(coordinate) }; return true }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { if (!editMode && manualMode) onManualEnd?.invoke(); lastCoord = null; performClick(); return true }
        }
        return true
    }

    override fun performClick(): Boolean { super.performClick(); return true }
    private fun coordinateAt(x: Float, y: Float): Coord {
        val cell = width.toFloat() / Board.COLS
        val gap = cell * BoardGeometry.ROW0_GAP_CELLS
        val rawRow = if (y < cell) (y / cell).toInt() else ((y - gap) / cell).toInt()
        return Coord(
            min(Board.ROWS - 1, max(0, rawRow)),
            min(Board.COLS - 1, max(0, (x / cell).toInt()))
        )
    }
    private fun loadOrb(orb: Orb): Bitmap? { val id = resources.getIdentifier(orb.assetName, "drawable", context.packageName); return if (id == 0) null else BitmapFactory.decodeResource(resources, id) }
}
