package com.comboauto

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread

class ScreenCaptureSession(
    private val context: Context,
    private val resultCode: Int,
    private val resultData: Intent,
    private val onStopped: () -> Unit
) {
    private val main = Handler(context.mainLooper)
    private val captureThread = HandlerThread("AutoComboScreenCapture")
    private val lock = Any()
    private var pending: ((Bitmap?) -> Unit)? = null
    private var pendingTimeout: Runnable? = null
    private var pendingEarliestNanos: Long = 0L
    private var projection: MediaProjection? = null
    private var reader: ImageReader? = null
    private var display: VirtualDisplay? = null
    private var stopped = false

    fun start(): Boolean {
        if (stopped) return false
        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = manager.getMediaProjection(resultCode, resultData) ?: return false
        captureThread.start()
        val captureHandler = Handler(captureThread.looper)
        val metrics = context.resources.displayMetrics
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        reader?.setOnImageAvailableListener({ imageReader -> onImage(imageReader) }, captureHandler)
        projection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopInternal(false)
                main.post(onStopped)
            }
        }, captureHandler)
        display = projection?.createVirtualDisplay(
            "AutoComboScreenCapture",
            width,
            height,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader?.surface,
            null,
            captureHandler
        )
        return display != null
    }

    fun capture(timeoutMs: Long = 1800L, callback: (Bitmap?) -> Unit) {
        beginCapture(timeoutMs, false, 0L, callback)
    }

    fun captureFresh(timeoutMs: Long = 2400L, callback: (Bitmap?) -> Unit) {
        beginCapture(timeoutMs, true, 0L, callback)
    }

    fun captureFreshAfterDelay(timeoutMs: Long = 3200L, minDelayMs: Long = 220L, callback: (Bitmap?) -> Unit) {
        beginCapture(timeoutMs, true, minDelayMs, callback)
    }

    private fun beginCapture(timeoutMs: Long, drainStaleFrames: Boolean, minDelayMs: Long, callback: (Bitmap?) -> Unit) {
        synchronized(lock) {
            if (stopped || pending != null) {
                main.post { callback(null) }
                return
            }
            if (drainStaleFrames) drainReader()
            pending = callback
            pendingEarliestNanos = if (minDelayMs > 0L) System.nanoTime() + minDelayMs * 1_000_000L else 0L
            val timeout = Runnable {
                val expired = synchronized(lock) {
                    val value = pending
                    pending = null
                    pendingEarliestNanos = 0L
                    value
                }
                expired?.invoke(null)
            }
            pendingTimeout = timeout
            main.postDelayed(timeout, timeoutMs)
        }
    }

    fun stop() { stopInternal(true) }

    private fun onImage(imageReader: ImageReader) {
        val image = imageReader.acquireLatestImage() ?: return
        var waitingForCleanFrame = false
        val callback = synchronized(lock) {
            val value = pending
            if (value != null && pendingEarliestNanos > 0L && System.nanoTime() < pendingEarliestNanos) {
                waitingForCleanFrame = true
                return@synchronized null
            }
            pending = null
            pendingEarliestNanos = 0L
            pendingTimeout?.let { main.removeCallbacks(it) }
            pendingTimeout = null
            value
        }
        if (callback == null || waitingForCleanFrame) {
            image.close()
            return
        }
        val bitmap = imageToBitmap(image)
        image.close()
        main.post { callback(bitmap) }
    }

    private fun drainReader() {
        val imageReader = reader ?: return
        repeat(4) {
            val image = try {
                imageReader.acquireLatestImage()
            } catch (_: Exception) {
                null
            } ?: return
            image.close()
        }
    }

    private fun imageToBitmap(image: Image): Bitmap? {
        return try {
            val plane = image.planes.firstOrNull() ?: return null
            val width = image.width
            val height = image.height
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = rowStride - pixelStride * width
            val paddedWidth = width + rowPadding / pixelStride
            val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
            padded.copyPixelsFromBuffer(plane.buffer)
            if (paddedWidth == width) padded else Bitmap.createBitmap(padded, 0, 0, width, height).also { padded.recycle() }
        } catch (_: Exception) { null }
    }

    private fun stopInternal(stopProjection: Boolean) {
        synchronized(lock) {
            if (stopped) return
            stopped = true
            pendingTimeout?.let { main.removeCallbacks(it) }
            pendingTimeout = null
            pending = null
            pendingEarliestNanos = 0L
        }
        reader?.close(); reader = null
        display?.release(); display = null
        if (stopProjection) projection?.stop()
        projection = null
        if (captureThread.isAlive) captureThread.quitSafely()
    }
}
