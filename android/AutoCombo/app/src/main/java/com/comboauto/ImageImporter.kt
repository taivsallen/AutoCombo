package com.comboauto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

object ImageImporter {
    data class Result(val board: Board, val confidence: Double)
    private data class Template(val orb: Orb, val feature: FloatArray)
    private data class Classification(val orb: Orb, val confidence: Double)
    private const val SAMPLE_SIZE = 28
    private const val INNER_PAD = 0.12f
    @Volatile private var templates: List<Template> = emptyList()

    fun initialize(context: Context) {
        if (templates.isNotEmpty()) return
        val names = mapOf(
            Orb.WATER to listOf("orb_water", "orb_pad_water"),
            Orb.FIRE to listOf("orb_fire", "orb_pad_fire"),
            Orb.EARTH to listOf("orb_earth", "orb_pad_earth"),
            Orb.LIGHT to listOf("orb_light", "orb_pad_light"),
            Orb.DARK to listOf("orb_dark", "orb_pad_dark"),
            Orb.HEART to listOf("orb_heart", "orb_pad_heart")
        )
        val loaded = mutableListOf<Template>()
        for ((orb, resourceNames) in names) {
            for (name in resourceNames) {
                val id = context.resources.getIdentifier(name, "drawable", context.packageName)
                if (id == 0) continue
                val bitmap = BitmapFactory.decodeResource(context.resources, id) ?: continue
                loaded += Template(orb, featureFromBitmap(bitmap))
                bitmap.recycle()
            }
        }
        templates = loaded
    }

    fun recognize(bitmap: Bitmap): Result {
        return recognize(bitmap, ScreenBoardRegion(0, 0, min(bitmap.width, bitmap.height)))
    }

    fun recognize(bitmap: Bitmap, region: ScreenBoardRegion, row0Source: Board? = null): Result {
        var confidence = 0.0
        var sampledCells = 0
        val cells = Array(Board.ROWS) { row -> Array(Board.COLS) { col ->
            if (row < Board.PLAY_ROW_START) {
                row0Source?.get(Coord(row, col))?.copy() ?: BoardCell(null)
            } else {
                val cellResult = classifyCell(bitmap, region, row, col)
                confidence += cellResult.second
                sampledCells += 1
                BoardCell(cellResult.first)
            }
        } }
        return Result(Board(cells), if (sampledCells == 0) 0.0 else confidence / sampledCells.toDouble())
    }

    private fun classifyCell(bitmap: Bitmap, region: ScreenBoardRegion, row: Int, col: Int): Pair<Orb, Double> {
        val color = classifyByColorSamples(bitmap, region, row, col)
        val template = classifyByTemplate(bitmap, region, row, col)
        if (template == null) return color.orb to color.confidence
        if (template.first == color.orb) return template.first to max(template.second, color.confidence)
        if (color.confidence >= 0.86) return color.orb to color.confidence
        if (template.second < 0.62 && color.confidence >= 0.58) return color.orb to color.confidence
        if (template.second < 0.78 && color.confidence >= 0.74) return color.orb to color.confidence
        return template
    }

    private fun classifyByColorSamples(bitmap: Bitmap, region: ScreenBoardRegion, row: Int, col: Int): Classification {
        val cellX = BoardGeometry.cellWidth(region).toDouble()
        val cellY = BoardGeometry.cellHeight(region).toDouble()
        val centerX = BoardGeometry.centerX(region, col).toDouble()
        val centerY = BoardGeometry.centerY(region, row).toDouble()
        val offsets = arrayOf(
            0.0 to 0.0,
            -0.16 to 0.0, 0.16 to 0.0, 0.0 to -0.16, 0.0 to 0.16,
            -0.22 to -0.18, 0.22 to -0.18, -0.22 to 0.18, 0.22 to 0.18,
            -0.28 to 0.0, 0.28 to 0.0, 0.0 to -0.28, 0.0 to 0.28
        )
        val scores = mutableMapOf<Orb, Double>()
        var totalScore = 0.0
        var used = 0
        for ((ox, oy) in offsets) {
            val x = (centerX + ox * cellX).toInt().coerceIn(0, bitmap.width - 1)
            val y = (centerY + oy * cellY).toInt().coerceIn(0, bitmap.height - 1)
            val result = classify(bitmap.getPixel(x, y)) ?: continue
            scores[result.orb] = (scores[result.orb] ?: 0.0) + result.confidence
            totalScore += result.confidence
            used += 1
        }
        if (used == 0 || totalScore <= 0.0) return Classification(Orb.HEART, 0.0)
        val best = scores.maxByOrNull { it.value } ?: return Classification(Orb.HEART, 0.0)
        val consistency = best.value / totalScore
        val average = best.value / used
        return Classification(best.key, (average * 0.62 + consistency * 0.38).coerceIn(0.0, 1.0))
    }

    private fun classifyByTemplate(bitmap: Bitmap, region: ScreenBoardRegion, row: Int, col: Int): Pair<Orb, Double>? {
        val db = templates
        if (db.isEmpty()) return null
        val cellW = BoardGeometry.cellWidth(region)
        val cellH = BoardGeometry.cellHeight(region)
        val left = region.left + col * cellW + cellW * INNER_PAD
        val top = region.top + BoardGeometry.rowTopOffset(region, row) + cellH * INNER_PAD
        val right = region.left + (col + 1) * cellW - cellW * INNER_PAD
        val bottom = region.top + BoardGeometry.rowBottomOffset(region, row) - cellH * INNER_PAD
        val sample = Bitmap.createBitmap(SAMPLE_SIZE, SAMPLE_SIZE, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(sample)
        val src = RectF(left, top, right, bottom)
        val clipped = Rect(
            src.left.toInt().coerceIn(0, bitmap.width - 1),
            src.top.toInt().coerceIn(0, bitmap.height - 1),
            src.right.toInt().coerceIn(1, bitmap.width),
            src.bottom.toInt().coerceIn(1, bitmap.height)
        )
        if (clipped.width() <= 1 || clipped.height() <= 1) {
            sample.recycle()
            return null
        }
        canvas.drawBitmap(bitmap, clipped, Rect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE), null)
        val feature = featureFromBitmap(sample)
        sample.recycle()
        var best = db.first()
        var bestScore = -1.0
        for (template in db) {
            val score = dot(feature, template.feature)
            if (score > bestScore) {
                bestScore = score.toDouble()
                best = template
            }
        }
        return best.orb to bestScore.coerceIn(0.0, 1.0)
    }

    private fun featureFromBitmap(bitmap: Bitmap): FloatArray {
        val width = bitmap.width
        val height = bitmap.height
        val hBins = 18
        val sBins = 5
        val vBins = 5
        val eBins = 4
        val feature = FloatArray(hBins + sBins + vBins + eBins)
        val gray = FloatArray(width * height)
        val mask = BooleanArray(width * height)
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        fun clamp01(value: Float) = value.coerceIn(0f, 1f)

        var index = 0
        val hsv = FloatArray(3)
        for (y in 0 until height) {
            val yn = (y + 0.5f) / height
            for (x in 0 until width) {
                val xn = (x + 0.5f) / width
                val pixel = pixels[index]
                if (xn > 0.64f && yn < 0.46f) {
                    index++
                    continue
                }
                val dx = xn - 0.5f
                val dy = yn - 0.52f
                if (dx * dx + dy * dy > 0.3f || Color.alpha(pixel) < 38) {
                    index++
                    continue
                }

                val r = Color.red(pixel) / 255f
                val g = Color.green(pixel) / 255f
                val b = Color.blue(pixel) / 255f
                val v = max(r, max(g, b))
                val m = min(r, min(g, b))
                val saturation = if (v > 1e-6f) (v - m) / v else 0f
                val lum = 0.2126f * r + 0.7152f * g + 0.0722f * b
                gray[index] = lum
                mask[index] = true

                val colorWeight = clamp01((saturation - 0.1f) / 0.35f) * clamp01((v - 0.2f) / 0.35f)
                if (colorWeight > 0f) {
                    Color.RGBToHSV(Color.red(pixel), Color.green(pixel), Color.blue(pixel), hsv)
                    val hb = min(hBins - 1, floor(hsv[0] / 360f * hBins).toInt())
                    val sb = min(sBins - 1, floor(saturation * sBins).toInt())
                    val vb = min(vBins - 1, floor(v * vBins).toInt())
                    feature[hb] += colorWeight * 2.2f
                    feature[hBins + sb] += colorWeight * 0.45f
                    feature[hBins + sBins + vb] += colorWeight * 0.35f
                }
                index++
            }
        }

        val edgeOffset = hBins + sBins + vBins
        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val p = y * width + x
                if (!mask[p] || !mask[p - 1] || !mask[p + 1] || !mask[p - width] || !mask[p + width]) continue
                val gx = gray[p + 1] - gray[p - 1]
                val gy = gray[p + width] - gray[p - width]
                val mag = min(1f, hypot(gx.toDouble(), gy.toDouble()).toFloat() * 2.2f)
                val eb = min(eBins - 1, floor(mag * eBins).toInt())
                feature[edgeOffset + eb] += 0.35f
            }
        }

        var norm = 0f
        for (value in feature) norm += value * value
        val scale = sqrt(norm).takeIf { it > 0f } ?: 1f
        for (i in feature.indices) feature[i] /= scale
        return feature
    }

    private fun dot(left: FloatArray, right: FloatArray): Float {
        var sum = 0f
        for (index in left.indices) sum += left[index] * right[index]
        return sum
    }

    private fun classify(color: Int): Classification? {
        if (Color.alpha(color) < 38) return null
        val r8 = Color.red(color)
        val g8 = Color.green(color)
        val b8 = Color.blue(color)
        if (g8 > 120 && r8 < 95 && b8 < 140 && g8 > r8 * 1.55 && g8 > b8 * 1.25) return null

        val r = r8 / 255.0
        val g = g8 / 255.0
        val b = b8 / 255.0
        val high = max(r, max(g, b))
        val low = min(r, min(g, b))
        val saturation = if (high <= 1e-6) 0.0 else (high - low) / high
        if (high < 0.14) return Classification(Orb.DARK, 0.42)
        if (saturation < 0.12) return Classification(if (high > 0.62) Orb.HEART else Orb.DARK, 0.35)

        val hsv = FloatArray(3)
        Color.RGBToHSV(r8, g8, b8, hsv)
        val hue = hsv[0].toDouble()
        val candidates = arrayOf(
            Orb.WATER to hueConfidence(hue, 195.0, 38.0),
            Orb.FIRE to max(hueConfidence(hue, 14.0, 32.0), hueConfidence(hue, 360.0, 24.0) * if (b < 0.32) 1.0 else 0.45),
            Orb.EARTH to hueConfidence(hue, 125.0, 44.0),
            Orb.LIGHT to hueConfidence(hue, 53.0, 30.0),
            Orb.DARK to hueConfidence(hue, 282.0, 42.0),
            Orb.HEART to max(hueConfidence(hue, 332.0, 36.0), hueConfidence(hue, 352.0, 24.0) * if (b > g * 0.82) 1.0 else 0.35)
        )
        val best = candidates.maxByOrNull { it.second } ?: return Classification(Orb.HEART, 0.0)
        val colorStrength = ((saturation - 0.08) / 0.55).coerceIn(0.0, 1.0)
        val brightness = ((high - 0.16) / 0.55).coerceIn(0.0, 1.0)
        val confidence = (best.second * 0.70 + colorStrength * 0.20 + brightness * 0.10).coerceIn(0.0, 0.95)
        if (confidence < 0.18) return Classification(Orb.HEART, 0.20)
        return Classification(best.first, confidence)
    }

    private fun hueConfidence(hue: Double, center: Double, width: Double): Double {
        val direct = abs(hue - center)
        val wrapped = min(direct, 360.0 - direct)
        return (1.0 - wrapped / width).coerceIn(0.0, 1.0)
    }
}
