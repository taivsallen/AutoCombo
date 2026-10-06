package com.comboauto

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors
import kotlin.math.max

class AppController(context: Context) {
    private val appContext = context.applicationContext
    private val persistence = Persistence(context.applicationContext)
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var manualWorking: Board? = null
    private var manualHeld: BoardCell? = null
    private var manualCurrent: Coord? = null
    private var manualTimer: Runnable? = null
    private var replayRunnable: Runnable? = null
    private var replayStep = 0
    private var solveToken = 0L

    var board: Board
        private set
    var originalBoard: Board
        private set
    var settings: SolverSettings
        private set
    var rules = RuleProfile()
    val specials = MutableList(3) { SpecialPriority() }
    var manualMode: Boolean
        private set
    var editorBoard: Board
        private set
    var editorTool: BoardEditorTool = BoardEditorTool.ORB(Orb.WATER)
    var results: List<SolverResult> = emptyList()
        private set
    var selectedResultIndex = 0
        private set
    var route: List<Coord> = emptyList()
        private set
    var stats = SolverStats()
        private set
    var isSolving = false
        private set
    var isReplaying = false
        private set
    var replayPaused = false
        private set
    var manualDragging = false
        private set
    var manualRemainingTicks = 100
        private set
    var needsSolve = true
        private set
    var importConfidence: Double? = null
        private set
    /** SET and TOP10 become available only after a real screen board was loaded. */
    var hasDetectedBoard: Boolean = false
        private set
    var lastMessage: String? = null
        private set

    var listener: (() -> Unit)? = null

    enum class BoardEditorToolKind { ORB, MARK, EMPTY }
    data class BoardEditorTool(val kind: BoardEditorToolKind, val orb: Orb? = null, val mark: CellMark = CellMark.NONE) {
        companion object { fun ORB(orb: Orb) = BoardEditorTool(BoardEditorToolKind.ORB, orb); fun MARK(mark: CellMark) = BoardEditorTool(BoardEditorToolKind.MARK, mark = mark); fun EMPTY() = BoardEditorTool(BoardEditorToolKind.EMPTY) }
    }

    init {
        val saved = persistence.load()
        board = saved.board
        originalBoard = saved.board.copy()
        settings = saved.settings
        rules = saved.rules
        specials.clear()
        specials.addAll(saved.specials.take(3))
        while (specials.size < 3) specials += SpecialPriority()
        manualMode = saved.manualMode
        editorBoard = board.copy()
    }

    fun destroy() { worker.shutdownNow(); main.removeCallbacksAndMessages(null) }

    fun randomize() {
        stopReplay()
        settings.boardSeed += 1
        board = Board.random(settings.boardSeed)
        originalBoard = board.copy()
        refreshTargetFromBoard(board)
        resetSearchState()
    }

    fun setManual(on: Boolean) {
        stopReplay()
        manualMode = on
        if (on) board = board.map { BoardCell(it.orb) } else originalBoard = board.copy()
        route = emptyList(); persist(); emit()
    }

    fun markDirty() {
        needsSolve = true
        results = emptyList(); route = emptyList(); selectedResultIndex = 0
        persist(); emit()
    }

    fun solve(onProgress: ((Int, Int) -> Unit)? = null) {
        if (isSolving || manualMode || isReplaying) return
        syncLegacySettingsFromSpecials()
        isSolving = true; needsSolve = false; results = emptyList(); route = emptyList(); originalBoard = board.copy(); lastMessage = "Calculating with beamSolve..."; emit()
        val token = ++solveToken
        val boardSnapshot = board.copy(); val settingsSnapshot = settings.copy(); val rulesSnapshot = cloneRules(); val specialsSnapshot = specials.map { it.copy(equalOrbs = it.equalOrbs.toMutableList()) }
        worker.execute {
            val output = SolverEngine.solve(boardSnapshot, settingsSnapshot, rulesSnapshot, specialsSnapshot, onProgress)
            main.post {
                if (token != solveToken) return@post
                isSolving = false; results = output.results; selectedResultIndex = 0; stats.theoreticalMax = output.theoreticalMax
                output.results.firstOrNull()?.let { applyResult(it, false) }
                lastMessage = if (output.results.isEmpty()) {
                    "No beamSolve route matched. Check detected board / target / shield settings."
                } else {
                    "beamSolve found ${output.results.size} route(s)."
                }
                emit()
            }
        }
    }

    fun cancelSolve() { solveToken++; isSolving = false; needsSolve = true; lastMessage = "Calculation stopped."; emit() }

    fun replaceDetectedBoard(detected: Board) {
        stopReplay()
        manualMode = false
        val source = originalBoard
        val next = detected.copy()
        for (col in 0 until Board.COLS) {
            if (next[Coord(0, col)].orb == null) {
                val preserved = source[Coord(0, col)].copy()
                next[Coord(0, col)] = if (preserved.orb != null) preserved else BoardCell(Orb.fromId(col % 5))
            }
        }
        board = next
        originalBoard = board.copy()
        hasDetectedBoard = true
        refreshTargetFromBoard(board)
        importConfidence = null
        lastMessage = "Screen board detected."
        markDirty()
    }

    fun applyDetectedSolve(detected: Board, confidence: Double, output: SolverEngine.Output, debug: String? = null) {
        stopReplay()
        manualMode = false
        isSolving = false
        needsSolve = false
        board = detected.copy()
        originalBoard = board.copy()
        hasDetectedBoard = true
        refreshTargetFromBoard(board)
        importConfidence = confidence
        results = output.results
        selectedResultIndex = 0
        route = emptyList()
        stats = SolverStats(theoreticalMax = output.theoreticalMax)
        output.results.firstOrNull()?.let { result ->
            board = result.board.copy()
            route = result.path
            updateStats(result.evaluation, result.path.size)
        }
        val suffix = debug?.takeIf { it.isNotBlank() }?.let { " / $it" }.orEmpty()
        lastMessage = if (output.results.isEmpty()) {
            "偵測OK (${"%.0f".format(confidence * 100)}%)，但 beamSolve 0 解；請檢查 combo/步數/解盾/起終點。"
        } else {
            "偵測OK (${"%.0f".format(confidence * 100)}%)，beamSolve 找到 ${output.results.size} 個解。"
        } + suffix
        persist()
        emit()
    }

    fun applyDetectedBoard(detected: Board, confidence: Double, debug: String? = null) {
        stopReplay()
        manualMode = false
        isSolving = false
        needsSolve = true
        board = detected.copy()
        originalBoard = board.copy()
        hasDetectedBoard = true
        editorBoard = board.copy()
        importConfidence = confidence
        results = emptyList()
        selectedResultIndex = 0
        route = emptyList()
        stats = SolverStats()
        refreshTargetFromBoard(board)
        val suffix = debug?.takeIf { it.isNotBlank() }?.let { " / $it" }.orEmpty()
        lastMessage = "Board detected (${"%.0f".format(confidence * 100)}%). Calculating beamSolve..." + suffix
        persist()
        emit()
    }

    fun setStatus(message: String) { lastMessage = message; emit() }

    fun reloadSettings() {
        val saved = persistence.load()
        settings = saved.settings
        rules = saved.rules
        specials.clear()
        specials.addAll(saved.specials.take(3))
        while (specials.size < 3) specials += SpecialPriority()
        syncLegacySettingsFromSpecials()
        emit()
    }

    fun selectResult(index: Int) { results.getOrNull(index)?.let { selectedResultIndex = index; applyResult(it, true) } }

    /** Restore the detected/base board and remove the active solution path. */
    fun clearSolutionPreview() {
        stopReplay()
        selectedResultIndex = -1
        board = originalBoard.copy()
        route = emptyList()
        stats = SolverStats(theoreticalMax = stats.theoreticalMax)
        lastMessage = "Solution preview cleared. Select a result or SEARCH again."
        emit()
    }

    private fun applyResult(result: SolverResult, save: Boolean) {
        stopReplay(); board = result.board.copy(); route = result.path; updateStats(result.evaluation, result.path.size); if (save) persist(); emit()
    }

    fun beginReplay() {
        val result = results.getOrNull(selectedResultIndex) ?: return
        if (result.path.size < 2 || isSolving) return
        stopReplay(); isReplaying = true; replayPaused = false; replayStep = 0; board = replayFrame(result, 0); emit()
        val tick = object : Runnable { override fun run() {
            if (!isReplaying) return
            if (!replayPaused) { replayStep++; board = replayFrame(result, replayStep); emit() }
            if (replayStep >= result.path.lastIndex) { isReplaying = false; board = result.board.copy(); emit() }
            else { replayRunnable = this; main.postDelayed(this, max(15L, (100 - settings.replaySpeed).toLong())) }
        } }
        replayRunnable = tick; main.postDelayed(tick, 60)
    }

    fun toggleReplayPause() { if (isReplaying) { replayPaused = !replayPaused; emit() } }
    fun stopReplay() { replayRunnable?.let { main.removeCallbacks(it) }; replayRunnable = null; if (isReplaying) results.getOrNull(selectedResultIndex)?.let { board = it.board.copy() }; isReplaying = false; replayPaused = false }

    fun beginManual(coord: Coord) {
        if (!manualMode || manualDragging || isSolving || isReplaying || board[coord].orb == null) return
        manualWorking = board.copy(); manualHeld = board[coord].copy(); manualCurrent = coord; manualWorking!![coord] = BoardCell(null); route = listOf(coord); manualDragging = true; manualRemainingTicks = 100
        manualTimer?.let { main.removeCallbacks(it) }
        val timer = object : Runnable { override fun run() { if (!manualDragging) return; manualRemainingTicks--; if (manualRemainingTicks <= 0) { endManual(); lastMessage = "Move time ended." } else main.postDelayed(this, 100) } }
        manualTimer = timer; main.postDelayed(timer, 100); emit()
    }

    fun moveManual(destination: Coord) {
        if (!manualDragging) return
        val current = manualCurrent ?: return; val held = manualHeld ?: return; val working = manualWorking ?: return
        if (destination == current || destination !in BoardEngine.neighbors(current, true)) return
        val target = working[destination]; working[destination] = held; manualHeld = target; manualCurrent = destination; manualWorking = working; route = route + destination; board = SolverEngine.makeFinalBoard(working, target, destination); emit()
    }

    fun endManual() {
        if (!manualDragging) return
        manualTimer?.let { main.removeCallbacks(it) }; manualTimer = null
        val working = manualWorking ?: return; val held = manualHeld ?: return; val current = manualCurrent ?: return
        manualDragging = false; board = SolverEngine.makeFinalBoard(working, held, current); originalBoard = board.copy(); updateStats(BoardEngine.evaluate(board, settings.skyfallEnabled, rules), route.size); persist(); emit()
    }

    fun openEditor() { editorBoard = board.copy(); editorTool = BoardEditorTool.ORB(Orb.WATER) }
    fun editCell(coord: Coord) {
        editorBoard[coord] = when (editorTool.kind) { BoardEditorToolKind.ORB -> BoardCell(editorTool.orb, editorBoard[coord].mark); BoardEditorToolKind.MARK -> editorBoard[coord].copy(mark = editorTool.mark); BoardEditorToolKind.EMPTY -> BoardCell(null) }
        emit()
    }
    fun clearEditorMarks() { editorBoard = editorBoard.map { BoardCell(it.orb) }; emit() }
    fun saveEditor() { board = editorBoard.copy(); originalBoard = board.copy(); markDirty() }
    fun useTemplate(template: Board) { editorBoard = template.copy(); emit() }
    fun importBitmap(bitmap: Bitmap) {
        // Image imports use the same App.jsx crop/template recognizer as the
        // live screen SCAN.  The old native color classifier was a second
        // recognition algorithm and could produce a different 5x6 board.
        val metrics = appContext.resources.displayMetrics
        val saved = persistence.loadBoardRegion(metrics.widthPixels, metrics.heightPixels)
        val region = ScreenBoardRegion(saved.left, saved.top, saved.size, saved.height)
        val boardSnapshot = originalBoard.copy()
        val settingsSnapshot = settings.copy()
        val rulesSnapshot = cloneRules()
        val specialsSnapshot = specials.map { it.copy(equalOrbs = it.equalOrbs.toMutableList()) }
        lastMessage = "Detecting imported image with App.jsx recognition..."
        emit()

        worker.execute {
            val result = SolverEngine.detectBoard(
                bitmap,
                region,
                boardSnapshot,
                settingsSnapshot,
                rulesSnapshot,
                specialsSnapshot
            )
            main.post {
                if (result == null || result.error != null) {
                    lastMessage = result?.error ?: "Image detection failed."
                } else {
                    editorBoard = result.board.copy()
                    hasDetectedBoard = true
                    importConfidence = result.confidence
                    lastMessage = "Imported with ${"%.0f".format(result.confidence * 100)}% confidence. Verify the board."
                }
                emit()
            }
        }
    }

    fun exportGif(onReady: (String?) -> Unit) {
        val source = originalBoard.copy(); val path = route.toList(); val speed = settings.replaySpeed
        worker.execute { val file = GifExporter.export(appContext, source, path, speed); main.post { onReady(file) } }
    }

    fun validationMessage(): String? = rules.requirements.firstOrNull { board.count(it.orb) < it.size * it.count }?.let { "Orb stock may be too small for a requirement." }

    fun persist() { syncLegacySettingsFromSpecials(); persistence.save(board, settings, manualMode, rules, specials) }

    private fun updateStats(evaluation: Evaluation, steps: Int) { stats = stats.copy(combos = evaluation.initialGroups, skyfallCombos = evaluation.skyfallGroups, initialCleared = evaluation.initialCleared, skyfallCleared = evaluation.skyfallCleared, steps = steps, crossCount = evaluation.crossCount, lCount = evaluation.lCount, tCount = evaluation.tCount) }
    private fun resetSearchState() { needsSolve = true; results = emptyList(); route = emptyList(); stats = SolverStats(); persist(); emit() }

    /** Keep the Android target lifecycle identical to App.jsx refreshTarget(). */
    private fun refreshTargetFromBoard(source: Board) {
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
                val orb = orbForTarget(source[Coord(row, col)])
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
        if (settings.row0Enabled) {
            for (col in 0 until Board.COLS) {
                val orb = orbForTarget(source[Coord(0, col)])
                if (orb >= 0) best = max(best, total(orb))
            }
        }
        best = best.coerceAtLeast(1)
        settings.targetCombo = best
        // Keep the user's configured initial-combo target.  The detected
        // board's theoretical maximum is a separate solver target and must
        // not overwrite SET every time SCAN runs.
        stats = stats.copy(theoreticalMax = best)
    }

    private fun emit() { main.post { listener?.invoke() } }
    private fun syncLegacySettingsFromSpecials() {
        val first = specials.firstOrNull() ?: SpecialPriority()
        settings.shieldType = first.type
        settings.shieldCount = first.count.coerceAtLeast(1)
        settings.shieldClearCount = first.clearCount.coerceAtLeast(3)
        settings.shieldOrb = first.orb?.ordinal ?: -1
        settings.shieldRectRows = first.rectRows.coerceIn(2, 5)
        settings.shieldRectCols = first.rectCols.coerceIn(2, 6)
        settings.equalFirstMask = first.equalOrbs.fold(0) { mask, orb -> mask or (1 shl orb.ordinal) }
    }
    private fun cloneRules(): RuleProfile = RuleProfile(rules.orbRules.map { it.copy() }.toMutableList(), rules.requirements.map { it.copy() }.toMutableList())
    private fun replayFrame(result: SolverResult, step: Int): Board { var frame = originalBoard.copy(); val clamped = step.coerceIn(0, result.path.lastIndex); for (index in 1..clamped) { val from = result.path[index - 1]; val to = result.path[index]; val temp = frame[from]; frame[from] = frame[to]; frame[to] = temp }; return frame }
}
