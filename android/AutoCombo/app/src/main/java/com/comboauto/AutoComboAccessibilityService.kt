package com.comboauto

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.PointF
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.DisplayMetrics
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent

/**
 * Executes the selected App.jsx route as one continuous touch gesture.
 * Android requires the user to explicitly enable this service in Accessibility
 * settings; without that system permission an overlay cannot inject touches
 * into the game below it.
 */
class AutoComboAccessibilityService : AccessibilityService() {
    private val main = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    /**
     * Execute the selected solution as a sequence of board-cell visits.
     *
     * The solver's route is a list of discrete cells.  We intentionally do
     * not consume any rendered path/polyline; every coordinate is converted
     * directly to the saved grid's cell center and every continued stroke ends
     * exactly on the next center.
     */
    fun dispatchCellCenters(
        cells: List<Coord>,
        region: ScreenBoardRegion,
        replaySpeed: Int,
        onFinished: (Boolean) -> Unit
    ): Boolean {
        // Collapse only consecutive duplicates.  A repeated cell is not a
        // new move, while every actual solver step remains in the sequence.
        val normalizedCells = buildList {
            cells.forEach { cell ->
                if (cell.row !in 0 until Board.ROWS || cell.col !in 0 until Board.COLS) return@forEach
                if (lastOrNull() != cell) add(cell)
            }
        }

        // App.jsx uses row 0 as a virtual held-orb/terminal row.  It is part
        // of the solver state and must remain in the result list, but it is
        // not a physical orb cell on the five-row game board.  Releasing at
        // that virtual row is therefore wrong: the game must release on the
        // last real board cell.  A route that starts in row 0 cannot be
        // reproduced by a physical drag, so reject it instead of silently
        // dragging from a non-game location.
        if (normalizedCells.firstOrNull()?.row == 0) return false
        val visitedCells = normalizedCells.takeWhile { it.row != 0 }
        if (visitedCells.size < 2) return false

        val targetMetrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getMetrics(targetMetrics)

        // Accessibility gestures use the active screen/window coordinate
        // frame, which can differ from physical display metrics when the
        // device is rotated. Prefer the foreground game's bounds for all
        // clamping so a portrait 900x1600 frame is never treated as 1600x900.
        val gestureFrame = activeGestureFrame(targetMetrics)

        // The guide, MediaProjection frame, and Accessibility gesture all
        // use the current app's logical (rotated) screen coordinate space.
        // Do not scale these coordinates using DisplayMetrics: on emulators
        // the physical display can be 1600x900 while the active portrait
        // frame is 900x1600.  Scaling 900x1600 by the physical metrics is the
        // exact failure mode that makes a correct route touch wrong cells.
        val cellCenters = visitedCells.map { coord ->
            PointF(
                BoardGeometry.centerX(region, coord.col),
                BoardGeometry.centerY(region, coord.row)
            )
        }

        val points = cellCenters.map { point ->
            PointF(
                point.x.coerceIn((gestureFrame.left + 1).toFloat(), (gestureFrame.right - 2).coerceAtLeast(gestureFrame.left + 1).toFloat()),
                point.y.coerceIn((gestureFrame.top + 1).toFloat(), (gestureFrame.bottom - 2).coerceAtLeast(gestureFrame.top + 1).toFloat())
            )
        }
        Log.i(
            TAG,
            "cellCenters=${visitedCells.joinToString("->")} region=${region.left},${region.top},${region.size},${region.height} " +
                "display=${targetMetrics.widthPixels}x${targetMetrics.heightPixels} frame=${gestureFrame.left},${gestureFrame.top},${gestureFrame.right},${gestureFrame.bottom} " +
                "scale=identity points=${points.joinToString(";") { "%.1f,%.1f".format(it.x, it.y) }}"
        )

        // Keep one pointer and one GestureDescription for the whole route.
        // The previous implementation split the route into several
        // dispatchGesture calls and used continueStroke between callbacks.
        // On the target Android/BlueStacks accessibility implementation the
        // first continuation is sometimes cancelled even though the first
        // chunk completed.  That leaves the game with a partial/random route.
        // A single stroke keeps the finger down for the entire drag and makes
        // every solver waypoint an actual Path line endpoint in order.
        // Keep the original fast replay timing.  Accessibility distributes a
        // StrokeDescription's duration over the path length, so the route is
        // intentionally one straight center-to-center polyline.  Adding
        // artificial in-cell excursions changes the timing and can make the
        // game sample a different sequence from the solver result.
        val perStep = ((110 - replaySpeed.coerceIn(15, 95) * 0.7f) / 2.5f)
            .toLong()
            .coerceIn(40L, 55L)
        val segmentCount = points.size - 1
        val totalDuration = (segmentCount.toLong() * perStep).coerceIn(1L, 60_000L)
        val path = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.drop(1).forEach { point -> lineTo(point.x, point.y) }
        }
        Log.i(
            TAG,
            "gesturePlan points=${points.size} perStep=$perStep duration=$totalDuration"
        )
        val gesture = try {
            GestureDescription.Builder()
                .addStroke(
                    GestureDescription.StrokeDescription(
                        path,
                        0L,
                        totalDuration,
                        false
                    )
                )
                .build()
        } catch (error: IllegalArgumentException) {
            Log.e(TAG, "gesture build failed points=${points.size} duration=$totalDuration", error)
            main.post { onFinished(false) }
            return false
        }

        val accepted = dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.i(TAG, "gesture completed points=${points.size} duration=$totalDuration")
                    main.post { onFinished(true) }
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w(TAG, "gesture cancelled points=${points.size} duration=$totalDuration")
                    main.post { onFinished(false) }
                }
            },
            null
        )
        if (!accepted) {
            Log.w(TAG, "gesture rejected points=${points.size} duration=$totalDuration")
        }
        return accepted
    }

    private fun activeGestureFrame(metrics: DisplayMetrics): Rect {
        rootInActiveWindow?.let { root ->
            val bounds = Rect()
            root.getBoundsInScreen(bounds)
            if (bounds.width() > 0 && bounds.height() > 0) return bounds
        }
        return Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
    }

    companion object {
        private const val TAG = "AutoComboGesture"
        @Volatile var instance: AutoComboAccessibilityService? = null
            private set
    }
}
