package com.comboauto

import android.graphics.PointF
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sqrt

object RoutePathGeometry {
    private const val DIAGONAL_UNIT = 0.70710677f

    data class Line(
        val start: Int,
        val end: Int,
        val orientation: Orientation,
        val tangent: PointF,
        var lane: Int = 0,
        var offset: Float = 0f,
        var displayStart: PointF? = null,
        var displayEnd: PointF? = null,
        var entryPoints: List<PointF>? = null
    )

    enum class Orientation(val nx: Float, val ny: Float) {
        H(0f, 1f),
        V(1f, 0f),
        D_DOWN(DIAGONAL_UNIT, -DIAGONAL_UNIT),
        D_UP(DIAGONAL_UNIT, DIAGONAL_UNIT)
    }

    fun buildPoints(route: List<Coord>, region: ScreenBoardRegion, laneGap: Float): List<PointF> {
        if (route.isEmpty()) return emptyList()
        val centers = route.map { coord -> PointF(BoardGeometry.centerX(region, coord.col), BoardGeometry.centerY(region, coord.row)) }
        if (route.size < 2) return centers
        val lines = mutableListOf<Line>()
        var start = 0
        var direction = directionKey(route[0], route[1])

        fun appendLine(end: Int) {
            lines += Line(
                start = start,
                end = end,
                orientation = orientation(route[start], route[start + 1]),
                tangent = tangent(route[start], route[start + 1])
            )
        }

        for (i in 1 until route.size - 1) {
            val nextDirection = directionKey(route[i], route[i + 1])
            if (nextDirection == direction) continue
            appendLine(i)
            start = i
            direction = nextDirection
        }
        appendLine(route.lastIndex)

        val used = mutableMapOf<Orientation, MutableList<Float>>()
        val minimumSupportGap = laneGap * 0.75f
        for (line in lines) {
            val orientationSupports = used.getOrPut(line.orientation) { mutableListOf() }
            val baseSupport = support(centers[line.start], line.orientation)
            var attempt = 0
            while (true) {
                val lane = laneSlot(attempt)
                val offset = lane * laneGap
                val candidateSupport = baseSupport + offset
                val overlaps = orientationSupports.any { abs(candidateSupport - it) < minimumSupportGap }
                if (!overlaps) {
                    line.lane = lane
                    line.offset = offset
                    orientationSupports += candidateSupport
                    break
                }
                attempt++
            }
        }

        lines.first().displayStart = addOffset(centers[lines.first().start], lines.first())
        val foldbackUsage = mutableMapOf<String, Int>()
        for (i in 0 until lines.size - 1) {
            val current = lines[i]
            val next = lines[i + 1]
            val corner = centers[current.end]
            val currentPoint = addOffset(corner, current)
            val nextPoint = addOffset(corner, next)
            val cross = current.tangent.x * next.tangent.y - current.tangent.y * next.tangent.x
            val intersection = if (abs(cross) >= 1e-6f) intersect(currentPoint, current.tangent, nextPoint, next.tangent) else null
            if (intersection != null && intersection.x.isFinite() && intersection.y.isFinite()) {
                current.displayEnd = intersection
                next.displayStart = intersection
            } else {
                val cornerCell = route[current.end]
                val key = "${cornerCell.row},${cornerCell.col}:${current.orientation}:${directionKey(route[current.start], route[current.start + 1])}"
                val foldbackIndex = foldbackUsage[key] ?: 0
                foldbackUsage[key] = foldbackIndex + 1
                val capDepth = laneGap * (0.75f + foldbackIndex * 0.75f)
                val capOffset = PointF(current.tangent.x * capDepth, current.tangent.y * capDepth)
                val currentCap = PointF(currentPoint.x + capOffset.x, currentPoint.y + capOffset.y)
                val nextCap = PointF(nextPoint.x + capOffset.x, nextPoint.y + capOffset.y)
                current.displayEnd = currentCap
                next.displayStart = nextCap
                next.entryPoints = listOf(currentCap, nextCap)
            }
        }
        val last = lines.last()
        last.displayEnd = addOffset(centers[last.end], last)

        val points = mutableListOf<PointF>()
        for (line in lines) {
            val linePoints = line.entryPoints?.let { it + listOfNotNull(line.displayEnd) } ?: listOfNotNull(line.displayStart, line.displayEnd)
            for (point in linePoints) {
                val previous = points.lastOrNull()
                if (previous != null && hypot((point.x - previous.x).toDouble(), (point.y - previous.y).toDouble()) < 0.01) continue
                points += point
            }
        }
        return points
    }

    private fun directionKey(a: Coord, b: Coord): String {
        val dr = sign((b.row - a.row).toFloat()).toInt()
        val dc = sign((b.col - a.col).toFloat()).toInt()
        return "$dr,$dc"
    }

    private fun orientation(a: Coord, b: Coord): Orientation {
        val dr = sign((b.row - a.row).toFloat()).toInt()
        val dc = sign((b.col - a.col).toFloat()).toInt()
        if (dr == 0) return Orientation.H
        if (dc == 0) return Orientation.V
        return if (dr * dc > 0) Orientation.D_DOWN else Orientation.D_UP
    }

    private fun tangent(a: Coord, b: Coord): PointF {
        val dr = sign((b.row - a.row).toFloat())
        val dc = sign((b.col - a.col).toFloat())
        val length = sqrt(dc * dc + dr * dr).takeIf { it > 0f } ?: 1f
        return PointF(dc / length, dr / length)
    }

    private fun support(point: PointF, orientation: Orientation): Float = point.x * orientation.nx + point.y * orientation.ny
    private fun addOffset(point: PointF, line: Line): PointF = PointF(point.x + line.orientation.nx * line.offset, point.y + line.orientation.ny * line.offset)
    private fun laneSlot(attempt: Int): Int {
        if (attempt == 0) return 0
        val distance = ceil(attempt / 2.0).toInt()
        return if (attempt % 2 == 1) -distance else distance
    }

    private fun intersect(p1: PointF, t1: PointF, p2: PointF, t2: PointF): PointF? {
        fun cross(a: PointF, b: PointF) = a.x * b.y - a.y * b.x
        val denominator = cross(t1, t2)
        if (abs(denominator) < 1e-6f) return null
        val delta = PointF(p2.x - p1.x, p2.y - p1.y)
        val distance = cross(delta, t2) / denominator
        return PointF(p1.x + t1.x * distance, p1.y + t1.y * distance)
    }
}
