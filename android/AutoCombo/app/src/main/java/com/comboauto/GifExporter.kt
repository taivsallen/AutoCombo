package com.comboauto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import java.io.ByteArrayOutputStream
import java.io.File

object GifExporter {
    private val palette = arrayOf(
        intArrayOf(8, 9, 13), intArrayOf(40, 170, 245), intArrayOf(245, 65, 55), intArrayOf(55, 195, 90),
        intArrayOf(250, 205, 35), intArrayOf(145, 85, 220), intArrayOf(245, 80, 145), intArrayOf(255, 255, 255)
    )

    fun export(context: Context, board: Board, path: List<Coord>, speed: Int): String? {
        return try {
            val frames = if (path.isEmpty()) listOf(board) else path.indices.map { frameBoard(board, path, it) }
            val output = ByteArrayOutputStream()
            output.write("GIF89a".toByteArray())
            writeShort(output, 180); writeShort(output, 180); output.write(0xF7); output.write(0); output.write(0)
            repeat(256) { index -> val color = palette.getOrNull(index) ?: intArrayOf(0, 0, 0); output.write(color[0]); output.write(color[1]); output.write(color[2]) }
            output.write(byteArrayOf(0x21, 0xFF.toByte(), 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00))
            val delay = (100.0 / maxOf(1, speed)).toInt().coerceIn(2, 50)
            frames.forEach { frame ->
                val bitmap = draw(frame)
                val indices = pixels(bitmap)
                output.write(byteArrayOf(0x21, 0xF9.toByte(), 0x04, 0x04, (delay and 0xFF).toByte(), ((delay shr 8) and 0xFF).toByte(), 0, 0))
                output.write(0x2C); writeShort(output, 0); writeShort(output, 0); writeShort(output, 180); writeShort(output, 180); output.write(0)
                output.write(8)
                writeBlocks(output, lzw(indices, 8))
            }
            output.write(0x3B)
            val file = File(context.cacheDir, "autocombo-${System.currentTimeMillis()}.gif")
            file.writeBytes(output.toByteArray())
            file.absolutePath
        } catch (_: Exception) { null }
    }

    private fun frameBoard(board: Board, path: List<Coord>, index: Int): Board {
        if (index == 0) return board.copy()
        val frame = board.copy()
        for (step in 1..index) { val from = path[step - 1]; val to = path[step]; val temp = frame[from]; frame[from] = frame[to]; frame[to] = temp }
        return frame
    }

    private fun draw(board: Board): Bitmap {
        val bitmap = Bitmap.createBitmap(180, 180, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val cell = 30f; val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawColor(android.graphics.Color.rgb(8, 9, 13))
        for (row in 0 until Board.ROWS) for (col in 0 until Board.COLS) {
            val coordinate = Coord(row, col); val rect = RectF(col * cell + 1, row * cell + 1, (col + 1) * cell - 1, (row + 1) * cell - 1)
            paint.color = if ((row + col) % 2 == 0) android.graphics.Color.rgb(40, 40, 48) else android.graphics.Color.rgb(22, 22, 28); canvas.drawRect(rect, paint)
            board[coordinate].orb?.let { orb -> paint.color = android.graphics.Color.rgb(palette[orb.ordinal + 1][0], palette[orb.ordinal + 1][1], palette[orb.ordinal + 1][2]); canvas.drawCircle(rect.centerX(), rect.centerY(), 10f, paint) }
        }
        return bitmap
    }

    private fun pixels(bitmap: Bitmap): IntArray = IntArray(bitmap.width * bitmap.height) { index ->
        val color = bitmap.getPixel(index % bitmap.width, index / bitmap.width)
        var best = 0; var distance = Long.MAX_VALUE
        palette.forEachIndexed { paletteIndex, rgb -> val dr = android.graphics.Color.red(color) - rgb[0]; val dg = android.graphics.Color.green(color) - rgb[1]; val db = android.graphics.Color.blue(color) - rgb[2]; val value = (dr * dr + dg * dg + db * db).toLong(); if (value < distance) { distance = value; best = paletteIndex } }
        best
    }

    private fun writeShort(output: ByteArrayOutputStream, value: Int) { output.write(value and 0xFF); output.write((value shr 8) and 0xFF) }
    private fun writeBlocks(output: ByteArrayOutputStream, data: ByteArray) { var index = 0; while (index < data.size) { val count = minOf(255, data.size - index); output.write(count); output.write(data, index, count); index += count }; output.write(0) }

    private fun lzw(values: IntArray, minimumCodeSize: Int): ByteArray {
        val clear = 1 shl minimumCodeSize; val end = clear + 1; var nextCode = end + 1; var codeSize = minimumCodeSize + 1
        val dictionary = HashMap<List<Int>, Int>(); val writer = BitWriter(); writer.write(clear, codeSize)
        var current = listOf(values.firstOrNull() ?: 0)
        values.drop(1).forEach { value ->
            val combined = current + value
            if (dictionary.containsKey(combined)) current = combined
            else {
                writer.write(if (current.size == 1) current[0] else dictionary[current] ?: 0, codeSize)
                if (nextCode < 4096) { dictionary[combined] = nextCode++; if (nextCode == (1 shl codeSize) && codeSize < 12) codeSize++ }
                else { writer.write(clear, codeSize); dictionary.clear(); nextCode = end + 1; codeSize = minimumCodeSize + 1 }
                current = listOf(value)
            }
        }
        writer.write(if (current.size == 1) current[0] else dictionary[current] ?: 0, codeSize); writer.write(end, codeSize)
        return writer.toByteArray()
    }

    private class BitWriter {
        private val bytes = ByteArrayOutputStream(); private var buffer = 0; private var bits = 0
        fun write(value: Int, count: Int) { buffer = buffer or (value shl bits); bits += count; while (bits >= 8) { bytes.write(buffer and 0xFF); buffer = buffer ushr 8; bits -= 8 } }
        fun toByteArray(): ByteArray { if (bits > 0) bytes.write(buffer and 0xFF); return bytes.toByteArray() }
    }
}
