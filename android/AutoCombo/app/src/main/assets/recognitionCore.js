(function () {
  // This file is the Android adapter around App.jsx's recognition functions.
  // The recognition math below intentionally mirrors:
  //   ensureImageLoaded
  //   featureFromImageData
  //   dot
  //   isProbablyEmptyCell
  //   buildTemplateDB
  //   detectFromCroppedCanvas
  // Android-specific code is limited to loading asset/data-url images and
  // returning the result through the NativeBridge.
  const TOTAL_ROWS = 6;
  const PLAY_ROWS_START = 1;
  const PLAY_ROWS = TOTAL_ROWS - PLAY_ROWS_START;
  const COLS = 6;

  const ORB_TYPES = {
    WATER: { id: 0, img: "w.png" },
    FIRE: { id: 1, img: "f.png" },
    EARTH: { id: 2, img: "p.png" },
    LIGHT: { id: 3, img: "l.png" },
    DARK: { id: 4, img: "d.png" },
    HEART: { id: 5, img: "h.png" },
  };

  const RECOGNITION_ORB_TEMPLATES = [
    { id: ORB_TYPES.WATER.id, img: "pad_w.png", key: "pad_water" },
    { id: ORB_TYPES.FIRE.id, img: "pad_f.png", key: "pad_fire" },
    { id: ORB_TYPES.EARTH.id, img: "pad_p.png", key: "pad_earth" },
    { id: ORB_TYPES.LIGHT.id, img: "pad_l.png", key: "pad_light" },
    { id: ORB_TYPES.DARK.id, img: "pad_d.png", key: "pad_dark" },
    { id: ORB_TYPES.HEART.id, img: "pad_h.png", key: "pad_heart" },
  ];

  const ensureImageLoaded = (imgEl) =>
    new Promise((resolve, reject) => {
      if (!imgEl) return reject(new Error("imgEl is null"));
      if (imgEl.complete && imgEl.naturalWidth > 0) return resolve();
      imgEl.onload = () => resolve();
      imgEl.onerror = () => reject(new Error("failed to load template image"));
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load image: ${src}`));
      img.src = src;
    });

  const featureFromImageData = (imgData) => {
    const { data, width, height } = imgData;

    const H_BINS = 18, S_BINS = 5, V_BINS = 5, E_BINS = 4;
    const feat = new Float32Array(H_BINS + S_BINS + V_BINS + E_BINS);
    const gray = new Float32Array(width * height);
    const mask = new Uint8Array(width * height);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    let idx = 0;
    for (let y = 0; y < height; y++) {
      const yn = (y + 0.5) / height;
      for (let x = 0; x < width; x++, idx++) {
        const xn = (x + 0.5) / width;
        if (xn > 0.64 && yn < 0.46) continue;

        const dx = xn - 0.5;
        const dy = yn - 0.52;
        if (dx * dx + dy * dy > 0.3) continue;

        const i = idx * 4;
        const a = data[i + 3] / 255;
        if (a < 0.15) continue;

        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const v = Math.max(r, g, b);
        const m = Math.min(r, g, b);
        const chroma = v - m;
        const s = v > 1e-6 ? chroma / v : 0;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        gray[idx] = lum;
        mask[idx] = 1;

        const colorWeight = clamp01((s - 0.1) / 0.35) * clamp01((v - 0.2) / 0.35);
        if (colorWeight <= 0) continue;

        let h = 0;
        if (chroma > 1e-6) {
          if (v === r) h = ((g - b) / chroma) % 6;
          else if (v === g) h = (b - r) / chroma + 2;
          else h = (r - g) / chroma + 4;
          h *= 60;
          if (h < 0) h += 360;
        }

        const hb = Math.min(H_BINS - 1, Math.floor(h / 360 * H_BINS));
        const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
        const vb = Math.min(V_BINS - 1, Math.floor(v * V_BINS));

        feat[hb] += colorWeight * 2.2;
        feat[H_BINS + sb] += colorWeight * 0.45;
        feat[H_BINS + S_BINS + vb] += colorWeight * 0.35;
      }
    }

    const edgeOffset = H_BINS + S_BINS + V_BINS;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        if (!mask[p] || !mask[p - 1] || !mask[p + 1] || !mask[p - width] || !mask[p + width]) {
          continue;
        }

        const gx = gray[p + 1] - gray[p - 1];
        const gy = gray[p + width] - gray[p - width];
        const mag = Math.min(1, Math.hypot(gx, gy) * 2.2);
        const eb = Math.min(E_BINS - 1, Math.floor(mag * E_BINS));
        feat[edgeOffset + eb] += 0.35;
      }
    }

    let norm = 0;
    for (let i = 0; i < feat.length; i++) norm += feat[i] * feat[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < feat.length; i++) feat[i] /= norm;

    return feat;
  };

  const dot = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  };

  const isProbablyEmptyCell = (imgData) => {
    const { data } = imgData;
    let n = 0;
    let mean = 0, m2 = 0;

    for (let i = 0; i < data.length; i += 16) {
      const a = data[i + 3];
      if (a < 30) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
      const d = y - mean;
      mean += d / n;
      m2 += d * (y - mean);
    }

    if (n < 40) return true;
    const varY = m2 / n;
    return mean < 35 && varY < 120;
  };

  const buildTemplateDB = async (templateSources) => {
    const types = [];
    for (const t of templateSources) {
      types.push({ ...t, imgEl: await loadImage(t.img) });
    }
    await Promise.all(types.map((t) => ensureImageLoaded(t.imgEl || null)));

    const SIZE = 28;
    const cvs = document.createElement("canvas");
    cvs.width = SIZE;
    cvs.height = SIZE;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("template canvas unavailable");

    const db = [];
    for (const t of types) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(t.imgEl, 0, 0, SIZE, SIZE);
      const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
      const feat = featureFromImageData(imgData);
      db.push({ id: t.id, feat, key: t.key || `orb-${t.id}` });
    }
    return { db, size: SIZE };
  };

  let templateCachePromise = null;
  let templateCacheKey = "";

  const getTemplateCache = (overrideSources = null) => {
    const sources = Array.isArray(overrideSources) && overrideSources.length
      ? overrideSources
      : [...Object.values(ORB_TYPES), ...RECOGNITION_ORB_TEMPLATES];
    const key = sources
      .map((source) => `${source.id}:${source.key || ""}:${String(source.img || "").length}`)
      .join("|");

    if (!templateCachePromise || key !== templateCacheKey) {
      templateCacheKey = key;
      templateCachePromise = buildTemplateDB(sources);
    }
    return templateCachePromise;
  };

  const detectFromCroppedCanvas = async (cropCanvas, opts = {}) => {
    const rows = opts.rows ?? PLAY_ROWS;
    const cols = opts.cols ?? COLS;
    const innerPad = opts.innerPad ?? 0.12;
    const sampleSize = opts.sampleSize ?? 28;
    const allowEmpty = !!opts.allowEmpty;
    const allowUnknown = !!opts.allowUnknown;
    const minScore = opts.minScore ?? 0.55;
    const cache = await getTemplateCache(opts.templates || null);

    if (!cache || !cache.db || cache.db.length === 0) {
      throw new Error("template DB not ready");
    }

    const W = cropCanvas.width;
    const H = cropCanvas.height;
    const cellW = W / cols;
    const cellH = H / rows;
    const out = Array.from({ length: rows }, () => Array(cols).fill(0));
    const scores = Array.from({ length: rows }, () => Array(cols).fill(0));

    const tmp = document.createElement("canvas");
    tmp.width = sampleSize;
    tmp.height = sampleSize;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    const cctx = cropCanvas.getContext("2d", { willReadFrequently: true });
    if (!tctx || !cctx) throw new Error("recognition canvas unavailable");

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * cellW;
        const y0 = r * cellH;
        const px = x0 + cellW * innerPad;
        const py = y0 + cellH * innerPad;
        const pw = cellW * (1 - innerPad * 2);
        const ph = cellH * (1 - innerPad * 2);

        tctx.clearRect(0, 0, sampleSize, sampleSize);
        tctx.drawImage(cropCanvas, px, py, pw, ph, 0, 0, sampleSize, sampleSize);
        const imgData = tctx.getImageData(0, 0, sampleSize, sampleSize);

        if (allowEmpty && isProbablyEmptyCell(imgData)) {
          out[r][c] = -1;
          scores[r][c] = 1;
          continue;
        }

        const feat = featureFromImageData(imgData);
        let bestId = cache.db[0].id;
        let bestScore = -1;
        for (let i = 0; i < cache.db.length; i++) {
          const score = dot(feat, cache.db[i].feat);
          if (score > bestScore) {
            bestScore = score;
            bestId = cache.db[i].id;
          }
        }

        scores[r][c] = Math.max(0, Math.min(1, bestScore));
        out[r][c] = allowUnknown && bestScore < minScore ? -1 : bestId;
      }
    }

    const flatScores = scores.flat();
    const confidence = flatScores.reduce((sum, value) => sum + value, 0) /
      Math.max(1, flatScores.length);
    return { board: out, scores, confidence };
  };

  const orbOf = (value) => value < 0 ? -1 : value % 10;
  const xMarkOf = (value) => value < 0 ? 0 : Math.floor(value / 10) % 10;
  const qMarkOf = (value) => value < 0 ? 0 : Math.floor(value / 100) % 10;
  const nMarkOf = (value) => value < 0 ? 0 : Math.floor(value / 1000) % 10;
  const withMarks = (orbId, xMark = 0, qMark = 0, nMark = 0) =>
    orbId + xMark * 10 + qMark * 100 + nMark * 1000;

  // Exact equivalent of App.jsx applyDetectedPlayBoard's board replacement:
  // preserve only the old row0 state; replace row1~row5 with fresh orb values
  // and clear their old X/Q/N marks.
  const buildBoardFromDetection = (inputBoard, detected5x6) => {
    const next = Array.from({ length: TOTAL_ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const existing = inputBoard?.[r]?.[c];
        if (existing == null || orbOf(existing) < 0) {
          return withMarks(r === 0 ? c % 5 : 0, 0, 0, 0);
        }
        return withMarks(
          orbOf(existing),
          xMarkOf(existing),
          qMarkOf(existing),
          nMarkOf(existing)
        );
      })
    );

    for (let r = 0; r < PLAY_ROWS; r++) {
      if (!Array.isArray(detected5x6?.[r]) || detected5x6[r].length < COLS) {
        throw new Error("Recognition result is not a 5x6 board");
      }
      for (let c = 0; c < COLS; c++) {
        const orbId = orbOf(Number(detected5x6[r][c]));
        if (orbId < 0 || orbId > 5) {
          throw new Error(`Recognition failed at row ${r + 1}, col ${c + 1}`);
        }
        next[r + PLAY_ROWS_START][c] = withMarks(orbId, 0, 0, 0);
      }
    }

    return next;
  };

  const solveWithBeam = async (board, input) => {
    const solver = globalThis.autoComboBeamSolve;
    if (typeof solver !== "function") throw new Error("beamSolve is not ready");

    const args = [
      board,
      input.cfg,
      input.target,
      input.mode,
      input.priority,
      input.skyfall,
      input.diagonal,
      input.specials,
      input.initTargetCombo,
      input.row0,
    ];
    if (solver.length >= 11) args.push(input.ruleProfile || null);
    args.push(function (progress) {
      const token = input.progressToken;
      if (!token || !window.NativeBridge?.onProgress || !progress) return;
      try {
        window.NativeBridge.onProgress(
          String(token),
          Math.max(0, Number(progress.current) || 0),
          Math.max(1, Number(progress.max) || 1)
        );
      } catch (_) {}
    });

    let result = solver.apply(globalThis, args);
    if (result && typeof result.then === "function") result = await result;

    // Keep the optional Android target-step objective attached to each
    // candidate before the App.jsx mergeTopSolutions ranking runs.  It is a
    // ranking preference only; beamSolve still returns the best valid route
    // when the exact requested step count is unavailable.
    if (result && input.cfg?.androidTargetStepEnabled === true) {
      const targetStep = Number(input.cfg.androidTargetStep);
      if (Number.isFinite(targetStep) && targetStep >= 1) {
        const decorate = (solution) => solution && typeof solution === "object"
          ? { ...solution, androidTargetStepEnabled: true, androidTargetStep: Math.floor(targetStep) }
          : solution;
        result = {
          ...result,
          topSteps: Array.isArray(result.topSteps) ? result.topSteps.map(decorate) : result.topSteps,
          topCombos: Array.isArray(result.topCombos) ? result.topCombos.map(decorate) : result.topCombos,
        };
      }
    }

    if (typeof globalThis.autoComboEnrichSolveResult === "function") {
      result = globalThis.autoComboEnrichSolveResult(result, board, input.specialSlots || input.specials);
    }

    if (result && typeof globalThis.autoComboMergeTopSolutions === "function") {
      const mode = input.priority === "combo" ? "combo" : "steps";
      const source = mode === "combo" ? result.topCombos : result.topSteps;
      const merged = globalThis.autoComboMergeTopSolutions(
        [], source || [], mode, input.specials || [], input.initTargetCombo,
        input.ruleProfile || null, 10
      );
      result = { ...result };
      if (mode === "combo") result.topCombos = merged;
      else result.topSteps = merged;
    }
    return result;
  };

  const loadCanvasFromDataUrl = async (dataUrl) => {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("source canvas unavailable");
    ctx.drawImage(img, 0, 0);
    return canvas;
  };

  const detectBoardFromInput = async (input) => {
    if (!input || !input.imageDataUrl) throw new Error("missing imageDataUrl");
    const canvas = await loadCanvasFromDataUrl(input.imageDataUrl);
    const detected = await detectFromCroppedCanvas(canvas, {
      rows: PLAY_ROWS,
      cols: COLS,
      innerPad: input.detectInnerPad ?? 0.12,
      sampleSize: input.detectSampleSize ?? 28,
      allowEmpty: false,
      allowUnknown: false,
      minScore: input.detectMinScore ?? 0.55,
      templates: input.templates || null,
    });
    const board = buildBoardFromDetection(input.board, detected.board);
    return { detected, board };
  };

  const detectionResultPayload = ({ detected, board }, input) => ({
    board,
    detected5x6: detected.board,
    confidence: detected.confidence,
    solverSource: globalThis.autoComboSolverSource || "App.jsx",
    nativeDebug: input.nativeDebug || null,
    scores: detected.scores,
  });

  window.autoComboDetectBoard = async function (input, token) {
    try {
      const result = detectionResultPayload(await detectBoardFromInput(input), input);
      if (window.NativeBridge && token != null) {
        window.NativeBridge.onResult(String(token), JSON.stringify(result));
      }
      return JSON.stringify(result);
    } catch (error) {
      const result = { error: String(error?.message || error) };
      if (window.NativeBridge && token != null) {
        window.NativeBridge.onResult(String(token), JSON.stringify(result));
      }
      return JSON.stringify(result);
    }
  };

  window.autoComboDetectAndSolve = async function (input, token) {
    try {
      const detectedResult = await detectBoardFromInput(input);
      const solve = await solveWithBeam(detectedResult.board, input);
      const result = {
        ...detectionResultPayload(detectedResult, input),
        solve,
      };
      if (window.NativeBridge && token != null) {
        window.NativeBridge.onResult(String(token), JSON.stringify(result));
      }
      return JSON.stringify(result);
    } catch (error) {
      const result = { error: String(error?.message || error) };
      if (window.NativeBridge && token != null) {
        window.NativeBridge.onResult(String(token), JSON.stringify(result));
      }
      return JSON.stringify(result);
    }
  };

  window.autoComboRecognitionReady = function () {
    return getTemplateCache().then(() => true);
  };

  window.autoComboDetectAndSolveFromNative = async function (token) {
    try {
      if (!window.NativeBridge?.getInput) throw new Error("NativeBridge.getInput unavailable");
      const input = JSON.parse(window.NativeBridge.getInput(String(token)) || "{}");
      return window.autoComboDetectAndSolve(input, token);
    } catch (error) {
      const result = { error: String(error?.message || error) };
      window.NativeBridge?.onResult?.(String(token), JSON.stringify(result));
      return JSON.stringify(result);
    }
  };

  window.autoComboDetectBoardFromNative = async function (token) {
    try {
      if (!window.NativeBridge?.getInput) throw new Error("NativeBridge.getInput unavailable");
      const input = JSON.parse(window.NativeBridge.getInput(String(token)) || "{}");
      return window.autoComboDetectBoard(input, token);
    } catch (error) {
      const result = { error: String(error?.message || error) };
      window.NativeBridge?.onResult?.(String(token), JSON.stringify(result));
      return JSON.stringify(result);
    }
  };

  // SolverEngine.solve() uses this entry point when the board has already
  // been detected.  Keep it separate from the image path so Android follows
  // the same sequence as App.jsx: prepare the base board, run beamSolve,
  // merge the active Top10 pool, then return the JSON result to Kotlin.
  window.autoComboSolveFromNative = async function (token) {
    try {
      if (!window.NativeBridge?.getInput) throw new Error("NativeBridge.getInput unavailable");
      const input = JSON.parse(window.NativeBridge.getInput(String(token)) || "{}");
      const result = await solveWithBeam(input.board, input);
      const encoded = JSON.stringify(result);
      window.NativeBridge?.onResult?.(String(token), encoded);
      return encoded;
    } catch (error) {
      const result = { error: String(error?.message || error) };
      window.NativeBridge?.onResult?.(String(token), JSON.stringify(result));
      return JSON.stringify(result);
    }
  };
})();
