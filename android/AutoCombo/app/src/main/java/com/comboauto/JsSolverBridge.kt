package com.comboauto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt

object JsSolverBridge {
    private val main = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    @Volatile private var ready = false
    @Volatile private var initializing = false
    @Volatile private var recognitionTemplatesJson: String? = null
    @Volatile private var recognitionTemplatesStamp: Long = Long.MIN_VALUE
    private val pendingJsInputs = ConcurrentHashMap<String, String>()
    private val pendingJsResults = ConcurrentHashMap<String, CompletableFuture<String>>()
    private val pendingJsProgress = ConcurrentHashMap<String, (Int, Int) -> Unit>()

    private data class RecognitionImage(
        val dataUrl: String,
        val debug: String
    )

    private object NativeBridge {
        @JavascriptInterface
        fun onResult(token: String, json: String) {
            pendingJsInputs.remove(token)
            pendingJsProgress.remove(token)
            pendingJsResults.remove(token)?.complete(json)
        }

        @JavascriptInterface
        fun onProgress(token: String, current: Int, max: Int) {
            pendingJsProgress[token]?.invoke(current.coerceAtLeast(0), max.coerceAtLeast(1))
        }

        @JavascriptInterface
        fun getInput(token: String): String {
            return pendingJsInputs[token] ?: "{}"
        }
    }

    fun initialize(context: Context) {
        main.post {
            if (webView != null || initializing) return@post
            initializing = true
            val view = WebView(context)
            view.setBackgroundColor(Color.TRANSPARENT)
            view.visibility = View.INVISIBLE
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = false
            view.settings.allowFileAccess = true
            view.addJavascriptInterface(NativeBridge, "NativeBridge")
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    ready = true
                    initializing = false
                }
            }
            webView = view
            view.loadUrl("file:///android_asset/solver_runner.html")
        }
    }

    fun solve(
        context: Context,
        board: Board,
        settings: SolverSettings,
        rules: RuleProfile,
        specials: List<SpecialPriority>,
        onProgress: ((Int, Int) -> Unit)? = null
    ): SolverEngine.Output? {
        initialize(context)
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!ready && System.nanoTime() < deadline) {
            Thread.sleep(40)
        }
        val payload = makePayload(board, settings, rules, specials)
        val token = UUID.randomUUID().toString()
        if (onProgress != null) pendingJsProgress[token] = onProgress
        payload.put("progressToken", token)
        val future = CompletableFuture<String>()
        pendingJsInputs[token] = payload.toString()
        pendingJsResults[token] = future
        main.post {
            val view = webView
            if (view == null || !ready) {
            pendingJsInputs.remove(token)
            pendingJsProgress.remove(token)
            pendingJsResults.remove(token)?.complete("""{"error":"runner not ready"}""")
                return@post
            }
            val script = "window.autoComboSolveFromNative(${JSONObject.quote(token)})"
            view.evaluateJavascript(script, null)
        }
        val raw = try {
            future.get(90, TimeUnit.SECONDS)
        } catch (_: Exception) {
            pendingJsInputs.remove(token)
            pendingJsProgress.remove(token)
            pendingJsResults.remove(token)
            return null
        }
        return try {
            val root = JSONObject(raw)
            if (root.has("error")) null else parseSolverRoot(root, board, settings)
        } catch (_: Exception) {
            null
        }
    }

    fun detectAndSolve(context: Context, bitmap: Bitmap, region: ScreenBoardRegion, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): SolverEngine.DetectAndSolveOutput? {
        initialize(context)
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!ready && System.nanoTime() < deadline) {
            Thread.sleep(40)
        }
        // App.jsx receives the already-cropped 5x6 canvas.  Do not search a
        // wider strip for another candidate; that makes a moved guide appear
        // ineffective and is not part of the App.jsx detection algorithm.
        val crop = playableExactCropDataUrl(context, bitmap, region) ?: return null
        val payload = makePayload(currentBoard, settings, rules, specials)
            .put("imageDataUrl", crop.dataUrl)
            .put("templates", recognitionTemplates(context))
            .put("detectInnerPad", 0.12)
            .put("detectSampleSize", 28)
            .put("detectMinScore", 0.55)
            .put("nativeDebug", crop.debug)
        val token = UUID.randomUUID().toString()
        val future = CompletableFuture<String>()
        pendingJsInputs[token] = payload.toString()
        pendingJsResults[token] = future
        main.post {
            val view = webView
            if (view == null || !ready) {
                pendingJsInputs.remove(token)
                pendingJsResults.remove(token)?.complete("""{"error":"runner not ready"}""")
                return@post
            }
            val script = "window.autoComboDetectAndSolveFromNative(${JSONObject.quote(token)})"
            view.evaluateJavascript(script, null)
        }
        val raw = try {
            future.get(90, TimeUnit.SECONDS)
        } catch (error: Exception) {
            pendingJsInputs.remove(token)
            pendingJsResults.remove(token)
            return SolverEngine.DetectAndSolveOutput(
                currentBoard.copy(),
                0.0,
                SolverEngine.Output(emptyList(), 0, 0),
                "JS runner timed out: ${error.message ?: error.javaClass.simpleName}"
            )
        }
        return parseDetectAndSolveOutput(raw, currentBoard, settings)
    }

    fun detectBoard(context: Context, bitmap: Bitmap, region: ScreenBoardRegion, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): SolverEngine.DetectionOutput? {
        initialize(context)
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!ready && System.nanoTime() < deadline) {
            Thread.sleep(40)
        }
        val playable = playableExactCropDataUrl(context, bitmap, region) ?: return null
        val payload = makePayload(currentBoard, settings, rules, specials)
            .put("imageDataUrl", playable.dataUrl)
            .put("templates", recognitionTemplates(context))
            .put("detectInnerPad", 0.12)
            .put("detectSampleSize", 28)
            .put("detectMinScore", 0.55)
            .put("nativeDebug", playable.debug)
        val token = UUID.randomUUID().toString()
        val future = CompletableFuture<String>()
        pendingJsInputs[token] = payload.toString()
        pendingJsResults[token] = future
        main.post {
            val view = webView
            if (view == null || !ready) {
                pendingJsInputs.remove(token)
                pendingJsResults.remove(token)?.complete("""{"error":"runner not ready"}""")
                return@post
            }
            val script = "window.autoComboDetectBoardFromNative(${JSONObject.quote(token)})"
            view.evaluateJavascript(script, null)
        }
        val raw = try {
            future.get(20, TimeUnit.SECONDS)
        } catch (error: Exception) {
            pendingJsInputs.remove(token)
            pendingJsResults.remove(token)
            return SolverEngine.DetectionOutput(
                currentBoard.copy(),
                0.0,
                "JS detection timed out: ${error.message ?: error.javaClass.simpleName}"
            )
        }
        return parseDetectionOutput(raw, currentBoard)
    }

    fun detectBoard(context: Context, bitmap: Bitmap, corners: ScreenBoardCorners, currentBoard: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): SolverEngine.DetectionOutput? {
        initialize(context)
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (!ready && System.nanoTime() < deadline) {
            Thread.sleep(40)
        }
        val playable = playableWarpDataUrl(bitmap, corners) ?: return null
        val payload = makePayload(currentBoard, settings, rules, specials)
            .put("imageDataUrl", playable.dataUrl)
            .put("templates", recognitionTemplates(context))
            .put("detectInnerPad", 0.12)
            .put("detectSampleSize", 28)
            .put("detectMinScore", 0.55)
            .put("nativeDebug", playable.debug)
        val token = UUID.randomUUID().toString()
        val future = CompletableFuture<String>()
        pendingJsInputs[token] = payload.toString()
        pendingJsResults[token] = future
        main.post {
            val view = webView
            if (view == null || !ready) {
                pendingJsInputs.remove(token)
                pendingJsResults.remove(token)?.complete("""{"error":"runner not ready"}""")
                return@post
            }
            val script = "window.autoComboDetectBoardFromNative(${JSONObject.quote(token)})"
            view.evaluateJavascript(script, null)
        }
        val raw = try {
            future.get(20, TimeUnit.SECONDS)
        } catch (error: Exception) {
            pendingJsInputs.remove(token)
            pendingJsResults.remove(token)
            return SolverEngine.DetectionOutput(
                currentBoard.copy(),
                0.0,
                "JS detection timed out: ${error.message ?: error.javaClass.simpleName}"
            )
        }
        return parseDetectionOutput(raw, currentBoard)
    }

    fun shutdown() {
        pendingJsProgress.clear()
        main.post {
            webView?.destroy()
            webView = null
            ready = false
            initializing = false
        }
    }

    /**
     * App.jsx does not use a fixed target Combo. refreshTarget() derives the
     * theoretical maximum from row1~row5, the per-orb minimum clear rules,
     * and the optional row0 held orb.  The previous Android bridge sent the
     * legacy settings.targetCombo (normally 8), which changed both the Beam
     * miss tiers and the stopping/ranking decisions.
     */
    private fun theoreticalTarget(board: Board, rules: RuleProfile, row0Enabled: Boolean): Int {
        val counts = IntArray(Orb.values().size)

        fun orbForTarget(cell: BoardCell): Int {
            val rawN = cell.encodedValue?.let { (it / 1000) % 10 }
            val n = rawN ?: when (cell.mark) {
                CellMark.N1 -> 1
                CellMark.N2 -> 2
                else -> 0
            }
            if (n == 1) return -1
            return cell.orb?.ordinal ?: -1
        }

        for (row in Board.PLAY_ROW_START until Board.ROWS) {
            for (col in 0 until Board.COLS) {
                val orb = orbForTarget(board[Coord(row, col)])
                if (orb in counts.indices) counts[orb]++
            }
        }

        fun total(bonusOrb: Int = -1): Int {
            var result = 0
            for (orb in counts.indices) {
                val minimum = rules.orbRules.getOrNull(orb)?.minimum?.coerceIn(1, 5) ?: 3
                result += (counts[orb] + if (orb == bonusOrb) 1 else 0) / minimum
            }
            return result
        }

        var best = total()
        if (row0Enabled) {
            for (col in 0 until Board.COLS) {
                val orb = orbForTarget(board[Coord(0, col)])
                if (orb >= 0) best = max(best, total(orb))
            }
        }
        return best.coerceAtLeast(1)
    }

    private fun makePayload(board: Board, settings: SolverSettings, rules: RuleProfile, specials: List<SpecialPriority>): JSONObject {
        val encodedBoard = JSONArray()
        for (row in 0 until Board.ROWS) {
            val encodedRow = JSONArray()
            for (col in 0 until Board.COLS) {
                encodedRow.put(encodeMainCell(board[Coord(row, col)], row, col, settings))
            }
            encodedBoard.put(encodedRow)
        }
        // Android has one tuned Combo-first budget. When the user checks
        // 限制 Step, the selected value becomes the actual BeamSolve
        // expansion limit; it is not a soft ranking target.
        val androidStepLimit = if (settings.targetStepEnabled) {
            settings.targetStep.coerceIn(1, AndroidSolverTuning.SEARCH_STEP_GUARD)
        } else {
            AndroidSolverTuning.SEARCH_STEP_GUARD
        }
        val cfg = JSONObject()
            .put("beamWidth", AndroidSolverTuning.BEAM_WIDTH)
            .put("maxSteps", androidStepLimit)
            .put("hardStepLimitEnabled", settings.targetStepEnabled)
            .put("hardStepLimit", androidStepLimit)
            .put("maxNodes", AndroidSolverTuning.MAX_NODES)
            .put("evalWorkers", 2)
            .put("humanPlanner", settings.humanPlanner)
            .put("reversePlanner", settings.reversePlanner)
            .put("reverseMaxSteps", settings.reverseMaxSteps.coerceIn(1, 120))
            .put("deferMoveMaterialization", true)
            .put("cheapLocalGuidance", true)
            .put("cheapLegacyReserve", 0.25)
            .put("cheapEvalScale", 2)
            .put("cheapEvalConstraintScale", 2.5)
            .put("stepPenalty", settings.stepPenalty)
            .put("potentialWeight", settings.potentialWeight)
            .put("clearedWeight", settings.clearedWeight)
            .put("searchSeed", settings.boardSeed)
            .put("browserYield", false)
            .put("androidStepLimitEnabled", settings.targetStepEnabled)
            .put("androidStepLimit", androidStepLimit)
            // Pass coordinates explicitly as well as encoded marks. This
            // preserves a valid same-cell start/end selection, which cannot
            // be represented by one legacy Q mark alone.
            .put("androidStartRow", settings.startRow)
            .put("androidStartCol", settings.startCol)
            .put("androidEndRow", settings.endRow)
            .put("androidEndCol", settings.endCol)
            // Android immediately injects the selected route. Combo remains
            // the ranking objective; the optional Step value is enforced
            // above as a hard search limit.
            .put("androidAutoCombo", true)
        val priority = "combo"
        val target = theoreticalTarget(board, rules, settings.row0Enabled)
        return JSONObject()
            .put("board", encodedBoard)
            .put("cfg", cfg)
            // Match App.jsx: target is theoretical maximum, while the user
            // setting controls initTargetCombo.
            .put("target", target)
            .put("mode", "vertical")
            .put("priority", priority)
            .put("skyfall", settings.skyfallEnabled)
            .put("diagonal", settings.diagonalEnabled)
            .put("specials", makeSpecials(specials, settings))
            .put("specialSlots", makeSpecialSlotTypes(specials))
            .put("row0", settings.row0Enabled)
            .put("ruleProfile", makeRuleProfile(rules))
            .apply {
                // Omit this key when disabled.  App.jsx treats undefined as
                // "no initial-combo target"; JSONObject.NULL would become 0
                // in JavaScript and accidentally enable the target.
                if (settings.targetComboEnabled) {
                    put("initTargetCombo", settings.initTargetCombo.coerceIn(0, target))
                }
            }
    }

    private fun encodeMainCell(cell: BoardCell, row: Int, col: Int, settings: SolverSettings): Int {
        val orb = cell.orb?.ordinal ?: return -1
        val stored = cell.encodedValue
        if (stored != null && stored >= 0) {
            val explicitStart = if (settings.startRow == row && settings.startCol == col) 100 else 0
            val explicitEnd = if (settings.endRow == row && settings.endCol == col) 200 else 0
            return max(stored, max(explicitStart + orb, explicitEnd + orb))
        }
        val mark = when (cell.mark) {
            CellMark.X1 -> 10
            CellMark.X2 -> 20
            CellMark.START -> 100
            CellMark.END -> 200
            CellMark.N1 -> 1000
            CellMark.N2 -> 2000
            else -> 0
        }
        val explicitStart = if (settings.startRow == row && settings.startCol == col) 100 else 0
        val explicitEnd = if (settings.endRow == row && settings.endCol == col) 200 else 0
        return orb + max(mark, max(explicitStart, explicitEnd))
    }

    private fun makeSpecials(specials: List<SpecialPriority>, settings: SolverSettings): JSONArray {
        val effective = specials.take(3).ifEmpty {
            listOf(SpecialPriority(
                type = settings.shieldType,
                count = settings.shieldCount,
                orb = Orb.fromId(settings.shieldOrb),
                clearCount = settings.shieldClearCount,
                rectRows = settings.shieldRectRows,
                rectCols = settings.shieldRectCols,
                equalOrbs = Orb.values().filter { (settings.equalFirstMask and (1 shl it.ordinal)) != 0 }.toMutableList()
            ))
        }
        return JSONArray().apply {
            for (special in effective) makeSpecial(special)?.let { put(it) }
        }
    }

    private fun makeSpecialSlotTypes(specials: List<SpecialPriority>): JSONArray {
        val slots = specials.take(3).toMutableList()
        while (slots.size < 3) slots += SpecialPriority()
        return JSONArray().apply {
            slots.forEach { special ->
                put(when (special.type) {
                    SpecialType.CROSS -> "cross"
                    SpecialType.L_SHAPE -> "l"
                    SpecialType.T_SHAPE -> "t"
                    SpecialType.RECTANGLE -> "rect"
                    SpecialType.CLEAR_COUNT -> "clearCount"
                    SpecialType.EQUAL_FIRST -> "equalFirst"
                    SpecialType.COMBO -> "combo"
                    else -> "none"
                })
            }
        }
    }

    private fun makeSpecial(special: SpecialPriority): JSONObject? {
        val orb = special.orb?.ordinal ?: -1
        val count = special.count.coerceAtLeast(1)
        return when (special.type) {
            SpecialType.CROSS -> JSONObject().put("type", "cross").put("orb", orb).put("count", count)
            SpecialType.L_SHAPE -> JSONObject().put("type", "l").put("orb", orb).put("count", count)
            SpecialType.T_SHAPE -> JSONObject().put("type", "t").put("orb", orb).put("count", count)
            SpecialType.RECTANGLE -> JSONObject().put("type", "rect").put("rectM", special.rectRows.coerceIn(2, 5)).put("rectN", special.rectCols.coerceIn(2, 6)).put("rectOrb", orb)
            SpecialType.CLEAR_COUNT -> JSONObject().put("type", "clearCount").put("clearCount", special.clearCount.coerceIn(3, 30))
            SpecialType.EQUAL_FIRST -> JSONObject().put("type", "equalFirst").put("equalOrbs", JSONArray().apply {
                special.equalOrbs.distinct().forEach { put(it.ordinal) }
            })
            SpecialType.COMBO -> JSONObject().put("type", "combo").put("count", count)
            else -> null
        }
    }

    private fun makeRuleProfile(rules: RuleProfile): JSONObject {
        return JSONObject()
            .put("orbRules", JSONArray().apply {
                rules.orbRules.take(Orb.values().size).forEach { rule ->
                    put(JSONObject()
                        .put("minClear", rule.minimum.coerceIn(1, 5))
                        .put("clearMode", if (rule.mode == ClearMode.CONNECTED) "connected" else "line")
                    )
                }
            })
            .put("requirements", JSONArray().apply {
                rules.requirements.forEach { requirement ->
                    put(JSONObject()
                        .put("orb", requirement.orb.ordinal)
                        .put("size", requirement.size.coerceIn(1, 5))
                        .put("count", requirement.count.coerceAtLeast(1))
                        .put("match", if (requirement.match == RequirementMatch.AT_LEAST) "atLeast" else "exact")
                    )
                }
            })
    }

    private fun playableExactCropDataUrl(context: Context, bitmap: Bitmap, region: ScreenBoardRegion): RecognitionImage? {
        val metrics = context.resources.displayMetrics
        val rect = BoardGeometry.toBitmapRect(
            region,
            bitmap.width,
            bitmap.height,
            metrics.widthPixels,
            metrics.heightPixels
        ) ?: return null
        val crop = Bitmap.createBitmap(bitmap, rect.left, rect.top, rect.width(), rect.height())
        return try {
            val output = ByteArrayOutputStream()
            crop.compress(Bitmap.CompressFormat.PNG, 100, output)
            RecognitionImage(
                dataUrl = "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP),
                debug = "exactRow1to5 region=${region.left},${region.top},${region.size}x${region.height} frame=${bitmap.width}x${bitmap.height} boardImage=${rect.left},${rect.top},${rect.width()}x${rect.height()}"
            )
        } finally {
            if (!crop.isRecycled) crop.recycle()
        }
    }

    private fun playableWarpDataUrl(bitmap: Bitmap, corners: ScreenBoardCorners): RecognitionImage? {
        val warped = ScreenBoardWarp.playableFromCorners(bitmap, corners) ?: return null
        return try {
            val output = ByteArrayOutputStream()
            warped.compress(Bitmap.CompressFormat.PNG, 100, output)
            RecognitionImage(
                dataUrl = "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP),
                debug = ScreenBoardWarp.debugLabel(corners, warped)
            )
        } finally {
            if (!warped.isRecycled) warped.recycle()
        }
    }

    private fun recognitionTemplates(context: Context): JSONArray {
        val externalRoot = context.getExternalFilesDir("recognition_templates")?.apply { mkdirs() }
        val externalStamp = externalRoot?.let { templateFolderStamp(it) } ?: 0L
        val cached = recognitionTemplatesJson
        if (cached != null && recognitionTemplatesStamp == externalStamp) return JSONArray(cached)
        val specs = listOf(
            Triple(0, "w.png", "water"),
            Triple(1, "f.png", "fire"),
            Triple(2, "p.png", "earth"),
            Triple(3, "l.png", "light"),
            Triple(4, "d.png", "dark"),
            Triple(5, "h.png", "heart"),
            Triple(0, "pad_w.png", "pad_water"),
            Triple(1, "pad_f.png", "pad_fire"),
            Triple(2, "pad_p.png", "pad_earth"),
            Triple(3, "pad_l.png", "pad_light"),
            Triple(4, "pad_d.png", "pad_dark"),
            Triple(5, "pad_h.png", "pad_heart")
        )
        val array = JSONArray()
        for ((orbId, assetName, key) in specs) {
            val bytes = try {
                context.assets.open(assetName).use { input -> input.readBytes() }
            } catch (_: IOException) {
                continue
            }
            array.put(JSONObject()
                .put("id", orbId)
                .put("key", key)
                .put("img", "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
            )
        }
        // Optional user templates live in the app-specific external folder.
        // The folder name is the class label; the JS recognizer then digests
        // all of them through the same App.jsx feature/template table.
        val folders = listOf(
            "water" to 0,
            "fire" to 1,
            "earth" to 2,
            "light" to 3,
            "dark" to 4,
            "heart" to 5
        )
        for ((folderName, orbId) in folders) {
            val bundledFolder = "recognition_templates/$folderName"
            context.assets.list(bundledFolder)
                ?.filter { it.substringAfterLast('.', "").lowercase(Locale.US) in setOf("png", "jpg", "jpeg", "webp") }
                ?.sorted()
                ?.forEachIndexed { index, fileName ->
                    try {
                        val extension = fileName.substringAfterLast('.', "").lowercase(Locale.US)
                        val mime = if (extension == "jpg" || extension == "jpeg") "image/jpeg" else if (extension == "webp") "image/webp" else "image/png"
                        val bytes = context.assets.open("$bundledFolder/$fileName").use { it.readBytes() }
                        array.put(JSONObject()
                            .put("id", orbId)
                            .put("key", "bundled_${folderName}_${index}_$fileName")
                            .put("img", "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)))
                    } catch (_: Exception) { }
                }
            val folder = externalRoot?.resolve(folderName) ?: continue
            if (!folder.exists()) folder.mkdirs()
            folder.listFiles()
                ?.filter { it.isFile && it.extension.lowercase(Locale.US) in setOf("png", "jpg", "jpeg", "webp") }
                ?.sortedBy { it.name.lowercase(Locale.US) }
                ?.forEachIndexed { index, file ->
                    try {
                        val mime = when (file.extension.lowercase(Locale.US)) {
                            "jpg", "jpeg" -> "image/jpeg"
                            "webp" -> "image/webp"
                            else -> "image/png"
                        }
                        array.put(JSONObject()
                            .put("id", orbId)
                            .put("key", "user_${folderName}_${index}_${file.name}")
                            .put("img", "data:$mime;base64," + Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)))
                    } catch (_: Exception) { }
                }
        }
        val encoded = array.toString()
        recognitionTemplatesJson = encoded
        recognitionTemplatesStamp = externalStamp
        return JSONArray(encoded)
    }

    private fun templateFolderStamp(root: File): Long {
        var stamp = 17L
        val folders = listOf("water", "fire", "earth", "light", "dark", "heart")
        for (name in folders) {
            val folder = root.resolve(name)
            stamp = stamp * 31 + folder.lastModified()
            folder.listFiles()?.filter { it.isFile }?.sortedBy { it.name }?.forEach { file ->
                stamp = stamp * 31 + file.name.hashCode()
                stamp = stamp * 31 + file.length()
                stamp = stamp * 31 + file.lastModified()
            }
        }
        return stamp
    }

    private fun parseOutput(rawJavascriptValue: String?, original: Board, settings: SolverSettings): SolverEngine.Output? {
        return try {
            val raw = JSONTokener(rawJavascriptValue ?: "null").nextValue() as? String ?: return null
            parseSolverRoot(JSONObject(raw), original, settings)
        } catch (_: Exception) { null }
    }

    private fun parseDetectAndSolveOutput(raw: String, currentBoard: Board, settings: SolverSettings): SolverEngine.DetectAndSolveOutput? {
        return try {
            val root = JSONObject(raw)
            if (root.has("error")) {
                return SolverEngine.DetectAndSolveOutput(
                    currentBoard.copy(),
                    0.0,
                    SolverEngine.Output(emptyList(), 0, 0),
                    root.optString("error", "Unknown JS error")
                )
            }
            val detectedBoard = parseBoard(root.optJSONArray("board")) ?: currentBoard.copy()
            val solveRoot = root.optJSONObject("solve") ?: JSONObject()
            val output = parseSolverRoot(solveRoot, detectedBoard, settings)
            val debugParts = mutableListOf<String>()
            root.optString("solverSource", "").takeIf { it.isNotBlank() }?.let { debugParts += it }
            root.optString("nativeDebug", "").takeIf { it.isNotBlank() }?.let { debugParts += it }
            SolverEngine.DetectAndSolveOutput(
                detectedBoard,
                root.optDouble("confidence", 0.0).coerceIn(0.0, 1.0),
                output,
                debug = debugParts.joinToString(" ").takeIf { it.isNotBlank() }
            )
        } catch (error: Exception) {
            SolverEngine.DetectAndSolveOutput(
                currentBoard.copy(),
                0.0,
                SolverEngine.Output(emptyList(), 0, 0),
                "JS result parse failed: ${error.message ?: error.javaClass.simpleName}"
            )
        }
    }

    private fun parseDetectionOutput(raw: String, currentBoard: Board): SolverEngine.DetectionOutput? {
        return try {
            val root = JSONObject(raw)
            if (root.has("error")) {
                return SolverEngine.DetectionOutput(
                    currentBoard.copy(),
                    0.0,
                    root.optString("error", "Unknown JS detection error")
                )
            }
            val detectedBoard = parseBoard(root.optJSONArray("board")) ?: currentBoard.copy()
            val debugParts = mutableListOf<String>()
            root.optString("solverSource", "").takeIf { it.isNotBlank() }?.let { debugParts += it }
            root.optString("nativeDebug", "").takeIf { it.isNotBlank() }?.let { debugParts += it }
            SolverEngine.DetectionOutput(
                detectedBoard,
                root.optDouble("confidence", 0.0).coerceIn(0.0, 1.0),
                debug = debugParts.joinToString(" ").takeIf { it.isNotBlank() }
            )
        } catch (error: Exception) {
            SolverEngine.DetectionOutput(
                currentBoard.copy(),
                0.0,
                "JS detection parse failed: ${error.message ?: error.javaClass.simpleName}"
            )
        }
    }

    private fun parseSolverRoot(root: JSONObject, original: Board, settings: SolverSettings): SolverEngine.Output {
        // Automatic Android playback always consumes the Combo-ranked pool.
        // Keep the old SET selector readable for compatibility, but do not
        // let it downgrade the automatic route objective.
        val primary = root.optJSONArray("topCombos")
        val results = mutableListOf<SolverResult>()

        // beamSolve/mergeTopSolutions already performed App.jsx's exact
        // signature-based deduplication and lexicographic pool ranking in
        // JavaScript.  Do not deduplicate by path here: that is a different
        // equivalence rule and can change both the Top10 membership and its
        // order before the Android UI displays it.
        fun readSource(source: JSONArray?) {
            if (source == null) return
            for (index in 0 until source.length()) {
                val solution = source.optJSONObject(index) ?: continue
                val path = parsePath(solution.optJSONArray("path"))
                if (path.size < 2) continue
                val evaluation = parseEvaluation(solution)
                val finalBoard = parseBoard(solution.optJSONArray("finalBoard")) ?: original.copy()
                val hard = !solution.optBoolean("violatesN2", false) && evaluation.totalCombos >= settings.targetCombo
                val statusArray = solution.optJSONArray("specialStatus")
                val specialStatus = if (statusArray != null) {
                    (0 until statusArray.length()).map { offset -> statusArray.optBoolean(offset, false) }
                } else {
                    val specialTuple = solution.optJSONArray("specialTuple")
                    if (specialTuple == null) emptyList() else {
                        (0 until specialTuple.length() step 2).map { offset -> specialTuple.optInt(offset, 0) > 0 }
                    }
                }
                results += SolverResult(finalBoard, path, evaluation, hard, solution.optDouble("score", 0.0), specialStatus)
                if (results.size >= 10) return
            }
        }
        readSource(primary)
        if (results.isEmpty()) {
            val path = parsePath(root.optJSONArray("path"))
            val finalBoard = parseBoard(root.optJSONArray("finalBoard")) ?: original.copy()
            if (path.size >= 2) results += SolverResult(finalBoard, path, parseEvaluation(root), root.optBoolean("success", false), root.optDouble("score", 0.0))
        }
        return SolverEngine.Output(results.take(10), root.optInt("nodesExpanded", 0), root.optInt("theoreticalMax", 0))
    }

    private fun parseBoard(array: JSONArray?): Board? {
        if (array == null || array.length() < Board.ROWS) return null
        val cells = Array(Board.ROWS) { row ->
            val jsonRow = array.optJSONArray(row) ?: return null
            if (jsonRow.length() < Board.COLS) return null
            Array(Board.COLS) { col ->
                val value = jsonRow.optInt(col, -1)
                BoardCell(
                    Orb.fromId(if (value < 0) -1 else value % 10),
                    markFromEncodedValue(value),
                    value.takeIf { it >= 0 }
                )
            }
        }
        return Board(cells)
    }

    private fun markFromEncodedValue(value: Int): CellMark {
        if (value < 0) return CellMark.NONE
        return when {
            (value / 100) % 10 == 1 -> CellMark.START
            (value / 100) % 10 == 2 -> CellMark.END
            (value / 10) % 10 == 1 -> CellMark.X1
            (value / 10) % 10 == 2 -> CellMark.X2
            (value / 1000) % 10 == 1 -> CellMark.N1
            (value / 1000) % 10 == 2 -> CellMark.N2
            else -> CellMark.NONE
        }
    }

    private fun parsePath(array: JSONArray?): List<Coord> {
        if (array == null) return emptyList()
        val path = ArrayList<Coord>(array.length())
        for (index in 0 until array.length()) {
            val point = array.optJSONObject(index) ?: continue
            path += Coord(point.optInt("r", -1), point.optInt("c", -1))
        }
        return path.filter { it.row in 0 until Board.ROWS && it.col in 0 until Board.COLS }
    }

    private fun parseEvaluation(source: JSONObject): Evaluation {
        val initial = source.optInt("initialCombos", source.optInt("combos", 0))
        val total = source.optInt("combos", initial)
        val skyfall = source.optInt("skyfallCombos", max(0, total - initial))
        val patterns = source.optJSONObject("initialPatternCounts")
        return Evaluation(
            initialGroups = initial,
            skyfallGroups = skyfall,
            initialCleared = source.optInt("initialClearedCount", 0),
            skyfallCleared = max(0, source.optInt("clearedCount", 0) - source.optInt("initialClearedCount", 0)),
            crossCount = patterns?.optJSONObject("cross")?.optInt("total", 0) ?: 0,
            lCount = patterns?.optJSONObject("l")?.optInt("total", 0) ?: 0,
            tCount = patterns?.optJSONObject("t")?.optInt("total", 0) ?: 0
        )
    }
}
