package com.comboauto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Button
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Space
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import android.widget.ProgressBar
import android.animation.ValueAnimator
import android.view.animation.LinearInterpolator
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val UI_TEXT_BOOST_TAG = "autocombo-ui-font-boost-2"

/** Apply the requested +2sp consistently, including rows created after init. */
private fun boostOverlayText(view: View) {
    if (view is TextView && view.tag != UI_TEXT_BOOST_TAG) {
        val density = view.resources.displayMetrics.scaledDensity.coerceAtLeast(0.1f)
        val currentSp = view.textSize / density
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, currentSp + 2f)
        view.tag = UI_TEXT_BOOST_TAG
    }
    if (view is android.view.ViewGroup) {
        for (index in 0 until view.childCount) boostOverlayText(view.getChildAt(index))
    }
}

class OverlayService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var windowManager: WindowManager
    private lateinit var controller: AppController
    private lateinit var persistence: Persistence
    private lateinit var iconView: FloatingIconView
    private lateinit var pathView: PathOverlayView
    private var guideView: BoardGuideView? = null
    private var panelView: NeonOverlayPanelView? = null
    private var settingsView: View? = null
    private var iconParams: WindowManager.LayoutParams? = null
    private var guideParams: WindowManager.LayoutParams? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var captureSession: ScreenCaptureSession? = null
    private var boardRegion: ScreenBoardRegion? = null
    private var scanBusy = false
    private var searchProgressActive = false
    private var searchProgressValue = 0
    private var searchProgressTicker: Runnable? = null
    private var autoRotating = false
    private var autoRotatePending = false
    private var autoRotateRetry: Runnable? = null
    private var gridDetectionRunnable: Runnable? = null
    private var queuedDetectionRegion: ScreenBoardRegion? = null
    private var queuedDetectionSolve = false
    private var pendingGuideRegion: SavedBoardRegion? = null
    private var guideUpdatePosted = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        SolverEngine.initialize(this)
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        persistence = Persistence(this)
        controller = AppController(this)
        controller.listener = { main.post { render() } }
        addPathLayer()
        addFloatingIcon()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startProjection(intent)
            ACTION_DETECT -> detectAndSolve()
            ACTION_TOP10 -> showPanel(true)
            ACTION_REFRESH_SETTINGS -> controller.reloadSettings()
            ACTION_STOP -> stopSelf()
        }
        return START_STICKY
    }

    private fun startProjection(intent: Intent) {
        val projectionIntent = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_PROJECTION_DATA, Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_PROJECTION_DATA)
        if (projectionIntent == null) return
        createNotificationChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(NOTIFICATION_ID, notification)
        captureSession?.stop()
        captureSession = ScreenCaptureSession(this, intent.getIntExtra(EXTRA_RESULT_CODE, -1), projectionIntent) {
            main.post { updateStatus("Screen capture stopped. Open the app to authorize again.") }
        }.also { session -> if (!session.start()) updateStatus("Screen capture could not start.") }
        updateStatus("Ready. Tap Detect & calculate.")
    }

    private fun detectAndSolve() {
        showPanel(false)
        if (controller.isSolving) {
            controller.cancelSolve()
            stopSearchProgress(false)
            return
        }
        requestDetection(true, currentScanRegion(), hideOverlay = true)
    }

    /** Capture/detect off the UI thread.  Every capture hides every AutoCombo
     * window first, including the panel and green guide. This is important for
     * SCAN too: the panel can overlap the playable board even when the user
     * only moved the guide and did not move the panel upward. */
    private fun requestDetection(solveAfter: Boolean, requestedRegion: ScreenBoardRegion, hideOverlay: Boolean) {
        if (controller.isSolving && !solveAfter) return
        if (scanBusy) {
            queuedDetectionRegion = requestedRegion
            queuedDetectionSolve = queuedDetectionSolve || solveAfter
            return
        }
        val session = captureSession
        if (session == null) {
            updateStatus("Open AutoCombo once and allow screen capture first.")
            return
        }
        gridDetectionRunnable?.let { main.removeCallbacks(it) }
        gridDetectionRunnable = null
        scanBusy = true
        startSearchProgress()
        panelView?.setDetectionState(true)
        controller.setStatus(if (solveAfter) "Capturing current screen..." else "Detecting board from green-grid reference...")
        pathView.setRoute(null, emptyList())
        render()
        setOverlayVisible(false)
        main.postDelayed({
            // SEARCH may be triggered while the game is still finishing a
            // previous orb animation.  Wait for a clean frame only for the
            // full SEARCH flow; grid calibration remains single-frame fast.
            session.captureFreshAfterDelay(
                timeoutMs = if (solveAfter) 1250L else 1100L,
                minDelayMs = if (solveAfter) 70L else 45L
            ) { bitmap ->
                setOverlayVisible(true)
                if (bitmap == null) {
                    scanBusy = false
                    panelView?.setDetectionState(false)
                    stopSearchProgress(false)
                    updateStatus("Screen capture timed out. Make sure the game screen is visible, then SCAN again.")
                    render()
                    continueQueuedDetection()
                    return@captureFreshAfterDelay
                }
                setSearchProgressStage(10)
                Thread {
                    setSearchProgressStage(15)
                    val detection = try {
                        SolverEngine.detectBoard(bitmap, requestedRegion, controller.originalBoard, controller.settings, controller.rules, controller.specials)
                    } catch (error: Exception) {
                        SolverEngine.DetectionOutput(
                            controller.originalBoard.copy(),
                            0.0,
                            "Detection crashed: ${error.message ?: error.javaClass.simpleName}"
                        )
                    }
                    if (!bitmap.isRecycled) bitmap.recycle()
                    main.post {
                        if (detection == null || detection.error != null) {
                            scanBusy = false
                            panelView?.setDetectionState(false)
                            stopSearchProgress(false)
                            updateStatus(detection?.error?.take(120) ?: "Detection failed. Check the saved green-grid position, then SCAN again.")
                            render()
                            continueQueuedDetection()
                            return@post
                        }
                        boardRegion = requestedRegion
                        controller.applyDetectedBoard(detection.board, detection.confidence, detection.debug)
                        setSearchProgressStage(if (solveAfter) 20 else 100)
                        scanBusy = false
                        panelView?.setDetectionState(false)
                        if (solveAfter) {
                            controller.solve { current, max ->
                                val ratio = current.toDouble() / max.coerceAtLeast(1).toDouble()
                                setSearchProgressStage(20 + (ratio.coerceIn(0.0, 1.0) * 80.0).roundToInt())
                            }
                        } else {
                            stopSearchProgress(true)
                        }
                        render()
                        continueQueuedDetection()
                    }
                }.start()
            }
        }, if (hideOverlay) 24L else 0L)
    }

    private fun scheduleGridDetection(region: ScreenBoardRegion) {
        if (controller.isSolving || scanBusy && queuedDetectionSolve) return
        gridDetectionRunnable?.let { main.removeCallbacks(it) }
        val task = Runnable {
            gridDetectionRunnable = null
            requestDetection(false, region, hideOverlay = false)
        }
        gridDetectionRunnable = task
        // Coalesce the many MOVE events generated by a finger into one fast
        // recognition pass after the newest geometry settles.
        main.postDelayed(task, 70L)
    }

    private fun continueQueuedDetection() {
        val next = queuedDetectionRegion ?: return
        val solve = queuedDetectionSolve
        queuedDetectionRegion = null
        queuedDetectionSolve = false
        main.post { requestDetection(solve, next, hideOverlay = solve) }
    }

    private fun startSearchProgress() {
        searchProgressTicker?.let { main.removeCallbacks(it) }
        searchProgressActive = true
        searchProgressValue = 0
        panelView?.setSearchProgress(searchProgressValue, true)
        // Do not animate a guessed percentage. The native bridge reports the
        // actual beam node count; capture/detection use explicit stage values.
        searchProgressTicker = null
    }

    private fun setSearchProgressStage(value: Int) {
        if (!searchProgressActive) return
        searchProgressValue = value.coerceIn(0, 99)
        main.post { panelView?.setSearchProgress(searchProgressValue, true) }
    }

    private fun stopSearchProgress(success: Boolean) {
        searchProgressTicker?.let { main.removeCallbacks(it) }
        searchProgressTicker = null
        if (!searchProgressActive) return
        searchProgressActive = false
        panelView?.setSearchProgress(if (success) 100 else 0, false)
    }

    private fun startAutoRotate() {
        if (autoRotating || autoRotatePending) {
            updateStatus("自動轉珠執行中，請等待目前路徑完成。")
            return
        }
        if (scanBusy || controller.isSolving) {
            updateStatus("SEARCH 尚未完成，請等待解算完成。")
            return
        }
        val result = controller.results.getOrNull(controller.selectedResultIndex)
        if (result == null || result.path.size < 2) {
            updateStatus("請先 SEARCH 並選擇一個解。")
            return
        }
        val accessibility = AutoComboAccessibilityService.instance
        if (accessibility == null) {
            if (isAutoComboAccessibilityEnabled()) {
                // Settings can be enabled before Android finishes reconnecting
                // the AccessibilityService process. Wait instead of opening
                // Settings again and making AUTO appear to jump away.
                autoRotatePending = true
                panelView?.setAutoRotateState(true)
                updateStatus("Accessibility service reconnecting...")
                scheduleAutoRotateRetry(0)
                return
            }
            updateStatus("請先在無障礙設定啟用 AutoCombo 自動轉珠服務。")
            try {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) { }
            return
        }
        val region = currentScanRegion()
        autoRotating = true
        panelView?.setAutoRotateState(true)
        updateStatus("自動轉珠執行中…")
        val accepted = accessibility.dispatchCellCenters(
            result.path,
            region,
            AndroidSolverTuning.REPLAY_SPEED
        ) { completed ->
            autoRotating = false
            panelView?.setAutoRotateState(false)
            updateStatus(if (completed) "自動轉珠完成。" else "自動轉珠被系統中止。")
            render()
        }
        if (!accepted) {
            autoRotating = false
            panelView?.setAutoRotateState(false)
            updateStatus("無法開始自動轉珠，請確認無障礙服務仍已啟用。")
            render()
        }
    }

    private fun scheduleAutoRotateRetry(attempt: Int) {
        autoRotateRetry?.let { main.removeCallbacks(it) }
        val retry = Runnable {
            if (!autoRotatePending) return@Runnable
            if (AutoComboAccessibilityService.instance != null) {
                autoRotatePending = false
                startAutoRotate()
            } else if (attempt < 20 && isAutoComboAccessibilityEnabled()) {
                scheduleAutoRotateRetry(attempt + 1)
            } else {
                autoRotatePending = false
                panelView?.setAutoRotateState(false)
                updateStatus("Accessibility service did not reconnect. Please reopen AutoCombo Accessibility once.")
                render()
            }
        }
        autoRotateRetry = retry
        main.postDelayed(retry, 150L)
    }

    private fun isAutoComboAccessibilityEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        val serviceName = AutoComboAccessibilityService::class.java.name
        val expected = "$packageName/$serviceName"
        return enabled.split(':').any { component ->
            component.equals(expected, ignoreCase = true) ||
                component.endsWith("/$serviceName", ignoreCase = true)
        }
    }

    private fun setOverlayVisible(visible: Boolean) {
        val state = if (visible) View.VISIBLE else View.INVISIBLE
        iconView.visibility = state
        panelView?.visibility = state
        guideView?.visibility = state
        pathView.visibility = state
    }

    private fun addFloatingIcon() {
        iconView = FloatingIconView(this) { dx, dy, click ->
            val params = iconParams ?: return@FloatingIconView
            if (click) togglePanel() else {
                params.x += dx.toInt()
                params.y += dy.toInt()
                try { windowManager.updateViewLayout(iconView, params) } catch (_: Exception) { }
                panelParams?.let { panel -> panel.x = params.x + dp(58); panel.y = params.y; panelView?.let { updatePanelPosition(panel) } }
                settingsParams?.let { panel -> panel.x = params.x + dp(58); panel.y = params.y; settingsView?.let { try { windowManager.updateViewLayout(it, panel) } catch (_: Exception) { } } }
            }
        }
        val params = overlayParams(dp(56), dp(56)).apply { gravity = Gravity.TOP or Gravity.START; x = dp(14); y = dp(240) }
        iconParams = params
        try { windowManager.addView(iconView, params) } catch (_: Exception) { stopSelf() }
    }

    private fun addPathLayer() {
        pathView = PathOverlayView(this)
        val params = overlayParams(-1, -1).apply {
            gravity = Gravity.TOP or Gravity.START
            alpha = 0.65f
            flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        }
        try { windowManager.addView(pathView, params) } catch (_: Exception) { }
    }

    private fun showPanel(showTop: Boolean) {
        if (showTop && (!controller.hasDetectedBoard || controller.results.isEmpty())) return
        if (panelView == null) {
            panelView = NeonOverlayPanelView(
                this,
                onSettings = { showSettings() },
                onGuide = { toggleGuideEditor() },
                onDetect = { detectAndSolve() },
                onTop10 = { toggleTop10Panel() },
                onSelect = { index -> controller.selectResult(index); render() },
                onAutoRotate = { startAutoRotate() },
                // The red X explicitly ends the floating helper, including
                // its icon, instead of merely hiding the current panel.
                onClose = { stopSelf() }
            )
            val icon = iconParams
            panelParams = overlayParams(dp(410), WindowManager.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START
                x = (icon?.x ?: dp(14)) + dp(62)
                y = icon?.y ?: dp(240)
            }
            try { windowManager.addView(panelView, panelParams) } catch (_: Exception) { panelView = null; panelParams = null }
        }
        panelView?.setResultsExpanded(showTop)
        panelParams?.let { params ->
            params.y = if (showTop) dp(8) else preferredPanelY()
            updatePanelPosition(params)
        }
        panelView?.setGuideMode(guideView != null)
        render()
    }

    private fun toggleTop10Panel() {
        if (!controller.hasDetectedBoard || controller.results.isEmpty()) return
        val panel = panelView ?: return
        panel.toggleResults()
        panelParams?.let { params ->
            params.y = if (panel.isResultsExpanded()) dp(8) else preferredPanelY()
            updatePanelPosition(params)
        }
        render()
    }

    private fun preferredPanelY(): Int {
        val screenHeight = resources.displayMetrics.heightPixels
        return (iconParams?.y ?: dp(240)).coerceIn(dp(8), max(dp(8), screenHeight - dp(420)))
    }

    private fun togglePanel() { if (panelView == null) showPanel(false) else closePanel() }

    private fun showSettings() {
        if (!controller.hasDetectedBoard) return
        closePanel()
        if (settingsView == null) {
            settingsView = MainSettingsView(this, controller, {
                controller.persist()
                closeSettings()
                showPanel(false)
            }, { closeSettings(); showPanel(false) })
            val icon = iconParams
            settingsParams = overlayParams(dp(400), WindowManager.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START
                x = (icon?.x ?: dp(14)) + dp(62)
                y = icon?.y ?: dp(240)
            }
            try { windowManager.addView(settingsView, settingsParams) } catch (_: Exception) { settingsView = null; settingsParams = null }
        }
    }

    private var settingsParams: WindowManager.LayoutParams? = null

    private fun closeSettings() {
        settingsView?.let { try { windowManager.removeView(it) } catch (_: Exception) { } }
        settingsView = null; settingsParams = null
        hideGuide()
    }

    private fun closePanel() {
        panelView?.let { try { windowManager.removeView(it) } catch (_: Exception) { } }
        panelView = null; panelParams = null
        hideGuide()
    }

    private fun toggleGuideEditor() {
        if (guideView == null) {
            showGuide()
            panelView?.setGuideMode(true)
            updateStatus("SCAN mode: drag or resize the green grid; detection updates automatically.")
            main.post { requestDetection(false, currentScanRegion(), hideOverlay = false) }
        } else {
            val pending = pendingGuideRegion
            pendingGuideRegion = null
            val savedRegion = pending?.let { ScreenBoardRegion(it.left, it.top, it.size, it.height) } ?: currentGuideRegion()
            savedRegion?.let { region ->
                persistence.saveBoardRegion(SavedBoardRegion(region.left, region.top, region.size, region.height))
                boardRegion = region
            }
            hideGuide()
            panelView?.setGuideMode(false)
            updateStatus("Green grid hidden. The latest detection remains loaded.")
        }
        render()
    }

    private fun showGuide() {
        if (guideView != null) return
        val metrics = resources.displayMetrics
        val saved = persistence.loadBoardRegion(metrics.widthPixels, metrics.heightPixels)
        guideView = BoardGuideView(this) { region -> queueGuideUpdate(region) }
        guideParams = overlayParams(saved.size, saved.height).apply {
            gravity = Gravity.TOP or Gravity.START
            x = saved.left
            y = saved.top
        }
        boardRegion = ScreenBoardRegion(saved.left, saved.top, saved.size, saved.height)
        try { windowManager.addView(guideView, guideParams) } catch (_: Exception) { guideView = null; guideParams = null }
    }

    private fun queueGuideUpdate(region: SavedBoardRegion) {
        pendingGuideRegion = region
        if (guideUpdatePosted) return
        guideUpdatePosted = true
        // WindowManager updates are rate-limited to one frame. Rebuilding the
        // full results panel for every raw MOVE event was the visible drag lag.
        main.postDelayed({
            guideUpdatePosted = false
            val latest = pendingGuideRegion ?: return@postDelayed
            pendingGuideRegion = null
            val params = guideParams ?: return@postDelayed
            params.x = latest.left
            params.y = latest.top
            params.width = latest.size
            params.height = latest.height
            boardRegion = ScreenBoardRegion(latest.left, latest.top, latest.size, latest.height)
            // Persist the latest calibration while the user drags/resizes;
            // reopening the overlay therefore restores the last position
            // even if SCAN is only used to hide the grid afterward.
            persistence.saveBoardRegion(latest)
            try { windowManager.updateViewLayout(guideView, params) } catch (_: Exception) { }
            scheduleGridDetection(ScreenBoardRegion(latest.left, latest.top, latest.size, latest.height))
        }, 16L)
    }

    private fun hideGuide() {
        guideView?.let { try { windowManager.removeView(it) } catch (_: Exception) { } }
        guideView = null
        guideParams = null
        panelView?.setGuideMode(false)
    }

    private fun currentGuideRegion(): ScreenBoardRegion? {
        val params = guideParams ?: return boardRegion
        // Height is derived from width so a stale LayoutParams/persisted
        // height can never stretch the grid into a non-square-cell shape.
        return ScreenBoardRegion(params.x, params.y, params.width, BoardGeometry.fullHeightForSize(params.width))
    }

    private fun currentScanRegion(): ScreenBoardRegion {
        currentGuideRegion()?.let { return it }
        val metrics = resources.displayMetrics
        val saved = persistence.loadBoardRegion(metrics.widthPixels, metrics.heightPixels)
        return ScreenBoardRegion(saved.left, saved.top, saved.size, saved.height).also { boardRegion = it }
    }

    private fun updatePanelPosition(params: WindowManager.LayoutParams) {
        val panel = panelView ?: return
        try { windowManager.updateViewLayout(panel, params) } catch (_: Exception) { }
    }

    private fun render() {
        val busy = scanBusy || controller.isSolving
        if (searchProgressActive && !scanBusy && !controller.isSolving) {
            stopSearchProgress(controller.results.isNotEmpty())
        }
        iconView.setBusy(busy)
        panelView?.render(controller, busy)
        if (searchProgressActive) panelView?.setSearchProgress(searchProgressValue, true)
        // The game screen is intentionally kept clean.  The selected route
        // remains available in the panel preview and for auto-rotation, but
        // is no longer painted over the app underneath the overlay.
        pathView.setRoute(null, emptyList())
    }

    private fun updateStatus(message: String) {
        controller.setStatus(message)
    }

    private fun overlayParams(width: Int, height: Int): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        return WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL_ID, "AutoCombo screen helper", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launch = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutable())
        val builder = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(this, CHANNEL_ID) else android.app.Notification.Builder(this)
        return builder.setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("AutoCombo is active").setContentText("Floating screen solver is running").setContentIntent(launch).setOngoing(true).build()
    }

    private fun pendingIntentImmutable(): Int = if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        stopSearchProgress(false)
        autoRotateRetry?.let { main.removeCallbacks(it) }
        autoRotateRetry = null
        autoRotatePending = false
        closeSettings()
        closePanel()
        captureSession?.stop(); captureSession = null
        try { windowManager.removeView(pathView) } catch (_: Exception) { }
        try { windowManager.removeView(iconView) } catch (_: Exception) { }
        controller.destroy()
        SolverEngine.shutdown()
        if (instance === this) instance = null
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        @Volatile private var instance: OverlayService? = null
        fun refreshSettings() { instance?.controller?.reloadSettings() }
        const val ACTION_START = "com.comboauto.action.START"
        const val ACTION_DETECT = "com.comboauto.action.DETECT"
        const val ACTION_TOP10 = "com.comboauto.action.TOP10"
        const val ACTION_REFRESH_SETTINGS = "com.comboauto.action.REFRESH_SETTINGS"
        const val ACTION_STOP = "com.comboauto.action.STOP"
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_PROJECTION_DATA = "projection_data"
        private const val CHANNEL_ID = "autocombo_capture"
        private const val NOTIFICATION_ID = 4401
    }
}

private class FloatingIconView(context: android.content.Context, private val onAction: (Float, Float, Boolean) -> Unit) : TextView(context) {
    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var moved = false
    private var animator: ValueAnimator? = null
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    init {
        text = "✦"
        textSize = 28f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.rgb(20, 125, 190)); setStroke(2, Color.CYAN) }
        elevation = 12f
        contentDescription = "AutoCombo floating control"
        setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = event.rawX; downY = event.rawY; lastX = downX; lastY = downY; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - lastX; val dy = event.rawY - lastY
                    if (kotlin.math.hypot((event.rawX - downX).toDouble(), (event.rawY - downY).toDouble()) > touchSlop) moved = true
                    lastX = event.rawX; lastY = event.rawY; if (moved) onAction(dx, dy, false); true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { if (!moved) onAction(0f, 0f, true); true }
                else -> false
            }
        }
    }

    fun setBusy(busy: Boolean) {
        if (busy && animator == null) {
            animator = ValueAnimator.ofFloat(0f, 360f).apply { duration = 720; repeatCount = ValueAnimator.INFINITE; interpolator = LinearInterpolator(); addUpdateListener { rotation = it.animatedValue as Float }; start() }
        } else if (!busy) {
            animator?.cancel(); animator = null; rotation = 0f
        }
    }
}

private class OverlayPanelView(
    context: android.content.Context,
    private val onSettings: () -> Unit,
    private val onDetect: () -> Unit,
    private val onTop10: () -> Unit,
    private val onSelect: (Int) -> Unit,
    private val onClose: () -> Unit
) : LinearLayout(context) {
    private val status = TextView(context)
    private val stats = TextView(context)
    private val preview = BoardView(context)
    private val resultsContainer = LinearLayout(context).apply {
        // Top10 is a vertical selectable list.  Without this explicit
        // orientation Android's default is HORIZONTAL, so all ten result
        // Top10 rows are laid out vertically and shown together.
        orientation = VERTICAL
    }
    private var resultsExpanded = false
    private val dp: (Int) -> Int = { (it * resources.displayMetrics.density).toInt() }

    init {
        orientation = VERTICAL
        setPadding(dp(12), dp(10), dp(12), dp(12))
        background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.argb(242, 20, 22, 32)); setStroke(dp(1), Color.rgb(80, 85, 110)) }
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(context).apply { text = "AutoCombo"; textSize = 17f; setTextColor(Color.WHITE); setTypeface(typeface, android.graphics.Typeface.BOLD) }, LayoutParams(0, dp(40), 1f))
        header.addView(button("×") { onClose() }, LayoutParams(dp(40), dp(40)))
        addView(header)
        status.apply { textSize = 12f; setTextColor(Color.LTGRAY); setPadding(0, 0, 0, dp(5)) }; addView(status)
        val actions = LinearLayout(context).apply { orientation = HORIZONTAL }
        actions.addView(button("設定") { onSettings() }, LayoutParams(0, dp(42), 1f))
        actions.addView(button("偵測並計算") { onDetect() }, LayoutParams(0, dp(42), 1.55f))
        actions.addView(button("Top10") { onTop10() }, LayoutParams(0, dp(42), 1f))
        addView(actions)
        stats.apply { textSize = 12f; setTextColor(Color.CYAN); setPadding(0, dp(6), 0, dp(4)) }; addView(stats)
        preview.layoutParams = LayoutParams(dp(190), dp(190)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(4) }
        addView(preview)
        resultsContainer.visibility = GONE
        addView(resultsContainer, LayoutParams(-1, -2))
    }

    fun toggleResults() { setResultsExpanded(!resultsExpanded) }
    fun setResultsExpanded(expanded: Boolean) {
        resultsExpanded = expanded
        resultsContainer.visibility = if (expanded) VISIBLE else GONE
    }

    fun render(controller: AppController, busy: Boolean) {
        status.text = controller.lastMessage ?: if (busy) "Calculating..." else "Ready"
        val selected = controller.results.getOrNull(controller.selectedResultIndex)
        stats.text = selected?.let { "Step ${it.path.size - 1}   Combo ${legacyComboText(it)}" } ?: "No result selected"
        preview.board = selected?.board ?: controller.board; preview.route = emptyList(); preview.invalidate()
        resultsContainer.removeAllViews()
        controller.results.take(10).forEachIndexed { index, result ->
            val label = "#${index + 1}  ${if (result.hardSatisfied) "✓" else ""}  Step ${result.path.size - 1}  Combo ${legacyComboText(result)}"
            val color = if (index == controller.selectedResultIndex) Color.rgb(65, 75, 135) else Color.rgb(48, 52, 72)
            resultsContainer.addView(button(label, color) { onSelect(index) }, LayoutParams(-1, dp(34)))
        }
    }

    private fun legacyComboText(result: SolverResult): String {
        val initial = result.evaluation.initialGroups.coerceAtLeast(0)
        val skyfall = result.evaluation.skyfallGroups.coerceAtLeast(0)
        return if (skyfall > 0) "$initial+$skyfall" else initial.toString()
    }

    private fun button(label: String, action: () -> Unit): Button = button(label, Color.rgb(48, 52, 72), action)
    private fun button(label: String, color: Int, action: () -> Unit): Button = Button(context).apply { text = label; textSize = 11f; setTextColor(Color.WHITE); setBackgroundColor(color); setOnClickListener { action() }; minHeight = 0; minimumHeight = 0 }
}

private class OverlaySettingsView(
    context: android.content.Context,
    private val controller: AppController,
    private val onSave: () -> Unit,
    private val onCancel: () -> Unit
) : ScrollView(context) {
    private val dp: (Int) -> Int = { (it * resources.displayMetrics.density).toInt() }
    private val root = LinearLayout(context)
    private val targetLabel = TextView(context)
    private val shieldCountLabel = TextView(context)
    private val stepLabel = TextView(context)
    private val targetSeek = SeekBar(context)
    private val shieldCountSeek = SeekBar(context)
    private val stepSeek = SeekBar(context)
    private val shieldSpinner = Spinner(context)
    private val prioritySpinner = Spinner(context)
    private val startInput = EditText(context)
    private val endInput = EditText(context)
    private val diagonal = CheckBox(context)
    private val skyfall = CheckBox(context)
    private val row0 = CheckBox(context)

    init {
        isFillViewport = true
        setBackgroundColor(Color.rgb(20, 22, 32))
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(dp(14), dp(12), dp(14), dp(14))
        addView(root, LayoutParams(-1, -2))
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(context).apply { text = "Settings"; textSize = 18f; setTextColor(Color.WHITE); setTypeface(typeface, android.graphics.Typeface.BOLD) }, LinearLayout.LayoutParams(0, dp(42), 1f))
        header.addView(button("取消") { onCancel() }, LinearLayout.LayoutParams(dp(58), dp(42)))
        header.addView(button("儲存") { save() }, LinearLayout.LayoutParams(dp(58), dp(42)))
        root.addView(header)
        addSeek(targetLabel, targetSeek, "預期首消 Combo", 1, 30, controller.settings.targetCombo)
        root.addView(label("解盾設定"))
        shieldSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, SpecialType.values().map { specialLabel(it) })
        root.addView(shieldSpinner, LinearLayout.LayoutParams(-1, dp(46)))
        addSeek(shieldCountLabel, shieldCountSeek, "解盾目標數量", 1, 12, controller.settings.shieldCount)
        root.addView(label("優先消除／模式"))
        prioritySpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, listOf("步數模式（Steps first）", "Combo 模式（Combo first）"))
        root.addView(prioritySpinner, LinearLayout.LayoutParams(-1, dp(46)))
        addSeek(stepLabel, stepSeek, "步數限制", 1, 180, controller.settings.maxSteps)
        root.addView(inputLabel("起始位置 row,col；Auto 表示不限"))
        root.addView(startInput, LinearLayout.LayoutParams(-1, dp(46)))
        root.addView(inputLabel("收尾位置 row,col；Auto 表示不限"))
        root.addView(endInput, LinearLayout.LayoutParams(-1, dp(46)))
        diagonal.text = "允許斜轉"; diagonal.setTextColor(Color.LTGRAY); root.addView(diagonal)
        skyfall.text = "啟用 Skyfall／落珠"; skyfall.setTextColor(Color.LTGRAY); root.addView(skyfall)
        row0.text = "允許頂部緩衝列"; row0.setTextColor(Color.LTGRAY); root.addView(row0)
        loadValues()
        boostOverlayText(this)
    }

    private fun addSeek(labelView: TextView, seek: SeekBar, label: String, minValue: Int, maxValue: Int, value: Int) {
        labelView.setTextColor(Color.LTGRAY); labelView.textSize = 12f; root.addView(labelView)
        seek.max = maxValue - minValue
        seek.progress = (value - minValue).coerceIn(0, seek.max)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) { labelView.text = "$label：${progress + minValue}" }
            override fun onStartTrackingTouch(bar: SeekBar?) {}
            override fun onStopTrackingTouch(bar: SeekBar?) {}
        })
        root.addView(seek, LinearLayout.LayoutParams(-1, dp(38)))
    }

    private fun loadValues() {
        val s = controller.settings
        targetLabel.text = "預期首消 Combo：${s.targetCombo}"
        shieldCountLabel.text = "解盾目標數量：${s.shieldCount}"
        stepLabel.text = "步數限制：${s.maxSteps}"
        shieldSpinner.setSelection(s.shieldType.ordinal)
        prioritySpinner.setSelection(if (s.priority == SolverPriority.COMBO) 1 else 0)
        startInput.setText(s.startLabel()); endInput.setText(s.endLabel())
        startInput.setTextColor(Color.WHITE); endInput.setTextColor(Color.WHITE)
        startInput.setHint("Auto 或 1,1"); endInput.setHint("Auto 或 6,6")
        startInput.inputType = android.text.InputType.TYPE_CLASS_TEXT; endInput.inputType = android.text.InputType.TYPE_CLASS_TEXT
        diagonal.isChecked = s.diagonalEnabled; skyfall.isChecked = s.skyfallEnabled; row0.isChecked = s.row0Enabled
    }

    private fun save() {
        val s = controller.settings
        s.targetCombo = targetSeek.progress + 1
        s.shieldType = SpecialType.values()[shieldSpinner.selectedItemPosition]
        s.shieldCount = shieldCountSeek.progress + 1
        s.priority = if (prioritySpinner.selectedItemPosition == 1) SolverPriority.COMBO else SolverPriority.STEPS
        s.maxSteps = stepSeek.progress + 1
        parse(startInput.text.toString())?.let { s.startRow = it.first; s.startCol = it.second } ?: run { s.startRow = -1; s.startCol = -1 }
        parse(endInput.text.toString())?.let { s.endRow = it.first; s.endCol = it.second } ?: run { s.endRow = -1; s.endCol = -1 }
        s.diagonalEnabled = diagonal.isChecked; s.skyfallEnabled = skyfall.isChecked; s.row0Enabled = row0.isChecked
        onSave()
    }

    private fun parse(value: String): Pair<Int, Int>? {
        if (value.trim().equals("auto", true)) return null
        val p = value.trim().split(',', '，')
        val r = p.getOrNull(0)?.trim()?.toIntOrNull()?.minus(1) ?: return null
        val c = p.getOrNull(1)?.trim()?.toIntOrNull()?.minus(1) ?: return null
        return if (r in 0 until Board.ROWS && c in 0 until Board.COLS) r to c else null
    }

    private fun specialLabel(type: SpecialType): String = when (type) {
        SpecialType.NONE -> "不設定解盾條件"; SpecialType.COMBO -> "Combo 解盾"; SpecialType.CROSS -> "十字解盾"; SpecialType.L_SHAPE -> "L 形解盾"; SpecialType.T_SHAPE -> "T 形解盾"; SpecialType.RECTANGLE -> "矩形解盾"; SpecialType.CLEAR_COUNT -> "首消數量解盾"; SpecialType.EQUAL_FIRST -> "同色首消解盾"
    }

    private fun label(text: String) = TextView(context).apply { this.text = text; setTextColor(Color.LTGRAY); setPadding(0, dp(7), 0, dp(2)) }
    private fun inputLabel(text: String) = TextView(context).apply { this.text = text; setTextColor(Color.LTGRAY); setPadding(0, dp(5), 0, 0) }
    private fun button(text: String, action: () -> Unit) = Button(context).apply { this.text = text; textSize = 11f; setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(48, 52, 72)); setOnClickListener { action() }; minHeight = 0; minimumHeight = 0 }
}

private class NeonOverlayPanelView(
    context: android.content.Context,
    private val onSettings: () -> Unit,
    private val onGuide: () -> Unit,
    private val onDetect: () -> Unit,
    private val onTop10: () -> Unit,
    private val onSelect: (Int) -> Unit,
    private val onAutoRotate: () -> Unit,
    private val onClose: () -> Unit
) : LinearLayout(context) {
    private val status = TextView(context)
    private val stats = TextView(context)
    private val searchProgress = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal)
    private val detectionSpinner = ProgressBar(context)
    private lateinit var detectionSpinnerRow: LinearLayout
    private val preview = BoardView(context)
    private val resultsContainer = LinearLayout(context).apply {
        // Keep every BeamSolve candidate in one vertical, non-scrolling list.
        orientation = VERTICAL
    }
    private var resultsExpanded = false
    private lateinit var guideButton: Button
    private lateinit var autoRotateButton: Button
    private lateinit var settingsButton: Button
    private lateinit var top10Button: Button
    private var autoRotateActive = false
    private val dp: (Int) -> Int = { (it * resources.displayMetrics.density).toInt() }

    init {
        orientation = VERTICAL
        setPadding(dp(12), dp(10), dp(12), dp(12))
        background = neonPanel()
        val header = LinearLayout(context).apply {
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(TextView(context).apply {
            text = "AUTO COMBO"
            textSize = 18f
            setTextColor(Color.rgb(164, 255, 230))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER_VERTICAL
        }, LayoutParams(0, dp(42), 1f))
        header.addView(neonButton("✕") { onClose() }.apply {
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(255, 116, 136))
            background = GradientDrawable().apply {
                cornerRadius = dp(8).toFloat()
                setColor(Color.argb(220, 58, 16, 30))
                setStroke(dp(1), Color.rgb(255, 72, 104))
            }
        }, LayoutParams(dp(42), dp(42)))
        addView(header)
        status.apply {
            text = "未計算"
            textSize = 11.5f
            setTextColor(Color.rgb(160, 175, 185))
            setPadding(0, 0, 0, 0)
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setSingleLine(true)
            visibility = VISIBLE
        }
        detectionSpinner.isIndeterminate = true
        detectionSpinner.indeterminateTintList = ColorStateList.valueOf(Color.rgb(170, 180, 190))
        detectionSpinner.visibility = INVISIBLE
        detectionSpinnerRow = LinearLayout(context).apply {
            gravity = Gravity.CENTER
            addView(detectionSpinner, LayoutParams(dp(24), dp(24)))
            // Reserve the same vertical space for SCAN and SEARCH so the
            // controls below never jump when detection starts or finishes.
            visibility = VISIBLE
        }
        // Use one fixed status row. The spinner is layered over the same row
        // instead of adding a separate 28dp spacer between status and progress.
        // This makes the title->status and status->progress gaps identical.
        val statusRow = android.widget.FrameLayout(context)
        statusRow.addView(status, android.widget.FrameLayout.LayoutParams(-1, dp(24)))
        statusRow.addView(detectionSpinnerRow, android.widget.FrameLayout.LayoutParams(-1, dp(24)))
        addView(statusRow, LayoutParams(-1, dp(24)).apply { topMargin = dp(6) })
        searchProgress.max = 100
        searchProgress.progress = 0
        searchProgress.progressTintList = ColorStateList.valueOf(Color.rgb(75, 255, 205))
        searchProgress.visibility = GONE
        addView(searchProgress, LayoutParams(-1, dp(8)).apply {
            topMargin = dp(6)
            bottomMargin = dp(4)
        })
        val actions = LinearLayout(context).apply { orientation = HORIZONTAL }
        settingsButton = neonButton("SET") { onSettings() }
        actions.addView(settingsButton, LayoutParams(0, dp(46), 1f))
        guideButton = neonButton("SCAN") { onGuide() }
        actions.addView(guideButton, LayoutParams(0, dp(46), 1f))
        actions.addView(neonButton("SEARCH") { onDetect() }, LayoutParams(0, dp(46), 1.2f))
        top10Button = neonButton("TOP10") { onTop10() }
        actions.addView(top10Button, LayoutParams(0, dp(46), 1f))
        addView(actions)
        stats.apply { textSize = 14f; setTextColor(Color.rgb(75, 255, 205)); setPadding(0, dp(8), 0, dp(6)) }
        addView(stats)
        val previewWidth = dp(174)
        preview.layoutParams = LayoutParams(previewWidth, BoardGeometry.fullHeightForSize(previewWidth)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(6)
        }
        addView(preview)
        autoRotateButton = neonButton("AUTO") { onAutoRotate() }
        addView(LinearLayout(context).apply {
            addView(autoRotateButton, LayoutParams(0, dp(46), 1f))
        }, LayoutParams(-1, dp(46)))
        resultsContainer.visibility = GONE
        addView(resultsContainer, LayoutParams(-1, -2))
    }

    fun toggleResults() { setResultsExpanded(!resultsExpanded) }
    fun isResultsExpanded(): Boolean = resultsExpanded
    fun setSearchProgress(value: Int, visible: Boolean) {
        searchProgress.progress = value.coerceIn(0, 100)
        searchProgress.visibility = if (visible) VISIBLE else GONE
    }

    fun setDetectionState(active: Boolean) {
        detectionSpinnerRow.visibility = VISIBLE
        detectionSpinner.visibility = if (active) VISIBLE else INVISIBLE
    }

    fun setAutoRotateState(active: Boolean) {
        if (!::autoRotateButton.isInitialized) return
        autoRotateActive = active
        autoRotateButton.text = "AUTO"
        autoRotateButton.isEnabled = !active
        autoRotateButton.alpha = if (active) 0.65f else 1f
    }
    fun setResultsExpanded(expanded: Boolean) {
        resultsExpanded = expanded
        resultsContainer.visibility = if (expanded) VISIBLE else GONE
    }

    fun setGuideMode(active: Boolean) {
        if (!::guideButton.isInitialized) return
        guideButton.text = "SCAN"
        guideButton.setTextColor(if (active) Color.BLACK else Color.rgb(215, 255, 245))
        guideButton.background = GradientDrawable().apply {
            cornerRadius = dp(8).toFloat()
            setColor(if (active) Color.rgb(92, 255, 184) else Color.argb(220, 18, 26, 44))
            setStroke(dp(1), if (active) Color.WHITE else Color.rgb(40, 130, 118))
        }
    }

    fun render(controller: AppController, busy: Boolean) {
        if (::settingsButton.isInitialized) {
            val detected = controller.hasDetectedBoard
            val hasResults = detected && controller.results.isNotEmpty()
            settingsButton.isEnabled = detected
            top10Button.isEnabled = hasResults
            settingsButton.alpha = if (detected) 1f else 0.42f
            top10Button.alpha = if (hasResults) 1f else 0.42f
        }
        // Keep the header state short and stable. Detailed capture errors
        // remain in the controller status channel; the overlay exposes the
        // three user-facing states requested for this window.
        status.text = when {
            busy -> "計算中..."
            controller.results.isNotEmpty() -> "計算完成"
            else -> "未計算"
        }
        val selected = controller.results.getOrNull(controller.selectedResultIndex)
        val canAutoRotate = selected != null && selected.path.size >= 2 && !busy
        autoRotateButton.isEnabled = canAutoRotate && !autoRotateActive
        autoRotateButton.alpha = if (autoRotateActive) 0.65f else if (canAutoRotate) 1f else 0.42f
        stats.text = selected?.let {
            "Step ${max(0, it.path.size - 1)}   Combo ${comboText(it)}   #${controller.selectedResultIndex + 1}"
        } ?: "No result selected"
        // App.jsx keeps the detected/base board visible while the selected
        // solution is represented by the route.  The route is drawn by the
        // transparent touch-through overlay, not by mutating this preview.
        preview.board = selected?.board ?: controller.originalBoard
        preview.route = selected?.path ?: emptyList()
        preview.invalidate()
        resultsContainer.removeAllViews()
        controller.results.take(10).forEachIndexed { index, result ->
            val active = index == controller.selectedResultIndex
            resultsContainer.addView(resultRow(controller, index, result, active))
        }
        if (controller.results.isEmpty()) {
            resultsContainer.addView(TextView(context).apply {
                text = if (busy) "Searching solution pool..." else "No Top10 yet. Tap SEARCH."
                textSize = 14f
                setTextColor(Color.rgb(160, 180, 190))
                setPadding(dp(10), dp(14), dp(10), dp(14))
            })
        }
        boostOverlayText(this)
    }

    private fun comboText(result: SolverResult): String {
        // Match App.jsx: only show the cascade suffix when it is non-zero.
        // Never collapse first-clear and cascade counts into one misleading
        // total in the Top10 display.
        val initial = result.evaluation.initialGroups.coerceAtLeast(0)
        val skyfall = result.evaluation.skyfallGroups.coerceAtLeast(0)
        return if (skyfall > 0) "$initial+$skyfall" else initial.toString()
    }

    private fun resultRow(controller: AppController, index: Int, result: SolverResult, active: Boolean): View {
        val row = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(8).toFloat()
                setColor(if (active) Color.argb(200, 44, 105, 86) else Color.argb(190, 14, 24, 40))
                setStroke(dp(1), if (active) Color.rgb(92, 255, 184) else Color.rgb(40, 130, 118))
            }
            isClickable = true
            setOnClickListener { onSelect(index) }
        }
        val left = TextView(context).apply {
            text = "#${index + 1}   Step ${max(0, result.path.size - 1)}   Combo ${comboText(result)}"
            textSize = 12.5f
            setTextColor(if (active) Color.rgb(170, 255, 225) else Color.rgb(215, 255, 245))
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setSingleLine(true)
        }
        row.addView(left, LayoutParams(0, dp(38), 2f))
        val shieldStatus = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER
        }
        for (slot in 0 until 3) {
            val configured = controller.specials.getOrNull(slot)?.type != SpecialType.NONE
            val achieved = result.specialStatus.getOrNull(slot) == true
            shieldStatus.addView(statusSquare(configured, achieved), LinearLayout.LayoutParams(dp(28), dp(28)).apply {
                if (slot > 0) leftMargin = dp(5)
            })
        }
        row.addView(shieldStatus, LayoutParams(0, dp(38), 1f))
        return row.apply { minimumHeight = dp(38) }
    }

    private fun statusSquare(configured: Boolean, achieved: Boolean): TextView {
        val color = when {
            !configured -> Color.rgb(145, 160, 168)
            achieved -> Color.rgb(92, 255, 150)
            else -> Color.rgb(255, 92, 112)
        }
        return TextView(context).apply {
            text = when {
                !configured -> "一"
                achieved -> "✓"
                else -> "✕"
            }
            textSize = 17f
            gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(color)
            background = GradientDrawable().apply {
                cornerRadius = dp(4).toFloat()
                setColor(Color.argb(96, Color.red(color), Color.green(color), Color.blue(color)))
                setStroke(dp(1), color)
            }
            contentDescription = when {
                !configured -> "解盾未設定"
                achieved -> "解盾已達成"
                else -> "解盾未達成"
            }
        }
    }

    private fun neonPanel() = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(Color.argb(238, 6, 10, 22))
        setStroke(dp(1), Color.rgb(72, 255, 190))
    }

    private fun neonButton(label: String, active: Boolean = false, action: () -> Unit): Button = Button(context).apply {
        text = label
        textSize = 12.5f
        setTextColor(if (active) Color.BLACK else Color.rgb(215, 255, 245))
        background = GradientDrawable().apply {
            cornerRadius = dp(8).toFloat()
            setColor(if (active) Color.rgb(92, 255, 184) else Color.argb(220, 18, 26, 44))
            setStroke(dp(1), if (active) Color.WHITE else Color.rgb(40, 130, 118))
        }
        setOnClickListener { action() }
        minHeight = 0
        minimumHeight = 0
    }
}

private class NeonSettingsView(
    context: android.content.Context,
    private val controller: AppController,
    private val onSave: () -> Unit,
    private val onCancel: () -> Unit
) : ScrollView(context) {
    private val dp: (Int) -> Int = { (it * resources.displayMetrics.density).toInt() }
    private val root = LinearLayout(context)
    private val targetCombo = SeekBar(context)
    private val initCombo = SeekBar(context)
    private val maxSteps = SeekBar(context)
    private val hardLimit = SeekBar(context)
    private val performance = SeekBar(context)
    private val shieldCount = SeekBar(context)
    private val clearCount = SeekBar(context)
    private val rectRows = SeekBar(context)
    private val rectCols = SeekBar(context)
    private val prioritySpinner = Spinner(context)
    private val shieldSpinner = Spinner(context)
    private val shieldOrbSpinner = Spinner(context)
    private val startInput = EditText(context)
    private val endInput = EditText(context)
    private val diagonal = CheckBox(context)
    private val skyfall = CheckBox(context)
    private val row0 = CheckBox(context)
    private val hardLimitEnabled = CheckBox(context)
    private val humanPlanner = CheckBox(context)
    private val reversePlanner = CheckBox(context)
    private val equalChecks = mutableListOf<CheckBox>()

    init {
        isFillViewport = true
        background = panelBackground()
        root.orientation = LinearLayout.VERTICAL
        root.setPadding(dp(14), dp(12), dp(14), dp(14))
        addView(root, LayoutParams(-1, -2))
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(context).apply {
            text = "NEON SETTINGS"
            textSize = 17f
            setTextColor(Color.rgb(160, 255, 225))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, LinearLayout.LayoutParams(0, dp(42), 1f))
        header.addView(button("X") { onCancel() }, LinearLayout.LayoutParams(dp(48), dp(40)))
        header.addView(button("SAVE") { save() }, LinearLayout.LayoutParams(dp(66), dp(40)))
        root.addView(header)

        section("Search")
        spinner(prioritySpinner, listOf("Steps first", "Combo first"))
        addSeek("Target combo", targetCombo, 1, 30, controller.settings.targetCombo)
        addSeek("Initial combo target", initCombo, 0, 30, controller.settings.initTargetCombo)
        addSeek("Max search steps", maxSteps, 1, 250, controller.settings.maxSteps)
        checkbox(hardLimitEnabled, "Hard step limit")
        addSeek("Hard limit", hardLimit, 1, 250, controller.settings.hardStepLimit)
        input("Start row,col", startInput, controller.settings.startLabel())
        input("End row,col", endInput, controller.settings.endLabel())
        checkbox(diagonal, "Diagonal movement")
        checkbox(skyfall, "Skyfall")
        checkbox(row0, "Use top row")

        section("Shield")
        spinner(shieldSpinner, listOf("None", "Combo", "Cross", "L shape", "T shape", "Rectangle", "Clear count", "Equal first"))
        spinner(shieldOrbSpinner, listOf("Any orb", "Water", "Fire", "Earth", "Light", "Dark", "Heart"))
        addSeek("Shape count", shieldCount, 1, 12, controller.settings.shieldCount)
        addSeek("Clear count", clearCount, 3, 30, controller.settings.shieldClearCount)
        addSeek("Rect rows", rectRows, 2, 5, controller.settings.shieldRectRows)
        addSeek("Rect cols", rectCols, 2, 6, controller.settings.shieldRectCols)
        val equalRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        Orb.values().forEach { orb ->
            val cb = CheckBox(context).apply {
                text = orb.label.take(1)
                setTextColor(orb.tint)
                isChecked = (controller.settings.equalFirstMask and (1 shl orb.ordinal)) != 0
            }
            equalChecks += cb
            equalRow.addView(cb, LinearLayout.LayoutParams(0, dp(42), 1f))
        }
        root.addView(equalRow)

        section("Advanced")
        addSeek("Performance Lv", performance, 1, 5, controller.settings.performanceLevel)
        root.addView(TextView(context).apply {
            text = "固定搜尋配置：Beam 640／Nodes 110k"
            textSize = 12f
            setTextColor(Color.rgb(125, 180, 170))
            setPadding(0, 0, 0, dp(4))
        })
        loadValues()
        boostOverlayText(this)
    }

    private fun save() {
        val s = controller.settings
        s.priority = if (prioritySpinner.selectedItemPosition == 1) SolverPriority.COMBO else SolverPriority.STEPS
        s.initTargetCombo = initCombo.progress
        s.maxSteps = maxSteps.progress + 1
        s.hardStepLimitEnabled = hardLimitEnabled.isChecked
        s.hardStepLimit = hardLimit.progress + 1
        parseCoord(startInput.text.toString())?.let { s.startRow = it.first; s.startCol = it.second } ?: run { s.startRow = -1; s.startCol = -1 }
        parseCoord(endInput.text.toString())?.let { s.endRow = it.first; s.endCol = it.second } ?: run { s.endRow = -1; s.endCol = -1 }
        s.diagonalEnabled = diagonal.isChecked
        s.skyfallEnabled = skyfall.isChecked
        s.row0Enabled = row0.isChecked
        s.shieldType = SpecialType.values()[shieldSpinner.selectedItemPosition]
        s.shieldOrb = shieldOrbSpinner.selectedItemPosition - 1
        s.shieldCount = shieldCount.progress + 1
        s.shieldClearCount = clearCount.progress + 3
        s.shieldRectRows = rectRows.progress + 2
        s.shieldRectCols = rectCols.progress + 2
        s.equalFirstMask = equalChecks.foldIndexed(0) { index, mask, box -> if (box.isChecked) mask or (1 shl index) else mask }
        s.applyPerformance(performance.progress + 1)
        onSave()
    }

    private fun loadValues() {
        val s = controller.settings
        prioritySpinner.setSelection(if (s.priority == SolverPriority.COMBO) 1 else 0)
        shieldSpinner.setSelection(s.shieldType.ordinal)
        shieldOrbSpinner.setSelection((s.shieldOrb + 1).coerceIn(0, 6))
        diagonal.isChecked = s.diagonalEnabled
        skyfall.isChecked = s.skyfallEnabled
        row0.isChecked = s.row0Enabled
        hardLimitEnabled.isChecked = s.hardStepLimitEnabled
        performance.progress = (s.performanceLevel - 1).coerceIn(0, 4)
    }

    private fun addSeek(title: String, seek: SeekBar, minValue: Int, maxValue: Int, value: Int) {
        val label = TextView(context).apply { textSize = 12f; setTextColor(Color.rgb(190, 235, 230)) }
        root.addView(label)
        seek.max = maxValue - minValue
        seek.progress = (value - minValue).coerceIn(0, seek.max)
        fun refresh() { label.text = "$title: ${seek.progress + minValue}" }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) { refresh() }
            override fun onStartTrackingTouch(bar: SeekBar?) {}
            override fun onStopTrackingTouch(bar: SeekBar?) {}
        })
        refresh()
        root.addView(seek, LinearLayout.LayoutParams(-1, dp(34)))
    }

    private fun section(text: String) {
        root.addView(TextView(context).apply {
            this.text = text
            textSize = 12f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(Color.rgb(105, 255, 180))
            setPadding(0, dp(12), 0, dp(4))
        })
    }

    private fun input(label: String, view: EditText, value: String) {
        root.addView(TextView(context).apply { text = label; textSize = 12f; setTextColor(Color.LTGRAY) })
        view.setText(value)
        view.hint = "Auto or 1,1"
        view.textSize = 12f
        view.setTextColor(Color.WHITE)
        view.setHintTextColor(Color.GRAY)
        view.inputType = android.text.InputType.TYPE_CLASS_TEXT
        view.background = fieldBackground()
        root.addView(view, LinearLayout.LayoutParams(-1, dp(42)))
    }

    private fun spinner(view: Spinner, items: List<String>) {
        view.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, items)
        root.addView(view, LinearLayout.LayoutParams(-1, dp(42)))
    }

    private fun checkbox(view: CheckBox, label: String) {
        view.text = label
        view.textSize = 12f
        view.setTextColor(Color.LTGRAY)
        root.addView(view, LinearLayout.LayoutParams(-1, dp(36)))
    }

    private fun parseCoord(value: String): Pair<Int, Int>? {
        val clean = value.trim()
        if (clean.equals("auto", true)) return null
        val p = clean.split(',', ' ', ';').filter { it.isNotBlank() }
        val r = p.getOrNull(0)?.toIntOrNull()?.minus(1) ?: return null
        val c = p.getOrNull(1)?.toIntOrNull()?.minus(1) ?: return null
        return if (r in 0 until Board.ROWS && c in 0 until Board.COLS) r to c else null
    }

    private fun panelBackground() = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(Color.argb(246, 8, 12, 22))
        setStroke(dp(1), Color.rgb(72, 255, 190))
    }

    private fun fieldBackground() = GradientDrawable().apply {
        cornerRadius = dp(8).toFloat()
        setColor(Color.argb(210, 14, 20, 34))
        setStroke(dp(1), Color.rgb(40, 115, 105))
    }

    private fun button(text: String, action: () -> Unit) = Button(context).apply {
        this.text = text
        textSize = 11f
        setTextColor(Color.rgb(210, 255, 245))
        background = fieldBackground()
        setOnClickListener { action() }
        minHeight = 0
        minimumHeight = 0
    }
}

private class MainSettingsView(
    context: android.content.Context,
    private val controller: AppController,
    private val onSave: () -> Unit,
    private val onCancel: () -> Unit
) : ScrollView(context) {
    private val dp: (Int) -> Int = { (it * resources.displayMetrics.density).toInt() }
    private val root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val initCombo = SeekBar(context)
    private val targetStep = SeekBar(context)
    private val targetComboEnabled = CheckBox(context)
    private val targetStepEnabled = CheckBox(context)
    private val startInput = EditText(context)
    private val endInput = EditText(context)
    private val startRowSpinner = Spinner(context)
    private val startColSpinner = Spinner(context)
    private val endRowSpinner = Spinner(context)
    private val endColSpinner = Spinner(context)
    private var chosenStart: Coord? = null
    private var chosenEnd: Coord? = null
    private lateinit var startPositionButton: Button
    private lateinit var endPositionButton: Button
    private lateinit var initComboValue: TextView
    private lateinit var targetStepValue: TextView
    private var positionPickerHost: LinearLayout? = null
    private var openPositionPickerForStart: Boolean? = null
    private val skyfall = CheckBox(context)
    private val row0 = CheckBox(context)
    private val diagonal = CheckBox(context)
    private val humanPlanner = CheckBox(context)
    private val reversePlanner = CheckBox(context)
    private val ruleMinSpinners = mutableListOf<Spinner>()
    private val ruleModeSpinners = mutableListOf<Spinner>()
    private val reqOrbSpinner = Spinner(context)
    private val reqSizeSpinner = Spinner(context)
    private val reqCountSpinner = Spinner(context)
    private val reqList = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val specialSlots = mutableListOf<SpecialSlotViews>()
    private val basicSection = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val prioritySection = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val shieldSection = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private var activeSection: LinearLayout = basicSection
    private val sectionBodies = linkedMapOf<String, LinearLayout>()
    private val sectionHeaders = linkedMapOf<String, Button>()
    private var openedSectionId: String? = null
    private val shieldBodies = linkedMapOf<Int, LinearLayout>()
    private val shieldHeaders = linkedMapOf<Int, Button>()
    private var openedShieldSlot: Int? = 0

    private val specialTypeOptions = listOf(
        SpecialType.NONE,
        SpecialType.CLEAR_COUNT,
        SpecialType.EQUAL_FIRST,
        SpecialType.RECTANGLE,
        SpecialType.CROSS,
        SpecialType.L_SHAPE,
        SpecialType.T_SHAPE
    )

    private data class SpecialSlotViews(
        val type: Spinner,
        val orb: Spinner,
        val count: SeekBar,
        val clearCount: SeekBar,
        val rectRows: SeekBar,
        val rectCols: SeekBar,
        val equalChecks: List<CheckBox>,
        val orbContainer: View,
        val countContainer: View,
        val clearContainer: View,
        val rectContainer: View,
        val equalContainer: View
    )

    init {
        isFillViewport = false
        background = panelBackground()
        root.setPadding(dp(14), dp(12), dp(14), dp(14))
        addView(root, LayoutParams(-1, -2))

        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(context).apply {
            text = "AUTO COMBO / SET"
            textSize = 18f
            setTextColor(Color.rgb(145, 255, 226))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER_VERTICAL
        }, LinearLayout.LayoutParams(0, dp(42), 1f))
        header.addView(button("取消") { onCancel() }, LinearLayout.LayoutParams(dp(58), dp(42)))
        header.addView(button("儲存") { save() }, LinearLayout.LayoutParams(dp(58), dp(42)))
        root.addView(header)

        addAccordion("basic", "基本設定", basicSection, true)
        activeSection = basicSection
        initComboValue = addOptionalTarget("目標首消 Combo", targetComboEnabled, initCombo, 0, 30, controller.settings.initTargetCombo)
        targetStepValue = addOptionalTarget("限制 Step", targetStepEnabled, targetStep, 1, AndroidSolverTuning.SEARCH_STEP_GUARD, controller.settings.targetStep)
        addPositionSelectors()
        addCheckboxTo(activeSection, skyfall, "疊消")
        addCheckboxTo(activeSection, row0, "使用 row0")
        addCheckboxTo(activeSection, diagonal, "斜轉")
        row0.setOnCheckedChangeListener { _, checked ->
            if (!checked && (chosenStart?.row == 0 || chosenEnd?.row == 0)) {
                if (chosenStart?.row == 0) chosenStart = null
                if (chosenEnd?.row == 0) chosenEnd = null
                updatePositionButtons()
            }
        }

        addAccordion("priority", "優先消除設定", prioritySection, false)
        activeSection = prioritySection
        Orb.values().forEach { orb ->
            val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
            row.addView(ImageView(context).apply {
                setImageResource(orbDrawable(orb))
                contentDescription = orb.label
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }, LinearLayout.LayoutParams(dp(30), dp(38)))
            val minSpin = Spinner(context)
            val modeSpin = Spinner(context)
            val rule = controller.rules.orbRules.getOrNull(orb.ordinal) ?: OrbRule()
            spinner(minSpin, listOf("1消", "2消", "3消", "4消", "5消"))
            minSpin.setSelection((rule.minimum - 1).coerceIn(0, 4))
            spinner(modeSpin, listOf("直橫消", "相連消"))
            modeSpin.setSelection(if (rule.mode == ClearMode.CONNECTED) 1 else 0)
            ruleMinSpinners += minSpin
            ruleModeSpinners += modeSpin
            row.addView(minSpin, LinearLayout.LayoutParams(dp(70), dp(42)).apply { rightMargin = dp(3) })
            row.addView(modeSpin, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(3) })
            activeSection.addView(row, LinearLayout.LayoutParams(-1, dp(46)).apply { bottomMargin = dp(6) })
        }
        addRequirementEditor()
        activeSection.addView(reqList)
        renderRequirements()

        addAccordion("shield", "解盾設定", shieldSection, false)
        activeSection = shieldSection
        for (slot in 0 until 3) addSpecialSlot(slot)
        openShieldSlot(0)

        openSection("basic")
        loadValues()
        boostOverlayText(this)
    }

    private fun addAccordion(id: String, label: String, body: LinearLayout, initiallyOpen: Boolean) {
        val header = Button(context).apply {
            textSize = 15f
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setPadding(dp(10), 0, dp(10), 0)
            setTextColor(Color.rgb(170, 255, 225))
            background = fieldBackground()
            isAllCaps = false
            setOnClickListener { openSection(id) }
        }
        sectionHeaders[id] = header
        sectionBodies[id] = body
        root.addView(header, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(8) })
        root.addView(body, LinearLayout.LayoutParams(-1, -2))
        body.visibility = if (initiallyOpen) VISIBLE else GONE
        header.text = if (initiallyOpen) "▾ $label" else "▸ $label"
    }

    private fun openSection(id: String) {
        val shouldOpen = openedSectionId != id || sectionBodies[id]?.visibility != VISIBLE
        openedSectionId = if (shouldOpen) id else null
        sectionBodies.forEach { (key, body) ->
            val open = shouldOpen && key == id
            body.visibility = if (open) VISIBLE else GONE
            sectionHeaders[key]?.text = when (key) {
                "basic" -> if (open) "▾ 基本設定" else "▸ 基本設定"
                "priority" -> if (open) "▾ 優先消除設定" else "▸ 優先消除設定"
                else -> if (open) "▾ 解盾設定" else "▸ 解盾設定"
            }
        }
    }

    private fun addRequirementEditor() {
        val title = TextView(context).apply {
            text = "需求組合：可新增多個條件"
            textSize = 14f
            setTextColor(Color.rgb(190, 235, 230))
            setPadding(0, dp(6), 0, dp(4))
        }
        activeSection.addView(title)
        val orbPicker = requirementOrbPicker(reqOrbSpinner)
        activeSection.addView(orbPicker, LinearLayout.LayoutParams(-1, dp(38)).apply {
            bottomMargin = dp(4)
        })
        val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        spinner(reqSizeSpinner, listOf("消1", "消2", "消3", "消4", "消5"))
        reqSizeSpinner.setSelection(2)
        spinner(reqCountSpinner, (1..8).map { "${it}組" })
        row.addView(reqSizeSpinner, LinearLayout.LayoutParams(0, dp(46), 1f).apply { rightMargin = dp(4) })
        row.addView(reqCountSpinner, LinearLayout.LayoutParams(0, dp(46), 1f).apply { rightMargin = dp(4) })
        row.addView(button("新增") {
            val orb = Orb.values()[reqOrbSpinner.selectedItemPosition.coerceIn(0, Orb.values().lastIndex)]
            val size = reqSizeSpinner.selectedItemPosition + 1
            val count = reqCountSpinner.selectedItemPosition + 1
            val existing = controller.rules.requirements.indexOfFirst { it.orb == orb && it.size == size }
            if (existing >= 0) {
                val old = controller.rules.requirements[existing]
                controller.rules.requirements[existing] = old.copy(count = old.count + count, match = RequirementMatch.EXACT)
            } else {
                controller.rules.requirements += RuleRequirement(orb = orb, size = size, count = count, match = RequirementMatch.EXACT)
            }
            renderRequirements()
        }, LinearLayout.LayoutParams(dp(58), dp(42)))
        activeSection.addView(row)
    }

    private fun renderRequirements() {
        reqList.removeAllViews()
        if (controller.rules.requirements.isEmpty()) {
            reqList.addView(TextView(context).apply {
                text = "尚未設定需求。"
                textSize = 14f
                setTextColor(Color.rgb(120, 150, 150))
            }, LinearLayout.LayoutParams(-1, dp(40)))
            return
        }
        controller.rules.requirements.forEachIndexed { index, req ->
            val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
            row.addView(TextView(context).apply {
                text = "#${index + 1}"
                textSize = 15f
                setTextColor(Color.rgb(215, 255, 245))
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
                setSingleLine(true)
            }, LinearLayout.LayoutParams(dp(34), dp(42)))
            row.addView(orbIcon(req.orb, 24), LinearLayout.LayoutParams(dp(32), dp(42)))
            row.addView(TextView(context).apply {
                text = "消${req.size} x ${req.count}"
                textSize = 15f
                setTextColor(Color.rgb(215, 255, 245))
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
                setSingleLine(true)
                setPadding(dp(4), 0, 0, 0)
            }, LinearLayout.LayoutParams(0, dp(44), 1f))
            row.addView(button("刪除") {
                if (index in controller.rules.requirements.indices) {
                    controller.rules.requirements.removeAt(index)
                    renderRequirements()
                }
            }, LinearLayout.LayoutParams(dp(64), dp(40)))
            reqList.addView(row)
        }
    }

    private fun addSpecialSlot(slotIndex: Int) {
        val box = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), dp(10), dp(10), dp(10))
            background = fieldBackground()
        }
        val type = Spinner(context)
        val orb = Spinner(context)
        spinner(type, listOf("無", "首消n粒盾", "連擊相等盾", "靈罩", "十字盾", "L字盾", "T字盾"))
        box.addView(type, LinearLayout.LayoutParams(-1, dp(46)))
        val orbContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(specialOrbPicker(orb), LinearLayout.LayoutParams(-1, dp(40)))
            // Keep a real Spinner as the persisted single source of truth;
            // the visible controls above are compact icon buttons.
            orb.visibility = GONE
            addView(orb, LinearLayout.LayoutParams(1, 1))
        }
        box.addView(orbContainer, LinearLayout.LayoutParams(-1, -2))
        val count = SeekBar(context)
        val clear = SeekBar(context)
        val rectRows = SeekBar(context)
        val rectCols = SeekBar(context)
        val sp = controller.specials.getOrNull(slotIndex) ?: SpecialPriority()
        val countContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        addSeekTo(countContainer, "形狀組數", count, 1, 3, sp.count) { updateShieldHeaders() }
        box.addView(countContainer)
        val clearContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        addSeekTo(clearContainer, "總粒數", clear, 3, 30, sp.clearCount) { updateShieldHeaders() }
        box.addView(clearContainer)
        val rectContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        addSeekTo(rectContainer, "靈罩列數", rectRows, 3, 5, sp.rectRows) { updateShieldHeaders() }
        addSeekTo(rectContainer, "靈罩行數", rectCols, 3, 5, sp.rectCols) { updateShieldHeaders() }
        box.addView(rectContainer)
        val equalRow = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val checks = Orb.values().map { each ->
            CheckBox(context).apply {
                text = ""
                contentDescription = each.label
                setOrbCompound(this, each, 22)
                compoundDrawablePadding = dp(1)
                buttonTintList = ColorStateList.valueOf(Color.rgb(92, 255, 184))
                isChecked = each in sp.equalOrbs
            }.also { equalRow.addView(it, LinearLayout.LayoutParams(0, dp(40), 1f)) }
        }
        val equalContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(equalRow, LinearLayout.LayoutParams(-1, dp(46)))
        }
        box.addView(equalContainer)
        fun refreshTypeVisibility() {
            val selected = specialTypeOptions.getOrElse(type.selectedItemPosition) { SpecialType.NONE }
            val shape = selected == SpecialType.CROSS || selected == SpecialType.L_SHAPE || selected == SpecialType.T_SHAPE
            val rectangle = selected == SpecialType.RECTANGLE
            val clearCount = selected == SpecialType.CLEAR_COUNT
            val equalFirst = selected == SpecialType.EQUAL_FIRST
            orbContainer.visibility = if (shape || rectangle) VISIBLE else GONE
            countContainer.visibility = if (shape || rectangle) VISIBLE else GONE
            rectContainer.visibility = if (rectangle) VISIBLE else GONE
            clearContainer.visibility = if (clearCount) VISIBLE else GONE
            equalContainer.visibility = if (equalFirst) VISIBLE else GONE
            updateShieldHeaders()
        }
        type.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) { refreshTypeVisibility() }
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) { refreshTypeVisibility() }
        }
        val wrapper = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val header = button("▸ #${slotIndex + 1} 解盾條件") { toggleShieldSlot(slotIndex) }
        shieldHeaders[slotIndex] = header
        shieldBodies[slotIndex] = box
        wrapper.addView(header, LinearLayout.LayoutParams(-1, dp(46)).apply { bottomMargin = dp(5) })
        wrapper.addView(box, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(10) })
        activeSection.addView(wrapper)
        specialSlots += SpecialSlotViews(type, orb, count, clear, rectRows, rectCols, checks, orbContainer, countContainer, clearContainer, rectContainer, equalContainer)
        checks.forEach { it.setOnCheckedChangeListener { _, _ -> updateShieldHeaders() } }
        updateShieldHeaders()
        refreshTypeVisibility()
    }

    private fun shieldSummary(index: Int): String {
        val views = specialSlots.getOrNull(index) ?: return "無"
        val type = specialTypeOptions.getOrElse(views.type.selectedItemPosition) { SpecialType.NONE }
        val orbText = if (views.orb.selectedItemPosition == 0) {
            "任意"
        } else {
            Orb.values().getOrNull(views.orb.selectedItemPosition - 1)?.let { orbShortName(it) } ?: "任意"
        }
        return when (type) {
            SpecialType.NONE -> "無"
            SpecialType.CLEAR_COUNT -> "首消n粒盾 : ${views.clearCount.progress + 3}粒"
            SpecialType.EQUAL_FIRST -> {
                val selected = views.equalChecks.mapIndexedNotNull { orbIndex, check ->
                    if (check.isChecked) Orb.values().getOrNull(orbIndex)?.let { orbShortName(it) } else null
                }
                "連擊相等盾 : ${if (selected.isEmpty()) "未選" else selected.joinToString("/")}"
            }
            SpecialType.RECTANGLE -> "靈罩 : $orbText/${views.rectRows.progress + 3}x${views.rectCols.progress + 3}/1組"
            SpecialType.CROSS -> "十字盾 : $orbText/${views.count.progress + 1}組"
            SpecialType.L_SHAPE -> "L字盾 : $orbText/${views.count.progress + 1}組"
            SpecialType.T_SHAPE -> "T字盾 : $orbText/${views.count.progress + 1}組"
            SpecialType.COMBO -> "無"
        }
    }

    private fun orbShortName(orb: Orb): String = when (orb) {
        Orb.WATER -> "水"
        Orb.FIRE -> "火"
        Orb.EARTH -> "木"
        Orb.LIGHT -> "光"
        Orb.DARK -> "暗"
        Orb.HEART -> "心"
    }

    private fun updateShieldHeaders() {
        for (index in 0 until 3) {
            val open = openedShieldSlot == index && shieldBodies[index]?.visibility == VISIBLE
            val views = specialSlots.getOrNull(index)
            val prefix = "${if (open) "▾" else "▸"} #${index + 1} : "
            val header = android.text.SpannableStringBuilder(prefix)
            if (views == null) {
                header.append("無")
            } else {
                val type = specialTypeOptions.getOrElse(views.type.selectedItemPosition) { SpecialType.NONE }
                when (type) {
                    SpecialType.NONE -> header.append("無")
                    SpecialType.CLEAR_COUNT -> header.append("首消n粒盾 : ${views.clearCount.progress + 3}粒")
                    SpecialType.EQUAL_FIRST -> {
                        header.append("連擊相等盾 : ")
                        val selected = views.equalChecks.mapIndexedNotNull { orbIndex, check ->
                            if (check.isChecked) Orb.values().getOrNull(orbIndex) else null
                        }
                        if (selected.isEmpty()) header.append("未選") else selected.forEachIndexed { orbIndex, orb ->
                            if (orbIndex > 0) header.append("/")
                            appendHeaderOrb(header, orb)
                        }
                    }
                    SpecialType.RECTANGLE -> {
                        header.append("靈罩 : ")
                        appendHeaderSelectedOrb(header, views)
                        header.append("/${views.rectRows.progress + 3}x${views.rectCols.progress + 3}/1組")
                    }
                    SpecialType.CROSS, SpecialType.L_SHAPE, SpecialType.T_SHAPE -> {
                        header.append(
                            when (type) {
                                SpecialType.CROSS -> "十字盾 : "
                                SpecialType.L_SHAPE -> "L字盾 : "
                                else -> "T字盾 : "
                            }
                        )
                        appendHeaderSelectedOrb(header, views)
                        header.append("/${views.count.progress + 1}組")
                    }
                    SpecialType.COMBO -> header.append("無")
                }
            }
            shieldHeaders[index]?.text = header
        }
    }

    private fun appendHeaderSelectedOrb(builder: android.text.SpannableStringBuilder, views: SpecialSlotViews) {
        if (views.orb.selectedItemPosition == 0) builder.append("任意")
        else Orb.values().getOrNull(views.orb.selectedItemPosition - 1)?.let { appendHeaderOrb(builder, it) } ?: builder.append("任意")
    }

    private fun appendHeaderOrb(builder: android.text.SpannableStringBuilder, orb: Orb) {
        val drawable = resources.getDrawable(orbDrawable(orb), context.theme)
        drawable.setBounds(0, 0, dp(22), dp(22))
        val start = builder.length
        builder.append(" ")
        builder.setSpan(
            android.text.style.ImageSpan(drawable),
            start,
            start + 1,
            android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
    }

    private fun toggleShieldSlot(index: Int) {
        val shouldOpen = openedShieldSlot != index || shieldBodies[index]?.visibility != VISIBLE
        openedShieldSlot = if (shouldOpen) index else null
        shieldBodies.forEach { (slot, body) ->
            val open = shouldOpen && slot == index
            body.visibility = if (open) VISIBLE else GONE
        }
        updateShieldHeaders()
    }

    private fun openShieldSlot(index: Int) {
        openedShieldSlot = index
        shieldBodies.forEach { (slot, body) ->
            val open = slot == index
            body.visibility = if (open) VISIBLE else GONE
        }
        updateShieldHeaders()
    }

    private fun save() {
        val s = controller.settings
        s.priority = SolverPriority.COMBO
        s.targetComboEnabled = targetComboEnabled.isChecked
        s.initTargetCombo = initCombo.progress
        s.targetStepEnabled = targetStepEnabled.isChecked
        s.targetStep = (targetStep.progress + 1).coerceIn(1, AndroidSolverTuning.SEARCH_STEP_GUARD)
        s.replaySpeed = AndroidSolverTuning.REPLAY_SPEED
        s.hardStepLimitEnabled = targetStepEnabled.isChecked
        s.hardStepLimit = if (targetStepEnabled.isChecked) s.targetStep else AndroidSolverTuning.SEARCH_STEP_GUARD
        s.maxSteps = if (targetStepEnabled.isChecked) s.targetStep else AndroidSolverTuning.SEARCH_STEP_GUARD
        chosenStart?.let { s.startRow = it.row; s.startCol = it.col } ?: run { s.startRow = -1; s.startCol = -1 }
        chosenEnd?.let { s.endRow = it.row; s.endCol = it.col } ?: run { s.endRow = -1; s.endCol = -1 }
        s.diagonalEnabled = diagonal.isChecked
        s.skyfallEnabled = skyfall.isChecked
        s.row0Enabled = row0.isChecked
        s.applyPerformance(3)

        for (i in 0 until Orb.values().size) {
            controller.rules.orbRules[i].minimum = ruleMinSpinners[i].selectedItemPosition + 1
            controller.rules.orbRules[i].mode = if (ruleModeSpinners[i].selectedItemPosition == 1) ClearMode.CONNECTED else ClearMode.LINE
        }

        specialSlots.forEachIndexed { index, views ->
            val sp = controller.specials[index]
            sp.type = specialTypeOptions.getOrElse(views.type.selectedItemPosition) { SpecialType.NONE }
            sp.orb = Orb.fromId(views.orb.selectedItemPosition - 1)
            sp.count = views.count.progress + 1
            sp.clearCount = views.clearCount.progress + 3
            sp.rectRows = views.rectRows.progress + 3
            sp.rectCols = views.rectCols.progress + 3
            sp.equalOrbs.clear()
            views.equalChecks.forEachIndexed { orbIndex, box -> if (box.isChecked) Orb.fromId(orbIndex)?.let { sp.equalOrbs += it } }
        }
        onSave()
    }

    private fun loadValues() {
        val s = controller.settings
        initCombo.progress = s.initTargetCombo.coerceIn(0, 30)
        targetComboEnabled.isChecked = s.targetComboEnabled
        targetStepEnabled.isChecked = s.targetStepEnabled
        targetStep.progress = (s.targetStep - 1).coerceIn(0, AndroidSolverTuning.SEARCH_STEP_GUARD - 1)
        skyfall.isChecked = s.skyfallEnabled
        row0.isChecked = s.row0Enabled
        diagonal.isChecked = s.diagonalEnabled
        chosenStart = if (s.startRow in 0 until Board.ROWS && s.startCol in 0 until Board.COLS) Coord(s.startRow, s.startCol) else null
        chosenEnd = if (s.endRow in 0 until Board.ROWS && s.endCol in 0 until Board.COLS) Coord(s.endRow, s.endCol) else null
        if (!row0.isChecked) {
            if (chosenStart?.row == 0) chosenStart = null
            if (chosenEnd?.row == 0) chosenEnd = null
        }
        updatePositionButtons()
        specialSlots.forEachIndexed { index, views ->
            val sp = controller.specials.getOrNull(index) ?: SpecialPriority()
            views.type.setSelection(specialTypeOptions.indexOf(sp.type).coerceAtLeast(0))
            views.orb.setSelection(((sp.orb?.ordinal ?: -1) + 1).coerceIn(0, 6))
        }
    }

    /** Optional target controls mirror App.jsx: the check box is the switch,
     * and an unchecked target never participates in the solver payload. */
    private fun addOptionalTarget(
        title: String,
        enabled: CheckBox,
        seek: SeekBar,
        minValue: Int,
        maxValue: Int,
        value: Int
    ): TextView {
        val valueLabel = TextView(context).apply {
            textSize = 15f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(4), 0, 0, 0)
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setSingleLine(true)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        enabled.text = ""
        enabled.contentDescription = title
        enabled.buttonTintList = ColorStateList.valueOf(Color.rgb(92, 255, 184))
        val line = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        line.addView(enabled, LinearLayout.LayoutParams(dp(42), dp(52)))
        // Use the remaining width so the title and current value stay on the
        // same visual line on narrow phones.
        line.addView(valueLabel, LinearLayout.LayoutParams(0, dp(52), 1f))
        activeSection.addView(line, LinearLayout.LayoutParams(-1, dp(52)).apply { bottomMargin = dp(2) })
        seek.max = maxValue - minValue
        seek.progress = (value - minValue).coerceIn(0, seek.max)
        fun refresh() {
            val active = enabled.isChecked
            valueLabel.text = "$title: ${if (active) seek.progress + minValue else "未啟用"}"
            val color = if (active) Color.rgb(215, 255, 245) else Color.rgb(120, 135, 145)
            valueLabel.setTextColor(color)
            seek.isEnabled = active
            seek.alpha = if (active) 1f else 0.32f
            seek.progressTintList = ColorStateList.valueOf(if (active) Color.rgb(75, 255, 205) else Color.rgb(100, 110, 120))
            seek.thumbTintList = ColorStateList.valueOf(if (active) Color.rgb(170, 255, 225) else Color.rgb(125, 135, 145))
        }
        enabled.setOnCheckedChangeListener { _, _ -> refresh() }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) { refresh() }
            override fun onStartTrackingTouch(bar: SeekBar?) {}
            override fun onStopTrackingTouch(bar: SeekBar?) {}
        })
        activeSection.addView(seek, LinearLayout.LayoutParams(-1, dp(40)).apply { bottomMargin = dp(6) })
        refresh()
        return valueLabel
    }

    private fun addCheckboxTo(parent: LinearLayout, view: CheckBox, label: String) {
        view.text = label
        view.textSize = 14f
        view.setTextColor(Color.rgb(225, 255, 248))
        view.buttonTintList = ColorStateList.valueOf(Color.rgb(92, 255, 184))
        val params = if (parent.orientation == LinearLayout.VERTICAL) {
            LinearLayout.LayoutParams(-1, dp(48))
        } else {
            LinearLayout.LayoutParams(0, dp(48), 1f)
        }
        parent.addView(view, params)
    }

    private fun addPositionSelectors() {
        activeSection.addView(TextView(context).apply {
            text = "起始/收尾位置"
            textSize = 15f
            setTextColor(Color.rgb(215, 255, 245))
            setPadding(0, dp(6), 0, dp(4))
        })
        val line = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        startPositionButton = button("不限") { showPositionPicker(true) }
        endPositionButton = button("不限") { showPositionPicker(false) }
        line.addView(startPositionButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { rightMargin = dp(6) })
        line.addView(TextView(context).apply {
            text = "/"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(130, 230, 210))
        }, LinearLayout.LayoutParams(dp(22), dp(46)))
        line.addView(endPositionButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { leftMargin = dp(6) })
        activeSection.addView(line)
        positionPickerHost = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(6), dp(6), dp(6), dp(6))
            background = fieldBackground()
            visibility = GONE
        }
        activeSection.addView(positionPickerHost, LinearLayout.LayoutParams(-1, -2).apply {
            topMargin = dp(6)
            bottomMargin = dp(6)
        })
    }

    private fun updatePositionButtons() {
        if (!::startPositionButton.isInitialized || !::endPositionButton.isInitialized) return
        startPositionButton.text = chosenStart?.let { "(${it.row},${it.col})" } ?: "不限"
        endPositionButton.text = chosenEnd?.let { "(${it.row},${it.col})" } ?: "不限"
    }

    private fun showPositionPicker(selectStart: Boolean) {
        val host = positionPickerHost ?: return
        if (host.visibility == VISIBLE && openPositionPickerForStart == selectStart) {
            host.visibility = GONE
            openPositionPickerForStart = null
            return
        }
        openPositionPickerForStart = selectStart
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        val title = if (selectStart) "選擇起始位置" else "選擇收尾位置"
        container.addView(TextView(context).apply {
            text = title
            textSize = 16f
            setTextColor(Color.rgb(160, 255, 225))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, dp(42)))
        val pickerError = TextView(context).apply {
            textSize = 13f
            setTextColor(Color.rgb(255, 130, 145))
            visibility = GONE
            setPadding(dp(4), 0, dp(4), dp(4))
        }
        container.addView(pickerError, LinearLayout.LayoutParams(-1, dp(28)))
        val controls = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        controls.addView(button("不限") {
            if (selectStart) chosenStart = null else chosenEnd = null
            updatePositionButtons()
            host.visibility = GONE
            openPositionPickerForStart = null
        }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(6) })
        controls.addView(button("收起") {
            host.visibility = GONE
            openPositionPickerForStart = null
        }, LinearLayout.LayoutParams(0, dp(42), 1f))
        container.addView(controls, LinearLayout.LayoutParams(-1, dp(42)).apply { bottomMargin = dp(8) })
        val grid = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        val cells = mutableMapOf<Coord, Button>()
        var marker: Coord? = if (selectStart) chosenStart else chosenEnd
        var armed: Coord? = null
        fun redraw() {
            cells.forEach { (coord, cell) ->
                cell.text = if (coord == marker) "●" else ""
                cell.setTextColor(Color.rgb(120, 255, 180))
                cell.textSize = 18f
                cell.background = if (coord == marker) activeCellBackground() else fieldBackground()
            }
        }
        for (rowIndex in 0 until Board.ROWS) {
            if (rowIndex == 1) grid.addView(Space(context), LinearLayout.LayoutParams(1, dp(12)))
            val row = LinearLayout(context).apply { gravity = Gravity.CENTER }
            for (colIndex in 0 until Board.COLS) {
                val coord = Coord(rowIndex, colIndex)
                val cell = Button(context).apply {
                    text = ""
                    minHeight = 0
                    minimumHeight = 0
                    setPadding(0, 0, 0, 0)
                    setOnClickListener {
                        if (coord.row == 0 && !row0.isChecked) {
                            pickerError.text = "請先勾選使用 row0"
                            pickerError.visibility = VISIBLE
                            return@setOnClickListener
                        }
                        pickerError.visibility = GONE
                        if (armed == coord) {
                            if (selectStart) {
                                chosenStart = coord
                                if (coord.row == 0 && chosenEnd?.row == 0) chosenEnd = null
                            } else {
                                chosenEnd = coord
                                if (coord.row == 0 && chosenStart?.row == 0) chosenStart = null
                            }
                            updatePositionButtons()
                            host.visibility = GONE
                            openPositionPickerForStart = null
                        } else {
                            armed = coord
                            marker = coord
                            redraw()
                        }
                    }
                }
                cells[coord] = cell
                row.addView(cell, LinearLayout.LayoutParams(dp(42), dp(42)).apply {
                    leftMargin = dp(2); rightMargin = dp(2); topMargin = dp(2); bottomMargin = dp(2)
                })
            }
            grid.addView(row, LinearLayout.LayoutParams(-1, dp(46)))
        }
        container.addView(grid, LinearLayout.LayoutParams(-1, -2))
        host.removeAllViews()
        host.addView(container, LinearLayout.LayoutParams(-1, -2))
        host.visibility = VISIBLE
        redraw()
    }

    private fun activeCellBackground() = GradientDrawable().apply {
        cornerRadius = dp(7).toFloat()
        setColor(Color.argb(160, 28, 105, 75))
        setStroke(dp(2), Color.rgb(92, 255, 184))
    }

    private fun orbDrawable(orb: Orb): Int = when (orb) {
        Orb.WATER -> R.drawable.orb_water
        Orb.FIRE -> R.drawable.orb_fire
        Orb.EARTH -> R.drawable.orb_earth
        Orb.LIGHT -> R.drawable.orb_light
        Orb.DARK -> R.drawable.orb_dark
        Orb.HEART -> R.drawable.orb_heart
    }

    private fun setOrbCompound(view: TextView, orb: Orb, sizeDp: Int) {
        val drawable = resources.getDrawable(orbDrawable(orb), context.theme)
        drawable.setBounds(0, 0, dp(sizeDp), dp(sizeDp))
        view.setCompoundDrawables(drawable, null, null, null)
    }

    private fun orbIcon(orb: Orb, sizeDp: Int): ImageView = ImageView(context).apply {
        setImageResource(orbDrawable(orb))
        contentDescription = orb.label
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        setPadding(dp(3), dp(3), dp(3), dp(3))
        layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp))
    }

    /** Compact six-orb chooser used by the priority requirement editor. */
    private fun requirementOrbPicker(view: Spinner): LinearLayout {
        orbSpinner(view)
        view.visibility = GONE
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        val choices = mutableListOf<View>()
        fun refresh() {
            choices.forEachIndexed { index, choice ->
                choice.background = if (view.selectedItemPosition == index) {
                    activeCellBackground()
                } else {
                    fieldBackground()
                }
            }
        }
        Orb.values().forEachIndexed { index, orb ->
            val choice = android.widget.ImageButton(context).apply {
                setImageResource(orbDrawable(orb))
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(4), dp(4), dp(4), dp(4))
                setMinimumWidth(0)
                setMinimumHeight(0)
                contentDescription = orb.label
                background = fieldBackground()
                setOnClickListener {
                    view.setSelection(index)
                    refresh()
                }
            }
            choices += choice
            row.addView(choice, LinearLayout.LayoutParams(0, dp(34), 1f).apply {
                leftMargin = dp(1)
                rightMargin = dp(1)
            })
        }
        view.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) { refresh() }
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, selected: View?, position: Int, id: Long) {
                refresh()
            }
        }
        row.post { refresh() }
        return row
    }

    private fun orbSpinner(view: Spinner) {
        val orbs = Orb.values().toList()
        val adapter = object : ArrayAdapter<Orb>(context, android.R.layout.simple_spinner_item, orbs) {
            private fun icon(): ImageView = ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(5), dp(5), dp(5), dp(5))
            }
            override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                return icon().apply { setImageResource(orbDrawable(orbs[position])); contentDescription = orbs[position].label }
            }
            override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                return icon().apply {
                    setImageResource(orbDrawable(orbs[position]))
                    contentDescription = orbs[position].label
                    setBackgroundColor(Color.rgb(16, 26, 42))
                }
            }
        }
        view.adapter = adapter
        view.background = fieldBackground()
    }

    private fun specialOrbPicker(view: Spinner): LinearLayout {
        val labels = listOf("任意") + Orb.values().map { it.label }
        val adapter = object : ArrayAdapter<String>(context, android.R.layout.simple_spinner_item, labels) {
            private fun style(textView: TextView, position: Int, dropdown: Boolean) {
                textView.setTextColor(Color.rgb(225, 255, 248))
                textView.textSize = 14f
                textView.setPadding(dp(8), 0, dp(8), 0)
                textView.setBackgroundColor(if (dropdown) Color.rgb(16, 26, 42) else Color.TRANSPARENT)
                if (position == 0) {
                    textView.text = "任意"
                    textView.setCompoundDrawablesWithIntrinsicBounds(0, 0, 0, 0)
                } else {
                    textView.text = ""
                    textView.setCompoundDrawablesWithIntrinsicBounds(orbDrawable(Orb.values()[position - 1]), 0, 0, 0)
                    textView.compoundDrawablePadding = dp(4)
                }
            }
            override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                return (super.getView(position, convertView, parent) as TextView).also { style(it, position, false) }
            }
            override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                return (super.getDropDownView(position, convertView, parent) as TextView).also { style(it, position, true) }
            }
        }
        view.adapter = adapter
        view.visibility = GONE
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val choices = mutableListOf<View>()
        fun refresh() {
            choices.forEachIndexed { index, choice ->
                choice.background = if (view.selectedItemPosition == index) activeCellBackground() else fieldBackground()
            }
        }
        val any = button("任意") { view.setSelection(0); refresh(); updateShieldHeaders() }
        any.textSize = 11f
        any.contentDescription = "任意符石"
        any.gravity = Gravity.CENTER
        any.setPadding(0, 0, 0, 0)
        any.minWidth = 0
        any.minimumWidth = 0
        any.minHeight = 0
        any.minimumHeight = 0
        choices += any
        row.addView(any, LinearLayout.LayoutParams(dp(48), dp(36)).apply { rightMargin = dp(3) })
        Orb.values().forEachIndexed { index, orb ->
            val choice = android.widget.ImageButton(context).apply {
                setImageResource(orbDrawable(orb))
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(4), dp(4), dp(4), dp(4))
                contentDescription = orb.label
                setMinimumWidth(0)
                setMinimumHeight(0)
                background = fieldBackground()
                setOnClickListener {
                    view.setSelection(index + 1)
                    refresh()
                    updateShieldHeaders()
                }
            }
            choices += choice
            row.addView(choice, LinearLayout.LayoutParams(0, dp(36), 1f).apply {
                leftMargin = dp(1); rightMargin = dp(1)
            })
        }
        view.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) { refresh() }
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, selected: View?, position: Int, id: Long) {
                refresh()
                updateShieldHeaders()
            }
        }
        row.post { refresh() }
        return row
    }

    private fun parseCoord(value: String): Pair<Int, Int>? {
        val clean = value.trim()
        if (clean.equals("auto", true)) return null
        val parts = clean.split(',', ' ', ';', '，').filter { it.isNotBlank() }
        val r = parts.getOrNull(0)?.toIntOrNull()?.minus(1) ?: return null
        val c = parts.getOrNull(1)?.toIntOrNull()?.minus(1) ?: return null
        return if (r in 0 until Board.ROWS && c in 0 until Board.COLS) r to c else null
    }

    private fun coordinatePicker(label: String, row: Spinner, col: Spinner, rowValue: Int, colValue: Int) {
        activeSection.addView(TextView(context).apply {
            text = "$label（選單選擇；不限表示自動）"
            textSize = 14f
            setTextColor(Color.rgb(215, 245, 240))
            setPadding(0, dp(3), 0, dp(2))
        })
        spinner(row, listOf("不限") + (0 until Board.ROWS).map { "第 ${it + 1} 行" })
        spinner(col, listOf("不限") + (0 until Board.COLS).map { "第 ${it + 1} 列" })
        val line = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        line.addView(row, LinearLayout.LayoutParams(0, dp(46), 1f).apply { rightMargin = dp(6) })
        line.addView(col, LinearLayout.LayoutParams(0, dp(46), 1f))
        activeSection.addView(line)
        setCoordinate(row, col, rowValue, colValue)
    }

    private fun setCoordinate(row: Spinner, col: Spinner, rowValue: Int, colValue: Int) {
        row.setSelection(if (rowValue in 0 until Board.ROWS) rowValue + 1 else 0)
        col.setSelection(if (colValue in 0 until Board.COLS) colValue + 1 else 0)
    }

    private fun readCoordinate(row: Spinner, col: Spinner): Pair<Int, Int>? {
        val r = row.selectedItemPosition - 1
        val c = col.selectedItemPosition - 1
        return if (r in 0 until Board.ROWS && c in 0 until Board.COLS) r to c else null
    }

    private fun addSeek(title: String, seek: SeekBar, minValue: Int, maxValue: Int, value: Int) {
        // Target Step is 1-based; all other seek bars keep their own ranges.
        val effectiveMin = if (seek === targetStep) 1 else minValue
        addSeekTo(activeSection, title, seek, effectiveMin, maxValue, value)
    }

    private fun addSeekTo(
        parent: LinearLayout,
        title: String,
        seek: SeekBar,
        minValue: Int,
        maxValue: Int,
        value: Int,
        onChanged: (() -> Unit)? = null
    ) {
        val label = TextView(context).apply {
            textSize = 14f
            setTextColor(Color.rgb(190, 235, 230))
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setSingleLine(true)
        }
        seek.progressTintList = ColorStateList.valueOf(Color.rgb(75, 255, 205))
        seek.thumbTintList = ColorStateList.valueOf(Color.rgb(170, 255, 225))
        seek.max = maxValue - minValue
        seek.progress = (value - minValue).coerceIn(0, seek.max)
        fun refresh() { label.text = "$title: ${seek.progress + minValue}" }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) {
                refresh()
                onChanged?.invoke()
            }
            override fun onStartTrackingTouch(bar: SeekBar?) {}
            override fun onStopTrackingTouch(bar: SeekBar?) {}
        })
        refresh()
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        row.addView(label, LinearLayout.LayoutParams(dp(105), dp(42)))
        row.addView(seek, LinearLayout.LayoutParams(0, dp(42), 1f))
        parent.addView(row, LinearLayout.LayoutParams(-1, dp(44)).apply {
            bottomMargin = dp(2)
        })
    }

    private fun section(text: String) {
        activeSection.addView(TextView(context).apply {
            this.text = text
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(Color.rgb(105, 255, 180))
            setPadding(0, dp(12), 0, dp(4))
        })
    }

    private fun input(label: String, view: EditText, value: String) {
        activeSection.addView(TextView(context).apply { text = label; textSize = 14f; setTextColor(Color.rgb(215, 245, 240)) })
        view.setText(value)
        view.hint = "Auto or 1,1"
        view.textSize = 14f
        view.setTextColor(Color.WHITE)
        view.setHintTextColor(Color.rgb(150, 175, 180))
        view.inputType = android.text.InputType.TYPE_CLASS_TEXT
        view.background = fieldBackground()
        activeSection.addView(view, LinearLayout.LayoutParams(-1, dp(46)))
    }

    private fun spinner(view: Spinner, items: List<String>) {
        val adapter = object : ArrayAdapter<String>(context, android.R.layout.simple_spinner_item, items) {
            private fun style(textView: TextView, dropdown: Boolean) {
                textView.setTextColor(Color.rgb(225, 255, 248))
                textView.textSize = 14f
                textView.setPadding(dp(12), 0, dp(12), 0)
                textView.setBackgroundColor(if (dropdown) Color.rgb(16, 26, 42) else Color.TRANSPARENT)
            }

            override fun getView(position: Int, convertView: android.view.View?, parent: android.view.ViewGroup): View {
                return (super.getView(position, convertView, parent) as TextView).also { style(it, false) }
            }

            override fun getDropDownView(position: Int, convertView: android.view.View?, parent: android.view.ViewGroup): View {
                return (super.getDropDownView(position, convertView, parent) as TextView).also { style(it, true) }
            }
        }
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        view.adapter = adapter
        view.background = fieldBackground()
    }

    private fun checkbox(view: CheckBox, label: String) {
        view.text = label
        view.textSize = 14f
        view.setTextColor(Color.rgb(225, 255, 248))
        view.buttonTintList = ColorStateList.valueOf(Color.rgb(92, 255, 184))
        view.highlightColor = Color.rgb(60, 140, 125)
        activeSection.addView(view, LinearLayout.LayoutParams(-1, dp(44)))
    }

    private fun panelBackground() = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(Color.argb(246, 8, 12, 22))
        setStroke(dp(1), Color.rgb(72, 255, 190))
    }

    private fun fieldBackground() = GradientDrawable().apply {
        cornerRadius = dp(8).toFloat()
        setColor(Color.argb(210, 14, 20, 34))
        setStroke(dp(1), Color.rgb(40, 115, 105))
    }

    private fun button(text: String, action: () -> Unit) = Button(context).apply {
        this.text = text
        textSize = 13f
        setTextColor(Color.rgb(210, 255, 245))
        background = fieldBackground()
        setOnClickListener { action() }
        minHeight = 0
        minimumHeight = 0
    }
}

private class BoardGuideView(context: android.content.Context, private val onChanged: (SavedBoardRegion) -> Unit) : View(context) {
    private val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(125, 112, 255, 120); style = Paint.Style.STROKE; strokeWidth = 2f }
    private val thick = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(210, 112, 255, 120); style = Paint.Style.STROKE; strokeWidth = 7f; setShadowLayer(12f, 0f, 0f, Color.rgb(50, 255, 90)) }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(44, 85, 255, 145); style = Paint.Style.FILL }
    private val handle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(230, 180, 255, 210); style = Paint.Style.FILL }
    private var downRawX = 0f
    private var downRawY = 0f
    private var startX = 0
    private var startY = 0
    private var startSize = 0
    private enum class ResizeHandle { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT }
    private var resizeHandle: ResizeHandle? = null
    private val minSize = (260 * resources.displayMetrics.density).toInt()

    init { setLayerType(View.LAYER_TYPE_SOFTWARE, null) }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawRect(0f, 0f, w, h, fill)
        val region = ScreenBoardRegion(0, 0, width, height)
        val cellX = BoardGeometry.cellWidth(region)
        for (i in 0..6) {
            val x = i * cellX
            canvas.drawLine(x, 0f, x, h, if (i == 0 || i == 6) thick else grid)
        }
        for (row in 0 until Board.ROWS) {
            val top = BoardGeometry.rowTopOffset(region, row)
            val bottom = BoardGeometry.rowBottomOffset(region, row)
            // row1 top is the actual screen-board origin used by SCAN and by
            // the path overlay. Keep it bright so calibration is unambiguous.
            canvas.drawLine(0f, top, w, top, if (row == 0 || row == Board.PLAY_ROW_START) thick else grid)
            canvas.drawLine(0f, bottom, w, bottom, if (row == Board.ROWS - 1 || row == 0) thick else grid)
            if (row == 0) {
                canvas.drawRect(0f, bottom, w, BoardGeometry.rowTopOffset(region, 1), Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.argb(30, 255, 255, 255)
                    style = Paint.Style.FILL
                })
            }
        }
        canvas.drawCircle(22f, 22f, 14f, handle)
        canvas.drawCircle(w - 22f, 22f, 14f, handle)
        canvas.drawCircle(22f, h - 22f, 14f, handle)
        canvas.drawCircle(w - 22f, h - 22f, 14f, handle)
    }

    private fun hitHandle(x: Float, y: Float): ResizeHandle? {
        val edge = 84f
        return when {
            x <= edge && y <= edge -> ResizeHandle.TOP_LEFT
            x >= width - edge && y <= edge -> ResizeHandle.TOP_RIGHT
            x <= edge && y >= height - edge -> ResizeHandle.BOTTOM_LEFT
            x >= width - edge && y >= height - edge -> ResizeHandle.BOTTOM_RIGHT
            else -> null
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val lp = layoutParams as? WindowManager.LayoutParams ?: return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downRawX = event.rawX
                downRawY = event.rawY
                startX = lp.x
                startY = lp.y
                startSize = lp.width
                resizeHandle = hitHandle(event.x, event.y)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = (event.rawX - downRawX).toInt()
                val dy = (event.rawY - downRawY).toInt()
                val metrics = resources.displayMetrics
                val handle = resizeHandle
                if (handle != null) {
                    val ratio = BoardGeometry.DEFAULT_HEIGHT_RATIO
                    val delta = when (handle) {
                        ResizeHandle.TOP_LEFT -> max(-dx.toFloat(), -dy.toFloat() / ratio)
                        ResizeHandle.TOP_RIGHT -> max(dx.toFloat(), -dy.toFloat() / ratio)
                        ResizeHandle.BOTTOM_LEFT -> max(-dx.toFloat(), dy.toFloat() / ratio)
                        ResizeHandle.BOTTOM_RIGHT -> max(dx.toFloat(), dy.toFloat() / ratio)
                    }
                    val anchorRight = startX + startSize
                    val anchorBottom = startY + (startSize * ratio).roundToInt()
                    val maxSize = when (handle) {
                        ResizeHandle.TOP_LEFT -> min(anchorRight, (anchorBottom / ratio).toInt())
                        ResizeHandle.TOP_RIGHT -> min(metrics.widthPixels - startX, (anchorBottom / ratio).toInt())
                        ResizeHandle.BOTTOM_LEFT -> min(anchorRight, ((metrics.heightPixels - startY) / ratio).toInt())
                        ResizeHandle.BOTTOM_RIGHT -> min(metrics.widthPixels - startX, ((metrics.heightPixels - startY) / ratio).toInt())
                    }.coerceAtLeast(minSize)
                    val size = (startSize + delta.roundToInt()).coerceIn(minSize, maxSize)
                    val height = BoardGeometry.fullHeightForSize(size)
                    val x = when (handle) {
                        ResizeHandle.TOP_LEFT, ResizeHandle.BOTTOM_LEFT -> anchorRight - size
                        else -> startX
                    }.coerceIn(0, max(0, metrics.widthPixels - size))
                    val y = when (handle) {
                        ResizeHandle.TOP_LEFT, ResizeHandle.TOP_RIGHT -> anchorBottom - height
                        else -> startY
                    }.coerceIn(0, max(0, metrics.heightPixels - height))
                    onChanged(SavedBoardRegion(x, y, size, height))
                } else {
                    val x = (startX + dx).coerceIn(0, max(0, metrics.widthPixels - startSize))
                    val guideHeight = (startSize * BoardGeometry.DEFAULT_HEIGHT_RATIO).toInt()
                    val y = (startY + dy).coerceIn(0, max(0, metrics.heightPixels - guideHeight))
                    onChanged(SavedBoardRegion(x, y, startSize, guideHeight))
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                resizeHandle = null
                performClick()
                return true
            }
        }
        return true
    }

    override fun performClick(): Boolean { super.performClick(); return true }
}

private class PathOverlayView(context: android.content.Context) : View(context) {
    private var region: ScreenBoardRegion? = null
    private var route: List<Coord> = emptyList()
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.STROKE; strokeCap = Paint.Cap.BUTT; strokeJoin = Paint.Join.MITER; strokeWidth = 4f }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; style = Paint.Style.STROKE; strokeWidth = 2f }

    init { setLayerType(View.LAYER_TYPE_SOFTWARE, null) }

    fun setRoute(newRegion: ScreenBoardRegion?, newRoute: List<Coord>) { region = newRegion; route = newRoute; invalidate() }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        val selectedRegion = region ?: return
        if (route.size < 2) return
        val cell = min(BoardGeometry.cellWidth(selectedRegion), BoardGeometry.cellHeight(selectedRegion))
        val points = RoutePathGeometry.buildPoints(route, selectedRegion, maxOf(6f, cell / 10f))
        if (points.size < 2) return
        val path = Path()
        points.forEachIndexed { index, point ->
            if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
        }
        line.strokeWidth = 4f
        line.setShadowLayer(maxOf(3f, cell * 0.04f), 3f, 3f, Color.BLACK)
        canvas.drawPath(path, line); line.clearShadowLayer()
        val startPoint = points.first()
        val endPoint = points.last()
        val startX = startPoint.x
        val startY = startPoint.y
        val endX = endPoint.x
        val endY = endPoint.y
        dot.color = Color.rgb(34, 197, 94); canvas.drawCircle(startX, startY, 14f, dot); canvas.drawCircle(startX, startY, 14f, dotStroke)
        dot.color = Color.rgb(239, 68, 68); canvas.drawCircle(endX, endY, 16f, dot); canvas.drawCircle(endX, endY, 16f, dotStroke)
    }
}
