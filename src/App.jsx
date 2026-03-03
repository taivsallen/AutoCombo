import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toCanvas } from "html-to-image";
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
  beamWidth: 200,    
  maxSteps: 30,      
  maxNodes: 120000,  
  stepPenalty: 250,  
  potentialWeight: 800, 
  clearedWeight: 300,
  replaySpeed: 250, 
};

const App = () => {
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

  const solverConfig = React.useMemo(() => {
	  const { replaySpeed, ...rest } = config; // ✅ 排除播放速度
	  return rest;
	}, [config]);
	
  const getBoardKey = (b) => b.flat().join(',');

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
  
  const holeStepInPlace = (b, hole, toRC) => {
	  const moved = b[toRC.r][toRC.c];
	  b[hole.r][hole.c] = moved;
	  b[toRC.r][toRC.c] = -1;
	  return toRC; // new hole
	};

// 評分/顯示用：把洞補成「手上那顆 held(startOrb)」
// 這樣 evaluateBoard / potentialScore 看到的是「拖曳中棋盤」的真實狀態（沒有缺格）
  const boardWithHeldFilled = (b, hole, held) => {
	  if (!hole) return b;
	  const next = b.map(r => [...r]);
	  next[hole.r][hole.c] = held;
	  return next;
	};

  const resetBasic = () => {
    setTargetCombos(stats.theoreticalMax);
    setSkyfallEnabled(false);
    setDiagonalEnabled(true);
    setConfig(prev => ({ ...prev, replaySpeed: DEFAULT_CONFIG.replaySpeed, maxSteps: DEFAULT_CONFIG.maxSteps }));
	solverCache.current.clear();
  };

  const resetAdvanced = () => {
    setConfig(prev => ({ ...prev, beamWidth: DEFAULT_CONFIG.beamWidth, maxNodes: DEFAULT_CONFIG.maxNodes, stepPenalty: DEFAULT_CONFIG.stepPenalty, potentialWeight: DEFAULT_CONFIG.potentialWeight, clearedWeight: DEFAULT_CONFIG.clearedWeight}));
    solverCache.current.clear();
  };

  const handleOpenEditor = () => {
    setEditingBoard(originalBoard.map(r => [...r]));
    setShowEditor(true);
  };

  const handleApplyCustomBoard = () => {
	  stopToBase(true);              // ✅ 先切回 base / 清 replayBoard
	  initBoard(false, editingBoard);
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

  const applyGravity = (b, toClear) => {
  const next = b.map(row => [...row]);

  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;

    for (let r = TOTAL_ROWS - 1; r >= 1; r--) {
      if (!toClear[r][c]) {
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
  const hWeight = mode === 'horizontal' ? 3 : 0.5;
  const vWeight = mode === 'vertical' ? 3 : 0.5;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const a = orbOf(b[r][c]);
      const d = orbOf(b[r][c + 1]);
      const e = orbOf(b[r][c + 2]);
      if (a === -1) continue;
      if (a === d && a !== e) p += hWeight;
      if (d === e && a !== d) p += hWeight;
      if (a === e && a !== d) p += hWeight;
    }
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const a = orbOf(b[r][c]);
      const d = orbOf(b[r + 1][c]);
      const e = orbOf(b[r + 2][c]);
      if (a === -1) continue;
      if (a === d && a !== e) p += vWeight;
      if (d === e && a !== d) p += vWeight;
      if (a === e && a !== d) p += vWeight;
    }
  }

  return p;
};

  const findMatches = (tempBoard) => {
  let combos = 0, clearedCount = 0, vC = 0, hC = 0;

  const isH = Array(TOTAL_ROWS).fill().map(() => Array(COLS).fill(false));
  const isV = Array(TOTAL_ROWS).fill().map(() => Array(COLS).fill(false));
  const toClear = Array(TOTAL_ROWS).fill().map(() => Array(COLS).fill(false));

  // 水平三連
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const v0 = orbOf(tempBoard[r][c]);
      const v1 = orbOf(tempBoard[r][c + 1]);
      const v2 = orbOf(tempBoard[r][c + 2]);
      if (v0 !== -1 && v0 === v1 && v0 === v2) {
        let k = c;
        while (k < COLS && orbOf(tempBoard[r][k]) === v0) {
          toClear[r][k] = true;
          isH[r][k] = true;
          k++;
        }
      }
    }
  }

  // 垂直三連
  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const v0 = orbOf(tempBoard[r][c]);
      const v1 = orbOf(tempBoard[r + 1][c]);
      const v2 = orbOf(tempBoard[r + 2][c]);
      if (v0 !== -1 && v0 === v1 && v0 === v2) {
        let k = r;
        while (k < TOTAL_ROWS && orbOf(tempBoard[k][c]) === v0) {
          toClear[k][c] = true;
          isV[k][c] = true;
          k++;
        }
      }
    }
  }

  // BFS 合併同色相連區塊（combo）
  const visited = Array(TOTAL_ROWS).fill().map(() => Array(COLS).fill(false));

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (toClear[r][c] && !visited[r][c]) {
        combos++;
        const q = [{ r, c }];
        visited[r][c] = true;

        const type = orbOf(tempBoard[r][c]); // ✅ 用 orbOf
        let hasHM = false, hasVM = false;

        while (q.length > 0) {
          const curr = q.shift();
          clearedCount++;

          if (isH[curr.r][curr.c]) hasHM = true;
          if (isV[curr.r][curr.c]) hasVM = true;

          [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
            const nr = curr.r + dr, nc = curr.c + dc;
            if (
              nr >= PLAY_ROWS_START && nr < TOTAL_ROWS &&
              nc >= 0 && nc < COLS &&
              toClear[nr][nc] &&
              !visited[nr][nc] &&
              orbOf(tempBoard[nr][nc]) === type
            ) {
              visited[nr][nc] = true;
              q.push({ r: nr, c: nc });
            }
          });
        }

        if (hasHM) hC++;
        if (hasVM) vC++;
      }
    }
  }

  return { combos, clearedCount, vC, hC, toClearMap: toClear };
};

  const evaluateBoard = (tempBoard, skyfall) => {
    let result = findMatches(tempBoard);
    let initialCombos = result.combos;
    let initialH = result.hC;
    let initialV = result.vC;
    let initialCleared = result.clearedCount;
    if (!skyfall) return { combos: initialCombos, initialCombos, skyfallCombos: 0, clearedCount: initialCleared, verticalCombos: initialV, horizontalCombos: initialH };

    let currentBoard = tempBoard.map(r => [...r]);
    let totalCombos = initialCombos, totalV = initialV, totalH = initialH, totalCleared = initialCleared;
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
    return { combos: totalCombos, initialCombos, skyfallCombos: totalCombos - initialCombos, clearedCount: totalCleared, verticalCombos: totalV, horizontalCombos: totalH };
  };

  const calcScore = (ev, pot, pathLen, cfg, target, mode, priority) => {
  const cappedCombos = Math.min(ev.combos, target);

  // 你原本的「主方向」加權：直排看 verticalCombos，橫排看 horizontalCombos
  const baseMajor =
    mode === 'vertical'
      ? ev.verticalCombos * 5000000
      : ev.horizontalCombos * 5000000;

  const baseScore = baseMajor + cappedCombos * 1000000;

  // ✅ 超標平方大扣分（改回來）
  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;

  // ✅ 步數懲罰：steps 模式更重、combo 模式較輕（跟你原本一致）
  const effectiveStepPenalty =
    priority === 'steps' ? cfg.stepPenalty * 4 : cfg.stepPenalty;

  // ✅ cleared 權重：combo 模式比較看消除數、steps 模式較低（跟你原本一致）
  const currentClearedWeight =
    priority === 'combo' ? 1000 : 200;

  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return (
      5000000 -
      stepCost -
      overPenalty +
      ev.clearedCount * currentClearedWeight
    );
  } else {
    // ✅ 沒達標：距離 target 的平方懲罰（改回來）
    const miss = target - ev.combos;
    const targetPenalty = -(miss * miss * 8000);

    return (
      baseScore +
      targetPenalty +
      pot * cfg.potentialWeight +
      ev.clearedCount * currentClearedWeight -
      pathLen * 20
    );
  }
};

  const beamSolve = (originalBoard, cfg, target, mode, priority, skyfall, diagonal) => {
	  const stepsOf = (pth) => Math.max(0, (pth?.length || 0) - 1);

	  // ===== X1/X2 規則 =====
	  // X1：永遠不能踩
	  // X2：可以踩，但只能當最後一步（踩到後 locked=true，不再展開）
	  const stepConstraint = (cellVal) => {
		const m = xMarkOf(cellVal);
		if (m === 1) return { ok: false, locked: false };
		if (m === 2) return { ok: true, locked: true };
		return { ok: true, locked: false };
	  };

	  const maxNodesEffective =
		priority === 'combo'
		  ? Math.max(cfg.maxNodes, cfg.maxSteps * cfg.beamWidth * 20)
		  : cfg.maxNodes;

	  // ===== Q1/Q2 掃描（最多各一個）=====
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
	  const shouldAcceptEnd = (pthLast) => {
		if (!q2Pos) return true;
		return pthLast?.r === q2Pos.r && pthLast?.c === q2Pos.c;
	  };

	  let bestGlobal = {
		combos: -1,
		skyfallCombos: 0,
		clearedCount: -1,
		path: [],
		score: -Infinity,
		verticalCombos: 0,
		horizontalCombos: 0,
	  };

	  const considerBest = (ev, score, pth) => {
		  // ✅ 先檢查 Q2：不在 Q2 結束的一律不收
		  const last = pth?.[pth.length - 1];
		  if (!shouldAcceptEnd(last)) return;

		  let isBetterGlobal = false;

		  if (priority === 'combo') {
			isBetterGlobal =
			  score > bestGlobal.score ||
			  (score === bestGlobal.score && ev.clearedCount > bestGlobal.clearedCount);
		  } else {
			if (ev.combos >= target) {
			  const bestSteps = bestGlobal.path ? stepsOf(bestGlobal.path) : Infinity;
			  const curSteps = stepsOf(pth);
			  if (bestGlobal.combos < target || curSteps < bestSteps) isBetterGlobal = true;
			} else {
			  if (ev.combos > bestGlobal.combos) isBetterGlobal = true;
			}
		  }

		  if (isBetterGlobal) bestGlobal = { ...ev, path: pth, score };
		};
	  
	  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;

	  let beam = [];
	  const visitedBest = new Map();

	  const pushInitState = (r, c, heldFromRow0) => {
		if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;
		const boardCopy = originalBoard.map(row => [...row]);

		let held;
		let hole = null;

		if (heldFromRow0) {
		  held = originalBoard[0][c]; // ✅ row0 起手：握 row0[c]
		  hole = null;                // ✅ 沒洞
		} else {
		  held = originalBoard[r][c]; // ✅ row1~5 起手：握該格珠
		  hole = { r, c };
		  boardCopy[r][c] = -1;       // ✅ 起點挖洞（等價於把那顆拿起來）
		}

		// ✅ 起手也算「碰到」：held 若是 X1 -> 禁止；X2 -> 鎖死只能當最後一步
		const heldMark = xMarkOf(held);
		if (heldMark === 1) return;
		const locked0 = (heldMark === 2);

		const evalBoard = boardWithHeldFilled(boardCopy, hole, held);
		const ev = evaluateBoard(evalBoard, skyfall);
		const pot = potentialScore(evalBoard, mode);
		const score = calcScore(ev, pot, 0, cfg, target, mode, priority);

		const holeKey = hole ? `${hole.r},${hole.c}` : `-1,-1`;
		const key =
		  getBoardKey(boardCopy) +
		  `|held:${held}|pos:${r},${c}|hole:${holeKey}|locked:${locked0 ? 1 : 0}`;

		visitedBest.set(key, {
		  h: ev.horizontalCombos,
		  v: ev.verticalCombos,
		  c: ev.combos,
		  clr: ev.clearedCount,
		  pot,
		  len: 0,
		  locked: locked0 ? 1 : 0,
		});

		beam.push({
		  board: boardCopy,
		  held,
		  hole,
		  r,
		  c,
		  path: [{ r, c }],
		  score,
		  ...ev,
		  pot,
		  locked: locked0,
		});
  };

  // 起手：row0(6) + row1~5(30)
  for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) pushInitState(r, c, false);
  }

  let nodesExpanded = 0;

  for (let step = 0; step < cfg.maxSteps; step++) {
    let candidates = [];

    for (const state of beam) {
      if (nodesExpanded > maxNodesEffective) break;

      // ✅ 一定要先把「停在當前 state」納入候選（X2 才能當最後一步）
      {
        const evalBoard0 = boardWithHeldFilled(state.board, state.hole, state.held);
        const ev0 = evaluateBoard(evalBoard0, skyfall);
        const pot0 = potentialScore(evalBoard0, mode);
        const score0 = calcScore(ev0, pot0, stepsOf(state.path), cfg, target, mode, priority);
        considerBest(ev0, score0, state.path);
      }

      // ✅ 若已踩到 X2：這步必須是最後一步，不展開鄰居
      if (state.locked) continue;

      for (const [dr, dc] of dirsPlay) {
        const nr = state.r + dr;
        const nc = state.c + dc;
        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;

        const newPath = [...state.path, { r: nr, c: nc }];
        const newSteps = stepsOf(newPath);

        // A) state 在 row0：只能拉到 row1（可斜），row0 永遠不動
        if (state.r === 0) {
          if (nr !== 1) continue;

          const destVal = state.board[nr][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;
		  const nextLocked = chk.locked || isAtQ2(nr, nc);

          const nextBoard = state.board.map(row => [...row]);
          nextBoard[nr][nc] = -1;          // ✅ 落點挖洞
          const nextHole = { r: nr, c: nc };

          const evalBoard = boardWithHeldFilled(nextBoard, nextHole, state.held);
          const ev = evaluateBoard(evalBoard, skyfall);
          const pot = potentialScore(evalBoard, mode);
          const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);
          considerBest(ev, score, newPath);

          const key =
            getBoardKey(nextBoard) +
            `|held:${state.held}|pos:${nr},${nc}|hole:${nextHole.r},${nextHole.c}|locked:${nextLocked ? 1 : 0}`;

          const prev = visitedBest.get(key);
          if (prev) {
            const sameBase =
              mode === 'vertical'
                ? ev.verticalCombos === prev.v
                : ev.horizontalCombos === prev.h;

            if (
              sameBase &&
              ev.combos === prev.c &&
              ev.clearedCount <= prev.clr &&
              pot <= prev.pot &&
              newSteps >= prev.len
            ) continue;
          }

          visitedBest.set(key, {
            h: ev.horizontalCombos,
            v: ev.verticalCombos,
            c: ev.combos,
            clr: ev.clearedCount,
            pot,
            len: newSteps,
            locked: nextLocked ? 1 : 0,
          });

          candidates.push({
            board: nextBoard,
            held: state.held,
            hole: nextHole,
            r: nr,
            c: nc,
            path: newPath,
            locked: nextLocked,
            score,
            ...ev,
            pot,
          });

          nodesExpanded++;
          continue;
        }

        // B) state 在 row1~5：下一步踏回 row0 => 終止（row0 不變）
        if (state.r >= PLAY_ROWS_START && nr === 0) {
          const destVal = state.board[0][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;
          // ✅ chk.locked === true 表示最後一步踩到 X2：允許（這裡本來就終止）

          const evalBoard = boardWithHeldFilled(state.board, state.hole, state.held);
          const ev = evaluateBoard(evalBoard, skyfall);
          const pot = potentialScore(evalBoard, mode);
          const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);
          considerBest(ev, score, newPath);
          continue;
        }

        // C) 一般移動：row1~5 內洞滑動
        if (nr < PLAY_ROWS_START) continue;
        if (!state.hole) continue;

        const destVal = state.board[nr][nc];
        const chk = stepConstraint(destVal);
        if (!chk.ok) continue;
        const nextLocked = chk.locked || isAtQ2(nr, nc);

        const nextBoard = state.board.map(row => [...row]);
        const nextHole = holeStepInPlace(nextBoard, state.hole, { r: nr, c: nc });

        const evalBoard = boardWithHeldFilled(nextBoard, nextHole, state.held);
        const ev = evaluateBoard(evalBoard, skyfall);
        const pot = potentialScore(evalBoard, mode);
        const score = calcScore(ev, pot, newSteps, cfg, target, mode, priority);
        considerBest(ev, score, newPath);

        const key =
          getBoardKey(nextBoard) +
          `|held:${state.held}|pos:${nr},${nc}|hole:${nextHole.r},${nextHole.c}|locked:${nextLocked ? 1 : 0}`;

        const prev = visitedBest.get(key);
        if (prev) {
          const sameBase =
            mode === 'vertical'
              ? ev.verticalCombos === prev.v
              : ev.horizontalCombos === prev.h;

          if (
            sameBase &&
            ev.combos === prev.c &&
            ev.clearedCount <= prev.clr &&
            pot <= prev.pot &&
            newSteps >= prev.len
          ) continue;
        }

        visitedBest.set(key, {
          h: ev.horizontalCombos,
          v: ev.verticalCombos,
          c: ev.combos,
          clr: ev.clearedCount,
          pot,
          len: newSteps,
          locked: nextLocked ? 1 : 0,
        });

        candidates.push({
          board: nextBoard,
          held: state.held,
          hole: nextHole,
          r: nr,
          c: nc,
          path: newPath,
          locked: nextLocked,
          score,
          ...ev,
          pot,
        });

        nodesExpanded++;
      }
    }

    if (candidates.length === 0 || nodesExpanded > maxNodesEffective) break;

    if (priority === 'combo') {
      candidates.sort((a, b) =>
        b.score - a.score ||
        b.clearedCount - a.clearedCount ||
        a.path.length - b.path.length
      );
      beam = candidates.slice(0, cfg.beamWidth);
    } else {
      const buckets = new Map();
      for (const st of candidates) {
        const k =
          (mode === 'vertical' ? st.verticalCombos : st.horizontalCombos) * 1000000 +
          st.combos * 1000 +
          st.clearedCount;
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
  const updateParam = (key, val) => setConfig(prev => ({ ...prev, [key]: key === 'replaySpeed' ? Math.round(parseFloat(val)) : parseFloat(val) }));
  const renderBoard = replayBoard ?? board;
  const replayDone = (!isReplaying && !isPaused && currentStep >= 0);

  const getCellCenter = (p) => {
	  const { x, y } = getCellCenterPx(p.r, p.c);
	  return { x, y };
	};

  const lineIntersection = (P, r, Q, s, eps = 1e-9) => {
  // 解 P + t r  與  Q + u s 的交點
  // 2D cross
  const cross = (a, b) => a.x * b.y - a.y * b.x;

  const rxs = cross(r, s);
  if (Math.abs(rxs) < eps) return null; // 平行或幾乎平行

  const qmp = { x: Q.x - P.x, y: Q.y - P.y };
  const t = cross(qmp, s) / rxs;

  return { x: P.x + r.x * t, y: P.y + r.y * t, t };
};

  const q = (v, unit = 0.25) => Math.round(v / unit) * unit;

  const edgeKey = (a, b) => {
	  const ax = q(a.x), ay = q(a.y);
	  const bx = q(b.x), by = q(b.y);
	  // 無向邊：反向走同一小段也算重合
	  if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
	  return `${bx},${by}|${ax},${ay}`;
	};

  const dirKey = (a, b, eps = 1e-6) => {
	  const dx = b.x - a.x, dy = b.y - a.y;
	  // 你的路徑通常是格子中心點，所以 dx/dy 會是固定步長的倍數
	  // 用 sign 就能穩定分方向（水平/垂直/斜）
	  const sx = Math.abs(dx) < eps ? 0 : Math.sign(dx);
	  const sy = Math.abs(dy) < eps ? 0 : Math.sign(dy);
	  return `${sx},${sy}`;
	};

  // ✅ v3：同方向 run 只要「前綴或後綴」有重合，就把整段 A->D 一次鼓包
  const collapseUpcomingOverlapRunsV3 = (
	  pts,
	  {
		prefixMinEdges = 1, // 前綴重合 >= 1 就觸發
		suffixMinEdges = 1, // 後綴重合 >= 1 就觸發（你這題要的）
		fullMinEdges = 3,   // 整段全重合時至少幾條邊才鼓包（避免太短抖動）
		bump = 14,
		bumpRamp = 14,
		eps = 1e-6,
	  } = {}
	) => {
	  if (!pts || pts.length < 2) return pts;

	  const visited = new Set();
	  const out = [pts[0]];
	  
	  const hypot = (x, y) => Math.hypot(x, y);

	  const addRunEdgesToVisited = (fromIdx, toIdx) => {
		for (let k = fromIdx; k < toIdx; k++) {
		  visited.add(edgeKey(pts[k], pts[k + 1]));
		}
	  };

	  const lineIntersection = (P, r, Q, s, eps = 1e-9) => {
	  const cross = (a, b) => a.x * b.y - a.y * b.x;
	  const rxs = cross(r, s);
	  if (Math.abs(rxs) < eps) return null;

	  const qmp = { x: Q.x - P.x, y: Q.y - P.y };
	  const t = cross(qmp, s) / rxs;
	  return { x: P.x + r.x * t, y: P.y + r.y * t, t };
	};

	const pushBumpWholeRun = (C, A, B, D) => {
  // m = A->B
  const mdx = B.x - A.x;
  const mdy = B.y - A.y;
  const mL  = hypot(mdx, mdy);

  // 不夠資訊 / 退化：直接回到 D
  if (mL <= eps) {
    out.push(D);
    return;
  }

  // m 的單位方向 u 與法線 n（鼓包方向用 +n）
  const ux = mdx / mL, uy = mdy / mL;
  const nx = -uy, ny = ux;

  // bump 最大距離 h（沿法線）
  // 你原本就是這樣算的：h = min(bump, L*0.25)
  // 這裡 L 用 A->D（run 的長度）讓長 run 不會 h 過大
  const rdx = D.x - A.x;
  const rdy = D.y - A.y;
  const rL  = hypot(rdx, rdy);
  const h   = Math.min(bump, rL * 0.25);

  // 平行線 n：通過 (A + n*h)，方向 = u
  const P = { x: A.x + nx * h, y: A.y + ny * h };
  const r = { x: ux, y: uy };

   // ✅ 沒有 C（run 在最前面）或退化：直接走 fallback 鼓包
  if (!C || mL <= eps || rL <= eps) {
    const nx = mL > eps ? -(mdy / mL) : 0;
    const ny = mL > eps ?  (mdx / mL) : 0;
    const h  = Math.min(bump, rL * 0.25);
    const L  = Math.max(rL, 1);
    const t  = Math.max(2, Math.min(bumpRamp, L * 0.33));

    const bumpIn  = { x: A.x + (rdx / L) * t + nx * h, y: A.y + (rdy / L) * t + ny * h };
    const bumpOut = { x: D.x - (rdx / L) * t + nx * h, y: D.y - (rdy / L) * t + ny * h };

    out.push(bumpIn, bumpOut, D);
    return;
  }

  // C2 = (C->A 的延長線) ∩ n
  const rCA = { x: A.x - C.x, y: A.y - C.y };
  const hitC = lineIntersection(P, r, C, rCA, 1e-9);

  // D2 = (B->D 的延長線) ∩ n
  const rBD = { x: D.x - B.x, y: D.y - B.y };
  const hitD = lineIntersection(P, r, B, rBD, 1e-9);

  // 任一交點不存在：fallback 回你原本鼓包
  if (!hitC || !hitD) {
    const L = rL;
    if (L <= eps) { out.push(D); return; }

    const t = Math.max(2, Math.min(bumpRamp, L * 0.33));
    const bumpIn  = { x: A.x + (rdx / L) * t + nx * h, y: A.y + (rdy / L) * t + ny * h };
    const bumpOut = { x: D.x - (rdx / L) * t + nx * h, y: D.y - (rdy / L) * t + ny * h };

    out.push(bumpIn, bumpOut, D);
    return;
  }

  // ✅ 你的需求：把 C、D 偏移到交點，使鼓包段變直線（沿 n）
  const C2 = { x: hitC.x, y: hitC.y };
  const D2 = { x: hitD.x, y: hitD.y };

  // out 目前通常已經有 A（外面 out = [pts[0]]，且你在 run 分支直接 pushBumpWholeRun）
  // 所以這裡補上 C2->D2->D
  out.push(C2, D2, D);
};

  let i = 0;
  while (i < pts.length - 1) {
    const d = dirKey(pts[i], pts[i + 1], eps);

    // 找同方向 run：pts[i..j]
    let j = i + 1;
    while (j < pts.length - 1 && dirKey(pts[j], pts[j + 1], eps) === d) j++;

    const edgesCount = j - i;
    const A = pts[i];
    const D = pts[j];

    // 1) 前綴重合長度 p
    let p = 0;
    while (p < edgesCount && visited.has(edgeKey(pts[i + p], pts[i + p + 1]))) {
      p++;
    }

    // 2) 後綴重合長度 s
    let s = 0;
    while (s < edgesCount && visited.has(edgeKey(pts[j - 1 - s], pts[j - s]))) {
      s++;
    }

    const fullOverlapped = (p === edgesCount); // (= s 也會等於 edgesCount)
    const triggerFull = fullOverlapped && edgesCount >= fullMinEdges;

    // ✅ 你要的：後綴重合也觸發整段鼓包
    const triggerPrefix = (!fullOverlapped) && (p >= prefixMinEdges);
    const triggerSuffix = (!fullOverlapped) && (s >= suffixMinEdges);

    if (triggerFull || triggerPrefix || triggerSuffix) {
      const C = (i > 0) ? pts[i - 1] : null;     // run 前一點（可能沒有）
  const B = pts[j - 1];                      // run 最後一條邊的起點（一定有）
  pushBumpWholeRun(C, A, B, D);

      // ✅ 把 run 中「新邊」加入 visited，避免後續判斷錯
      // - 前綴重合：新增的是後半 [i+p .. j-1]
      // - 後綴重合：新增的是前半 [i .. j-s-1]
      // - 兩邊都有：新增的是中間那段
      const newStart = i + p;
      const newEnd   = j - s;

      if (newStart < newEnd) addRunEdgesToVisited(newStart, newEnd);

      // 若你想更保守/一致，也可直接 addRunEdgesToVisited(i, j);

    } else {
      // 正常輸出
      for (let k = i; k < j; k++) {
        visited.add(edgeKey(pts[k], pts[k + 1]));
        out.push(pts[k + 1]);
      }
    }

    i = j;
  }

  return out;
};

//1122
  const hypot = (x, y) => Math.hypot(x, y);

  // 回傳：把 C-A-B-D 的 A->B 鼓包，改成沿著「與 AB 平行且距離 h」的直線 detour
// 會產生 C' 與 D'：
//   C' = line(C->A) 與 line_n 的交點
//   D' = line(B->D) 與 line_n 的交點
  const straightenBumpToParallelLine = (C, A, B, D, h, eps = 1e-6) => {
	  const hypot = (x, y) => Math.hypot(x, y);

	  const abx = B.x - A.x, aby = B.y - A.y;
	  const LAB = hypot(abx, aby);
	  if (LAB < eps) return null;

	  // m 的方向 u 與法線 n
	  const ux = abx / LAB, uy = aby / LAB;
	  const nx0 = -uy, ny0 = ux;

	  // 你原本鼓包可能在法線正向或反向：選一邊讓 detour 不會「跑到反方向」
	  // 用「看 C 在哪邊」來決定：讓 n 朝向遠離 C 的那側（通常比較符合鼓包外凸）
	  const acx = C.x - A.x, acy = C.y - A.y;
	  const side = Math.sign(acx * nx0 + acy * ny0); // C 在法線哪側
	  const sign = (side >= 0) ? -1 : 1;            // 取反側當外凸
	  const nx = nx0 * sign, ny = ny0 * sign;

	  // 平行線 n：穿過 A + n*h，方向 u
	  const Pn = { x: A.x + nx * h, y: A.y + ny * h };
	  const rn = { x: ux, y: uy };

	  // 交點：n 與 CA 延長線
	  const rCA = { x: A.x - C.x, y: A.y - C.y };
	  const hitC = lineIntersection(Pn, rn, C, rCA, 1e-9);

	  // 交點：n 與 BD 延長線
	  const rBD = { x: D.x - B.x, y: D.y - B.y };
	  const hitD = lineIntersection(Pn, rn, B, rBD, 1e-9);

	  if (!hitC || !hitD) return null;

	  return {
		C2: { x: hitC.x, y: hitC.y }, // C'
		D2: { x: hitD.x, y: hitD.y }, // D'
		nx, ny, ux, uy
	  };
	};

  const laneOf = (count) => {
	  // 0, +1, -1, +2, -2 ...
	  if (count === 0) return 0;
	  return (count % 2 === 1) ? (count + 1) / 2 : -(count / 2);
	};

  const dedupePts = (pts, eps = 1e-6) => {
	  if (!pts || pts.length < 2) return pts;
	  const out = [pts[0]];
	  for (let i = 1; i < pts.length; i++) {
		const p = pts[i], q0 = out[out.length - 1];
		if (Math.hypot(p.x - q0.x, p.y - q0.y) > eps) out.push(p);
	  }
	  return out;
	};

	// ✅ v2：用「單步邊」偵測重疊 + 把連續重疊合併成 run，做順滑 detour
  const deOverlapByRampedDetourV2 = (pts, spacing = 8, ramp = 14, eps = 1e-6) => {
	  const clean = dedupePts(pts, eps);
	  if (!clean || clean.length < 2) return clean;

	  const used = new Map();     // edgeKey -> times seen
	  const out = [clean[0]];

	  // run 狀態
	  let inRun = false;
	  let runStart = null;        // run 起點（原座標）
	  let runEnd = null;          // run 終點（原座標，會一路延伸）
	  let runDir = null;          // {ux, uy, nx, ny}
	  let runOff = 0;             // offset
	  let runLen = 0;             // run 長度（像素）

	  const flushRun = () => {
		if (!inRun) return;

		const a = runStart;
		const b = runEnd;
		const L = runLen;

		// ramp 不要吃光，run 越長越可以拉大一點，但仍有限制
		const t = Math.max(2, Math.min(ramp, L * 0.33));

		const { ux, uy, nx, ny } = runDir;
		const off = runOff;

		const pIn = {
		  x: a.x + ux * t + nx * off,
		  y: a.y + uy * t + ny * off,
		};
		const pOut = {
		  x: b.x - ux * t + nx * off,
		  y: b.y - uy * t + ny * off,
		};

		// out 最後一點已經是 a，所以 push detour 點與 b
		out.push(pIn, pOut, b);

		inRun = false;
		runStart = runEnd = runDir = null;
		runOff = 0;
		runLen = 0;
	  };

	  for (let i = 0; i < clean.length - 1; i++) {
		const a = clean[i];
		const b = clean[i + 1];

		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const L = hypot(dx, dy);
		if (L <= eps) continue;

		// 單步邊 key（這裡 a->b 通常就是一步）
		const k = edgeKey(a, b);
		const cnt = used.get(k) || 0;
		used.set(k, cnt + 1);

		const isOverlap = cnt > 0;

		if (!isOverlap) {
		  // 遇到非重疊邊：先把正在 detour 的 run 結束
		  flushRun();
		  out.push(b);
		  continue;
		}

		// 重疊邊：計算這條邊該用的 lane / offset
		const ux = dx / L;
		const uy = dy / L;
		const nx = -uy;
		const ny = ux;

		const lane = laneOf(cnt);       // 第2次、第3次…各走不同 lane
		const off  = lane * spacing;

		if (!inRun) {
		  // 開新 run：從 a 開始 detour
		  inRun = true;
		  runStart = a;
		  runEnd = b;
		  runDir = { ux, uy, nx, ny };
		  runOff = off;
		  runLen = L;
		} else {
		  // 如果方向相同 + offset 相同，延長 run（保持一路都不貼合）
		  const sameDir =
			Math.abs(runDir.ux - ux) < 1e-6 &&
			Math.abs(runDir.uy - uy) < 1e-6;
		  const sameOff = Math.abs(runOff - off) < 1e-6;

		  if (sameDir && sameOff) {
			runEnd = b;
			runLen += L;
		  } else {
			// 方向或 lane 變了：先結束舊 run，再開新 run
			flushRun();
			inRun = true;
			runStart = a;
			runEnd = b;
			runDir = { ux, uy, nx, ny };
			runOff = off;
			runLen = L;
		  }
		}
	  }

	  flushRun();
	  return out;
	};

  const simplifyPts = (pts, eps = 1e-6) => {
	  if (!pts || pts.length < 2) return pts;

	  // 1) 去掉重複點
	  const a = [pts[0]];
	  for (let i = 1; i < pts.length; i++) {
		const p = pts[i];
		const q = a[a.length - 1];
		if (Math.hypot(p.x - q.x, p.y - q.y) > eps) {
		  a.push(p);
		}
	  }

	  if (a.length < 3) return a;

	  // 2) 去掉同方向直線上的中繼點
	  const out = [a[0]];
	  for (let i = 1; i < a.length - 1; i++) {
		const p0 = out[out.length - 1];
		const p1 = a[i];
		const p2 = a[i + 1];

		const v1x = p1.x - p0.x;
		const v1y = p1.y - p0.y;
		const v2x = p2.x - p1.x;
		const v2y = p2.y - p1.y;

		const cross = v1x * v2y - v1y * v2x; // 叉積
		const dot   = v1x * v2x + v1y * v2y; // 點積

		// 共線且同方向 → 刪除 p1
		if (Math.abs(cross) < eps && dot > 0) {
		  continue;
		}

		out.push(p1);
	  }

	  out.push(a[a.length - 1]);
	  return out;
	};
  // ====== 核心路徑幾何邏輯：節點端口分配系統 (v12.9) ======
  // ====== 全重疊錯開：Node-Port Lane System ======

  const sampleAlongPolyline = (pts, spacing = 22, startOffset = 10) => {
	  if (!pts || pts.length < 2) return [];

	  // 每段長度
	  const segLen = [];
	  let total = 0;
	  for (let i = 0; i < pts.length - 1; i++) {
		const dx = pts[i + 1].x - pts[i].x;
		const dy = pts[i + 1].y - pts[i].y;
		const L = Math.hypot(dx, dy);
		segLen.push(L);
		total += L;
	  }
	  if (total <= 1e-6) return [];

	  const out = [];
	  // 從 startOffset 開始，每隔 spacing 一個
	  for (let dist = startOffset; dist < total - startOffset; dist += spacing) {
		// 找 dist 落在哪一段
		let acc = 0;
		let i = 0;
		while (i < segLen.length && acc + segLen[i] < dist) {
		  acc += segLen[i];
		  i++;
		}
		if (i >= segLen.length) break;

		const L = segLen[i] || 1;
		const t = (dist - acc) / L;

		const a = pts[i];
		const b = pts[i + 1];

		const x = a.x + (b.x - a.x) * t;
		const y = a.y + (b.y - a.y) * t;

		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const ang = Math.atan2(dy, dx) * 180 / Math.PI; // 讓 +X 對齊切線方向

		out.push({ x, y, ang });
	  }

	  return out;
	};

  const buildPathStringAndMarkersRounded = (pts, radius = 8) => {
	  if (!pts || pts.length < 2) return { d: "", start: null, tip: null };

	  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

	  const moveTowards = (from, to, len) => {
		const d = dist(from, to);
		if (d <= 1e-6) return { ...from };
		const t = len / d;
		return {
		  x: from.x + (to.x - from.x) * t,
		  y: from.y + (to.y - from.y) * t
		};
	  };

	  // 🔥 先簡化點
	  const cleanPts = simplifyPts(pts);

	  const start = cleanPts[0];
	  const tip   = cleanPts[cleanPts.length - 1];

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

		const r = Math.max(
		  0,
		  Math.min(radius, d01 * 0.5, d12 * 0.5)
		);

		if (r <= 1e-6) {
		  dStr += ` L ${p1.x} ${p1.y}`;
		  continue;
		}

		const inPt  = moveTowards(p1, p0, r);
		const outPt = moveTowards(p1, p2, r);

		dStr += ` L ${inPt.x} ${inPt.y}`;
		dStr += ` Q ${p1.x} ${p1.y} ${outPt.x} ${outPt.y}`;
	  }

	  dStr += ` L ${tip.x} ${tip.y}`;

	  return { d: dStr, start, tip };
	};

  const normalizeRcPath = (rcPath) => {
	  if (!rcPath || rcPath.length < 1) return [];
	  const out = [rcPath[0]];
	  for (let i = 1; i < rcPath.length; i++) {
		const p = rcPath[i];
		const q = out[out.length - 1];
		if (p.r !== q.r || p.c !== q.c) out.push(p);
	  }
	  return out;
	};

  const buildSegmentsFromRcPath = (rcPathRaw) => {
	  const rcPath = normalizeRcPath(rcPathRaw);
	  if (rcPath.length < 2) return [];

	  const segments = [];
	  let start = 0;

	  const dir = (a, b) => {
		const dr = b.r - a.r;
		const dc = b.c - a.c;
		// ✅ 理論上不會 0,0（normalize 會去掉），保險
		return `${Math.sign(dr)},${Math.sign(dc)}`;
	  };

	  let d0 = dir(rcPath[0], rcPath[1]);

	  for (let i = 1; i < rcPath.length - 1; i++) {
		const d1 = dir(rcPath[i], rcPath[i + 1]);
		if (d1 !== d0) {
		  segments.push({ start, end: i });
		  start = i;
		  d0 = d1;
		}
	  }

	  segments.push({ start, end: rcPath.length - 1 });
	  return segments;
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
	  const laneOf = (count) => (count === 0 ? 0 : (count % 2 ? (count + 1) / 2 : -(count / 2)));

	  for (let s = 0; s < segs.length; s++) {
		const { start, end } = segs[s];

		// A,B: 用段的首尾
		const A = rcPath[start];
		const B = rcPath[end];

		const pA = getCellCenterPx(A.r, A.c);
		const pB = getCellCenterPx(B.r, B.c);

		let dx = pB.x - pA.x;
		let dy = pB.y - pA.y;
		let L = Math.hypot(dx, dy);

		// ✅ 如果 L 太短或怪，改用「段內第一個有效方向」來定向（但仍會畫 label）
		if (!Number.isFinite(L) || L < 1e-6) {
		  // 找段內第一個不同點
		  let i = start;
		  while (i < end && rcPath[i].r === rcPath[i + 1].r && rcPath[i].c === rcPath[i + 1].c) i++;
		  if (i < end) {
			const p1 = getCellCenterPx(rcPath[i].r, rcPath[i].c);
			const p2 = getCellCenterPx(rcPath[i + 1].r, rcPath[i + 1].c);
			dx = p2.x - p1.x;
			dy = p2.y - p1.y;
			L = Math.hypot(dx, dy);
		  }
		}

		// ✅ 保證有方向：再不行就給一個水平
		if (!Number.isFinite(L) || L < 1e-6) {
		  dx = 1; dy = 0; L = 1;
		}

		// ✅ 不再 continue：短段也畫，只是用 minPxLen 讓偏移穩定
		const LforCalc = Math.max(L, minPxLen);
		const ux = dx / L;
		const uy = dy / L;
		const nx = -uy;
		const ny = ux;

		const mx = (pA.x + pB.x) / 2;
		const my = (pA.y + pB.y) / 2;

		const key = segKey(pA, pB);
		const count = usage.get(key) || 0;
		usage.set(key, count + 1);
		const lane = laneOf(count);

		const alongMax = Math.max(0, LforCalc * 0.45 - (labelR + 2));
		const along = Math.min(alongBase, alongMax);

		const x = mx + nx * off + ux * (along * lane);
		const y = my + ny * off + uy * (along * lane);

		labels.push({ idx: labels.length + 1, x, y });
	  }

	  return labels;
	};
  
  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans">
		<div className="sticky top-0 z-[3000] bg-neutral-900/95 backdrop-blur border-b border-white/10">
		  <div className="mx-auto max-w-5xl w-full px-4 py-3 flex items-center justify-between">
			<div className="flex items-center gap-3">
			  {/* 左邊可以放你的 logo（可刪） */}
			  <img src={logoImg} className="w-8 h-8" alt="" />

			  <h1 className="text-lg md:text-xl font-black tracking-wide">
				  Tower of Saviors 神魔之塔自動轉珠模擬器
				</h1>
			</div>

			{/* 右邊可以放小按鈕（可刪） */}
			{/* <button className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm">?</button> */}
		  </div>
		</div>
		<div className="mx-auto max-w-5xl w-full px-4 py-4">
		   <div className="max-w-5xl w-full">
			{/* 四組模式切換器 - 改為比例 2:2:1:1 */}
			<div className="grid grid-cols-6 gap-1.5 mb-8 text-[14px]">
			  {/* 排向 - 佔 2/6 */}
			  <div className="col-span-2 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
				<button onClick={() => setSolverMode('horizontal')} className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${solverMode === 'horizontal' ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  <Rows size={14} /> 橫排
				</button>
				<button onClick={() => setSolverMode('vertical')} className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${solverMode === 'vertical' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  直排 <Columns size={14} />
				</button>
			  </div>
			  {/* 優先級 - 佔 2/6 */}
			  <div className="col-span-2 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
				<button onClick={() => setPriorityMode('combo')} className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${priorityMode === 'combo' ? 'bg-emerald-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  <Trophy size={14} /> 消除
				</button>
				<button onClick={() => setPriorityMode('steps')} className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${priorityMode === 'steps' ? 'bg-amber-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  步數 <Footprints size={14} />
				</button>
			  </div>
			  {/* 疊珠 - 佔 1/6 */}
			  <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
				<button onClick={() => setSkyfallEnabled(!skyfallEnabled)} className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${skyfallEnabled ? 'bg-purple-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  疊珠 <CloudLightning size={14} />
				</button>
			  </div>
			  {/* 斜轉 - 佔 1/6 */}
			  <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
				<button onClick={() => setDiagonalEnabled(!diagonalEnabled)} className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${diagonalEnabled ? 'bg-rose-600 text-white' : 'text-neutral-500 hover:bg-neutral-800'}`}>
				  斜轉 {diagonalEnabled ? <MoveUpRight size={14} /> : <Move size={14} />}
				</button>
			  </div>
			</div>

			{/* 數據面板 */}
			<div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">

			  <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800 flex items-center justify-center gap-2">
				<span className="text-xs text-neutral-500 font-bold uppercase italic">
				  上限組數:
				</span>
				<span className="text-2xl font-black text-white/40">
				  {stats.theoreticalMax}
				</span>
			  </div>

			  <div className="bg-blue-900/20 p-3 rounded-xl border border-blue-500/30 ring-1 ring-blue-500/20 flex items-center justify-center gap-2">
				<span className="text-xs text-blue-400 font-bold uppercase italic">
				  總消除組數:
				</span>
				<span className="text-2xl font-black text-blue-400">
				  {stats.combos}
				  {stats.skyfallCombos > 0 ? `+${stats.skyfallCombos}` : ''}
				</span>
			  </div>

			  <div className="bg-indigo-900/20 p-3 rounded-xl border border-indigo-500/30 ring-1 ring-indigo-500/20 flex items-center justify-center gap-2">
				<span className="text-xs text-indigo-400 font-bold uppercase italic">
				  {solverMode === 'horizontal' ? '橫向:' : '直向:'}
				</span>
				<span className="text-2xl font-black text-indigo-400">
				  {solverMode === 'horizontal'
					? stats.horizontalCombos
					: stats.verticalCombos}
				</span>
			  </div>

			  <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800 flex items-center justify-center gap-2">
				<span className="text-xs text-neutral-500 font-bold uppercase italic">
				  消除符石數:
				</span>
				<span className="text-2xl font-black text-purple-400">
				  {stats.clearedOrbs}
				</span>
			  </div>

			  <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-800 flex items-center justify-center gap-2">
				<span className="text-xs text-neutral-500 font-bold uppercase italic">
				  步數:
				</span>
				<span className="text-2xl font-black text-emerald-400">
				  {stats.steps}
				</span>
			  </div>

			</div>

			{/* 基本設定面板 */}
			<div className="mb-3 bg-neutral-900/80 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
			  <div className="w-full p-3 flex items-center justify-between bg-blue-900/10 border-b border-neutral-800">
				<button onClick={() => setShowBasicSettings(!showBasicSettings)} className="flex items-center gap-2 text-[14px] font-bold text-blue-300 pl-2"><Settings size={18} /> 基本設定與目標</button>
				<div className="flex items-center gap-3 pr-2"><button onClick={resetBasic} className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-all border border-neutral-700 shadow-sm"><RotateCcw size={14} /> 恢復預設</button><span className="text-xs text-neutral-600 uppercase font-bold cursor-pointer" onClick={() => setShowBasicSettings(!showBasicSettings)}>{showBasicSettings ? '收起' : '展開'}</span></div>
			  </div>
			  {showBasicSettings && (
				  <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 bg-neutral-900/40">
					<ParamSlider
					  label="🎯 期望目標 Combo"
					  value={targetCombos}
					  min={1}
					  max={stats.theoreticalMax || 1}
					  step={1}
					  inputMode="numeric"
					  formatInput={(v) => String(v)} // 整數
					  onChange={(n) => setTargetCombos(parseInt(n, 10))}
					/>
					<ParamSlider
					  label="⏱️ 播放速度 (s/步)"
					  value={config.replaySpeed / 1000}
					  min={0.08}
					  max={0.45}
					  step={0.01}
					  inputMode="decimal"
					  formatInput={(v) => Number(v).toFixed(2)}              // ✅ input 也固定兩位
					  onChange={(n) => updateParam('replaySpeed', n * 1000)}
					/>
					<ParamSlider
					  label="📏 步數上限 (Steps)"
					  value={config.maxSteps}
					  min={5}
					  max={240}
					  step={1}
					  inputMode="numeric"
					  formatInput={(v) => String(v)}
					  onChange={(n) => updateParam('maxSteps', n)}
					/>
				  </div>
				)}
			</div>

			{/* 進階設定面板 */}
			<div className="mb-6 bg-neutral-900/80 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
			  <div className="w-full p-3 flex items-center justify-between bg-zinc-800/30 border-b border-neutral-800">
				<button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-2 text-[14px] font-bold text-neutral-400 pl-2"><Settings2 size={18} /> 進階搜尋參數調優</button>
				<div className="flex items-center gap-3 pr-2"><button onClick={resetAdvanced} className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-all border border-neutral-700 shadow-sm"><RotateCcw size={14} /> 恢復預設</button><span className="text-xs text-neutral-600 uppercase font-bold cursor-pointer" onClick={() => setShowConfig(!showConfig)}>{showConfig ? '收起' : '展開'}</span></div>
			  </div>
			  {showConfig && (<div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 border-t border-neutral-800 bg-neutral-900/40">
				  <ParamSlider label="束寬 (Beam Width)" value={config.beamWidth} min={40} max={1050} step={10} onChange={(v) => updateParam('beamWidth', v)} />
				  <ParamSlider label="潛在權重 (Potential)" value={config.potentialWeight} min={0} max={4500} step={50} onChange={(v) => updateParam('potentialWeight', v)} />
				  <ParamSlider label="節點上限" value={config.maxNodes} min={10000} max={600000} step={10000} onChange={(v) => updateParam('maxNodes', v)} />
				  <ParamSlider label="達標後步數懲罰" value={config.stepPenalty} min={0} max={1500} step={50} onChange={(v) => updateParam('stepPenalty', v)} />
				</div>)}
			</div>

			{/* 棋盤容器 */}
			<div style={{ contain: 'layout paint' }} ref={boardWrapRef} className="relative bg-neutral-900 p-3 rounded-3xl shadow-2xl border-2 border-neutral-800 mb-6 mx-auto w-fit overflow-visible" >
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
						  currentStep >= 0 &&               // ✅ 從第 0 步才開始算“移動”
						  path[currentStep]?.r === r &&
						  path[currentStep]?.c === c;
						return (
						  <div
							key={`${r}-${c}`}
							data-cell={`${r}-${c}`}
							className={`relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center transition-all duration-75
							  ${r === 0 ? 'ring-2 ring-yellow-400 z-10 rounded-2xl' : 'rounded-2xl'}
							  ${isMoving ? 'opacity-20 z-40' : 'opacity-100'}
							`}
							style={{ backgroundColor: '#171717' }}
						  >
							{orb === -1 ? (
							  <div className="w-[96%] h-[96%] rounded-2xl bg-black/40 border border-white/10" />
							) : (
							  <>
								<img
								  src={Object.values(ORB_TYPES).find(t => t.id === orbOf(orb))?.img}
								  className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
								  draggable={false}
								  alt=""
								/>

								{xMarkOf(orb) === 1 && (
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
								
								{qMarkOf(orb) === 1 && !(r === 0 && replayDone) && (
								  <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
									Start
								  </div>
								)}

								{qMarkOf(orb) === 2 && (
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
				<svg ref={overlayRef} className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-[60]" style={{ overflow: 'visible' }}>
				  <defs>
					<filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
					  <feGaussianBlur stdDeviation="3" result="blur" />
					  <feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					  </feMerge>
					</filter>
					<filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
					  <feGaussianBlur stdDeviation="3" result="blur" />
					  <feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					  </feMerge>
					</filter>
				  </defs>

				  {(() => {
					if (!path || path.length < 2) return null;

					const visiblePath = path.slice(0, currentStep + 1);
					if (visiblePath.length < 2) return null;

					const pts0 = buildPixelPath(visiblePath);

					const bumpPx = Math.max(10, Math.min(22, stableCellSize * 0.22));
					const rampPx = Math.max(10, Math.min(22, stableCellSize * 0.22));

					const ptsJump = collapseUpcomingOverlapRunsV3(pts0, {
					  prefixMinEdges: 1,
					  suffixMinEdges: 1,
					  fullMinEdges: 3,
					  bump: bumpPx,
					  bumpRamp: rampPx,
					});

					const ptsDetour = deOverlapByRampedDetourV2(ptsJump, 8, 14);
					const { d, start, tip } = buildPathStringAndMarkersRounded(ptsDetour, 10);

					const triMarks = replayDone
					  ? sampleAlongPolyline(ptsDetour, 22, 14)  // spacing, startOffset 你可調
					  : [];

					// ✅ 段號：只看原始 rcPath (visiblePath) 的轉折
					// ✅ 位置：投影到 ptsDetour
					const segLabels = replayDone
					  ? buildSegmentLabelsFromRcPath(visiblePath, getCellCenterPx, {
						  cellSize: stableCellSize,
						  labelR: 8,
						  pathStroke: 4,
						  gap: -2,
						  alongScale: 0.22,
						  minPxLen: 10,
						})
					  : [];
					
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
						  {/* 中：陰影（先畫，才會在後面） */}
						  <path
							d={d}
							stroke="rgba(0,0,0,0.55)"
							strokeWidth="10"
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
							  filter: "blur(3.5px)",
							  // 陰影不要用 screen，不然會變淡甚至看不到
							  mixBlendMode: "normal",
							}}
							opacity={0.9}
						  />

						  {/* 外：光暈（再畫） */}
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

						  {/* 裡：白色核心（最後畫，最清晰） */}
						  <path
							d={d}
							stroke="white"
							strokeWidth="4"
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
							  // 核心不要 blur
							  mixBlendMode: "screen",
							}}
							opacity={0.95}
						  />
						</>
						
						{replayDone && triMarks.length > 0 && (
						  <g opacity={1}>
							{triMarks.map((m, idx) => {
							  const leg = 4;

								// 🔥 越小越尖：45=原本，30=更尖(60°)，25=更尖(50°)
								const angleDeg = 30;
								const theta = angleDeg * Math.PI / 180;

								// 兩條腿端點（以角點 0,0 為中心，往後(-x)展開）
								const dx = -leg * Math.cos(theta);
								const dy =  leg * Math.sin(theta);

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
							{segLabels.map(s => (
							  <g key={s.idx}>
								{/* 背板圓 */}
								<circle
								  cx={s.x}
								  cy={s.y}
								  r={7}                        // 10 → 8
								  fill="rgba(0,0,0,0.75)"
								  stroke="rgba(255,255,255,0.35)"
								  strokeWidth="1.2"            // 1.5 → 1.2
								/>
								{/* 段號 */}
								<text
								  x={s.x}
								  y={s.y + 3}                  // 4 → 3
								  textAnchor="middle"
								  fontSize="9"                // 12 → 10
								  fontWeight="900"
								  fill="white"
								  style={{ pointerEvents: "none", userSelect: "none" }}
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
							<animate attributeName="r" values="15;21;15" dur="0.8s" repeatCount="indefinite" />
							<animate attributeName="opacity" values="1;0.5;1" dur="0.8s" repeatCount="indefinite" />
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
						{/* 光暈（在圖層下） */}
						{/* 🔵 高濃厚版光暈 */}
						<div className="absolute z-0 flex items-center justify-center">

					  {/* 集中高能核心 */}
					  <div
						className="absolute rounded-full blur-lg opacity-100"
						style={{
						  width: 90,
						  height: 90,
						  background:
							"radial-gradient(circle, rgba(99,102,241,1) 0%, rgba(99,102,241,0.95) 40%, rgba(99,102,241,0.6) 65%, rgba(0,0,0,0) 80%)",
						}}
					  />

					  {/* 強白色核心提亮 */}
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

						{/* orb 本體 */}
						<img
						  src={Object.values(ORB_TYPES).find(t => t.id === floating.orbId)?.img}
						  className="relative w-16 h-16 md:w-20 md:h-20 block drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]"
						  draggable={false}
						  alt=""
						/>
					  </div>
					)}
				  </div>
				  {solving && (<div className="absolute inset-0 bg-neutral-950/90 rounded-3xl flex flex-col items-center justify-center z-20 backdrop-blur-xl">
					  <div className="relative w-24 h-24 mb-6">
						<div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
						<div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
						{priorityMode === 'steps' ? <Footprints className="absolute inset-0 m-auto text-amber-400 animate-pulse" size={32} /> : <Trophy className="absolute inset-0 m-auto text-emerald-400 animate-pulse" size={32} />}
					  </div>
					  <p className="font-black text-xl text-indigo-500 tracking-[0.2em] animate-pulse uppercase">{skyfallEnabled ? 'Skyfall Analysis' : priorityMode === 'steps' ? 'Optimizing Time' : 'Deep Searching'}</p>
					</div>)}
				   {/* ✅ GIF footer：會被 toCanvas 一起截進去 */}
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
			  <button onClick={() => initBoard(true)} disabled={solving || isReplaying || exportingGif} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-6 py-4 rounded-2xl font-bold transition-all text-sm border border-neutral-700 shadow-md active:scale-95"><RefreshCw size={20} /> 隨機生成</button>
			  <button onClick={handleOpenEditor} disabled={solving || isReplaying || exportingGif} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-6 py-4 rounded-2xl font-bold transition-all text-sm border border-neutral-700 shadow-md active:scale-95"><Edit3 size={20} /> 自訂版面</button>
			  <button onClick={solve} disabled={solving || isReplaying || showEditor || exportingGif} className={[ "flex items-center gap-2 px-8 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95", (solving || isReplaying || showEditor || exportingGif) ? "opacity-20" : "", needsSolve ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-emerald-900/30 text-white" : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200" ].join(" ")} title={needsSolve ? "參數已變更，尚未重新計算" : "目前結果已是最新"} > <Lightbulb size={20} /> {solving ? "計算中..." : (needsSolve ? "待計算" : "已計算")} </button>
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
					disabled={solving || exportingGif ||(path.length === 0 && !isReplaying && !isPaused)}
					className={[
					  "flex items-center gap-2 px-10 py-4 rounded-2xl font-black shadow-xl transition-all text-base active:scale-95",
					  ((solving || exportingGif)? "opacity-20" : ""),
					  (isReplaying && !isPaused)
						? "bg-red-600 hover:bg-red-500 shadow-red-900/40"
						: isPaused
						  ? "bg-orange-500 hover:bg-orange-400 shadow-orange-900/30"
						  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40"
					].join(" ")}
				  >
					{(isReplaying && !isPaused) ? (
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
						exportingGif ? "opacity-20 pointer-events-none" : ""
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
				  {/* 輸出 GIF 主按鈕 */}
				  <button
					onClick={exportGif}
					disabled={solving || exportingGif || !path || path.length < 2 || isReplaying || isPaused}
					className={[
					  "flex items-center gap-2 px-8 py-4 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
					  (solving || exportingGif || isReplaying || isPaused || !path || path.length < 2) ? "opacity-20" : "",
					  "bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-400/30 shadow-fuchsia-900/30 text-white"
					].join(" ")}
					title="將轉珠播放輸出為 GIF"
				  >
					<Database size={20} />
					{exportingGif
					  ? (gifStage === "render"
						  ? "合成GIF..."
						  : `擷取中... ${gifProgress.pct || 0}%`)
					  : "輸出 GIF"}
				  </button>

				  {/* ⭐ 只有匯出中才出現 */}
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
					  "bg-amber-500 hover:bg-amber-400 border-amber-300/30 shadow-amber-900/30 text-white"
					].join(" ")}
				  >
					<FileDown size={20} />
					下載 GIF
				  </button>
				)}
			</div>

			{/* Modal 編輯器 */}
			{showEditor && (
			  <div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
			  >
				<div
				  className="bg-neutral-900 w-full max-w-xl rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden
							 max-h-[calc(100vh-2rem)] flex flex-col"
				  onClick={(e) => e.stopPropagation()}
				>
				  {/* ✅ 內容區：可滾動 */}
				  <div className="p-6 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }} >
					<div className="flex flex-col items-center">
					  <div className="bg-neutral-950 p-3 rounded-3xl border-2 border-neutral-800 mt-6 mb-8">
						<div className="grid grid-cols-6 gap-0">
						  {editingBoard.map((row, r) => (
							  <React.Fragment key={r}>

								{/* ✅ row0 / row1 分隔粗白線 */}
								{r === 1 && (
								  <div className="col-span-6 h-2 bg-white z-50 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
								)}

								{row.map((orb, c) => (
								  <div
									key={`${r}-${c}`}
									onClick={() => {
									  const next = editingBoard.map(row => [...row]);
									  const cur = next[r][c];

									  const o = orbOf(cur);
									  const xm = xMarkOf(cur);
									  const qm = qMarkOf(cur);

									  // ---------- ORB 刷子 ----------
									  if (selectedMark === 0) {
										next[r][c] = withMarks(selectedBrush, xm, qm);
										setEditingBoard(next);
										return;
									  }

									  // ---------- X1 / X2 ----------
									  if (selectedMark === 1 || selectedMark === 2) {
										const want = selectedMark;
										const nx = (xm === want) ? 0 : want;
										const nq = (nx !== 0) ? 0 : qm;
										next[r][c] = withMarks(o, nx, nq);
										setEditingBoard(next);
										return;
									  }

									  // ---------- Q1 / Q2 ----------
									  if (selectedMark === 3 || selectedMark === 4) {
										const wantQ = (selectedMark === 3) ? 1 : 2;

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
											if (wantQ === 1 && qMarkOf(v) === 2) return;
											if (wantQ === 2 && qMarkOf(v) === 1) return;
										  }
										}

										for (let rr = 0; rr < TOTAL_ROWS; rr++) {
										  for (let cc = 0; cc < COLS; cc++) {
											const v = next[rr][cc];
											if (qMarkOf(v) === wantQ) {
											  next[rr][cc] = withMarks(orbOf(v), xMarkOf(v), 0);
											}
										  }
										}

										next[r][c] = withMarks(o, xm, wantQ);
										setEditingBoard(next);
										return;
									  }
									}}
									className={`relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center transition-all duration-75
									  ${r === 0 ? 'ring-2 ring-yellow-400 z-10 rounded-2xl' : 'rounded-2xl'}
									  ${orbOf(editingBoard[r][c]) === selectedBrush ? 'ring-2 ring-white' : ''}
									`}
								  >
									<img
									  src={Object.values(ORB_TYPES).find(t => t.id === orbOf(orb))?.img}
									  className="w-[90%] h-[90%] object-contain pointer-events-none select-none"
									  draggable={false}
									  alt=""
									/>

									{xMarkOf(orb) === 1 && (
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

									{qMarkOf(orb) === 1 && (
									  <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
										START
									  </div>
									)}

									{qMarkOf(orb) === 2 && (
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
						<div className="grid grid-cols-6 gap-3 mb-2 justify-items-center">
						  {Object.values(ORB_TYPES).map((type) => (
							<button
							  key={type.id}
							  onClick={() => setSelectedBrush(type.id)}
							  className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
								${selectedBrush === type.id ? 'ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20' : 'opacity-70 hover:opacity-100'}`}
							>
							  <img
								src={type.img}
								className="w-[88%] h-[88%] object-contain pointer-events-none select-none"
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
							  ${selectedMark === 0 ? 'ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20' : 'opacity-70 hover:opacity-100'}`}
							title="刷符石（不附加狀態）"
						  >
							<span className="font-black text-neutral-300">ORB</span>
						  </button>

						  <button
							onClick={() => setSelectedMark(1)}
							className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
							  ${selectedMark === 1 ? 'ring-4 ring-red-500 scale-110 shadow-lg shadow-red-500/20' : 'opacity-70 hover:opacity-100'}`}
							title="附加 X1（路徑不可碰）"
						  >
							<img src={x1Img} className="w-[85%] h-[85%] object-contain" draggable={false} alt="" />
						  </button>

						  <button
							onClick={() => setSelectedMark(2)}
							className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
							  ${selectedMark === 2 ? 'ring-4 ring-yellow-400 scale-110 shadow-lg shadow-yellow-400/20' : 'opacity-70 hover:opacity-100'}`}
							title="附加 X2（路徑不可碰，但最後一格可）"
						  >
							<img src={x2Img} className="w-[85%] h-[85%] object-contain" draggable={false} alt="" />
						  </button>
						  
						  <button
							  onClick={() => setSelectedMark(3)}
							  className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
								${selectedMark === 3 ? 'ring-4 ring-cyan-400 scale-110 shadow-lg shadow-cyan-500/20' : 'opacity-70 hover:opacity-100'}`}
							  title="附加 Start（計算從此格開始，最多一個，再點取消）"
							>
							  <span className="font-black text-cyan-300 text-lg">START</span>
							</button>

							<button
							  onClick={() => setSelectedMark(4)}
							  className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
								${selectedMark === 4 ? 'ring-4 ring-fuchsia-400 scale-110 shadow-lg shadow-fuchsia-500/20' : 'opacity-70 hover:opacity-100'}`}
							  title="附加 End（計算在此格結束，最多一個，再點取消）"
							>
							  <span className="font-black text-fuchsia-300 text-lg">END</span>
							</button>
						</div>
					  </div>
					</div>
				  </div>

				  {/* ✅ 底部按鈕：固定在底部，不會被內容擠出畫面 */}
				  <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 p-4">
					<div className="grid grid-cols-2 gap-0 w-full">
					  <button
						onClick={() => setShowEditor(false)}
						className="w-full py-5 rounded-2xl font-bold bg-neutral-800 hover:bg-neutral-700 transition-colors text-base"
					  >
						取消
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
				<strong className="text-indigo-400 block mb-1 text-base">功能介紹：</strong>
				 <strong className="block text-xs">
				  自動轉珠模擬器，全自動搜尋最優路徑。自訂盤面模擬、疊珠與斜轉判定、
				  完整顯示 Combo 數、總消除符石數與移動步數。
				  可設定目標 Combo、步數上限與回放速度。
				</strong>

				{/* 🔗 新增連結 */}
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