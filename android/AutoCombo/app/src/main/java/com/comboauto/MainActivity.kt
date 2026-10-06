package com.comboauto

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var startButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SolverEngine.initialize(this)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
        }
        buildUi()
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) refreshStatus()
    }

    private fun buildUi() {
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.rgb(7, 10, 18))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(30))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "AUTO COMBO"
            textSize = 28f
            setTextColor(Color.rgb(120, 255, 220))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER_HORIZONTAL
        })
        root.addView(TextView(this).apply {
            text = "Android 版已重寫成主程式核心 runner + 原生懸浮窗。App 入口只負責授權；設定、偵測、Top10、路徑投影都在螢幕上的 icon 操作。"
            textSize = 14f
            setTextColor(Color.rgb(205, 230, 230))
            setPadding(0, dp(12), 0, dp(16))
        })

        status = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.rgb(120, 230, 255))
            setPadding(0, 0, 0, dp(12))
        }
        root.addView(status)

        root.addView(button("1. 開啟懸浮窗權限", Color.rgb(24, 76, 108)) {
            openOverlayPermission()
        }, LinearLayout.LayoutParams(-1, dp(52)).apply { bottomMargin = dp(10) })

        startButton = button("2. 授權螢幕擷取並啟動 icon", Color.rgb(20, 130, 88)) {
            requestProjection()
        }
        root.addView(startButton, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(10) })

        root.addView(button("停止懸浮 icon", Color.rgb(116, 40, 58)) {
            stopService(Intent(this, OverlayService::class.java))
            Toast.makeText(this, "已送出停止懸浮 icon", Toast.LENGTH_SHORT).show()
        }, LinearLayout.LayoutParams(-1, dp(50)).apply { bottomMargin = dp(18) })

        root.addView(TextView(this).apply {
            text = "操作方式：\n• 點 icon 展開面板。\n• SET 調整綠色定位格與所有主程式設定。\n• SEARCH 會截圖、偵測 row1~row5、使用主程式 beamSolve 計算。\n• TOP10 可選 10 個解；路徑層是觸控穿透，不會擋住底下遊戲。\n• 按「自動轉珠」前，需在 Android 無障礙設定啟用 AutoCombo 服務。"
            textSize = 13f
            setTextColor(Color.rgb(180, 200, 210))
            setPadding(0, dp(4), 0, 0)
        })

        setContentView(scroll)
        refreshStatus()
    }

    private fun requestProjection() {
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermission()
            Toast.makeText(this, "請先允許懸浮窗權限", Toast.LENGTH_LONG).show()
            return
        }
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_PROJECTION)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_PROJECTION) return
        if (resultCode != RESULT_OK || data == null) {
            Toast.makeText(this, "未取得螢幕擷取授權", Toast.LENGTH_LONG).show()
            return
        }
        val serviceIntent = Intent(this, OverlayService::class.java).apply {
            action = OverlayService.ACTION_START
            putExtra(OverlayService.EXTRA_RESULT_CODE, resultCode)
            putExtra(OverlayService.EXTRA_PROJECTION_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(serviceIntent) else startService(serviceIntent)
        Toast.makeText(this, "懸浮 icon 已啟動", Toast.LENGTH_LONG).show()
    }

    private fun openOverlayPermission() {
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    private fun refreshStatus() {
        val overlay = Settings.canDrawOverlays(this)
        status.text = "懸浮窗權限：${if (overlay) "已允許" else "未允許"}\n螢幕擷取：每次啟動服務需由系統授權。"
        startButton.isEnabled = overlay
        startButton.alpha = if (overlay) 1f else 0.55f
    }

    private fun button(text: String, color: Int, action: () -> Unit): Button {
        return Button(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(Color.WHITE)
            setBackgroundColor(color)
            setOnClickListener { action() }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val REQUEST_PROJECTION = 701
        private const val REQUEST_NOTIFICATIONS = 702
    }
}
