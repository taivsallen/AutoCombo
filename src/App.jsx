import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toCanvas } from "html-to-image";
import ImportCropModal from "./ImportCropModal";
import GIF from "gif.js.optimized";
import gifWorkerUrl from "gif.js.optimized/dist/gif.worker.js?url";
import gifsicle from "gifsicle-wasm-browser";
import { FileDown, Wrench, Play, Pause, Square, Zap, RefreshCw, Database, Activity, Target, BrainCircuit, Settings2, Sliders, Layers, Microscope, Binary, Timer, Unlink, AlignJustify, AlignCenterVertical, Columns, Rows, RotateCcw, Footprints, Trophy, Edit3, Check, X, Palette, Clock, Settings, Hourglass, Ruler, CloudLightning, MoveUpRight, Move, Lightbulb } from 'lucide-react';

import wImg from './assets/w.png';
import fImg from './assets/f.png';
import pImg from './assets/p.png';
import lImg from './assets/l.png';
import dImg from './assets/d.png';
import hImg from './assets/h.png';
import x1Img from './assets/x1.png';
import x2Img from './assets/x2.png';
import logoImg from './assets/logo.png';

const ORB_TYPES = {
  WATER: { id: 0, img: wImg },
  FIRE: { id: 1, img: fImg },
  EARTH: { id: 2, img: pImg },
  LIGHT: { id: 3, img: lImg },
  DARK: { id: 4, img: dImg },
  HEART: { id: 5, img: hImg },
};
const orbOf = (v) => (v < 0 ? -1 : (v % 10));                // 0~5
const xMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 10) % 10); // 0/1/2 (X)
const qMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 100));     // 0/1/2 (Q)

const withMarks = (orbId, xMark, qMark) => orbId + xMark * 10 + qMark * 100;
const setXMark = (cellVal, xMark) => withMarks(orbOf(cellVal), xMark, qMarkOf(cellVal));
const setQMark = (cellVal, qMark) => withMarks(orbOf(cellVal), xMarkOf(cellVal), qMark);

const TOTAL_ROWS = 6;
const COLS = 6;
const PLAY_ROWS_START = 1; // 0 是暫存列
const PLAY_ROWS = TOTAL_ROWS - PLAY_ROWS_START; // 5

// 定義移動方向
const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const DEFAULT_CONFIG = {
  beamWidth: 440,    
  maxSteps: 30,      
  maxNodes: 50000,  
  stepPenalty: 0,  
  potentialWeight: 10, 
  clearedWeight: 300,
  replaySpeed: 250, 
};

function topKByScore(items, K, getScore) {
  if (K <= 0) return [];
  const heap = []; // min-heap: [score, item]

  const swap = (i, j) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      swap(p, i);
      i = p;
    }
  };
  const down = (i) => {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
  };

  for (const it of items) {
    const s = getScore(it);
    if (heap.length < K) {
      heap.push([s, it]);
      up(heap.length - 1);
    } else if (s > heap[0][0]) {
      heap[0] = [s, it];
      down(0);
    }
  }

  heap.sort((a, b) => b[0] - a[0]); // 由大到小
  return heap.map(x => x[1]);
}

const App = () => {

const manualStartFromRow0Ref = useRef(false);

const moveFlushRAFRef = useRef(0);
const pointerLastClientRef = useRef({ x: 0, y: 0 });

const pendingBoardRef = useRef(null);
const pendingPathRef = useRef(null);
const pendingCurrentStepRef = useRef(-1);
const pendingStepsRef = useRef(0);

const [manualLocked, setManualLocked] = useState(false);
const [showMoveEnded, setShowMoveEnded] = useState(false);
const moveEndedTimerRef = useRef(0);
	
const isDraggingRef = useRef(false);
const pathRef = useRef([]);
const boardRef = useRef([]);
const floatingRAFRef = useRef(0);
const floatingPointRef = useRef({ x: 0, y: 0 });
const timerRAFRef = useRef(0);
const dragStartTimeRef = useRef(0);
const manualEndCalledRef = useRef(false);

// 用來記錄上一次「摸到」的格子座標，避免重複計算
const lastPosRef = useRef({ r: -1, c: -1 });

const handleManualEndRef = useRef(null);

const [isManual, setIsManual] = useState(false); // 模式開關
const [isDragging, setIsDragging] = useState(false); // 是否正在拖拽
const [timeLeft, setTimeLeft] = useState(10); // 剩餘時間
const [maxTime, setMaxTime] = useState(10); // 使用者設定的總時限
const [manualActive, setManualActive] = useState(false); // 轉珠是否已開始
	
  const svgRectRef = useRef(null);
  const [stableCellSize, setStableCellSize] = useState(64);
  const exportTokenRef = useRef({ id: 0, cancelled: false });
  const [gifStage, setGifStage] = useState("capture"); // "capture" | "render"
  const [selectedMark, setSelectedMark] = useState(0); // 0=刷符石, 1=X1, 2=X2, 3=Q1, 4=Q2
  const baseBoardRef = useRef([]);
  const [holePos, setHolePos] = useState(null);
  const rafRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const gifBlobRef = useRef(null);
  
  const [importBusy, setImportBusy] = useState(false);
  const [showImportCrop, setShowImportCrop] = useState(false);
  const [importImgUrl, setImportImgUrl] = useState("");
  const importFileRef = useRef(null);
  
  const [exportingGif, setExportingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState({ cur: 0, total: 0, pct: 0 });
  const [gifReady, setGifReady] = useState({ url: "", name: "" });
  
  const solverCache = useRef(new Map());
  const debounceTimer = useRef(null);
  const replayAnimRef = useRef({ raf: 0, step: 0, t0: 0, from: null, to: null, b: null, held: null });
  useEffect(() => {
	  return () => {
		if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  };
	}, []);
  
  const cellRectsRef = useRef([]);     

  const measureCells = useCallback(() => {
	  const root = boardInnerRef.current;
	  const svg = overlayRef.current;
	  if (!root) return;

	  // ✅ cache svg rect（不要每次 getCellCenterPx 都拿一次）
	  if (svg) svgRectRef.current = svg.getBoundingClientRect();

	  const rects = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));

	  for (let r = 0; r < TOTAL_ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
		  const el = root.querySelector(`[data-cell="${r}-${c}"]`);
		  if (!el) continue;
		  rects[r][c] = el.getBoundingClientRect();
		}
	  }
	  cellRectsRef.current = rects;

	  // ✅ 算一次 cellSize（用 row1 col0 最穩）
	  const r10 = rects?.[1]?.[0];
	  if (r10) setStableCellSize(r10.width);
	}, []);
	
  const [overlay, setOverlay] = useState({ d: "", start: null, tip: null });
  useEffect(() => {
	  measureCells();
	  window.addEventListener('resize', measureCells);
	  window.addEventListener('scroll', measureCells, { passive: true, capture: true });
	  return () => {
		window.removeEventListener('resize', measureCells);
		window.removeEventListener('scroll', measureCells, { capture: true });
	  };
	}, [measureCells]);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
	  const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
	  window.addEventListener('resize', onResize);
	  return () => window.removeEventListener('resize', onResize);
	}, []);
  const overlayRef = useRef(null);
  const gifRef = useRef(null);
  const boardWrapRef = useRef(null);
  const [floating, setFloating] = useState(null);
  const [replayBoard, setReplayBoard] = useState(null);
  const boardInnerRef = useRef(null);
  const [needsSolve, setNeedsSolve] = useState(true);

  const [board, setBoard] = useState([]);
  const [originalBoard, setOriginalBoard] = useState([]);
  const [solving, setSolving] = useState(false);
  const [path, setPath] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stats, setStats] = useState({ 
    combos: 0, 
    skyfallCombos: 0,
    steps: 0, 
    clearedOrbs: 0, 
    theoreticalMax: 0, 
    verticalCombos: 0, 
    horizontalCombos: 0
  });
  const GIF_FOOTER_H = 30;
  const [isReplaying, setIsReplaying] = useState(false);
  
  const [showConfig, setShowConfig] = useState(false);
  const [showBasicSettings, setShowBasicSettings] = useState(true);

  const [solverMode, setSolverMode] = useState('vertical'); 
  const [priorityMode, setPriorityMode] = useState('steps'); 
  const [skyfallEnabled, setSkyfallEnabled] = useState(true);
  const [diagonalEnabled, setDiagonalEnabled] = useState(true); 
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingBoard, setEditingBoard] = useState([]);
  const [selectedBrush, setSelectedBrush] = useState(0);

  const [targetCombos, setTargetCombos] = useState(1);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [gifCaptureMode, setGifCaptureMode] = useState(false);
  
  const updateParam = (key, val) => setConfig(prev => ({ ...prev, [key]: key === 'replaySpeed' ? Math.round(parseFloat(val)) : parseFloat(val) }));
  const renderBoard = replayBoard ?? board;
  const manualHiddenCell =
  isManual && isDragging && floating && path.length > 0
    ? path[path.length - 1]
    : null;
  const replayDone = (!isReplaying && !isPaused && currentStep >= 0);

  const templateCacheRef = useRef({ db: [], ready: false });

  useEffect(() => {
	  let cancelled = false;

	  const prepare = async () => {
		// 1) 為每個 type 建一個 Image 物件
		const types = Object.values(ORB_TYPES);
		for (const t of types) {
		  if (!t.imgEl) {
			const im = new Image();
			im.crossOrigin = "anonymous"; // 本地 assets 一般不影響，但加著保險
			im.src = t.img;
			t.imgEl = im;
		  }
		}

		// 2) 建模板 DB
		await Promise.all(types.map(t => ensureImageLoaded(t.imgEl)));
		const built = await buildTemplateDB(ORB_TYPES);

		if (!cancelled) {
		  templateCacheRef.current = { ...built, ready: true };
		  console.log("[detect] template DB ready:", built.db.map(x => x.id));
		}
	  };

  prepare().catch(err => {
    console.error("[detect] template init failed:", err);
  });

  return () => { cancelled = true; };
}, []);

  const solverConfig = React.useMemo(() => {
	  const { replaySpeed, ...rest } = config; // ✅ 排除播放速度
	  return rest;
	}, [config]);
	

  const refreshTarget = useCallback((newBoard) => {
	  const counts = Array(6).fill(0);

	  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
		  const o = orbOf(newBoard[r][c]);
		  if (o !== -1) counts[o]++;
		}
	  }

	  const base = counts.reduce((acc, x) => acc + Math.floor(x / 3), 0);

	  let best = base;
	  for (let c = 0; c < COLS; c++) {
		const t = orbOf(newBoard[0][c]); // ✅ row0
		let s = 0;
		for (let i = 0; i < 6; i++) {
		  s += Math.floor((counts[i] + (i === t ? 1 : 0)) / 3);
		}
		if (s > best) best = s;
	  }

	  setStats(prev => ({ ...prev, theoreticalMax: best }));
	  setTargetCombos(best);
	}, []);

  const initBoard = useCallback((random = true, providedBoard = null) => {
	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  replayAnimRef.current.raf = 0;

	  setReplayBoard(null);
	  setFloating(null);
	  setHolePos(null);
	  setIsReplaying(false);
	  setIsPaused(false);
	  setCurrentStep(-1);
	  let newBoard = [];
	  if (providedBoard) {
		newBoard = providedBoard;
	  } else if (random) {
		for (let r = 0; r < TOTAL_ROWS; r++) {
		  let row = [];
		  for (let c = 0; c < COLS; c++) {
			row.push(withMarks(Math.floor(Math.random() * 6), 0, 0)); // ✅ 永遠 mark=0
		  }
		  newBoard.push(row);
		}
	  } else {
		// ✅ 固定盤：也統一成 mark=0
		newBoard = [
		  [0,2,3,4,5,1],
		  [2,0,0,2,4,1],
		  [0,5,2,5,0,1],
		  [2,1,2,5,1,2],
		  [5,4,1,0,3,1],
		  [1,1,4,3,5,0],
		].map(row => row.map(v => withMarks(v, 0, 0)));
	  }

	  baseBoardRef.current = newBoard.map(r => [...r]);
	  setBoard(newBoard.map(r => [...r]));
	  setOriginalBoard(newBoard.map(r => [...r]));

	  setPath([]);
	  setCurrentStep(-1);
	  setIsReplaying(false);

	  refreshTarget(newBoard);
	  solverCache.current.clear();
	}, [refreshTarget]);

  useEffect(() => {
		initBoard(false);
	  }, [initBoard]);

  useEffect(() => {
	  if (!showEditor) return;
	  const prev = document.body.style.overflow;
	  document.body.style.overflow = 'hidden';
	  return () => {
		document.body.style.overflow = prev;
	  };
	}, [showEditor]);

  useEffect(() => {
	  if (originalBoard.length === 0) return;
	  if (showEditor) return;
	  setNeedsSolve(true);
	}, [targetCombos, solverConfig, originalBoard, solverMode, priorityMode, skyfallEnabled, diagonalEnabled, showEditor]);
  
  useEffect(() => {
	  return () => {
		setGifReady(prev => {
		  if (prev.url) URL.revokeObjectURL(prev.url);
		  return prev;
		});
	  };
	}, []);

///////////

const flushManualVisual = useCallback(() => {
  moveFlushRAFRef.current = 0;

  if (pendingBoardRef.current) {
    setBoard(pendingBoardRef.current);
  }

  if (pendingPathRef.current) {
    setPath(pendingPathRef.current);
    setCurrentStep(
      typeof pendingCurrentStepRef.current === "number"
        ? pendingCurrentStepRef.current
        : -1
    );
  }

  setStats((prev) => ({
    ...prev,
    steps:
      typeof pendingStepsRef.current === "number"
        ? pendingStepsRef.current
        : prev.steps,
  }));
}, []);

const scheduleManualVisualFlush = useCallback(() => {
  if (moveFlushRAFRef.current) return;
  moveFlushRAFRef.current = requestAnimationFrame(flushManualVisual);
}, [flushManualVisual]);

const getCellFromClientPoint = useCallback(
  (clientX, clientY) => {
    const wrap = boardWrapRef.current;
    if (!wrap) return null;

    const rect = wrap.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const cellSize = stableCellSize || 0;
    if (!cellSize) return null;

    const c = Math.floor(localX / cellSize);
    const rRaw = Math.floor(localY / cellSize);

    if (c < 0 || c >= COLS) return null;
    if (rRaw < 0 || rRaw >= TOTAL_ROWS + 1) return null;

    const r = Math.min(TOTAL_ROWS - 1, rRaw);
    return { r, c };
  },
  [stableCellSize]
);

const traceCellsBetweenPoints = useCallback(
  (x0, y0, x1, y1) => {
    if (
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      return [];
    }

    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);

    const samples = Math.max(1, Math.ceil(dist / 6));
    const cells = [];
    let lastKey = "";

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      const cell = getCellFromClientPoint(x, y);
      if (!cell) continue;

      const key = `${cell.r}-${cell.c}`;
      if (key !== lastKey) {
        cells.push(cell);
        lastKey = key;
      }
    }

    return cells;
  },
  [getCellFromClientPoint]
);

const tryMoveToCell = useCallback(
  (r, c) => {
    if (!isDraggingRef.current || manualLocked) return false;
    if (r < 0 || c < 0 || r >= TOTAL_ROWS || c >= COLS) return false;

    const currentPath = pathRef.current;
    const last = currentPath[currentPath.length - 1];
    if (!last) return false;

    if (last.r === r && last.c === c) return false;

    const dr = Math.abs(last.r - r);
    const dc = Math.abs(last.c - c);

    const isOrthogonal = dr + dc === 1;
    const isDiagonal = dr === 1 && dc === 1;

    if (diagonalEnabled) {
      if (!isOrthogonal && !isDiagonal) return false;
    } else {
      if (!isOrthogonal) return false;
    }

    const currentBoard = boardRef.current;
    if (currentBoard?.[r]?.[c] === undefined) return false;

    const targetOrb = currentBoard[r][c];
    const xMark = xMarkOf(targetOrb);

    if (xMark === 1) return false;

    const lastIsRow0 = last.r === 0;
    const nextIsRow0 = r === 0;
    const startedFromRow0 = manualStartFromRow0Ref.current;

    // case A: 從 row0 起手，離開後不可再回 row0
    if (startedFromRow0 && !lastIsRow0 && nextIsRow0) {
      handleManualEndRef.current?.();
      return false;
    }

    // case D: row0 -> row0 不允許
    if (lastIsRow0 && nextIsRow0) {
      return false;
    }

    // 先更新 path
    const newPath = [...currentPath, { r, c }];
    pathRef.current = newPath;
    pendingPathRef.current = newPath;
    pendingCurrentStepRef.current = newPath.length - 1;
    pendingStepsRef.current = newPath.length - 1;
    lastPosRef.current = { r, c };

    // case B: row0 -> row1~5
	// ✅ 第一次拉下來時，row1~5 該格直接顯示 row0 那顆
	// ✅ 但 row0 本身不變
	if (lastIsRow0 && !nextIsRow0) {
	  const nextBoard = clone2D(currentBoard);

	  // 把目前要進入的格子，覆蓋成 row0 那顆的樣式
	  nextBoard[r][c] = currentBoard[last.r][last.c];

	  boardRef.current = nextBoard;
	  pendingBoardRef.current = nextBoard;

	  scheduleManualVisualFlush();
	  return true;
	}

    // case C: row1~5 -> row0
    // 前一步變成 row0 的樣式，但 row0 不變
    if (!lastIsRow0 && nextIsRow0) {
      const nextBoard = clone2D(currentBoard);

      // 把前一步覆蓋成 row0 的珠
      nextBoard[last.r][last.c] = currentBoard[r][c];

      boardRef.current = nextBoard;
      pendingBoardRef.current = nextBoard;

      scheduleManualVisualFlush();
      handleManualEndRef.current?.();
      return true;
    }

    // case E: row1~5 之間正常交換
    const nextBoard = clone2D(currentBoard);
    const temp = nextBoard[last.r][last.c];
    nextBoard[last.r][last.c] = nextBoard[r][c];
    nextBoard[r][c] = temp;

    boardRef.current = nextBoard;
    pendingBoardRef.current = nextBoard;

    scheduleManualVisualFlush();

    if (xMark === 2) {
      handleManualEndRef.current?.();
    }

    return true;
  },
  [manualLocked, scheduleManualVisualFlush, diagonalEnabled]
);

const triggerMoveEndedOverlay = useCallback(
  (duration = 800) => {
    if (moveEndedTimerRef.current) {
      clearTimeout(moveEndedTimerRef.current);
      moveEndedTimerRef.current = 0;
    }

    setManualLocked(true);
    setShowMoveEnded(true);

    moveEndedTimerRef.current = window.setTimeout(() => {
      setShowMoveEnded(false);
      setTimeLeft(maxTime);
      setManualLocked(false);
      moveEndedTimerRef.current = 0;
    }, duration);
  },
  [maxTime]
);

useEffect(() => {
  boardRef.current = board;
}, [board]);

useEffect(() => {
  pathRef.current = path;
}, [path]);

const flushFloatingPosition = useCallback(() => {
  floatingRAFRef.current = 0;
  const { x, y } = floatingPointRef.current;
  setFloating((prev) => (prev ? { ...prev, x, y, visible: true } : prev));
}, []);

const scheduleFloatingUpdate = useCallback(
  (x, y) => {
    floatingPointRef.current = { x, y };
    if (floatingRAFRef.current) return;
    floatingRAFRef.current = requestAnimationFrame(flushFloatingPosition);
  },
  [flushFloatingPosition]
);

const stopManualTimer = useCallback(() => {
  if (timerRAFRef.current) {
    cancelAnimationFrame(timerRAFRef.current);
    timerRAFRef.current = 0;
  }
}, []);

const startManualTimer = useCallback(() => {
  stopManualTimer();
  dragStartTimeRef.current = performance.now();
  manualEndCalledRef.current = false;

  const tick = (now) => {
    if (!isDraggingRef.current) {
      timerRAFRef.current = 0;
      return;
    }

    const elapsed = (now - dragStartTimeRef.current) / 1000;
    const remain = Math.max(0, maxTime - elapsed);

    setTimeLeft(remain);

    if (remain <= 0) {
      if (!manualEndCalledRef.current) {
        manualEndCalledRef.current = true;
        handleManualEndRef.current?.();
      }
      timerRAFRef.current = 0;
      return;
    }

    timerRAFRef.current = requestAnimationFrame(tick);
  };

  timerRAFRef.current = requestAnimationFrame(tick);
}, [maxTime, stopManualTimer]);

const getBoardLocalPos = (clientX, clientY) => {
  const rect = boardWrapRef.current?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
};

const clearMarksForManual = (board) => {
  return board.map((row) =>
    row.map((cell) => {
      const orb = orbOf(cell);
      const xm = xMarkOf(cell);
      const nextX = xm === 1 ? 0 : xm;
      return withMarks(orb, nextX, 0);
    })
  );
};

const handleToggleMode = (manual) => {
  if (typeof stopToBase === "function") stopToBase(true);

  stopManualTimer();
  isDraggingRef.current = false;
  manualEndCalledRef.current = false;
  pointerLastClientRef.current = null;
  manualStartFromRow0Ref.current = false;

  if (floatingRAFRef.current) {
    cancelAnimationFrame(floatingRAFRef.current);
    floatingRAFRef.current = 0;
  }

  if (moveFlushRAFRef.current) {
    cancelAnimationFrame(moveFlushRAFRef.current);
    moveFlushRAFRef.current = 0;
  }

  if (moveEndedTimerRef.current) {
    clearTimeout(moveEndedTimerRef.current);
    moveEndedTimerRef.current = 0;
  }

  pendingBoardRef.current = null;
  pendingPathRef.current = null;
  pendingCurrentStepRef.current = -1;
  pendingStepsRef.current = 0;

  setShowMoveEnded(false);
  setManualLocked(false);
  setFloating(null);

  setIsManual(manual);

  if (manual) {
    setBoard((prev) => clearMarksForManual(prev));
    setEditingBoard((prev) => clearMarksForManual(prev));
    setPath([]);
    pathRef.current = [];
    lastPosRef.current = { r: -1, c: -1 };
    setCurrentStep(-1);
    setTimeLeft(maxTime);
  } else {
    setPath([]);
    pathRef.current = [];
    setCurrentStep(-1);
  }
};

const handleManualStart = (r, c, e) => {
  if (!isManual || manualLocked || solving || isReplaying) return;

  const currentBoard = boardRef.current;
  const startOrb = currentBoard?.[r]?.[c];
  if (startOrb === undefined) return;

  // 起手不能是 X1 / X2
  if (xMarkOf(startOrb) !== 0) return;

  baseBoardRef.current = clone2D(currentBoard);
  manualStartFromRow0Ref.current = (r === 0);

  isDraggingRef.current = true;
  setIsDragging(true);
  setManualActive(true);
  setTimeLeft(maxTime);

  const startPath = [{ r, c }];
  pathRef.current = startPath;
  setPath(startPath);

  lastPosRef.current = { r, c };
  setCurrentStep(0);

  pendingBoardRef.current = currentBoard;
  pendingPathRef.current = startPath;
  pendingCurrentStepRef.current = 0;
  pendingStepsRef.current = 0;

  setStats((prev) => ({
    ...prev,
    combos: 0,
    skyfallCombos: 0,
    steps: 0,
    clearedOrbs: 0,
    horizontalCombos: 0,
    verticalCombos: 0,
  }));

  let clientX;
  let clientY;

  if (e?.touches?.[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (
    typeof e?.clientX === "number" &&
    typeof e?.clientY === "number"
  ) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    const p = getCellCenterPx(r, c);
    clientX = p.x;
    clientY = p.y;
  }

  pointerLastClientRef.current = { x: clientX, y: clientY };

  const { x, y } = getBoardLocalPos(clientX, clientY);

  setFloating({
    orbId: orbOf(currentBoard[r][c]),
    x,
    y,
    visible: true,
  });

  startManualTimer();
};

const handleManualMove = (r, c, e) => {
  if (!isManual || manualLocked || !isDraggingRef.current) return;

  let clientX;
  let clientY;

  if (e?.touches?.[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (
    typeof e?.clientX === "number" &&
    typeof e?.clientY === "number"
  ) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    return;
  }

  const { x, y } = getBoardLocalPos(clientX, clientY);
  scheduleFloatingUpdate(x, y);

  const prev = pointerLastClientRef.current;
  if (!prev || !Number.isFinite(prev.x) || !Number.isFinite(prev.y)) {
    pointerLastClientRef.current = { x: clientX, y: clientY };
    if (typeof r === "number" && typeof c === "number" && r >= 0 && c >= 0) {
      tryMoveToCell(r, c);
    }
    return;
  }

  const crossedCells = traceCellsBetweenPoints(prev.x, prev.y, clientX, clientY);
  pointerLastClientRef.current = { x: clientX, y: clientY };

  if (crossedCells.length > 0) {
  for (const cell of crossedCells) {
    const ok = tryMoveToCell(cell.r, cell.c);

    // ✅ 如果 sample 出來的格子因為跳格/漏格沒走成功
    // 就改用 chase 一步一步補追
    if (!ok) {
      chaseToTargetCell(cell.r, cell.c);
    }

    if (!isDraggingRef.current) break;
  }
}

// ✅ 不管 crossedCells 有沒有，都再用「目前實際指標所在格」補一次
const liveCell = getCellFromClientPoint(clientX, clientY);
if (liveCell && isDraggingRef.current) {
  const ok = tryMoveToCell(liveCell.r, liveCell.c);
  if (!ok) {
    chaseToTargetCell(liveCell.r, liveCell.c);
  }
} else if (
  typeof r === "number" &&
  typeof c === "number" &&
  r >= 0 &&
  c >= 0 &&
  isDraggingRef.current
) {
  const ok = tryMoveToCell(r, c);
  if (!ok) {
    chaseToTargetCell(r, c);
  }
}
  
};

const handleManualEnd = useCallback(() => {
  if (!isDraggingRef.current || manualLocked) return;

  isDraggingRef.current = false;
  pointerLastClientRef.current = null;

  setIsDragging(false);
  setManualActive(false);
  setFloating(null);

  stopManualTimer();

  if (floatingRAFRef.current) {
    cancelAnimationFrame(floatingRAFRef.current);
    floatingRAFRef.current = 0;
  }

  if (moveFlushRAFRef.current) {
    cancelAnimationFrame(moveFlushRAFRef.current);
    moveFlushRAFRef.current = 0;
  }

  if (pendingBoardRef.current) {
    boardRef.current = pendingBoardRef.current;
    setBoard(pendingBoardRef.current);
  }

  if (pendingPathRef.current) {
    pathRef.current = pendingPathRef.current;
    setPath(pendingPathRef.current);
    setCurrentStep(pendingCurrentStepRef.current);
  }

  const finalBoard = boardRef.current;
  const result = evaluateBoard(finalBoard, skyfallEnabled);

  setStats((prev) => ({
    ...prev,
    steps:
      typeof pendingStepsRef.current === "number"
        ? pendingStepsRef.current
        : prev.steps,
    combos: result.initialCombos,
    skyfallCombos: result.skyfallCombos,
    clearedOrbs: result.clearedCount,
    horizontalCombos: result.horizontalCombos,
    verticalCombos: result.verticalCombos,
  }));

  triggerMoveEndedOverlay(800);
}, [manualLocked, skyfallEnabled, stopManualTimer, triggerMoveEndedOverlay]);

useEffect(() => {
  handleManualEndRef.current = handleManualEnd;
}, [handleManualEnd]);

useEffect(() => {
  return () => {
    stopManualTimer();

    if (floatingRAFRef.current) {
      cancelAnimationFrame(floatingRAFRef.current);
      floatingRAFRef.current = 0;
    }

    if (moveFlushRAFRef.current) {
      cancelAnimationFrame(moveFlushRAFRef.current);
      moveFlushRAFRef.current = 0;
    }

    if (moveEndedTimerRef.current) {
      clearTimeout(moveEndedTimerRef.current);
      moveEndedTimerRef.current = 0;
    }

    pointerLastClientRef.current = null;
    pendingBoardRef.current = null;
    pendingPathRef.current = null;
  };
}, [stopManualTimer]);

const chaseToTargetCell = useCallback(
  (targetR, targetC) => {
    if (!isDraggingRef.current || manualLocked) return false;
    if (targetR < 0 || targetC < 0 || targetR >= TOTAL_ROWS || targetC >= COLS) return false;

    let moved = false;
    let guard = 0;

    while (guard++ < 20) {
      const currentPath = pathRef.current;
      const last = currentPath[currentPath.length - 1];
      if (!last) break;
      if (last.r === targetR && last.c === targetC) break;

      const dr = targetR - last.r;
      const dc = targetC - last.c;

      let stepR = last.r;
      let stepC = last.c;

      if (diagonalEnabled) {
        stepR += dr === 0 ? 0 : dr > 0 ? 1 : -1;
        stepC += dc === 0 ? 0 : dc > 0 ? 1 : -1;
      } else {
        if (Math.abs(dr) >= Math.abs(dc)) {
          stepR += dr === 0 ? 0 : dr > 0 ? 1 : -1;
        } else {
          stepC += dc === 0 ? 0 : dc > 0 ? 1 : -1;
        }
      }

      if (stepR === last.r && stepC === last.c) break;

      const ok = tryMoveToCell(stepR, stepC);
      if (!ok) break;
      moved = true;

      if (!isDraggingRef.current) break;
    }

    return moved;
  },
  [manualLocked, diagonalEnabled, tryMoveToCell]
);

////////////
 
  const onImportClick = () => {
	  console.log("import click", { importBusy, ref: importFileRef.current });
	  if (importBusy || exportingGif || solving || isReplaying || isPaused) return;
	  importFileRef.current?.click();
	};
	
  const onImportFileChange = (e) => {
	  const f = e.target.files?.[0];
	  e.target.value = ""; // 讓同檔可重選
	  if (!f) return;

	  if (importImgUrl) URL.revokeObjectURL(importImgUrl);
	  const url = URL.createObjectURL(f);
	  setImportImgUrl(url);
	  setShowImportCrop(true);
	};

  const resetBasic = () => {
    setTargetCombos(stats.theoreticalMax);
    setConfig(prev => ({ ...prev, replaySpeed: DEFAULT_CONFIG.replaySpeed, maxSteps: DEFAULT_CONFIG.maxSteps }));
	solverCache.current.clear();
  };

  const resetAdvanced = () => {
    setConfig(prev => ({ ...prev, beamWidth: DEFAULT_CONFIG.beamWidth, maxNodes: DEFAULT_CONFIG.maxNodes, stepPenalty: DEFAULT_CONFIG.stepPenalty, potentialWeight: DEFAULT_CONFIG.potentialWeight, clearedWeight: DEFAULT_CONFIG.clearedWeight}));
    solverCache.current.clear();
  };

  const handleOpenEditor = () => {
	  if (isManual) {
		setEditingBoard(clearMarksForManual(board));
	  } else {
		setEditingBoard(board.map((row) => [...row]));
	  }

	  setShowEditor(true);
	};

  const handleApplyCustomBoard = () => {
	  const finalBoard = isManual
		? clearMarksForManual(editingBoard)
		: editingBoard.map((row) => [...row]);

	  setBoard(finalBoard.map((row) => [...row]));
	  setEditingBoard(finalBoard.map((row) => [...row]));
	  baseBoardRef.current = finalBoard.map((row) => [...row]);

	  setShowEditor(false);
	};

  const swapBoard = (tempBoard, r1, c1, r2, c2) => {
  const nextBoard = tempBoard.map(row => [...row]);
  if (r1 === 0 || r2 === 0) return nextBoard; // ✅ Row0 永遠不換
  const val = nextBoard[r1][c1];
  nextBoard[r1][c1] = nextBoard[r2][c2];
  nextBoard[r2][c2] = val;
  return nextBoard;
};

  const dragStep = (board, heldOrb, nr, nc) => {
  const nextBoard = board.map(row => [...row]);
  const temp = nextBoard[nr][nc];
  nextBoard[nr][nc] = heldOrb;
  const nextHeld = temp;
  return { nextBoard, nextHeld };
};

const clone2D = (b) => {
  const len = b.length;
  const copy = new Array(len);
  for (let i = 0; i < len; i++) copy[i] = b[i].slice();
  return copy;
};

// 評分/顯示用：把洞補成「手上那顆 held(startOrb)」
const boardWithHeldFilled = (b, hole, held) => {
  if (!hole) return b;
  const next = clone2D(b);
  next[hole.r][hole.c] = held;
  return next;
};

const holeStepInPlace = (b, hole, toRC) => {
  const moved = b[toRC.r][toRC.c];
  b[hole.r][hole.c] = moved;
  b[toRC.r][toRC.c] = -1;
  return toRC; // new hole
};

// 🚀 搭配 1D toClearMap 的提速版 Gravity
const applyGravity = (b, toClear1D) => {
  const next = clone2D(b);
  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;
    for (let r = TOTAL_ROWS - 1; r >= 1; r--) {
      // 降維讀取: r * COLS + c
      if (!toClear1D[r * COLS + c]) {
        next[writeRow][c] = b[r][c];
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 1; r--) next[r][c] = -1;
  }
  return next;
};

const potentialScore = (b, mode) => {
  let p = 0;
  const hWeight = mode === "horizontal" ? 3 : 0.5;
  const vWeight = mode === "vertical" ? 3 : 0.5;

  // 水平：一次取出 3 格 orb 類型
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    let a = orbOf(b[r][0]);
    let d = orbOf(b[r][1]);
    for (let c = 0; c < COLS - 2; c++) {
      const e = orbOf(b[r][c + 2]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += hWeight;
      }
      a = d;
      d = e;
    }
  }

  // 垂直
  for (let c = 0; c < COLS; c++) {
    let a = orbOf(b[PLAY_ROWS_START][c]);
    let d = PLAY_ROWS_START + 1 < TOTAL_ROWS ? orbOf(b[PLAY_ROWS_START + 1][c]) : -1;
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const e = orbOf(b[r + 2][c]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += vWeight;
      }
      a = d;
      d = e;
    }
  }

  return p;
};

const findMatches = (tempBoard) => {
  let combos = 0,
    clearedCount = 0,
    vC = 0,
    hC = 0;

  const totalCells = TOTAL_ROWS * COLS;
  const isH = new Uint8Array(totalCells);
  const isV = new Uint8Array(totalCells);
  const toClear1D = new Uint8Array(totalCells);

  // ===== 水平三連 =====
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; ) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) {
        c++;
        continue;
      }

      const v1 = orbOf(tempBoard[r][c + 1]);
      const v2 = orbOf(tempBoard[r][c + 2]);
      if (v0 !== v1 || v0 !== v2) {
        c++;
        continue;
      }

      let k = c + 3;
      while (k < COLS && orbOf(tempBoard[r][k]) === v0) k++;

      for (let x = c; x < k; x++) {
        toClear1D[r * COLS + x] = 1;
        isH[r * COLS + x] = 1;
      }
      c = k;
    }
  }

  // ===== 垂直三連 =====
  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; ) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) {
        r++;
        continue;
      }

      const v1 = orbOf(tempBoard[r + 1][c]);
      const v2 = orbOf(tempBoard[r + 2][c]);
      if (v0 !== v1 || v0 !== v2) {
        r++;
        continue;
      }

      let k = r + 3;
      while (k < TOTAL_ROWS && orbOf(tempBoard[k][c]) === v0) k++;

      for (let y = r; y < k; y++) {
        toClear1D[y * COLS + c] = 1;
        isV[y * COLS + c] = 1;
      }
      r = k;
    }
  }

  // ===== BFS 合併 =====
  const visited = new Uint8Array(totalCells);
  const drs = [0, 0, 1, -1];
  const dcs = [1, -1, 0, 0];

  const qR = new Int8Array(totalCells);
  const qC = new Int8Array(totalCells);

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx0 = r * COLS + c;
      if (!toClear1D[idx0] || visited[idx0]) continue;

      combos++;
      const type = orbOf(tempBoard[r][c]);
      let hasHM = false,
        hasVM = false;

      let head = 0,
        tail = 0;
      qR[tail] = r;
      qC[tail] = c;
      tail++;
      visited[idx0] = 1;

      while (head < tail) {
        const cr = qR[head];
        const cc = qC[head];
        head++;
        clearedCount++;

        const idx = cr * COLS + cc;
        if (isH[idx]) hasHM = true;
        if (isV[idx]) hasVM = true;

        for (let i = 0; i < 4; i++) {
          const nr = cr + drs[i],
            nc = cc + dcs[i];
          if (nr >= PLAY_ROWS_START && nr < TOTAL_ROWS && nc >= 0 && nc < COLS) {
            const nidx = nr * COLS + nc;
            if (toClear1D[nidx] && !visited[nidx] && orbOf(tempBoard[nr][nc]) === type) {
              visited[nidx] = 1;
              qR[tail] = nr;
              qC[tail] = nc;
              tail++;
            }
          }
        }
      }

      if (hasHM) hC++;
      if (hasVM) vC++;
    }
  }

  return { combos, clearedCount, vC, hC, toClearMap: toClear1D };
};

const evaluateBoard = (tempBoard, skyfall) => {
  let result = findMatches(tempBoard);
  let initialCombos = result.combos;
  let initialH = result.hC;
  let initialV = result.vC;
  let initialCleared = result.clearedCount;

  if (!skyfall)
    return {
      combos: initialCombos,
      initialCombos,
      skyfallCombos: 0,
      clearedCount: initialCleared,
      verticalCombos: initialV,
      horizontalCombos: initialH,
    };

  let currentBoard = clone2D(tempBoard);
  let totalCombos = initialCombos,
    totalV = initialV,
    totalH = initialH,
    totalCleared = initialCleared;
  let loopResult = result;

  while (loopResult.combos > 0) {
    currentBoard = applyGravity(currentBoard, loopResult.toClearMap);
    loopResult = findMatches(currentBoard);
    if (loopResult.combos > 0) {
      totalCombos += loopResult.combos;
      totalV += loopResult.vC;
      totalH += loopResult.hC;
      totalCleared += loopResult.clearedCount;
    }
  }

  return {
    combos: totalCombos,
    initialCombos,
    skyfallCombos: totalCombos - initialCombos,
    clearedCount: totalCleared,
    verticalCombos: totalV,
    horizontalCombos: totalH,
  };
};

// ✅ 更快更省記憶體的棋盤 key（保持函式名不變）
const getBoardKey = (b) => {
  // 兩個 32-bit hash 合成 BigInt 字串 key（低碰撞、Map key 短）
  let h1 = 2166136261 >>> 0; // FNV-ish
  let h2 = 16777619 >>> 0;

  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = b[r];
    for (let c = 0; c < COLS; c++) {
      const x = (row[c] + 11) ^ ((r + 1) * 131) ^ ((c + 1) * 257);

      h1 ^= x & 0xff;
      h1 = Math.imul(h1, 16777619) >>> 0;

      h2 += x | 0;
      h2 = (h2 ^ (h2 >>> 16)) >>> 0;
      h2 = Math.imul(h2, 2246822507) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
      h2 = Math.imul(h2, 3266489909) >>> 0;
      h2 = (h2 ^ (h2 >>> 16)) >>> 0;
    }
    h1 ^= 0x9e;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= 0x85ebca6b;
    h2 = Math.imul(h2, 2246822507) >>> 0;
  }

  const key = (BigInt(h1) << 32n) ^ BigInt(h2);
  return key.toString();
};

// ✅ 更更提升達標率：未達標評分更「以 miss 為王」，pot 只在接近時才放大
const calcScore = (ev, pot, pathLen, cfg, target, mode, priority) => {
  const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;

  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;

  const effectiveStepPenalty = priority === "steps" ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const clearedW = priority === "combo" ? 1000 : 200;

  // ✅ 達標：你 considerBest 會以「最小步數」決勝
  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return 5200000 - stepCost - overPenalty + ev.clearedCount * clearedW;
  }

  // ✅ 未達標：用 miss 做主導（越接近 target 越高）
  const miss = target - ev.combos;

  // 1) miss 二次懲罰更硬（這是「更更提升準度」的關鍵）
  const missPenalty = -(miss * miss * 320000);

  // 2) 接近 target 給額外獎勵（避免卡在離 target 3~4 的局部最優）
  const nearBonus =
    (target - miss) * 50000 +
    (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);

  // 3) 主方向只在「接近 target」時才提高權重，否則不要干擾達標
  const t = Math.max(0, 1 - miss / Math.max(1, target)); // 0..1
  const majorBonus = major * (1200000 * t * t); // 近 target 才明顯

  // 4) pot 權重：遠離 target 時壓低，接近時放大
  const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);

  // 5) 步數軟扣（不要破壞達標探索）
  const stepSoft = pathLen * 35;

  // 6) cleared 仍有用：同 miss 時偏向「更容易連鎖」的盤面
  const clearedBonus = ev.clearedCount * clearedW;

  return missPenalty + nearBonus + majorBonus + pot * potWeight + clearedBonus - stepSoft;
};

const beamSolve = (originalBoard, cfg, target, mode, priority, skyfall, diagonal) => {
  const makeNode = (parent, r, c) => ({ parent, r, c, len: parent ? parent.len + 1 : 1 });

  const buildPath = (node) => {
    const arr = [];
    for (let cur = node; cur; cur = cur.parent) arr.push({ r: cur.r, c: cur.c });
    arr.reverse();
    return arr;
  };

  const stepsOf = (node) => Math.max(0, (node?.len || 0) - 1);

  const stepConstraint = (cellVal) => {
    const m = xMarkOf(cellVal);
    if (m === 1) return { ok: false, locked: false };
    if (m === 2) return { ok: true, locked: true };
    return { ok: true, locked: false };
  };

  // ✅ 避免 combo 模式把 maxNodes 拉爆造成「像無限迴圈」
  //   仍保留你 maxNodes / maxSteps / beamWidth 的彈性，但把倍率 20 -> 12 (更穩、準度不掉)
  const maxNodesEffective =
    priority === "combo"
      ? Math.max(cfg.maxNodes, cfg.maxSteps * cfg.beamWidth * 12)
      : cfg.maxNodes;

  let q1Pos = null;
  let q2Pos = null;
  for (let rr = 0; rr < TOTAL_ROWS; rr++) {
    for (let cc = 0; cc < COLS; cc++) {
      const q = qMarkOf(originalBoard[rr][cc]);
      if (q === 1) q1Pos = { r: rr, c: cc };
      if (q === 2) q2Pos = { r: rr, c: cc };
    }
  }

  const isAtQ2 = (r, c) => q2Pos && r === q2Pos.r && c === q2Pos.c;
  const shouldAcceptEnd = (endNode) => {
    if (!q2Pos) return true;
    return endNode?.r === q2Pos.r && endNode?.c === q2Pos.c;
  };

  let bestGlobal = {
    combos: -1,
    skyfallCombos: 0,
    clearedCount: -1,
    node: null,
    score: -Infinity,
    verticalCombos: 0,
    horizontalCombos: 0,
  };

  // ✅ 一旦找到達標解，記住目前最小步數；外層 step 到了就可以直接停（保證最小步）
  let bestReachedSteps = Infinity;

  const considerBest = (ev, score, node) => {
    if (!shouldAcceptEnd(node)) return;

    let isBetterGlobal = false;
    const curSteps = stepsOf(node);
    const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;

    if (ev.combos >= target) {
      if (bestGlobal.combos < target) {
        isBetterGlobal = true;
      } else {
        if (curSteps < bestSteps) isBetterGlobal = true;
        else if (curSteps === bestSteps) {
          if (score > bestGlobal.score) isBetterGlobal = true;
          else if (score === bestGlobal.score && ev.clearedCount > bestGlobal.clearedCount)
            isBetterGlobal = true;
        }
      }
    } else {
      if (bestGlobal.combos < target) {
        if (ev.combos > bestGlobal.combos) isBetterGlobal = true;
        else if (ev.combos === bestGlobal.combos) {
          if (curSteps < bestSteps) isBetterGlobal = true;
          else if (curSteps === bestSteps) {
            if (score > bestGlobal.score) isBetterGlobal = true;
            else if (score === bestGlobal.score && ev.clearedCount > bestGlobal.clearedCount)
              isBetterGlobal = true;
          }
        }
      }
    }

    if (isBetterGlobal) bestGlobal = { ...ev, node, score };

    // ✅ 更新最小達標步數（用來早停）
    if (ev.combos >= target && shouldAcceptEnd(node)) {
      if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
    }
  };

  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;
  let beam = [];

  // ✅ visited: dominance / best-record
  // value: [bestCombos, bestMajor, bestCleared, bestNegSteps, bestScore]
  const visitedBest = new Map();
  const betterThanVisited = (key, ev, score, steps, mode) => {
    const prev = visitedBest.get(key);
    const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
    const rec = [ev.combos, major, ev.clearedCount, -steps, score];

    if (!prev) {
      visitedBest.set(key, rec);
      return true;
    }

    // dominance: prev >= rec 全維度 => rec 一定不值得留
    if (
      prev[0] >= rec[0] &&
      prev[1] >= rec[1] &&
      prev[2] >= rec[2] &&
      prev[3] >= rec[3] &&
      prev[4] >= rec[4]
    ) {
      return false;
    }

    // 允許覆蓋：只要 rec 在關鍵序更好（先 combos 再 major/cleared/steps/score）
    let shouldUpdate = false;
    if (rec[0] > prev[0]) shouldUpdate = true;
    else if (rec[0] === prev[0]) {
      if (rec[1] > prev[1]) shouldUpdate = true;
      else if (rec[1] === prev[1]) {
        if (rec[2] > prev[2]) shouldUpdate = true;
        else if (rec[2] === prev[2]) {
          if (rec[3] > prev[3]) shouldUpdate = true;
          else if (rec[3] === prev[3] && rec[4] > prev[4]) shouldUpdate = true;
        }
      }
    }

    if (shouldUpdate) visitedBest.set(key, rec);
    return shouldUpdate;
  };

  const pushInitState = (r, c, heldFromRow0) => {
    if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;

    const boardCopy = clone2D(originalBoard);

    let held;
    let hole = null;

    if (heldFromRow0) {
      held = originalBoard[0][c];
      hole = null;
    } else {
      held = originalBoard[r][c];
      hole = { r, c };
      boardCopy[r][c] = -1;
    }

    const heldMark = xMarkOf(held);
    if (heldMark === 1) return;
    const locked0 = heldMark === 2;

    const evalBoard = boardWithHeldFilled(boardCopy, hole, held);
    const ev = evaluateBoard(evalBoard, skyfall);
    const pot = potentialScore(evalBoard, mode);
    const score = calcScore(ev, pot, 0, cfg, target, mode, priority);

    const key = `${getBoardKey(boardCopy)}|${held}|${r},${c}|${locked0 ? 1 : 0}`;
    if (!betterThanVisited(key, ev, score, 0, mode)) return;

    const node = makeNode(null, r, c);
    considerBest(ev, score, node);

    if (ev.combos >= target && shouldAcceptEnd(node)) return;

    beam.push({ board: boardCopy, held, hole, r, c, node, score, ev, pot, locked: locked0 });
  };

  for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) pushInitState(r, c, false);
  }

  let nodesExpanded = 0;

  // ✅ combo 模式挑 beam：固定配額 + 單次掃描（不會洗牌，不會「像無限迴圈」）
  const pickBeamCombo = (candidates) => {
    candidates.sort((a, b) => {
      const aReach = a.ev.combos >= target;
      const bReach = b.ev.combos >= target;
      if (aReach !== bReach) return aReach ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return (b.ev.clearedCount || 0) - (a.ev.clearedCount || 0);
    });

    const BW = cfg.beamWidth;
    const out = [];

    // 1) elite 先拿（穩定 exploit）
    const eliteN = Math.min(candidates.length, Math.max(6, (BW / 3) | 0));
    for (let i = 0; i < eliteN && out.length < BW; i++) out.push(candidates[i]);
    if (out.length >= BW) return out;

    // 2) miss 分層配額（保證接近 target 的不被洗掉）
    const maxTier = 8; // ✅ 這裡直接比你之前的 6 再更準，但仍然 O(n) 很便宜
    const tierCount = maxTier + 1;
    const quotaW = [3.0, 2.2, 1.6, 1.1, 0.8, 0.55, 0.4, 0.3, 0.2];

    // 統計每 tier 有多少
    const counts = new Array(tierCount).fill(0);
    for (let i = eliteN; i < candidates.length; i++) {
      const miss = Math.max(0, target - candidates[i].ev.combos);
      if (miss <= maxTier) counts[miss]++;
    }

    let remain = BW - out.length;
    let sumW = 0;
    for (let m = 0; m <= maxTier; m++) if (counts[m] > 0) sumW += quotaW[m];

    const quota = new Array(tierCount).fill(0);
    if (sumW > 0) {
      for (let m = 0; m <= maxTier; m++) {
        if (counts[m] === 0) continue;
        quota[m] = Math.max(1, Math.floor((remain * quotaW[m]) / sumW));
      }
    }

    // 3) 單次掃描把 quota 填滿（含位置多樣性，但「只 skip，不回推」避免洗牌）
    const usedPos = new Set();
    for (const st of out) usedPos.add((st.r << 8) | st.c);

    const took = new Array(tierCount).fill(0);

    // 第一輪：尊重 quota + 位置多樣性（但不回推，不會卡）
    for (let i = eliteN; i < candidates.length && out.length < BW; i++) {
      const st = candidates[i];
      const miss = Math.max(0, target - st.ev.combos);
      if (miss > maxTier) continue;
      if (took[miss] >= quota[miss]) continue;

      const pc = (st.r << 8) | st.c;
      if (usedPos.has(pc)) continue;

      out.push(st);
      usedPos.add(pc);
      took[miss]++;
    }

    // 第二輪：quota 沒填滿就放寬位置限制（補足數量）
    if (out.length < BW) {
      for (let i = eliteN; i < candidates.length && out.length < BW; i++) {
        const st = candidates[i];
        const miss = Math.max(0, target - st.ev.combos);
        if (miss > maxTier) continue;
        if (took[miss] >= quota[miss]) continue;

        out.push(st);
        took[miss]++;
      }
    }

    // 第三輪：仍不足，直接補滿（保證 beam 不變小）
    if (out.length < BW) {
      for (let i = eliteN; i < candidates.length && out.length < BW; i++) out.push(candidates[i]);
    }

    return out.slice(0, BW);
  };

  for (let step = 0; step < cfg.maxSteps; step++) {
    // ✅ 早停：已找到達標解的最小步數，後面不可能更小
    if (bestReachedSteps !== Infinity && step >= bestReachedSteps) break;

    let candidates = [];

    for (const state of beam) {
      if (nodesExpanded > maxNodesEffective) break;
      if (state.locked) continue;

      for (const [dr, dc] of dirsPlay) {
        const nr = state.r + dr;
        const nc = state.c + dc;
        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;

        if (state.node && state.node.parent && nr === state.node.parent.r && nc === state.node.parent.c)
          continue;

        const newNode = makeNode(state.node, nr, nc);
        const newSteps = stepsOf(newNode);

        if (state.r === 0) {
          if (nr !== 1) continue;

          const destVal = state.board[nr][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;
          const nextLocked = chk.locked || isAtQ2(nr, nc);

          const nextBoard = clone2D(state.board);
          nextBoard[nr][nc] = -1;
          const nextHole = { r: nr, c: nc };

          const evalBoard = boardWithHeldFilled(nextBoard, nextHole, state.held);
          const ev = evaluateBoard(evalBoard, skyfall);
          const pot = potentialScore(evalBoard, mode);
          const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);

          const key = `${getBoardKey(nextBoard)}|${state.held}|${nr},${nc}|${nextLocked ? 1 : 0}`;
          if (!betterThanVisited(key, ev, score, newSteps, mode)) continue;

          considerBest(ev, score, newNode);

          if (ev.combos >= target && shouldAcceptEnd(newNode)) {
            nodesExpanded++;
            continue;
          }

          candidates.push({
            board: nextBoard,
            held: state.held,
            hole: nextHole,
            r: nr,
            c: nc,
            node: newNode,
            locked: nextLocked,
            score,
            ev,
            pot,
          });
          nodesExpanded++;
          continue;
        }

        if (state.r >= PLAY_ROWS_START && nr === 0) {
          const destVal = state.board[0][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const evalBoard = boardWithHeldFilled(state.board, state.hole, state.held);
          const ev = evaluateBoard(evalBoard, skyfall);
          const pot = potentialScore(evalBoard, mode);
          const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);

          considerBest(ev, score, newNode);
          continue;
        }

        if (nr < PLAY_ROWS_START || !state.hole) continue;

        const destVal = state.board[nr][nc];
        const chk = stepConstraint(destVal);
        if (!chk.ok) continue;
        const nextLocked = chk.locked || isAtQ2(nr, nc);

        const nextBoard = clone2D(state.board);
        const nextHole = holeStepInPlace(nextBoard, state.hole, { r: nr, c: nc });

        const evalBoard = boardWithHeldFilled(nextBoard, nextHole, state.held);
        const ev = evaluateBoard(evalBoard, skyfall);
        const pot = potentialScore(evalBoard, mode);
        const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);

        const key = `${getBoardKey(nextBoard)}|${state.held}|${nr},${nc}|${nextLocked ? 1 : 0}`;
        if (!betterThanVisited(key, ev, score, newSteps, mode)) continue;

        considerBest(ev, score, newNode);

        if (ev.combos >= target && shouldAcceptEnd(newNode)) {
          nodesExpanded++;
          continue;
        }

        candidates.push({
          board: nextBoard,
          held: state.held,
          hole: nextHole,
          r: nr,
          c: nc,
          node: newNode,
          locked: nextLocked,
          score,
          ev,
          pot,
        });
        nodesExpanded++;
      }
    }

    if (candidates.length === 0 || nodesExpanded > maxNodesEffective) break;

    if (priority === "combo") {
      beam = pickBeamCombo(candidates);
    } else {
      // steps priority：維持你原本的分桶策略
      const buckets = new Map();
      for (const st of candidates) {
        const k =
          (mode === "vertical" ? st.ev.verticalCombos : st.ev.horizontalCombos) * 1000000 +
          st.ev.combos * 1000 +
          st.ev.clearedCount;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(st);
      }
      for (const arr of buckets.values()) arr.sort((a, b) => b.score - a.score);
      const bucketKeys = Array.from(buckets.keys()).sort((a, b) => b - a);

      const newBeam = [];
      let i = 0;
      while (newBeam.length < cfg.beamWidth && bucketKeys.length > 0) {
        const idx = i % bucketKeys.length;
        const arr = buckets.get(bucketKeys[idx]);
        if (arr.length > 0) newBeam.push(arr.shift());
        else bucketKeys.splice(idx, 1);
        i++;
      }
      beam = newBeam;
    }
  }

  bestGlobal.path = buildPath(bestGlobal.node);
  bestGlobal.nodesExpanded = nodesExpanded;
  delete bestGlobal.node;
  return bestGlobal;
};
  const stopToBase = useCallback((clearStep = true) => {
	  // 1) 停動畫
	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  replayAnimRef.current.raf = 0;

	  // 2) 清掉重播狀態
	  setIsReplaying(false);
	  setIsPaused(false);
	  setFloating(null);
	  setReplayBoard(null);
	  setHolePos(null);

	  // 3) ✅ 回到原盤（B版：baseBoardRef）
	  if (baseBoardRef.current?.length) {
		setBoard(baseBoardRef.current.map(r => [...r]));
	  }

	  // 4) Stop 是否要把路徑回到未開始
	  if (clearStep) setCurrentStep(-1);
	}, []);

  const abortGifExport = useCallback(() => {
	  // ✅ 讓正在跑的 exportGif 之後「所有 await 回來」都直接停掉
	  exportTokenRef.current.cancelled = true;

	  if (gifRef.current) {
		try { gifRef.current.abort(); } catch (e) { console.warn("Abort error:", e); }
	  }
	  gifRef.current = null;

	  setExportingGif(false);
	  setGifProgress({ cur: 0, total: 0, pct: 0 });

	  // ✅ 畫面立刻回底盤、停止匯出動畫
	  stopToBase(true);
	}, [stopToBase]);

  const pauseReplay = useCallback(() => {
  if (!isReplaying) return;
  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
  replayAnimRef.current.raf = 0;

  // ✅ 把目前距離累積進 dist0
  const st = replayAnimRef.current;
  if (st.tStart) {
    const elapsed = (performance.now() - st.tStart) / 1000;
    st.dist0 = (st.dist0 || 0) + elapsed * st.pxPerSec;
  }

  setIsPaused(true);
}, [isReplaying]);

  const resumeReplay = useCallback(() => {
  if (!isPaused) return;

  const st = replayAnimRef.current;
  if (!st || !st.pts || !st.targetPath) return;

  setIsPaused(false);
  setIsReplaying(true);

  st.tStart = performance.now();

  const EPS = 1e-4;

  const tick = (now) => {
    const s = replayAnimRef.current;
    const elapsed = (now - s.tStart) / 1000;
    const dist = (s.dist0 || 0) + elapsed * s.pxPerSec;

    const clamped = Math.min(dist, s.total);
    let acc = 0;
    let i = 0;
    while (i < s.segLen.length && acc + s.segLen[i] < clamped) {
      acc += s.segLen[i];
      i++;
    }

    const t =
      s.segLen[i] === 0 ? 1 : (clamped - acc) / s.segLen[i];

    const x =
      s.pts[i].x +
      (s.pts[i + 1].x - s.pts[i].x) * t;

    const y =
      s.pts[i].y +
      (s.pts[i + 1].y - s.pts[i].y) * t;

    setFloating(prev =>
      prev ? { ...prev, x, y, visible: true } : prev
    );

    // =========================
    // 洞模型推進
    // =========================
    while (s.lastNode < i) {
      const nextStep = s.lastNode + 1;
      const currRC = s.targetPath[nextStep];

      // 回到 row0 終止
      if (currRC.r === 0) {
        if (s.hole) {
          const bb = s.b.map(r => [...r]);
          bb[s.hole.r][s.hole.c] = s.held;
          setReplayBoard(bb);
        } else {
          setReplayBoard(s.b.map(r => [...r]));
        }

        setFloating(null);
        setIsReplaying(false);
        setIsPaused(false);
        setCurrentStep(s.targetPath.length - 1);
        s.raf = 0;
        return;
      }

      // 第一次踏入 row1~5
      if (!s.hole) {
        s.hole = { r: currRC.r, c: currRC.c };
        s.b[currRC.r][currRC.c] = -1;
        setHolePos({ ...s.hole });
      } else {
        s.hole = holeStepInPlace(
          s.b,
          s.hole,
          currRC
        );
        setHolePos({ ...s.hole });
      }

      s.lastNode = nextStep;

      setReplayBoard(s.b.map(r => [...r]));
      setCurrentStep(nextStep);
    }

    if (dist >= s.total - EPS) {
		const lastIdx = st.targetPath.length - 1;

  // 🔥 只補「最後一個 step」
  if (st.lastNode < lastIdx) {
    const currRC = st.targetPath[lastIdx];

    if (currRC.r !== 0) {
      if (!st.hole) {
        st.hole = { r: currRC.r, c: currRC.c };
        st.b[currRC.r][currRC.c] = -1;
      } else {
        st.hole = holeStepInPlace(st.b, st.hole, currRC);
      }
    }

    st.lastNode = lastIdx;
  }
      const bb = s.b.map(r => [...r]);
      if (s.hole)
        bb[s.hole.r][s.hole.c] = s.held;

      setReplayBoard(bb);
      setFloating(null);
      setIsReplaying(false);
      setIsPaused(false);
      setCurrentStep(s.targetPath.length - 1);

      s.raf = 0;
      return;
    }

    s.raf = requestAnimationFrame(tick);
  };

  st.raf = requestAnimationFrame(tick);
}, [isPaused]);

  const stopReplay = useCallback((clearPath = false) => {
	  if (replayAnimRef.current.raf) {
		cancelAnimationFrame(replayAnimRef.current.raf);
	  }
	  replayAnimRef.current.raf = 0;

	  setIsReplaying(false);
	  setFloating(null);
	  setReplayBoard(null);
	  setHolePos(null);

	  if (clearPath) {
		setCurrentStep(-1);   // 只有真的要清掉才清
	  }
	}, []);

  const solve = () => {
	//✅ 思考期間不顯示起手高亮
	stopToBase(true);
	setNeedsSolve(false);
    const configHash = JSON.stringify({
  ...solverConfig, // ✅ 不含 replaySpeed
  target: targetCombos,
  mode: solverMode,
  priority: priorityMode,
  skyfall: skyfallEnabled,
  diagonal: diagonalEnabled,
});
    const base = baseBoardRef.current;
	const boardKey = getBoardKey(base) + `|cfg:${configHash}`;
    if (solverCache.current.has(boardKey)) {
      const cached = solverCache.current.get(boardKey);
      setPath(cached.path);
      const steps = cached.path ? cached.path.length - 1 : 0;
      setStats(prev => ({ ...prev, ...cached.stats }));
      return;
    }
    setSolving(true);
    setTimeout(() => {
      const result = beamSolve(base, solverConfig, targetCombos, solverMode, priorityMode, skyfallEnabled, diagonalEnabled);
      const steps = result.path ? result.path.length - 1 : 0;
      const finalStats = { combos: result.initialCombos, skyfallCombos: result.skyfallCombos, steps, clearedOrbs: result.clearedCount, verticalCombos: result.verticalCombos, horizontalCombos: result.horizontalCombos};
      solverCache.current.set(boardKey, { path: result.path, stats: finalStats });
      setPath(result.path);
      setStats(prev => ({ ...prev, ...finalStats }));
      setSolving(false);
	  setNeedsSolve(false);
    }, 50);
  };

  const getCellCenterPx = useCallback((r, c) => {
	  const rc = cellRectsRef.current?.[r]?.[c];
	  const svgRect = svgRectRef.current || overlayRef.current?.getBoundingClientRect();
	  if (!rc || !svgRect) return { x: 0, y: 0 };

	  // ✅ 轉成 SVG 內座標
	  const x = (rc.left + rc.right) / 2 - svgRect.left;
	  const y = (rc.top + rc.bottom) / 2 - svgRect.top;

	  // ✅ 像素對齊：直接消滅 subpixel 抖動
	  return { x: Math.round(x), y: Math.round(y) };
	}, []);

  // footer 文字（每幀可更新）
  const [gifFooter, setGifFooter] = useState({
	  segment: 1,
	  segmentTotal: 1,
	  comboText: "0",
	  step: 0,
	  stepTotal: 0,
	});

  // 依 path 計算「每一步」屬於第幾段 segment（方向改變就 +1）
  // segment: 1..N
  const buildSegmentIndexByStep = (rcPath) => {
	  const n = rcPath?.length || 0;
	  if (n < 2) return { segAt: [1], segTotal: 1 };

	  let seg = 1;
	  const segAt = Array(n).fill(1);

	  let prevDr = rcPath[1].r - rcPath[0].r;
	  let prevDc = rcPath[1].c - rcPath[0].c;

	  segAt[0] = 1;
	  segAt[1] = 1;

	  for (let i = 2; i < n; i++) {
		const dr = rcPath[i].r - rcPath[i - 1].r;
		const dc = rcPath[i].c - rcPath[i - 1].c;

		// 方向改變（含斜轉↔直轉、直↔橫）就算新段
		if (dr !== prevDr || dc !== prevDc) seg++;

		segAt[i] = seg;
		prevDr = dr;
		prevDc = dc;
	  }

	  return { segAt, segTotal: seg };
	};

  const exportGif = useCallback(async () => {
	  // ✅ 開新的一次匯出：換 id、取消旗標歸零
	  const myId = ++exportTokenRef.current.id;
	  exportTokenRef.current.cancelled = false;

	  const isCancelled = () =>
		exportTokenRef.current.cancelled || exportTokenRef.current.id !== myId;

	  try {
		
		setGifReady(prev => {
		  if (prev.url) URL.revokeObjectURL(prev.url);
		  return { url: "", name: "" };
		});
		gifBlobRef.current = null;

		if (!path || path.length < 2) return;

		setExportingGif(true);
		setGifCaptureMode(true);
		setGifStage("capture");

		// 先回到原盤面（避免 replay 狀態干擾）
		stopToBase(true);

		// 讓 React 有時間把畫面穩定下來
		await new Promise(r => setTimeout(r, 80));

		const el = boardInnerRef.current;
		if (!el) return;

		// =========
		// 1) 自動決定 skip
		// =========
		const totalSteps = path.length - 1;

		const maxFrames = 500;
		const skip = Math.max(1, Math.ceil(totalSteps / maxFrames));
		const frameDelay = Math.max(60, config.replaySpeed * skip);
		const { segAt, segTotal } = buildSegmentIndexByStep(path);
		const comboText = `${stats.combos}${stats.skyfallCombos > 0 ? `+${stats.skyfallCombos}` : ""}`;

		setGifFooter({
		  segment: segAt[0] || 1,
		  segmentTotal: segTotal,
		  comboText,
		  step: 0,
		  stepTotal: totalSteps,
		});

		const baseFrames = 1 + Math.floor(totalSteps / skip); 
		// 1 = firstCanvas
		// + floor(totalSteps/skip) = i=skip,2skip,...,<=totalSteps 會被抓到的幀數

		const forceLastFrame = 1; // 你後面固定會 addFrame() 一次（強制最後一步）
		const tailHoldFrame  = 1; // 你後面 lastCanvas 又 addFrame 一次（delay 1500）

		const totalFrames = baseFrames + forceLastFrame + tailHoldFrame;

		setGifProgress({ cur: 0, total: totalFrames, pct: 0 });
		// =========
		// 2) 建立第一步畫面（跟你原本相同）
		// =========
		const base = baseBoardRef.current.map(r => [...r]);
		const start = path[0];
		const held = base[start.r][start.c];

		let b = base.map(r => [...r]);
		let hole = null;

		if (start.r >= PLAY_ROWS_START) {
		  hole = { r: start.r, c: start.c };
		  b[start.r][start.c] = -1;
		  setHolePos({ ...hole });
		} else {
		  setHolePos(null);
		}

		setReplayBoard(b.map(r => [...r]));
		setCurrentStep(0);

		{
		  const p0 = getCellCenterPx(start.r, start.c);
		  setFloating({ orbId: orbOf(held), x: p0.x, y: p0.y, visible: true });
		}

		// 等 DOM 更新
		await new Promise(r => requestAnimationFrame(() => r()));
		await new Promise(r => requestAnimationFrame(() => r())); // 多等一幀更穩

		// =========
		// 3) foreignObject 截圖：固定輸出尺寸，避免擠壓
		// =========
		// const rect0 = el.getBoundingClientRect(); // 你沒用到可以刪掉

		const W = el.offsetWidth;
		const H = el.offsetHeight;

		const pixelRatio = 1;

		const captureOpts = {
		  backgroundColor: null,
		  cacheBust: true,
		  width: W,
		  height: H,
		  pixelRatio,
		};

		const bumpProgress = (forceCur = null) => {
		  setGifProgress(prev => {
			const total = prev.total || 1;
			const nextCur =
			  forceCur !== null
				? Math.min(forceCur, total)
				: Math.min((prev.cur || 0) + 1, total);

			const pct = Math.round((nextCur / total) * 100);
			return { ...prev, cur: nextCur, pct };
		  });
		};

		// ✅ 這個用來「不再抓圖」直接多加 3 偵
		let lastCanvas = null;

		// 先截第一幀，用它決定 GIF 固定像素尺寸
		const firstCanvas = await toCanvas(el, captureOpts);
		lastCanvas = firstCanvas;

		const gif = new GIF({
		  workers: 2,
		  quality: 40,
		  dither: false,
		  workerScript: gifWorkerUrl,
		  width: firstCanvas.width,
		  height: firstCanvas.height,
		});

		gifRef.current = gif;

		gif.addFrame(firstCanvas, { delay: frameDelay, copy: true });
		bumpProgress();

		const addFrame = async () => {
		  if (isCancelled()) return;

		  await new Promise(r => requestAnimationFrame(() => r()));
		  if (isCancelled()) return;

		  const canvas = await toCanvas(el, captureOpts);
		  if (isCancelled()) return;

		  if (canvas.width !== firstCanvas.width || canvas.height !== firstCanvas.height) {
			console.warn("Skip frame due to size mismatch:", canvas.width, canvas.height);
			return;
		  }

		  lastCanvas = canvas; // ✅ 記住最後一張（用來尾端多加偵）

		  gif.addFrame(canvas, { delay: frameDelay, copy: true });
		  if (!isCancelled()) bumpProgress();
		};

		// =========
		// 4) 推進步驟 + 擷取
		// =========
		for (let i = 1; i < path.length; i++) {
		  if (isCancelled()) return;
		  const currRC = path[i];

		  if (currRC.r === 0) {
			if (hole) b[hole.r][hole.c] = held;

			setReplayBoard(b.map(r => [...r]));
			setHolePos(null);
			setFloating(null);
			setCurrentStep(i);

			await new Promise(r => requestAnimationFrame(() => r()));
			await addFrame();
			break;
		  }

		  if (!hole) {
			hole = { r: currRC.r, c: currRC.c };
			b[currRC.r][currRC.c] = -1;
		  } else {
			const moved = b[currRC.r][currRC.c];
			b[hole.r][hole.c] = moved;
			b[currRC.r][currRC.c] = -1;
			hole = { r: currRC.r, c: currRC.c };
		  }

		  setReplayBoard(b.map(r => [...r]));
		  setHolePos({ ...hole });
		  setCurrentStep(i);

		  {
			const pi = getCellCenterPx(currRC.r, currRC.c);
			setFloating(prev => (prev ? { ...prev, x: pi.x, y: pi.y, visible: true } : prev));
		  }

		  await new Promise(r => requestAnimationFrame(() => r()));
		  if (isCancelled()) return;

		  if (i % skip === 0 || i === path.length - 1) {
			// ✅ 更新 footer（segment/step）
			 setGifFooter(prev => ({
			  ...prev,
			  segment: segAt[i] || prev.segment || 1,
			  step: i,
			}));

			// ✅ 等 footer DOM 真的更新再截（保險兩幀）
			await new Promise(r => requestAnimationFrame(r));
			await new Promise(r => requestAnimationFrame(r));

			await addFrame();
			if (isCancelled()) return;
		  }
		}
		
		// ✅ 強制最後一步的 footer + 截一張，確保顯示 step=totalSteps
		setGifFooter(prev => ({
		  ...prev,
		  segment: segAt[totalSteps] || prev.segment || 1,
		  step: totalSteps,
		}));
		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => requestAnimationFrame(r));
		await addFrame(); // 這張會變成真正的 lastCanvas

		// ✅ 最後一幀都加完了，強制顯示 12/12（100%）
		bumpProgress(totalFrames);

		// ✅ 不再抓圖：直接把最後一張 canvas 重複加 3 偵
		if (lastCanvas) {
			if (isCancelled()) return;
			gif.addFrame(lastCanvas, { delay: 1500, copy: true });
		}

		// ✅ 讓 React 有機會把 12/12 畫上去（哪怕一瞬間）
		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => setTimeout(r, 60));

		if (isCancelled()) return;

		// ✅ 進入「合成 GIF...」階段
		setGifStage("render");
		await new Promise(r => requestAnimationFrame(r));

		// =========
		// 5) render GIF
		// =========
		const blob = await new Promise((resolve, reject) => {
		  gif.on("finished", resolve);
		  gif.on("abort", () => reject(new Error("GIF render aborted")));
		  gif.render();
		});

		if (isCancelled()) return;

		gifBlobRef.current = blob;
		const url = URL.createObjectURL(blob);

		if (isCancelled()) {
		  URL.revokeObjectURL(url);
		  return;
		}

		setGifReady({ url, name: `tos_replay_${totalSteps}steps_skip${skip}.gif` });

		stopToBase(true);
	  } catch (e) {
			// ✅ 使用者按終止/取消：不要當錯誤，不要 alert
			  const msg = String(e?.message || e || "");
			  if (exportTokenRef.current.cancelled || /aborted|abort/i.test(msg)) {
				console.log("GIF export cancelled:", e);
				stopToBase(true);
				return;
			  }

			  console.error(e);
			  alert("GIF 輸出失敗，請看 Console: " + (e?.message || e));
			  stopToBase(true);
	  } finally {
		// ✅ 只有「這次匯出」還是最新那次，才去收尾 UI
		const stillMine = exportTokenRef.current.id === myId;
		if (stillMine) {
		  gifRef.current = null;
		  setExportingGif(false);
		  setGifProgress({ cur: 0, total: 0, pct: 0 });
		  setGifStage("capture");
		  setGifCaptureMode(false);
		}
	  }
	}, [path, config.replaySpeed, stopToBase, getCellCenterPx, stats.combos, stats.skyfallCombos]);

  const onGifDownloadClick = useCallback(async () => {
	  const blob = gifBlobRef.current;
	  const url = gifReady?.url;
	  const name = gifReady?.name || "replay.gif";
	  if (!blob && !url) return;

	  // ✅ 只在「手機」才走 share（避免 Windows Chrome 也跳分享面板）
	  const isMobile =
		/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints > 1 && window.matchMedia?.("(pointer: coarse)")?.matches);

	  if (isMobile && blob && navigator.share && navigator.canShare) {
		try {
		  const file = new File([blob], name, { type: "image/gif" });
		  if (navigator.canShare({ files: [file] })) {
			await navigator.share({ files: [file], title: name });
			return; // ✅ 手機 share 成功就結束
		  }
		} catch (e) {
		  // 使用者取消/分享失敗 → fallback 下載
		  console.log("share cancelled/failed:", e);
		}
	  }

	  // ✅ fallback：直接下載（電腦一定走這條）
	  const downloadUrl = url || (blob ? URL.createObjectURL(blob) : "");
	  if (!downloadUrl) return;

	  const a = document.createElement("a");
	  a.href = downloadUrl;
	  a.download = name;
	  a.rel = "noopener";
	  document.body.appendChild(a);
	  a.click();
	  a.remove();

	  // 若是臨時 createObjectURL，回收
	  if (!url && blob) setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
	}, [gifReady?.url, gifReady?.name]);

  const buildPixelPath = (rcPath, startPx = null) => {
    if (!rcPath || rcPath.length < 2) return null;
    const pts = rcPath.map(p => getCellCenterPx(p.r, p.c));
    if (startPx) pts[0] = startPx;
    return pts;
  };

  const cellCenterByRC = (r, c) => {
	  const rc = cellRectsRef.current?.[r]?.[c];
	  if (!rc) return { x: 0, y: 0 };
	  return { x: (rc.left + rc.right) / 2, y: (rc.top + rc.bottom) / 2 };
	};

  const replayPathContinuous = (targetPath = path, startPx = null) => {
	  if (!targetPath || targetPath.length < 2) return;

	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);

	  setIsReplaying(true);
	  setIsPaused(false);
	  setCurrentStep(0);

	  const start = targetPath[0];
	  const base = baseBoardRef.current;

	  const startCell = base[start.r][start.c]; // ✅ 手上那顆永遠固定
	  const startOrbId = orbOf(startCell);
	  let b = base.map(r => [...r]);

	  // ✅ 初始化：起手在 row0，棋盤先不挖洞；洞會在「第一次踏入 row1~5」才出現
	  let hole = null;

	if (start.r >= PLAY_ROWS_START) {
	  hole = { r: start.r, c: start.c };
	  b[start.r][start.c] = -1;
	  setHolePos({ ...hole });
	} else {
	  // ✅ 起手在 row0：一開始沒洞（你的規則）
	  setHolePos(null);
	}

	  setReplayBoard(b);

	  const pts = buildPixelPath(targetPath, startPx);
	  if (!pts || pts.length < 2) return;

	  const segLen = [];
	  let total = 0;
	  for (let i = 0; i < pts.length - 1; i++) {
		const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
		segLen.push(d);
		total += d;
	  }
	  if (total <= 0) return;

	  setFloating({ orbId: startOrbId, x: pts[0].x, y: pts[0].y, visible: true });

	  const totalSteps = targetPath.length - 1;
	  const totalTimeSec = (totalSteps * config.replaySpeed) / 1000;
	  const pxPerSec = total / totalTimeSec;

	  replayAnimRef.current = {
		raf: 0,
		tStart: performance.now(),
		pxPerSec,
		dist0: 0,

		b,
		hole,          // ✅ 洞位置（b 裡面對應 -1）
		held: startCell,// ✅ 永遠固定

		lastNode: 0,
		pts,
		segLen,
		total,
		targetPath,
	  };

	  const EPS = 1e-4;

	  const tick = (now) => {
		const st = replayAnimRef.current;
		const elapsed = (now - st.tStart) / 1000;
		const dist = (st.dist0 || 0) + elapsed * st.pxPerSec;

		// 位置插值
		const clamped = Math.min(dist, st.total);
		let acc = 0;
		let i = 0;
		while (i < st.segLen.length && acc + st.segLen[i] < clamped) {
		  acc += st.segLen[i];
		  i++;
		}
		
		const t = st.segLen[i] === 0 ? 1 : (clamped - acc) / st.segLen[i];
		const x = st.pts[i].x + (st.pts[i + 1].x - st.pts[i].x) * t;
		const y = st.pts[i].y + (st.pts[i + 1].y - st.pts[i].y) * t;
		setFloating(prev => prev ? { ...prev, x, y, visible: true } : prev);

		// ✅ 走過節點就提交「洞滑動」
		while (st.lastNode < i) {
		  const nextStep = st.lastNode + 1;
		  const currRC = st.targetPath[nextStep];

		  // 踏回 row0：終止（先把 held 放回洞）
		  if (currRC.r === 0) {
			if (st.hole) {
			  const bb = st.b.map(r => [...r]);
			  bb[st.hole.r][st.hole.c] = st.held;
			  setReplayBoard(bb);
			} else {
			  setReplayBoard(st.b.map(r => [...r]));
			}
			setFloating(null);
			setIsReplaying(false);
			setIsPaused(false);
			setCurrentStep(st.targetPath.length - 1);
			st.raf = 0;
			return;
		  }

		  // 第一次踏入 row1~5：在那格挖洞（把那顆「抽走」不顯示，洞開始移動）
		  if (!st.hole) {
			st.hole = { r: currRC.r, c: currRC.c };
			st.b[currRC.r][currRC.c] = -1;
			setHolePos({ ...st.hole });
		  } else {
			st.hole = holeStepInPlace(st.b, st.hole, currRC);
			setHolePos({ ...st.hole });
		  }

		  st.lastNode = nextStep;
		  setReplayBoard(st.b.map(r => [...r]));
		  setCurrentStep(nextStep);

		  // ✅ 浮珠永遠不換 orbId（保持 startOrb）
		}

		// 結束：把 held 放到洞，浮珠消失
		if (dist >= st.total - EPS) {
			const lastIdx = st.targetPath.length - 1;

	  // 🔥 只補「最後一個 step」
	  if (st.lastNode < lastIdx) {
		const currRC = st.targetPath[lastIdx];

		if (currRC.r !== 0) {
		  if (!st.hole) {
			st.hole = { r: currRC.r, c: currRC.c };
			st.b[currRC.r][currRC.c] = -1;
		  } else {
			st.hole = holeStepInPlace(st.b, st.hole, currRC);
		  }
		}

		st.lastNode = lastIdx;
	  }
		  const bb = st.b.map(r => [...r]);
		  if (st.hole) bb[st.hole.r][st.hole.c] = st.held;
		  setReplayBoard(bb);

		  setHolePos(null);
		  setFloating(null);
		  setIsReplaying(false);
		  setIsPaused(false);
		  setCurrentStep(st.targetPath.length - 1);
		  st.raf = 0;
		  return;
		}

		st.raf = requestAnimationFrame(tick);
	  };

	  replayAnimRef.current.raf = requestAnimationFrame(tick);
	};

  // =========================
// ✅ Geometry helpers (deduped)
// =========================
const hypot = (x, y) => Math.hypot(x, y);

const q = (v, unit = 0.25) => Math.round(v / unit) * unit;

const lineIntersection = (P, r, Q, s, eps = 1e-9) => {
  // Solve: P + t r intersects Q + u s
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const rxs = cross(r, s);
  if (Math.abs(rxs) < eps) return null;

  const qmp = { x: Q.x - P.x, y: Q.y - P.y };
  const t = cross(qmp, s) / rxs;
  return { x: P.x + r.x * t, y: P.y + r.y * t, t };
};

// ✅ 避免跟你檔案內既有名稱撞到
const isReasonableIntersectionGeom = (hit, refA, refB, maxDist = 96) => {
  if (!hit) return false;
  if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return false;

  const d1 = hypot(hit.x - refA.x, hit.y - refA.y);
  const d2 = hypot(hit.x - refB.x, hit.y - refB.y);

  return d1 <= maxDist && d2 <= maxDist;
};

// Edge keys: undirected + quantized => reverse counts as overlap too
const edgeKey = (a, b) => {
  const ax = q(a.x), ay = q(a.y);
  const bx = q(b.x), by = q(b.y);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
};

const dirKey = (a, b, eps = 1e-6) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const sx = Math.abs(dx) < eps ? 0 : Math.sign(dx);
  const sy = Math.abs(dy) < eps ? 0 : Math.sign(dy);
  return `${sx},${sy}`;
};

const laneOf = (count) => (count === 0 ? 0 : (count % 2 ? (count + 1) / 2 : -(count / 2)));

const dedupePts = (pts, eps = 1e-6) => {
  if (!pts || pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q0 = out[out.length - 1];
    if (hypot(p.x - q0.x, p.y - q0.y) > eps) out.push(p);
  }
  return out;
};

const simplifyPts = (pts, eps = 1e-6) => {
  if (!pts || pts.length < 2) return pts;

  const a = dedupePts(pts, eps);
  if (a.length < 3) return a;

  const out = [a[0]];
  for (let i = 1; i < a.length - 1; i++) {
    const p0 = out[out.length - 1];
    const p1 = a[i];
    const p2 = a[i + 1];

    const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y;

    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;

    if (Math.abs(cross) < eps && dot > 0) continue; // collinear & same dir
    out.push(p1);
  }
  out.push(a[a.length - 1]);
  return out;
};

// =========================
// ✅ Utility wrappers (keep same signature)
// =========================
const getCellCenter = (p) => {
  const { x, y } = getCellCenterPx(p.r, p.c);
  return { x, y };
};

// =========================
// ✅ v3: collapse overlap runs (prefix or suffix triggers whole-run bump)
// =========================
const collapseUpcomingOverlapRunsV3 = (
  pts,
  {
    prefixMinEdges = 1,
    suffixMinEdges = 1,
    fullMinEdges = 3,
    bump = 14,
    bumpRamp = 14,
    eps = 1e-6,
  } = {}
) => {
  if (!pts || pts.length < 2) return pts;

  const visited = new Set();
  const out = [pts[0]];

  const addRunEdgesToVisited = (fromIdx, toIdx) => {
    for (let k = fromIdx; k < toIdx; k++) visited.add(edgeKey(pts[k], pts[k + 1]));
  };

  const pushBumpWholeRun = (C, A, B, D) => {
    // m = A->B defines run direction
    const mdx = B.x - A.x, mdy = B.y - A.y;
    const mL = hypot(mdx, mdy);
    if (mL <= eps) { out.push(D); return; }

    const ux = mdx / mL, uy = mdy / mL;
    const nx = -uy, ny = ux;

    const rdx = D.x - A.x, rdy = D.y - A.y;
    const rL = hypot(rdx, rdy);
    const h = Math.min(bump, rL * 0.25);

    const fallback = () => {
      const L = Math.max(rL, 1);
      const t = Math.max(2, Math.min(bumpRamp, L * 0.33));
      const bumpIn  = { x: A.x + (rdx / L) * t + nx * h, y: A.y + (rdy / L) * t + ny * h };
      const bumpOut = { x: D.x - (rdx / L) * t + nx * h, y: D.y - (rdy / L) * t + ny * h };
      out.push(bumpIn, bumpOut, D);
    };

    // no C / degenerate => fallback bump
    if (!C || rL <= eps) { fallback(); return; }

    // parallel line through A + n*h with direction u
    const P = { x: A.x + nx * h, y: A.y + ny * h };
    const r = { x: ux, y: uy };

    // C2 = line(C->A) ∩ parallel line
    const rCA = { x: A.x - C.x, y: A.y - C.y };
    const hitC = lineIntersection(P, r, C, rCA, 1e-9);

    // D2 = line(B->D) ∩ parallel line
    const rBD = { x: D.x - B.x, y: D.y - B.y };
    const hitD = lineIntersection(P, r, B, rBD, 1e-9);

    if (
      !hitC || !hitD ||
      !isReasonableIntersectionGeom(hitC, C, A) ||
      !isReasonableIntersectionGeom(hitD, B, D)
    ) {
      fallback();
      return;
    }

    out.push({ x: hitC.x, y: hitC.y }, { x: hitD.x, y: hitD.y }, D);
  };

  let i = 0;
  while (i < pts.length - 1) {
    const d = dirKey(pts[i], pts[i + 1], eps);

    // same-direction run: pts[i..j]
    let j = i + 1;
    while (j < pts.length - 1 && dirKey(pts[j], pts[j + 1], eps) === d) j++;

    const edgesCount = j - i;
    const A = pts[i];
    const D = pts[j];

    // prefix overlap count p
    let p = 0;
    while (p < edgesCount && visited.has(edgeKey(pts[i + p], pts[i + p + 1]))) p++;

    // suffix overlap count s
    let s = 0;
    while (s < edgesCount && visited.has(edgeKey(pts[j - 1 - s], pts[j - s]))) s++;

    const fullOverlapped = (p === edgesCount);
    const triggerFull = fullOverlapped && edgesCount >= fullMinEdges;

    const triggerPrefix = (!fullOverlapped) && (p >= prefixMinEdges);
    const triggerSuffix = (!fullOverlapped) && (s >= suffixMinEdges);

    if (triggerFull || triggerPrefix || triggerSuffix) {
      const C = (i > 0) ? pts[i - 1] : null;
      const B = pts[j - 1];
      pushBumpWholeRun(C, A, B, D);

      // mark only the "new" edges (keeps your original behavior)
      const newStart = i + p;
      const newEnd = j - s;
      if (newStart < newEnd) addRunEdgesToVisited(newStart, newEnd);
    } else {
      for (let k = i; k < j; k++) {
        visited.add(edgeKey(pts[k], pts[k + 1]));
        out.push(pts[k + 1]);
      }
    }

    i = j;
  }

  return out;
};

// =========================
// ✅ Optional: convert bump segment into straight detour line (kept signature)
// =========================
const straightenBumpToParallelLine = (C, A, B, D, h, eps = 1e-6) => {
  const abx = B.x - A.x, aby = B.y - A.y;
  const LAB = hypot(abx, aby);
  if (LAB < eps) return null;

  const ux = abx / LAB, uy = aby / LAB;
  const nx0 = -uy, ny0 = ux;

  // choose outward side away from C
  const acx = C.x - A.x, acy = C.y - A.y;
  const side = Math.sign(acx * nx0 + acy * ny0);
  const sign = (side >= 0) ? -1 : 1;
  const nx = nx0 * sign, ny = ny0 * sign;

  const Pn = { x: A.x + nx * h, y: A.y + ny * h };
  const rn = { x: ux, y: uy };

  const rCA = { x: A.x - C.x, y: A.y - C.y };
  const hitC = lineIntersection(Pn, rn, C, rCA, 1e-9);

  const rBD = { x: D.x - B.x, y: D.y - B.y };
  const hitD = lineIntersection(Pn, rn, B, rBD, 1e-9);

  if (
    !hitC || !hitD ||
    !isReasonableIntersectionGeom(hitC, C, A) ||
    !isReasonableIntersectionGeom(hitD, B, D)
  ) return null;

  return {
    C2: { x: hitC.x, y: hitC.y },
    D2: { x: hitD.x, y: hitD.y },
    nx, ny, ux, uy
  };
};

// =========================
// ✅ v2: overlap edges -> ramped detours (kept signature)
// =========================
const deOverlapByRampedDetourV2 = (pts, spacing = 8, ramp = 14, eps = 1e-6) => {
  const clean = dedupePts(pts, eps);
  if (!clean || clean.length < 2) return clean;

  const used = new Map(); // edgeKey -> times seen
  const out = [clean[0]];

  let inRun = false;
  let runStart = null, runEnd = null, runDir = null;
  let runOff = 0, runLen = 0;

  const flushRun = () => {
    if (!inRun) return;

    const a = runStart, b = runEnd;
    const L = runLen;
    const t = Math.max(2, Math.min(ramp, L * 0.33));

    const { ux, uy, nx, ny } = runDir;

    out.push(
      { x: a.x + ux * t + nx * runOff, y: a.y + uy * t + ny * runOff },
      { x: b.x - ux * t + nx * runOff, y: b.y - uy * t + ny * runOff },
      b
    );

    inRun = false;
    runStart = runEnd = runDir = null;
    runOff = 0;
    runLen = 0;
  };

  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];

    const dx = b.x - a.x, dy = b.y - a.y;
    const L = hypot(dx, dy);
    if (L <= eps) continue;

    const k = edgeKey(a, b);
    const cnt = used.get(k) || 0;
    used.set(k, cnt + 1);

    if (cnt === 0) {
      flushRun();
      out.push(b);
      continue;
    }

    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;

    const off = laneOf(cnt) * spacing;

    if (!inRun) {
      inRun = true;
      runStart = a;
      runEnd = b;
      runDir = { ux, uy, nx, ny };
      runOff = off;
      runLen = L;
      continue;
    }

    const sameDir = Math.abs(runDir.ux - ux) < 1e-6 && Math.abs(runDir.uy - uy) < 1e-6;
    const sameOff = Math.abs(runOff - off) < 1e-6;

    if (sameDir && sameOff) {
      runEnd = b;
      runLen += L;
    } else {
      flushRun();
      inRun = true;
      runStart = a;
      runEnd = b;
      runDir = { ux, uy, nx, ny };
      runOff = off;
      runLen = L;
    }
  }

  flushRun();
  return out;
};

// =========================
// ✅ sampling + rounded svg path (kept signature)
// =========================
const sampleAlongPolyline = (pts, spacing = 22, startOffset = 10) => {
  if (!pts || pts.length < 2) return [];

  const segLen = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const L = hypot(dx, dy);
    segLen.push(L);
    total += L;
  }
  if (total <= 1e-6) return [];

  const out = [];
  for (let dist = startOffset; dist < total - startOffset; dist += spacing) {
    let acc = 0, i = 0;
    while (i < segLen.length && acc + segLen[i] < dist) { acc += segLen[i]; i++; }
    if (i >= segLen.length) break;

    const L = segLen[i] || 1;
    const t = (dist - acc) / L;

    const a = pts[i], b = pts[i + 1];
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;

    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    out.push({ x, y, ang });
  }
  return out;
};

const buildPathStringAndMarkersRounded = (pts, radius = 8) => {
  if (!pts || pts.length < 2) return { d: "", start: null, tip: null };

  const dist = (a, b) => hypot(b.x - a.x, b.y - a.y);

  const moveTowards = (from, to, len) => {
    const d = dist(from, to);
    if (d <= 1e-6) return { ...from };
    const t = len / d;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  };

  const cleanPts = simplifyPts(pts);

  const start = cleanPts[0];
  const tip = cleanPts[cleanPts.length - 1];

  let dStr = `M ${start.x} ${start.y}`;

  if (cleanPts.length === 2) {
    dStr += ` L ${tip.x} ${tip.y}`;
    return { d: dStr, start, tip };
  }

  for (let i = 1; i < cleanPts.length - 1; i++) {
    const p0 = cleanPts[i - 1];
    const p1 = cleanPts[i];
    const p2 = cleanPts[i + 1];

    const d01 = dist(p0, p1);
    const d12 = dist(p1, p2);

    const r = Math.max(0, Math.min(radius, d01 * 0.5, d12 * 0.5));
    if (r <= 1e-6) { dStr += ` L ${p1.x} ${p1.y}`; continue; }

    const inPt = moveTowards(p1, p0, r);
    const outPt = moveTowards(p1, p2, r);

    dStr += ` L ${inPt.x} ${inPt.y}`;
    dStr += ` Q ${p1.x} ${p1.y} ${outPt.x} ${outPt.y}`;
  }

  dStr += ` L ${tip.x} ${tip.y}`;
  return { d: dStr, start, tip };
};

// =========================
// ✅ RC path utilities + segment labels (kept signatures)
// =========================
const normalizeRcPath = (rcPath) => {
  if (!rcPath || rcPath.length < 1) return [];
  const out = [rcPath[0]];
  for (let i = 1; i < rcPath.length; i++) {
    const p = rcPath[i], q0 = out[out.length - 1];
    if (p.r !== q0.r || p.c !== q0.c) out.push(p);
  }
  return out;
};

const buildSegmentsFromRcPath = (rcPathRaw) => {
  const rcPath = normalizeRcPath(rcPathRaw);
  if (rcPath.length < 2) return [];

  const segs = [];
  let start = 0;

  const dir = (a, b) => `${Math.sign(b.r - a.r)},${Math.sign(b.c - a.c)}`;

  let d0 = dir(rcPath[0], rcPath[1]);
  for (let i = 1; i < rcPath.length - 1; i++) {
    const d1 = dir(rcPath[i], rcPath[i + 1]);
    if (d1 !== d0) {
      segs.push({ start, end: i });
      start = i;
      d0 = d1;
    }
  }
  segs.push({ start, end: rcPath.length - 1 });
  return segs;
};

const buildSegmentLabelsFromRcPath = (
  rcPathRaw,
  getCellCenterPx,
  {
    labelR = 8,
    pathStroke = 4,
    gap = 1.5,
    alongScale = 0.22,
    cellSize = 64,
    minPxLen = 10,
  } = {}
) => {
  const rcPath = normalizeRcPath(rcPathRaw);
  if (rcPath.length < 2) return [];

  const segs = buildSegmentsFromRcPath(rcPath);
  if (!segs.length) return [];

  const labels = [];
  const off = labelR + pathStroke / 2 + gap;
  const alongBase = Math.max(8, Math.min(18, cellSize * alongScale));

  const usage = new Map();
  const segKey = (A, B) => {
    const k1 = `${A.x},${A.y}|${B.x},${B.y}`;
    const k2 = `${B.x},${B.y}|${A.x},${A.y}`;
    return k1 < k2 ? k1 : k2;
  };

  for (let si = 0; si < segs.length; si++) {
    const { start, end } = segs[si];
    const A = rcPath[start];
    const B = rcPath[end];

    const pA = getCellCenterPx(A.r, A.c);
    const pB = getCellCenterPx(B.r, B.c);

    let dx = pB.x - pA.x, dy = pB.y - pA.y;
    let L = hypot(dx, dy);

    // if weird, take first valid step inside segment
    if (!Number.isFinite(L) || L < 1e-6) {
      let k = start;
      while (k < end && rcPath[k].r === rcPath[k + 1].r && rcPath[k].c === rcPath[k + 1].c) k++;
      if (k < end) {
        const p1 = getCellCenterPx(rcPath[k].r, rcPath[k].c);
        const p2 = getCellCenterPx(rcPath[k + 1].r, rcPath[k + 1].c);
        dx = p2.x - p1.x;
        dy = p2.y - p1.y;
        L = hypot(dx, dy);
      }
    }

    // still degenerate => default horizontal
    if (!Number.isFinite(L) || L < 1e-6) { dx = 1; dy = 0; L = 1; }

    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;

    const mx = (pA.x + pB.x) / 2;
    const my = (pA.y + pB.y) / 2;

    const key = segKey(pA, pB);
    const cnt = usage.get(key) || 0;
    usage.set(key, cnt + 1);
    const lane = laneOf(cnt);

    const LforCalc = Math.max(Math.max(L, minPxLen), 1);
    const alongMax = Math.max(0, LforCalc * 0.45 - (labelR + 2));
    const along = Math.min(alongBase, alongMax);

    labels.push({
      idx: labels.length + 1,
      x: mx + nx * off + ux * (along * lane),
      y: my + ny * off + uy * (along * lane),
    });
  }

  return labels;
};

  // 小工具：確保 <img> 真的載入完成
  const ensureImageLoaded = (imgEl) =>
	  new Promise((resolve, reject) => {
		if (!imgEl) return reject(new Error("imgEl is null"));
		if (imgEl.complete && imgEl.naturalWidth > 0) return resolve();
		imgEl.onload = () => resolve();
		imgEl.onerror = () => reject(new Error("failed to load template image"));
	  });

// 取像素特徵：HSV-ish 直方圖 + 簡單亮度/邊緣資訊（全都很快）
  const featureFromImageData = (imgData) => {
	  const { data, width, height } = imgData;

	  // bins: H(12) + S(6) + V(6) + edge(6) = 30 維
	  const H_BINS = 12, S_BINS = 6, V_BINS = 6, E_BINS = 6;
	  const feat = new Float32Array(H_BINS + S_BINS + V_BINS + E_BINS);

	  // 先做灰階方便算 edge
	  const gray = new Float32Array(width * height);

	  let idx = 0;
	  for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++, idx++) {
		  const i = idx * 4;
		  const r = data[i] / 255;
		  const g = data[i + 1] / 255;
		  const b = data[i + 2] / 255;
		  const a = data[i + 3] / 255;

		  // 透明像素略過（模板圖可能有透明背景）
		  if (a < 0.15) {
			gray[idx] = 0;
			continue;
		  }

		  // brightness / gray
		  const v = Math.max(r, g, b);
		  const m = Math.min(r, g, b);
		  const c = v - m;
		  const s = v > 1e-6 ? (c / v) : 0;

		  // hue
		  let h = 0;
		  if (c > 1e-6) {
			if (v === r) h = ((g - b) / c) % 6;
			else if (v === g) h = (b - r) / c + 2;
			else h = (r - g) / c + 4;
			h = (h * 60);
			if (h < 0) h += 360;
		  }

		  // histogram
		  const hb = Math.min(H_BINS - 1, Math.floor(h / 360 * H_BINS));
		  const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
		  const vb = Math.min(V_BINS - 1, Math.floor(v * V_BINS));

		  feat[hb] += 1;
		  feat[H_BINS + sb] += 1;
		  feat[H_BINS + S_BINS + vb] += 1;

		  // 灰階 (感知亮度)
		  gray[idx] = (0.2126 * r + 0.7152 * g + 0.0722 * b);
		}
	  }

	  // edge histogram (簡單 Sobel-ish，用差分近似)
	  // 用來區分圖案結構，提升準度
	  let eCount = 0;
	  for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
		  const p = y * width + x;
		  const gx = (gray[p + 1] - gray[p - 1]);
		  const gy = (gray[p + width] - gray[p - width]);
		  const mag = Math.min(1, Math.hypot(gx, gy) * 2.2); // 放大一點
		  const eb = Math.min(E_BINS - 1, Math.floor(mag * E_BINS));
		  feat[H_BINS + S_BINS + V_BINS + eb] += 1;
		  eCount++;
		}
	  }

	  // normalize (L2)
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

// 判斷一格是不是「幾乎全黑/空」：避免被硬比到某顆符石
  const isProbablyEmptyCell = (imgData) => {
	  const { data } = imgData;
	  let n = 0;
	  let mean = 0, m2 = 0;

	  // 取樣（每 4px 取一次）
	  for (let i = 0; i < data.length; i += 16) {
		const a = data[i + 3];
		if (a < 30) continue;
		const r = data[i], g = data[i + 1], b = data[i + 2];
		const y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
		n++;
		const d = y - mean;
		mean += d / n;
		m2 += d * (y - mean);
	  }
	  if (n < 40) return true; // 幾乎全透明/全空

	  const varY = m2 / n;
	  // 你盤面背景通常偏暗且變化小（黑格/空格）
	  return (mean < 35 && varY < 120);
	};

// 建立模板庫（用你 ORB_TYPES 的圖片）
  const buildTemplateDB = async (ORB_TYPES) => {
	  const types = Object.values(ORB_TYPES);

	  // 確保模板圖都載入
	  await Promise.all(types.map(t => ensureImageLoaded(t.imgEl || null)));

	  const SIZE = 28; // 模板抽樣尺寸（小但夠用）
	  const cvs = document.createElement("canvas");
	  cvs.width = SIZE; cvs.height = SIZE;
	  const ctx = cvs.getContext("2d", { willReadFrequently: true });

	  const db = [];
	  for (const t of types) {
		// t.imgEl：你最好在 ORB_TYPES 裡放一個已載入的 Image 物件
		// 如果你現在 ORB_TYPES 只有 img URL，我下面也提供改法（第 2 節）
		ctx.clearRect(0, 0, SIZE, SIZE);
		ctx.drawImage(t.imgEl, 0, 0, SIZE, SIZE);
		const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
		const feat = featureFromImageData(imgData);
		db.push({ id: t.id, feat });
	  }
	  return { db, size: SIZE };
	};

// 偵測主函式
  const detectFromCroppedCanvas = (cropCanvas, ORB_TYPES, templateCacheRef, opts = {}) => {
	  const rows = opts.rows ?? 5;
	  const cols = opts.cols ?? 6;

	  // innerPad：避開格線/邊框（很重要，會提升準度）
	  const innerPad = opts.innerPad ?? 0.12; // 12% padding
	  const sampleSize = opts.sampleSize ?? 28;

	  const cache = templateCacheRef.current;
	  if (!cache || !cache.db || cache.db.length === 0) {
		throw new Error("template DB not ready");
	  }

	  const W = cropCanvas.width;
	  const H = cropCanvas.height;
	  const cellW = W / cols;
	  const cellH = H / rows;

	  const out = Array.from({ length: rows }, () => Array(cols).fill(0));

	  const tmp = document.createElement("canvas");
	  tmp.width = sampleSize;
	  tmp.height = sampleSize;
	  const tctx = tmp.getContext("2d", { willReadFrequently: true });

	  const cctx = cropCanvas.getContext("2d", { willReadFrequently: true });

	  for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
		  const x0 = c * cellW;
		  const y0 = r * cellH;

		  // 內縮取樣區，避開邊框/格線
		  const px = x0 + cellW * innerPad;
		  const py = y0 + cellH * innerPad;
		  const pw = cellW * (1 - innerPad * 2);
		  const ph = cellH * (1 - innerPad * 2);

		  // draw to small canvas
		  tctx.clearRect(0, 0, sampleSize, sampleSize);
		  tctx.drawImage(cropCanvas, px, py, pw, ph, 0, 0, sampleSize, sampleSize);

		  const imgData = tctx.getImageData(0, 0, sampleSize, sampleSize);

		  // 空格判斷（可選）
		  if (opts.allowEmpty && isProbablyEmptyCell(imgData)) {
			out[r][c] = -1;
			continue;
		  }

		  const feat = featureFromImageData(imgData);

		  // 比對模板（cosine: 因為特徵已 L2 normalize，所以 dot 就是 cosine）
		  let bestId = cache.db[0].id;
		  let bestScore = -1;

		  for (let i = 0; i < cache.db.length; i++) {
			const s = dot(feat, cache.db[i].feat);
			if (s > bestScore) {
			  bestScore = s;
			  bestId = cache.db[i].id;
			}
		  }

		  // 可加一道門檻：太不像就當空/未知
		  const minScore = opts.minScore ?? 0.55;
		  if (opts.allowUnknown && bestScore < minScore) {
			out[r][c] = -1; // 或你想用 0 / null
		  } else {
			out[r][c] = bestId;
		  }
		}
	  }

	  return out;
	};
  
  
  
  return (
  <div className="min-h-screen bg-neutral-950 text-white font-sans">
    <div className="sticky top-0 z-[3000] bg-neutral-900/95 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-5xl w-full px-4 py-3 flex items-center justify-between gap-1">
        <div className="flex items-center gap-3">
          <img src={logoImg} className="w-8 h-8" alt="" />
          <h1 className="text-lg md:text-xl font-black tracking-wide">
            Tower of Saviors 神魔之塔｜
            {isManual ? (
              <span className="bg-orange-600 text-white px-2 py-0.5 rounded-md mx-1 shadow-sm">
                手動 Manual
              </span>
            ) : (
              <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md mx-1 shadow-sm">
                自動 Auto
              </span>
            )}
            ｜轉珠模擬器
          </h1>
        </div>

        <div className="flex bg-neutral-800 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => handleToggleMode(false)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
              !isManual
                ? "bg-indigo-600 text-white"
                : "text-neutral-500 hover:bg-neutral-700"
            }`}
          >
            自動
          </button>
          <button
            onClick={() => handleToggleMode(true)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
              isManual
                ? "bg-orange-600 text-white"
                : "text-neutral-500 hover:bg-neutral-700"
            }`}
          >
            手動
          </button>
        </div>
      </div>
    </div>

    <div className="mx-auto max-w-5xl w-full px-2 sm:px-4 py-4 flex-col items-center">
      {!isManual ? (
        <div className="grid grid-cols-6 gap-1.5 mb-8 text-[14px]">
          <div className="col-span-2 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
            <button
              onClick={() => setSolverMode("horizontal")}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
                solverMode === "horizontal"
                  ? "bg-blue-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              <Rows size={14} /> 橫排
            </button>
            <button
              onClick={() => setSolverMode("vertical")}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
                solverMode === "vertical"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              直排 <Columns size={14} />
            </button>
          </div>

          <div className="col-span-2 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
            <button
              onClick={() => setPriorityMode("combo")}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
                priorityMode === "combo"
                  ? "bg-emerald-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              <Trophy size={14} /> 消除
            </button>
            <button
              onClick={() => setPriorityMode("steps")}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
                priorityMode === "steps"
                  ? "bg-amber-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              步數 <Footprints size={14} />
            </button>
          </div>

          <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
            <button
              onClick={() => setSkyfallEnabled(!skyfallEnabled)}
              className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${
                skyfallEnabled
                  ? "bg-purple-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              疊珠 <CloudLightning size={14} />
            </button>
          </div>

          <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
            <button
              onClick={() => setDiagonalEnabled(!diagonalEnabled)}
              className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${
                diagonalEnabled
                  ? "bg-rose-600 text-white"
                  : "text-neutral-500 hover:bg-neutral-800"
              }`}
            >
              斜轉{" "}
              {diagonalEnabled ? <MoveUpRight size={14} /> : <Move size={14} />}
            </button>
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="max-w-5xl w-full">
        <div className="flex flex-row gap-2 mb-4 w-full items-stretch">
          {!isManual && (
            <div className="flex-1 min-w-0 bg-neutral-900/50 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
              <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
                上限
              </span>
              <span className="text-xl font-black text-white/40 w-full text-center leading-none">
                {stats.theoreticalMax}
              </span>
            </div>
          )}

          <div className="flex-[1.2] min-w-0 bg-blue-900/20 p-2.5 rounded-xl border border-blue-500/30 ring-1 ring-blue-500/20 flex flex-col items-center justify-center space-y-1">
            <span className="text-xs text-blue-400 font-bold uppercase truncate w-full text-center leading-none">
              總消除
            </span>
            <span className="text-xl font-black text-blue-400 w-full text-center leading-none">
              {stats.combos}
              {stats.skyfallCombos > 0 ? `+${stats.skyfallCombos}` : ""}
            </span>
          </div>

          <div className="flex-[1.5] min-w-0 bg-indigo-900/20 p-2.5 rounded-xl border border-indigo-500/30 ring-1 ring-blue-500/20 flex flex-col items-center justify-center">
            {isManual ? (
              <div className="flex w-full items-center justify-center">
                <div className="flex-1 flex flex-col items-center min-w-0 space-y-1">
                  <span className="text-xs text-indigo-400/80 font-bold truncate w-full text-center leading-none">
                    橫向
                  </span>
                  <span className="text-xl font-black text-indigo-400 w-full text-center leading-none">
                    {stats.horizontalCombos}
                  </span>
                </div>

                <div className="w-[1px] h-5 bg-indigo-500/20 shrink-0 mx-1" />

                <div className="flex-1 flex flex-col items-center min-w-0 space-y-1">
                  <span className="text-xs text-indigo-400/80 font-bold truncate w-full text-center leading-none">
                    直向
                  </span>
                  <span className="text-xl font-black text-indigo-400 w-full text-center leading-none">
                    {stats.verticalCombos}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-1 w-full">
                <span className="text-xs text-indigo-400 font-bold uppercase truncate w-full text-center leading-none">
                  {solverMode === "horizontal" ? "橫向" : "直向"}
                </span>
                <span className="text-xl font-black text-indigo-400 w-full text-center leading-none">
                  {solverMode === "horizontal"
                    ? stats.horizontalCombos
                    : stats.verticalCombos}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 bg-neutral-900/50 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
            <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
              符石數
            </span>
            <span className="text-xl font-black text-purple-400 w-full text-center leading-none">
              {stats.clearedOrbs}
            </span>
          </div>

          <div className="flex-1 min-w-0 bg-neutral-900/50 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
            <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
              步數
            </span>
            <span className="text-xl font-black text-emerald-400 w-full text-center leading-none">
              {stats.steps}
            </span>
          </div>
        </div>

        <div className="mb-3 bg-neutral-900/80 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
          <div className="w-full p-3 flex items-center justify-between bg-blue-900/10 border-b border-neutral-800">
            <button
              onClick={() => setShowBasicSettings(!showBasicSettings)}
              className="flex items-center gap-2 text-[14px] font-bold text-blue-300 pl-2"
            >
              <Settings size={18} /> {isManual ? "手動設定" : "基本設定與目標"}
            </button>

            <div className="flex items-center gap-3 pr-2">
              <button
                onClick={resetBasic}
                className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-all border border-neutral-700 shadow-sm"
              >
                <RotateCcw size={14} /> 恢復預設
              </button>
              <span
                className="text-xs text-neutral-600 uppercase font-bold cursor-pointer"
                onClick={() => setShowBasicSettings(!showBasicSettings)}
              >
                {showBasicSettings ? "收起" : "展開"}
              </span>
            </div>
          </div>

          {showBasicSettings && (
            <div
              className={`p-4 grid grid-cols-1 gap-6 bg-neutral-900/40 ${
                isManual ? "md:grid-cols-2" : "md:grid-cols-3"
              }`}
            >
              {!isManual && (
                <>
                  <ParamSlider
                    label="🎯 期望目標 Combo"
                    value={targetCombos}
                    min={1}
                    max={stats.theoreticalMax || 1}
                    step={1}
                    onChange={(n) => setTargetCombos(parseInt(n, 10))}
                  />
                  <ParamSlider
                    label="📏 步數上限 (Steps)"
                    value={config.maxSteps}
                    min={5}
                    max={240}
                    step={1}
                    onChange={(n) => updateParam("maxSteps", n)}
                  />
                </>
              )}

              {isManual && (
                <ParamSlider
                  label="⏳ 手動轉珠時間 (秒)"
                  value={maxTime}
                  min={1}
                  max={30}
                  step={0.5}
                  inputMode="decimal"
                  formatInput={(v) => `${v}s`}
                  onChange={(n) => {
                    const newTime = Number(n);
                    setMaxTime(newTime);
                    setTimeLeft(newTime);
                  }}
                />
              )}

              <div>
                <ParamSlider
                  label="⏱️ 播放速度 (s/步)"
                  value={config.replaySpeed / 1000}
                  min={0.08}
                  max={0.45}
                  step={0.01}
                  inputMode="decimal"
                  formatInput={(v) => Number(v).toFixed(2)}
                  onChange={(n) => updateParam("replaySpeed", n * 1000)}
                />
              </div>
            </div>
          )}
        </div>

        {!isManual && (
          <div className="mb-6 bg-neutral-900/80 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
            <div className="w-full p-3 flex items-center justify-between bg-zinc-800/30 border-b border-neutral-800">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center gap-2 text-[14px] font-bold text-neutral-400 pl-2"
              >
                <Settings2 size={18} /> 進階搜尋參數調優
              </button>
              <div className="flex items-center gap-3 pr-2">
                <button
                  onClick={resetAdvanced}
                  className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-all border border-neutral-700 shadow-sm"
                >
                  <RotateCcw size={14} /> 恢復預設
                </button>
                <span
                  className="text-xs text-neutral-600 uppercase font-bold cursor-pointer"
                  onClick={() => setShowConfig(!showConfig)}
                >
                  {showConfig ? "收起" : "展開"}
                </span>
              </div>
            </div>

            {showConfig && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 border-t border-neutral-800 bg-neutral-900/40">
                <ParamSlider
                  label="束寬 (Beam Width)"
                  value={config.beamWidth}
                  min={350}
                  max={700}
                  step={10}
                  inputMode="numeric"
                  formatInput={(v) => String(v)}
                  onChange={(v) => updateParam("beamWidth", Number(v))}
                />

                <ParamSlider
                  label="潛在權重 (Potential)"
                  value={config.potentialWeight}
                  min={0}
                  max={300}
                  step={10}
                  inputMode="numeric"
                  formatInput={(v) => String(v)}
                  onChange={(v) => updateParam("potentialWeight", Number(v))}
                />

                <ParamSlider
                  label="節點上限"
                  value={config.maxNodes}
                  min={50000}
                  max={200000}
                  step={10000}
                  inputMode="numeric"
                  formatInput={(v) => String(v)}
                  onChange={(v) => updateParam("maxNodes", Number(v))}
                />

                <ParamSlider
                  label="達標後步數懲罰"
                  value={config.stepPenalty}
                  min={0}
                  max={800}
                  step={50}
                  inputMode="numeric"
                  formatInput={(v) => String(v)}
                  onChange={(v) => updateParam("stepPenalty", Number(v))}
                />
              </div>
            )}
          </div>
        )}

        {isManual && (
          <div className="mx-auto w-full max-w-[500px] mb-4 px-2">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[10px] font-black text-orange-400 italic tracking-widest">
                TIME REMAINING
              </span>
              <span className="text-xl font-black text-white">
                {timeLeft.toFixed(2)}s
              </span>
            </div>

            <div className="w-full h-2.5 bg-neutral-950 rounded-full border border-white/5 overflow-hidden shadow-inner">
              <div
                className={`h-full ${
                  timeLeft < 3
                    ? "bg-red-500 animate-pulse"
                    : "bg-gradient-to-r from-orange-600 to-amber-400"
                }`}
                style={{
                  width: `${Math.max(0, (timeLeft / maxTime) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div
          ref={boardWrapRef}
          className="relative bg-neutral-900 p-1 rounded-3xl shadow-2xl border-2 border-neutral-800 mb-6 mx-auto w-full max-w-[500px] overflow-visible"
          style={{
            contain: "layout paint",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            msUserSelect: "none",
          }}
          onMouseMove={(e) => {
            if (!isManual || manualLocked || !isDraggingRef.current) return;
            const cell = getCellFromClientPoint(e.clientX, e.clientY);
            if (cell) {
              handleManualMove(cell.r, cell.c, e);
            }
          }}
          onTouchMove={(e) => {
            if (!isManual || manualLocked || !isDraggingRef.current) return;
            e.preventDefault();

            const touch = e.touches[0];
            if (!touch) return;

            const cell = getCellFromClientPoint(touch.clientX, touch.clientY);
            if (cell) {
              handleManualMove(cell.r, cell.c, e);
            }
          }}
          onMouseLeave={() => {
            if (isManual && isDraggingRef.current) {
              lastPosRef.current = { r: -1, c: -1 };
              handleManualEnd();
            }
          }}
          onTouchCancel={() => {
            if (isManual && isDraggingRef.current) {
              lastPosRef.current = { r: -1, c: -1 };
              handleManualEnd();
            }
          }}
        >
          <div ref={boardInnerRef} className="relative overflow-visible">
            <div className="grid grid-cols-6 gap-0">
              {renderBoard.map((row, r) => (
                <React.Fragment key={r}>
                  {!solving && r === 1 && (
                    <div className="overflow-visible col-span-6 h-2 bg-white z-50 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                  )}
				  
				  {row.map((orb, c) => {
  const isMoving =
    !solving &&
    isReplaying &&
    currentStep >= 0 &&
    path[currentStep]?.r === r &&
    path[currentStep]?.c === c;

  const isManualHidden =
    manualHiddenCell &&
    manualHiddenCell.r === r &&
    manualHiddenCell.c === c;

  return (
    <div
      key={`${r}-${c}`}
      data-cell={`${r}-${c}`}
      onMouseDown={(e) => {
        if (isManual && !manualLocked) {
          handleManualStart(r, c, e);
        }
      }}
      onTouchStart={(e) => {
        if (isManual && !manualLocked) {
          handleManualStart(r, c, e);
        }
      }}
      onMouseUp={() => {
        if (isManual) {
          lastPosRef.current = { r: -1, c: -1 };
          handleManualEnd();
        }
      }}
      onTouchEnd={() => {
        if (isManual) {
          lastPosRef.current = { r: -1, c: -1 };
          handleManualEnd();
        }
      }}
      className={`relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center transition-all duration-75
        ${
          r === 0
            ? "ring-2 ring-yellow-400 z-10 rounded-2xl"
            : "rounded-2xl"
        }
        ${isMoving ? "opacity-20 z-40" : "opacity-100"}
      `}
      style={{ backgroundColor: "#171717" }}
    >
      {orb === -1 || isManualHidden ? (
        <div className="w-[96%] h-[96%] rounded-2xl bg-black/40 border border-white/10" />
      ) : (
        <>
          <img
            src={
              Object.values(ORB_TYPES).find(
                (t) => t.id === orbOf(orb)
              )?.img
            }
            className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
            draggable={false}
            alt=""
          />

          {xMarkOf(orb) === 1 && !isManual && (
            <img
              src={x1Img}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
              alt=""
            />
          )}

          {xMarkOf(orb) === 2 && (
            <img
              src={x2Img}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
              alt=""
            />
          )}

          {qMarkOf(orb) === 1 &&
            !isManual &&
            !(r === 0 && replayDone) && (
              <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
                Start
              </div>
            )}

          {qMarkOf(orb) === 2 && !isManual && (
            <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-fuchsia-500/90 text-black text-xs font-black border border-black/30">
              End
            </div>
          )}
        </>
      )}
    </div>
  );
})}

				</React.Fragment>
              ))}
            </div>

            <svg
              ref={overlayRef}
              className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-[60]"
              style={{ overflow: "visible" }}
            >
              <defs>
                <filter
                  id="glowGreen"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                <filter
                  id="glowRed"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {(() => {
  if (!path || path.length < 2) return null;

  const isManualDragging = isManual && isDragging;
  const visiblePath = path.slice(0, currentStep + 1);
  if (visiblePath.length < 2) return null;

  const pts0 = buildPixelPath(visiblePath);

  let d, start, tip;
  let ptsDetour = pts0;

  // ✅ 先宣告在外層，後面 return JSX 才能用
  let triMarks = [];
  let segLabels = [];

  if (isManualDragging) {
    const simple = buildPathStringAndMarkersRounded(pts0, 6);
    d = simple.d;
    start = simple.start;
    tip = simple.tip;
  } else {
    const bumpPx = Math.max(10, Math.min(22, stableCellSize * 0.22));
    const rampPx = Math.max(10, Math.min(22, stableCellSize * 0.22));

    const ptsJump = collapseUpcomingOverlapRunsV3(pts0, {
      prefixMinEdges: 1,
      suffixMinEdges: 1,
      fullMinEdges: 3,
      bump: bumpPx,
      bumpRamp: rampPx,
    });

    ptsDetour = deOverlapByRampedDetourV2(ptsJump, 8, 14);

    const complex = buildPathStringAndMarkersRounded(ptsDetour, 10);
    d = complex.d;
    start = complex.start;
    tip = complex.tip;

    triMarks = replayDone
      ? sampleAlongPolyline(ptsDetour, 22, 14) // spacing, startOffset
      : [];

    // ✅ 段號：只看原始 rcPath (visiblePath) 的轉折
    // ✅ 位置：投影到 detour 後的折線
    segLabels = replayDone
      ? buildSegmentLabelsFromRcPath(visiblePath, getCellCenterPx, {
          cellSize: stableCellSize,
          labelR: 8,
          pathStroke: 4,
          gap: -2,
          alongScale: 0.22,
          minPxLen: 10,
        })
      : [];
  }

                return (
                  <>
                    {start && (
                      <circle
                        cx={start.x}
                        cy={start.y}
                        r="14"
                        fill="#22c55e"
                        stroke="black"
                        strokeWidth="2"
                        filter="url(#glowGreen)"
                      />
                    )}

                    <>
                      <path
                        d={d}
                        stroke="rgba(0,0,0,0.55)"
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          filter: "blur(3.5px)",
                          mixBlendMode: "normal",
                        }}
                        opacity={0.9}
                      />

                      <path
                        d={d}
                        stroke="rgba(255,255,255,0.95)"
                        strokeWidth="14"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          filter: "blur(6px)",
                          mixBlendMode: "screen",
                        }}
                        opacity={0.45}
                      />

                      <path
                        d={d}
                        stroke="white"
                        strokeWidth="4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          mixBlendMode: "screen",
                        }}
                        opacity={0.95}
                      />
                    </>

                    {replayDone && triMarks.length > 0 && (
                      <g opacity={1}>
                        {triMarks.map((m, idx) => {
                          const leg = 4;
                          const angleDeg = 30;
                          const theta = (angleDeg * Math.PI) / 180;
                          const dx = -leg * Math.cos(theta);
                          const dy = leg * Math.sin(theta);
                          const coreWidth = 6;
                          const sw = coreWidth * 0.15;

                          return (
                            <g
                              key={idx}
                              transform={`translate(${m.x} ${m.y}) rotate(${m.ang})`}
                            >
                              <path
                                d={`M ${dx} ${-dy} L 0 0 L ${dx} ${dy}`}
                                fill="none"
                                stroke="black"
                                strokeWidth={sw}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}

                    {replayDone && segLabels.length > 0 && (
                      <g>
                        {segLabels.map((s) => (
                          <g key={s.idx}>
                            <circle
                              cx={s.x}
                              cy={s.y}
                              r={7}
                              fill="rgba(0,0,0,0.75)"
                              stroke="rgba(255,255,255,0.35)"
                              strokeWidth="1.2"
                            />
                            <text
                              x={s.x}
                              y={s.y + 3}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="900"
                              fill="white"
                              style={{
                                pointerEvents: "none",
                                userSelect: "none",
                              }}
                            >
                              {s.idx}
                            </text>
                          </g>
                        ))}
                      </g>
                    )}

                    {currentStep >= 0 && tip && (
                      <circle
                        cx={tip.x}
                        cy={tip.y}
                        r="16"
                        fill="#ef4444"
                        stroke="black"
                        strokeWidth="2"
                        filter="url(#glowRed)"
                      >
                        <animate
                          attributeName="r"
                          values="15;21;15"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="1;0.5;1"
                          dur="0.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </>
                );
              })()}
            </svg>

            <div className="absolute inset-0 pointer-events-none z-[9999]">
              {floating?.visible && (
                <div
                  className="absolute z-[9999] pointer-events-none flex items-center justify-center"
                  style={{
                    left: floating.x,
                    top: floating.y,
                    transform: "translate(-50%, -50%)",
                    width: 120,
                    height: 120,
                  }}
                >
                  <div className="absolute z-0 flex items-center justify-center">
                    <div
                      className="absolute rounded-full blur-lg opacity-100"
                      style={{
                        width: 90,
                        height: 90,
                        background:
                          "radial-gradient(circle, rgba(99,102,241,1) 0%, rgba(99,102,241,0.95) 40%, rgba(99,102,241,0.6) 65%, rgba(0,0,0,0) 80%)",
                      }}
                    />
                    <div
                      className="absolute rounded-full blur-sm opacity-100"
                      style={{
                        width: 75,
                        height: 75,
                        background:
                          "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.5) 75%, rgba(0,0,0,0) 95%)",
                      }}
                    />
                  </div>

                  <img
                    src={
                      Object.values(ORB_TYPES).find(
                        (t) => t.id === floating.orbId
                      )?.img
                    }
                    className="relative w-16 h-16 md:w-20 md:h-20 block drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]"
                    draggable={false}
                    alt=""
                  />
                </div>
              )}
            </div>

            {solving && (
              <div className="absolute inset-0 bg-neutral-950/90 rounded-3xl flex flex-col items-center justify-center z-20 backdrop-blur-xl">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  {priorityMode === "steps" ? (
                    <Footprints
                      className="absolute inset-0 m-auto text-amber-400 animate-pulse"
                      size={32}
                    />
                  ) : (
                    <Trophy
                      className="absolute inset-0 m-auto text-emerald-400 animate-pulse"
                      size={32}
                    />
                  )}
                </div>

                <p className="font-black text-xl text-indigo-500 tracking-[0.2em] animate-pulse uppercase">
                  {skyfallEnabled
                    ? "Combo Analysis"
                    : priorityMode === "steps"
                    ? "Optimizing Time"
                    : "Deep Searching"}
                </p>
              </div>
            )}

            {showMoveEnded && (
              <div className="absolute inset-0 bg-neutral-950/85 rounded-3xl flex flex-col items-center justify-center z-[9999] pointer-events-none">
                <Clock className="text-orange-400 mb-4" size={40} />

                <p className="font-black text-xl text-orange-400 tracking-[0.2em] uppercase">
                  Move Ended
                </p>

                <p className="mt-2 text-sm font-black text-white/70 tracking-[0.3em] uppercase">
                  Time Up
                </p>
              </div>
            )}

            {gifCaptureMode && (
              <div
                className="w-full flex items-center justify-center text-[12px] font-black tracking-wide"
                style={{
                  height: GIF_FOOTER_H,
                  marginTop: 0,
                  background: "rgba(0,0,0,0.55)",
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span className="text-white/90">
                  segment: {gifFooter.segment}/{gifFooter.segmentTotal}
                </span>
                <span className="mx-2 text-white/30">|</span>
                <span className="text-fuchsia-200">
                  combo: {gifFooter.comboText}
                </span>
                <span className="mx-2 text-white/30">|</span>
                <span className="text-emerald-200">
                  step: {gifFooter.step}/{gifFooter.stepTotal}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => initBoard(true)}
            disabled={solving || isReplaying || exportingGif}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-6 py-4 rounded-2xl font-bold transition-all text-sm border border-neutral-700 shadow-md active:scale-95"
          >
            <RefreshCw size={20} /> 隨機生成
          </button>

          <button
            onClick={handleOpenEditor}
            disabled={solving || isReplaying || exportingGif}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-6 py-4 rounded-2xl font-bold transition-all text-sm border border-neutral-700 shadow-md active:scale-95"
          >
            <Edit3 size={20} /> 自訂版面
          </button>

          {!isManual && (
            <button
              onClick={solve}
              disabled={solving || isReplaying || showEditor || exportingGif}
              className={[
                "flex items-center gap-2 px-8 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                solving || isReplaying || showEditor || exportingGif
                  ? "opacity-20"
                  : "",
                needsSolve
                  ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-emerald-900/30 text-white"
                  : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200",
              ].join(" ")}
              title={needsSolve ? "參數已變更，尚未重新計算" : "目前結果已是最新"}
            >
              <Lightbulb size={20} />
              {solving ? "計算中..." : needsSolve ? "待計算" : "已計算"}
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (isReplaying && !isPaused) return pauseReplay();
                if (isPaused) return resumeReplay();

                if (!path || path.length === 0) return;
                const s = getCellCenterPx(path[0].r, path[0].c);
                const startPx = { x: s.x, y: s.y - 30 };
                replayPathContinuous(path, startPx);
              }}
              disabled={
                solving ||
                exportingGif ||
                (path.length === 0 && !isReplaying && !isPaused)
              }
              className={[
                "flex items-center gap-2 px-10 py-4 rounded-2xl font-black shadow-xl transition-all text-base active:scale-95",
                solving || exportingGif ? "opacity-20" : "",
                isReplaying && !isPaused
                  ? "bg-red-600 hover:bg-red-500 shadow-red-900/40"
                  : isPaused
                  ? "bg-orange-500 hover:bg-orange-400 shadow-orange-900/30"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40",
              ].join(" ")}
            >
              {isReplaying && !isPaused ? (
                <>
                  <Pause size={22} fill="white" /> 暫停播放
                </>
              ) : isPaused ? (
                <>
                  <Play size={22} fill="white" /> 繼續播放
                </>
              ) : (
                <>
                  <Play size={22} fill="white" /> 重播路徑
                </>
              )}
            </button>

            {(isReplaying || isPaused || exportingGif || currentStep !== -1) && (
              <button
                onClick={() => stopToBase(true)}
                disabled={exportingGif}
                className={[
                  "p-4 bg-neutral-800 hover:bg-neutral-700 rounded-2xl border border-neutral-700 active:scale-95 transition-all text-neutral-300",
                  exportingGif ? "opacity-20 pointer-events-none" : "",
                ].join(" ")}
                title="Stop / 回到原盤"
              >
                <Square size={20} fill="currentColor" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center mt-3 gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={exportGif}
              disabled={
                solving ||
                exportingGif ||
                !path ||
                path.length < 2 ||
                isReplaying ||
                isPaused
              }
              className={[
                "flex items-center gap-2 px-8 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                solving ||
                exportingGif ||
                isReplaying ||
                isPaused ||
                !path ||
                path.length < 2
                  ? "opacity-20"
                  : "",
                "bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-400/30 shadow-fuchsia-900/30 text-white",
              ].join(" ")}
              title="將轉珠播放輸出為 GIF"
            >
              <Database size={20} />
              {exportingGif
                ? gifStage === "render"
                  ? "合成GIF..."
                  : `擷取中... ${gifProgress.pct || 0}%`
                : "輸出 GIF"}
            </button>

            {exportingGif && (
              <button
                onClick={abortGifExport}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95 bg-red-600 hover:bg-red-500 border-red-400/30 shadow-red-900/30 text-white"
              >
                <Square size={20} />
                終止
              </button>
            )}
          </div>

          {exportingGif && (
            <div className="w-full max-w-xl">
              <div className="flex justify-between text-xs font-bold text-neutral-400 mb-1">
                <span>擷取幀數</span>
                <span className="text-fuchsia-300">
                  {gifProgress.cur}/{gifProgress.total}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden border border-neutral-700">
                <div
                  className="h-full bg-fuchsia-500 transition-all"
                  style={{ width: `${gifProgress.pct || 0}%` }}
                />
              </div>

              <div className="mt-1 text-[11px] text-neutral-500 text-center">
                產生中請勿切換頁面（會吃 CPU 是正常的）
              </div>
            </div>
          )}

          {gifReady.url && (
            <button
              onClick={onGifDownloadClick}
              className={[
                "mt-2 inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                "bg-amber-500 hover:bg-amber-400 border-amber-300/30 shadow-amber-900/30 text-white",
              ].join(" ")}
            >
              <FileDown size={20} />
              下載 GIF
            </button>
          )}
        </div>

        {showEditor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div
              className="pt-5 bg-neutral-900 w-full max-w-2xl rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-3 flex-1 overflow-y-auto overscroll-contain"
                style={{
                  WebkitOverflowScrolling: "touch",
                  contain: "content",
                  willChange: "transform",
                  transform: "translateZ(0)",
                }}
              >
                <div className="flex flex-col items-center">
                  <div className="relative bg-neutral-900 p-3 rounded-3xl shadow-2xl border-2 border-neutral-800 mb-6 mx-auto w-fit overflow-visible mt-6">
                    <div className="grid grid-cols-6">
                      {editingBoard.map((row, r) => (
                        <React.Fragment key={r}>
                          {r === 1 && (
                            <div className="col-span-6 h-2 bg-white z-50 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                          )}

                          {row.map((orb, c) => (
                            <div
                              key={`${r}-${c}`}
                              onClick={() => {
                                const next = editingBoard.map((row) => [...row]);
                                const cur = next[r][c];

                                const o = orbOf(cur);
                                const xm = xMarkOf(cur);
                                const qm = qMarkOf(cur);

                                if (selectedMark === 0) {
                                  next[r][c] = withMarks(selectedBrush, xm, qm);
                                  setEditingBoard(next);
                                  return;
                                }

                                if (selectedMark === 1 || selectedMark === 2) {
                                  const want = selectedMark;
                                  const nx = xm === want ? 0 : want;
                                  const nq = nx !== 0 ? 0 : qm;
                                  next[r][c] = withMarks(o, nx, nq);
                                  setEditingBoard(next);
                                  return;
                                }

                                if (selectedMark === 3 || selectedMark === 4) {
                                  const wantQ = selectedMark === 3 ? 1 : 2;

                                  if (wantQ === 1 && xm !== 0) return;
                                  if (wantQ === 2 && xm === 1) return;

                                  if (qm === wantQ) {
                                    next[r][c] = withMarks(o, xm, 0);
                                    setEditingBoard(next);
                                    return;
                                  }

                                  if (r === 0) {
                                    for (let cc = 0; cc < COLS; cc++) {
                                      const v = next[0][cc];
                                      if (wantQ === 1 && qMarkOf(v) === 2)
                                        return;
                                      if (wantQ === 2 && qMarkOf(v) === 1)
                                        return;
                                    }
                                  }

                                  for (let rr = 0; rr < TOTAL_ROWS; rr++) {
                                    for (let cc = 0; cc < COLS; cc++) {
                                      const v = next[rr][cc];
                                      if (qMarkOf(v) === wantQ) {
                                        next[rr][cc] = withMarks(
                                          orbOf(v),
                                          xMarkOf(v),
                                          0
                                        );
                                      }
                                    }
                                  }

                                  next[r][c] = withMarks(o, xm, wantQ);
                                  setEditingBoard(next);
                                  return;
                                }
                              }}
                              className="relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center transition-all duration-75 rounded-2xl"
                            >
                              <div
                                className={`absolute inset-0 m-auto w-[95%] h-[95%] rounded-2xl pointer-events-none transition-all duration-75
                                  ${r === 0 ? "ring-2 ring-yellow-400 z-10" : ""}
                                  ${
                                    orbOf(editingBoard[r][c]) === selectedBrush
                                      ? "ring-2 ring-white z-20"
                                      : ""
                                  }`}
                              />

                              <img
                                src={
                                  Object.values(ORB_TYPES).find(
                                    (t) => t.id === orbOf(orb)
                                  )?.img
                                }
                                className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
                                draggable={false}
                                alt=""
                              />

                              {xMarkOf(orb) === 1 && !isManual && (
                                <img
                                  src={x1Img}
                                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                                  draggable={false}
                                  alt=""
                                />
                              )}

                              {xMarkOf(orb) === 2 && (
                                <img
                                  src={x2Img}
                                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                                  draggable={false}
                                  alt=""
                                />
                              )}

                              {!isManual && qMarkOf(orb) === 1 && (
                                <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
                                  START
                                </div>
                              )}

                              {!isManual && qMarkOf(orb) === 2 && (
                                <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-fuchsia-500/90 text-black text-xs font-black border border-black/30">
                                  END
                                </div>
                              )}
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="w-full">
                    <p className="text-xs font-black text-neutral-500 uppercase tracking-widest text-center mb-4">
                      ORB PALETTE
                    </p>

                    <div className="flex justify-center gap-3 mb-2">
                      {Object.values(ORB_TYPES).map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setSelectedBrush(type.id)}
                          className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                            ${
                              selectedBrush === type.id
                                ? "ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20"
                                : "opacity-70 hover:opacity-100"
                            }`}
                        >
                          <img
                            src={type.img}
                            className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
                            draggable={false}
                            alt=""
                          />
                        </button>
                      ))}
                    </div>

                    <p className="text-xs font-black text-neutral-500 uppercase tracking-widest text-center mt-6 mb-4">
                      STATE PALETTE
                    </p>

                    <div className="flex justify-center gap-3">
                      <button
                        onClick={() => setSelectedMark(0)}
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                          ${
                            selectedMark === 0
                              ? "ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20"
                              : "opacity-70 hover:opacity-100"
                          }`}
                        title="刷符石（不附加狀態）"
                      >
                        <span className="font-black text-neutral-300">ORB</span>
                      </button>

                      {!isManual && (
                        <button
                          onClick={() => setSelectedMark(1)}
                          className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                            ${
                              selectedMark === 1
                                ? "ring-4 ring-red-500 scale-110 shadow-lg shadow-red-500/20"
                                : "opacity-70 hover:opacity-100"
                            }`}
                          title="附加 X1（路徑不可碰）"
                        >
                          <img
                            src={x1Img}
                            className="w-[85%] h-[85%] object-contain"
                            draggable={false}
                            alt=""
                          />
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedMark(2)}
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                          ${
                            selectedMark === 2
                              ? "ring-4 ring-yellow-400 scale-110 shadow-lg shadow-yellow-400/20"
                              : "opacity-70 hover:opacity-100"
                          }`}
                        title="附加 X2（路徑不可碰，但最後一格可）"
                      >
                        <img
                          src={x2Img}
                          className="w-[85%] h-[85%] object-contain"
                          draggable={false}
                          alt=""
                        />
                      </button>

                      {!isManual && (
                        <>
                          <button
                            onClick={() => setSelectedMark(3)}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                              ${
                                selectedMark === 3
                                  ? "ring-4 ring-cyan-400 scale-110 shadow-lg"
                                  : "opacity-70"
                              }`}
                            title="附加 Start"
                          >
                            <span className="font-black text-cyan-300 text-lg">
                              START
                            </span>
                          </button>

                          <button
                            onClick={() => setSelectedMark(4)}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                              ${
                                selectedMark === 4
                                  ? "ring-4 ring-fuchsia-400 scale-110 shadow-lg"
                                  : "opacity-70"
                              }`}
                            title="附加 End"
                          >
                            <span className="font-black text-fuchsia-300 text-lg">
                              END
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 p-4">
                <div className="grid grid-cols-3 gap-2 w-full">
                  <button
                    onClick={() => setShowEditor(false)}
                    className="w-full py-5 rounded-2xl font-bold bg-neutral-800 hover:bg-neutral-700 transition-colors text-base"
                  >
                    取消
                  </button>

                  <button
                    onClick={onImportClick}
                    disabled={importBusy}
                    className={[
                      "w-full py-5 rounded-2xl font-black transition-all text-base border active:scale-95",
                      importBusy
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:brightness-110",
                      "bg-fuchsia-600 border-fuchsia-400/30 shadow-xl shadow-fuchsia-900/20",
                    ].join(" ")}
                    title="匯入截圖並自動辨識盤面"
                  >
                    匯入版面
                  </button>

                  <button
                    onClick={handleApplyCustomBoard}
                    className="w-full py-5 rounded-2xl font-black bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-900/20 transition-all flex items-center justify-center gap-2 text-base"
                  >
                    <Check size={22} /> 完成
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 flex items-start gap-4 p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 text-xs text-neutral-400 leading-relaxed shadow-inner">
          <Wrench size={18} className="text-indigo-500 shrink-0 mt-1" />
          <div>
            <strong className="text-indigo-400 block mb-1 text-base">
              功能介紹：
            </strong>
            <strong className="block text-xs">
              自動轉珠模擬器，全自動搜尋最優路徑。自訂盤面模擬、疊珠與斜轉判定、
              完整顯示 Combo 數、總消除符石數與移動步數。
              可設定目標 Combo、步數上限與回放速度。
            </strong>

            <a
              href="https://forum.gamer.com.tw/C.php?bsn=23805&snA=729214"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-indigo-400 neon-link font-semibold tracking-wide text-base"
            >
              → 前往巴哈介紹文
            </a>
          </div>
        </div>
      </div>
    </div>

    <input
      ref={importFileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={onImportFileChange}
    />

    <ImportCropModal
      open={showImportCrop}
      imgUrl={importImgUrl}
      onCancel={() => setShowImportCrop(false)}
      onConfirm={async ({ cropCanvas }) => {
        console.log("[ImportCropModal] onConfirm fired", cropCanvas);

        setImportBusy(true);
        try {
          if (!cropCanvas) {
            alert("cropCanvas 是空的（Modal 沒有傳出來）");
            return;
          }

          const detected = detectFromCroppedCanvas(
            cropCanvas,
            ORB_TYPES,
            templateCacheRef,
            {
              rows: 5,
              cols: 6,
              innerPad: 0.12,
              sampleSize: 28,
              allowEmpty: false,
              allowUnknown: false,
              minScore: 0.55,
            }
          );

          console.log("[detect] result", detected);

          setEditingBoard((prev) => {
            const next = prev.map((r) => [...r]);
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 6; c++) {
                next[r + 1][c] = detected[r][c];
              }
            }
            return next;
          });

          console.log(
            "sample pixel:",
            cropCanvas?.getContext?.("2d")?.getImageData(0, 0, 1, 1)?.data
          );

          setShowEditor(true);
          setShowImportCrop(false);
        } catch (err) {
          console.error("偵測流程炸掉：", err);
          console.error("err.message:", err?.message);
          console.error("err.stack:", err?.stack);
          console.log("cropCanvas:", cropCanvas);
          console.log("cropCanvas size:", cropCanvas?.width, cropCanvas?.height);
          alert("偵測失敗（看 console 錯誤）");
        } finally {
          setImportBusy(false);
        }
      }}
    />
  </div>
);
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const roundToStep = (v, step, min = 0) => {
  const s = Number(step) || 1;
  const base = Number(min) || 0;
  const k = Math.round((v - base) / s);
  return base + k * s;
};

const ParamSlider = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  inputMode = "decimal",
  formatInput = (v) => String(v),
}) => {
  const [text, setText] = React.useState(formatInput(value));
  const isComposingRef = React.useRef(false);

  React.useEffect(() => {
    if (isComposingRef.current) return;
    setText(formatInput(value));
  }, [value, formatInput]);

  const commit = React.useCallback(() => {
    if (text.trim() === "") {
      setText(formatInput(value));
      return;
    }

    const n = Number(text);
    if (!Number.isFinite(n)) {
      setText(formatInput(value));
      return;
    }

    let next = clamp(n, min, max);
    next = roundToStep(next, step, min);

    if (String(step).includes(".")) {
      const decimals = String(step).split(".")[1].length;
      next = Number(next.toFixed(decimals));
    }

    onChange(next);
    setText(formatInput(next));
  }, [text, value, min, max, step, onChange, formatInput]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center text-[14px] font-bold text-neutral-400 gap-2">
        <span>{label}</span>

        {/* ✅ 只保留可輸入 input，拿掉原本不可輸入 label */}
        <input
          value={text}
          inputMode={inputMode}
          className="w-24 md:w-28 px-2 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-blue-400 font-bold text-base text-right outline-none focus:ring-2 focus:ring-blue-500/40"
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; commit(); }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setText(formatInput(value));
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(n);
          setText(formatInput(n));
        }}
        className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
};

export default App;