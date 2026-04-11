import fs from "fs";
import { performance } from "perf_hooks";

const COLS = 6;
const TOTAL_ROWS = 6;
const PLAY_ROWS_START = 1;
const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_8 = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = "true";
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
};

const asInt = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
};
const asFloat = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const asBool = (v, d = false) => {
  if (v == null) return d;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return d;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const orbOf = (v) => (v < 0 ? -1 : v % 10);
const xMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 10) % 10);
const qMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 100) % 10);

const clone2D = (b) => b.map((row) => row.slice());
const boardWithHeldFilled = (b, hole, held) => {
  if (!hole) return clone2D(b);
  const out = clone2D(b);
  out[hole.r][hole.c] = held;
  return out;
};
const holeStepInPlace = (b, hole, to) => {
  const moved = b[to.r][to.c];
  b[hole.r][hole.c] = moved;
  b[to.r][to.c] = -1;
  return { r: to.r, c: to.c };
};

const applyGravity = (b, toClear1D) => {
  const next = clone2D(b);
  for (let c = 0; c < COLS; c++) {
    let w = TOTAL_ROWS - 1;
    for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) {
      if (!toClear1D[r * COLS + c]) next[w--][c] = b[r][c];
    }
    for (let r = w; r >= PLAY_ROWS_START; r--) next[r][c] = -1;
  }
  return next;
};

const potentialScore = (b, mode) => {
  let p = 0;
  const hw = mode === "horizontal" ? 3 : 0.5;
  const vw = mode === "vertical" ? 3 : 0.5;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    let a = orbOf(b[r][0]);
    let d = orbOf(b[r][1]);
    for (let c = 0; c < COLS - 2; c++) {
      const e = orbOf(b[r][c + 2]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += hw;
      }
      a = d;
      d = e;
    }
  }

  for (let c = 0; c < COLS; c++) {
    let a = orbOf(b[PLAY_ROWS_START][c]);
    let d = PLAY_ROWS_START + 1 < TOTAL_ROWS ? orbOf(b[PLAY_ROWS_START + 1][c]) : -1;
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const e = orbOf(b[r + 2][c]);
      if (a !== -1) {
        if ((a === d && a !== e) || (d === e && a !== d) || (a === e && a !== d)) p += vw;
      }
      a = d;
      d = e;
    }
  }
  return p;
};

const findMatches = (tempBoard) => {
  let combos = 0, clearedCount = 0, vC = 0, hC = 0;
  const total = TOTAL_ROWS * COLS;
  const isH = new Uint8Array(total);
  const isV = new Uint8Array(total);
  const toClear1D = new Uint8Array(total);

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2;) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) { c++; continue; }
      const v1 = orbOf(tempBoard[r][c + 1]);
      const v2 = orbOf(tempBoard[r][c + 2]);
      if (v0 !== v1 || v0 !== v2) { c++; continue; }
      let k = c + 3;
      while (k < COLS && orbOf(tempBoard[r][k]) === v0) k++;
      for (let x = c; x < k; x++) {
        toClear1D[r * COLS + x] = 1;
        isH[r * COLS + x] = 1;
      }
      c = k;
    }
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2;) {
      const v0 = orbOf(tempBoard[r][c]);
      if (v0 === -1) { r++; continue; }
      const v1 = orbOf(tempBoard[r + 1][c]);
      const v2 = orbOf(tempBoard[r + 2][c]);
      if (v0 !== v1 || v0 !== v2) { r++; continue; }
      let k = r + 3;
      while (k < TOTAL_ROWS && orbOf(tempBoard[k][c]) === v0) k++;
      for (let y = r; y < k; y++) {
        toClear1D[y * COLS + c] = 1;
        isV[y * COLS + c] = 1;
      }
      r = k;
    }
  }

  const vis = new Uint8Array(total);
  const drs = [0, 0, 1, -1];
  const dcs = [1, -1, 0, 0];
  const qR = new Int8Array(total);
  const qC = new Int8Array(total);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i0 = r * COLS + c;
      if (!toClear1D[i0] || vis[i0]) continue;
      combos++;
      const type = orbOf(tempBoard[r][c]);
      let hm = false, vm = false;
      let h = 0, t = 0;
      qR[t] = r; qC[t] = c; t++;
      vis[i0] = 1;
      while (h < t) {
        const cr = qR[h], cc = qC[h]; h++;
        clearedCount++;
        const idx = cr * COLS + cc;
        if (isH[idx]) hm = true;
        if (isV[idx]) vm = true;
        for (let i = 0; i < 4; i++) {
          const nr = cr + drs[i], nc = cc + dcs[i];
          if (nr >= PLAY_ROWS_START && nr < TOTAL_ROWS && nc >= 0 && nc < COLS) {
            const ni = nr * COLS + nc;
            if (toClear1D[ni] && !vis[ni] && orbOf(tempBoard[nr][nc]) === type) {
              vis[ni] = 1;
              qR[t] = nr; qC[t] = nc; t++;
            }
          }
        }
      }
      if (hm) hC++;
      if (vm) vC++;
    }
  }
  return { combos, clearedCount, vC, hC, toClearMap: toClear1D };
};

const evaluateBoard = (tempBoard, skyfall) => {
  let result = findMatches(tempBoard);
  const init = {
    combos: result.combos,
    v: result.vC,
    h: result.hC,
    cleared: result.clearedCount,
  };
  if (!skyfall) {
    return {
      combos: init.combos,
      initialCombos: init.combos,
      skyfallCombos: 0,
      clearedCount: init.cleared,
      verticalCombos: init.v,
      horizontalCombos: init.h,
    };
  }
  let cur = clone2D(tempBoard);
  let total = { combos: init.combos, v: init.v, h: init.h, cleared: init.cleared };
  while (result.combos > 0) {
    cur = applyGravity(cur, result.toClearMap);
    result = findMatches(cur);
    if (result.combos > 0) {
      total.combos += result.combos;
      total.v += result.vC;
      total.h += result.hC;
      total.cleared += result.clearedCount;
    }
  }
  return {
    combos: total.combos,
    initialCombos: init.combos,
    skyfallCombos: total.combos - init.combos,
    clearedCount: total.cleared,
    verticalCombos: total.v,
    horizontalCombos: total.h,
  };
};

const getBoardKey = (b) => {
  let h1 = 2166136261 >>> 0;
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
  return `${h1.toString(16)}${h2.toString(16)}`;
};

const calcScore = (ev, pot, pathLen, cfg, target, mode, priority) => {
  const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;
  const stepPenalty = priority === "steps" ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const clearedW = priority === "combo" ? 1000 : 200;
  if (ev.combos >= target) return 5200000 - pathLen * stepPenalty - overPenalty + ev.clearedCount * clearedW;
  const miss = target - ev.combos;
  const missPenalty = -(miss * miss * 320000);
  const nearBonus = (target - miss) * 50000 + (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);
  const t = Math.max(0, 1 - miss / Math.max(1, target));
  const majorBonus = major * (1200000 * t * t);
  const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
  return missPenalty + nearBonus + majorBonus + pot * potWeight + ev.clearedCount * clearedW - pathLen * 35;
};

const makeNode = (parent, r, c) => ({ parent, r, c, len: parent ? parent.len + 1 : 1 });
const stepsOf = (node) => Math.max(0, (node?.len || 0) - 1);
const buildPath = (node) => {
  const out = [];
  for (let cur = node; cur; cur = cur.parent) out.push({ r: cur.r, c: cur.c });
  out.reverse();
  return out;
};
const extendNodeByPath = (node, path) => {
  let cur = node;
  for (const p of path) cur = makeNode(cur, p.r, p.c);
  return cur;
};

const defaultValuePredictor = ({ ev, pot, stepsLeft, target, mode }) => {
  const major = mode === "vertical" ? ev.verticalCombos : mode === "horizontal" ? ev.horizontalCombos : 0;
  const miss = Math.max(0, target - (ev.combos || 0));
  return (ev.combos || 0) * 1.2 + (major || 0) * 0.35 + (ev.clearedCount || 0) * 0.008 + (pot || 0) * 0.07 - miss * 0.9 + stepsLeft * 0.03;
};

const valueLambdaAt = (cfg, stepsUsed) => {
  if (!cfg.useValueGuidance) return 0;
  const ratio = Math.max(0, (cfg.maxSteps - stepsUsed) / Math.max(1, cfg.maxSteps));
  const raw = cfg.valueLambdaBase * Math.pow(ratio, cfg.valueLambdaPower);
  return clamp(raw, cfg.valueLambdaMin, cfg.valueLambdaMax);
};

const stepConstraint = (cellVal) => {
  const m = xMarkOf(cellVal);
  if (m === 1) return { ok: false, locked: false };
  if (m === 2) return { ok: true, locked: true };
  return { ok: true, locked: false };
};

const getMoveCheapScore = (state, nr, nc, nextLocked, step, q2Pos) => {
  const ev = state?.ev || {};
  let s = 0;
  s += (ev.initialCombos || 0) * 120;
  s += (ev.combos || 0) * 80;
  s += (ev.clearedCount || 0) * 8;
  s -= nextLocked ? 200 : 0;
  if (q2Pos) s -= (Math.abs(nr - q2Pos.r) + Math.abs(nc - q2Pos.c)) * 16;
  s -= step * 0.15;
  return s;
};

const pickCheapTopMoves = (moves, limit, perSigCap = 2) => {
  if (!moves.length || limit <= 0) return [];
  const sorted = [...moves].sort((a, b) => b.cheapScore - a.cheapScore);
  const out = [];
  const sigCount = new Map();
  for (const mv of sorted) {
    if (out.length >= limit) break;
    const sig = mv.cheapSig || "none";
    const used = sigCount.get(sig) || 0;
    if (used >= perSigCap) continue;
    sigCount.set(sig, used + 1);
    out.push(mv);
  }
  return out;
};

const pickMovesWithPrimitiveQuota = (primitiveMoves, macroMoves, limit, primitiveQuota) => {
  const cap = Math.max(0, Math.floor(limit));
  if (cap <= 0) return [];
  const primitive = Array.isArray(primitiveMoves) ? primitiveMoves : [];
  const macro = Array.isArray(macroMoves) ? macroMoves : [];
  if (!macro.length) return pickCheapTopMoves(primitive, cap, 2);
  if (!primitive.length) return pickCheapTopMoves(macro, cap, 2);

  const minPrimitive = Math.min(primitive.length, Math.max(1, Math.floor(cap * clamp(primitiveQuota, 0.1, 0.95))));
  const pickedPrimitive = pickCheapTopMoves(primitive, minPrimitive, 2);
  const remain = Math.max(0, cap - pickedPrimitive.length);
  const pickedMacro = remain > 0 ? pickCheapTopMoves(macro, remain, 2) : [];

  const out = [...pickedPrimitive, ...pickedMacro];
  if (out.length >= cap) return out.slice(0, cap);
  const seen = new Set(out);
  const rest = [...primitive, ...macro].filter((x) => !seen.has(x)).sort((a, b) => b.cheapScore - a.cheapScore);
  for (const mv of rest) {
    out.push(mv);
    if (out.length >= cap) break;
  }
  return out.slice(0, cap);
};

const buildStaticMacroPath = (state, target, dirsPlay, maxLen) => {
  const start = state.r * COLS + state.c;
  const goal = target.r * COLS + target.c;
  if (start === goal) return null;
  const q = [start];
  const parent = new Map([[start, -1]]);
  const dist = new Map([[start, 0]]);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const d = dist.get(cur) || 0;
    if (cur === goal) break;
    if (d >= maxLen) continue;
    const r = Math.floor(cur / COLS);
    const c = cur % COLS;
    for (const [dr, dc] of dirsPlay) {
      const nr = r + dr, nc = c + dc;
      if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
      const idx = nr * COLS + nc;
      if (parent.has(idx)) continue;
      if (!stepConstraint(state.board[nr][nc]).ok) continue;
      parent.set(idx, cur);
      dist.set(idx, d + 1);
      q.push(idx);
    }
  }
  if (!parent.has(goal)) return null;
  const len = dist.get(goal) || 0;
  if (len < 2 || len > maxLen) return null;
  const rev = [];
  let cur = goal;
  while (cur !== start) {
    rev.push({ r: Math.floor(cur / COLS), c: cur % COLS });
    cur = parent.get(cur);
    if (cur == null) return null;
  }
  rev.reverse();
  return rev;
};

const scoreLineCompletion = (state, tr, tc) => {
  const held = orbOf(state.held);
  if (held < 0) return 0;
  const getOrb = (r, c) => (r >= PLAY_ROWS_START && r < TOTAL_ROWS && c >= 0 && c < COLS ? orbOf(state.board[r][c]) : -1);
  let score = 0;
  const patterns = [
    [[0, -2], [0, -1]], [[0, -1], [0, 1]], [[0, 1], [0, 2]],
    [[-2, 0], [-1, 0]], [[-1, 0], [1, 0]], [[1, 0], [2, 0]],
  ];
  for (const [a, b] of patterns) {
    const o1 = getOrb(tr + a[0], tc + a[1]);
    const o2 = getOrb(tr + b[0], tc + b[1]);
    if (o1 === held && o2 === held) score += 260;
    else if (o1 === held || o2 === held) score += 55;
  }
  return score;
};

const buildMacroTargets = (state, step, cfg, q2Pos) => {
  const map = new Map();
  const put = (r, c, score, kind) => {
    const k = `${r},${c}`;
    const prev = map.get(k);
    if (!prev || score > prev.score) map.set(k, { r, c, score, kind });
  };
  const held = orbOf(state.held);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === state.r && c === state.c) continue;
      const d = Math.abs(r - state.r) + Math.abs(c - state.c);
      if (d < 2 || d > cfg.macroMaxLen + 1) continue;
      if (!stepConstraint(state.board[r][c]).ok) continue;

      const transport = getMoveCheapScore(state, r, c, false, step, q2Pos) - d * 12;
      put(r, c, transport, "transport");

      const line = scoreLineCompletion(state, r, c);
      if (line > 70) put(r, c, getMoveCheapScore(state, r, c, false, step, q2Pos) + line - d * 10, "line3");

      let adjAny = 0, adjHeld = 0;
      for (const [dr, dc] of DIRS_4) {
        const nr = r + dr, nc = c + dc;
        if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
        const o = orbOf(state.board[nr][nc]);
        if (o >= 0) { adjAny++; if (o === held) adjHeld++; }
      }
      const hotspot = adjAny * 16 + adjHeld * 70;
      if (hotspot > 40) put(r, c, getMoveCheapScore(state, r, c, false, step, q2Pos) + hotspot - d * 8, "hotspot");
    }
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, cfg.macroTargetCount);
};

const simulateMacro = (state, path, isAtQ2) => {
  if (!state.hole || !Array.isArray(path) || path.length < 2) return null;
  const nextBoard = clone2D(state.board);
  let nextHole = { ...state.hole };
  let nextLocked = !!state.locked;
  let r = state.r, c = state.c;
  for (const p of path) {
    const chk = stepConstraint(nextBoard[p.r][p.c]);
    if (!chk.ok) return null;
    nextLocked = nextLocked || chk.locked || isAtQ2(p.r, p.c);
    nextHole = holeStepInPlace(nextBoard, nextHole, { r: p.r, c: p.c });
    r = p.r; c = p.c;
  }
  return { nextBoard, hole: nextHole, r, c, locked: nextLocked };
};

const pickBeamCombo = (candidates, cfg, target) => {
  candidates.sort((a, b) => {
    const ar = a.ev.combos >= target;
    const br = b.ev.combos >= target;
    if (ar !== br) return ar ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    return (b.ev.clearedCount || 0) - (a.ev.clearedCount || 0);
  });
  const BW = cfg.beamWidth;
  if (candidates.length <= BW) return candidates;
  return candidates.slice(0, BW);
};

const beamSolveAblation = (originalBoard, cfg, target, mode, priority, skyfall, diagonal) => {
  const t0 = performance.now();
  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;
  const valuePredictor = cfg.valuePredictor || defaultValuePredictor;
  const maxNodes = cfg.maxNodes;

  let q1Pos = null, q2Pos = null;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const q = qMarkOf(originalBoard[r][c]);
      if (q === 1) q1Pos = { r, c };
      if (q === 2) q2Pos = { r, c };
    }
  }
  const isAtQ2 = (r, c) => q2Pos && r === q2Pos.r && c === q2Pos.c;
  const shouldAcceptEnd = (node) => !q2Pos || (node?.r === q2Pos.r && node?.c === q2Pos.c);

  let best = { combos: -1, clearedCount: -1, score: -Infinity, node: null };
  let bestReachedSteps = Infinity;
  let nodesExpanded = 0;
  let timedOut = false;

  const visited = new Map();
  const betterThanVisited = (key, ev, score, steps) => {
    const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
    const rec = [ev.combos, major, ev.clearedCount, -steps, score];
    const prev = visited.get(key);
    if (!prev) {
      visited.set(key, rec);
      return true;
    }
    if (prev[0] >= rec[0] && prev[1] >= rec[1] && prev[2] >= rec[2] && prev[3] >= rec[3] && prev[4] >= rec[4]) return false;
    visited.set(key, rec);
    return true;
  };

  const considerBest = (ev, score, node) => {
    if (!shouldAcceptEnd(node)) return;
    const s = stepsOf(node);
    const bs = best.node ? stepsOf(best.node) : Infinity;
    let better = false;
    if (ev.combos >= target) {
      if (best.combos < target) better = true;
      else if (s < bs) better = true;
      else if (s === bs && score > best.score) better = true;
    } else if (best.combos < target) {
      if (ev.combos > best.combos) better = true;
      else if (ev.combos === best.combos && score > best.score) better = true;
    }
    if (better) best = { ...ev, score, node };
    if (ev.combos >= target && s < bestReachedSteps) bestReachedSteps = s;
  };

  const applyValueGuidance = (stateCtx, ev, pot, stepsUsed, score) => {
    if (!cfg.useValueGuidance) return score;
    const lambda = valueLambdaAt(cfg, stepsUsed);
    if (lambda <= 0) return score;
    const stepsLeft = Math.max(0, cfg.maxSteps - stepsUsed);
    const raw = Number(valuePredictor({ ...stateCtx, ev, pot, stepsUsed, stepsLeft, target, mode, priority, skyfall, diagonal }));
    const v = Number.isFinite(raw) ? raw : 0;
    const clipped = clamp(v, -cfg.valueClip, cfg.valueClip);
    return score + clipped * cfg.valueScale * lambda;
  };

  let beam = [];
  const pushInitState = (r, c, heldFromRow0) => {
    if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;
    const b = clone2D(originalBoard);
    let held, hole = null;
    if (heldFromRow0) held = originalBoard[0][c];
    else {
      held = originalBoard[r][c];
      hole = { r, c };
      b[r][c] = -1;
    }
    if (xMarkOf(held) === 1) return;
    const locked = xMarkOf(held) === 2;
    const evalBoard = boardWithHeldFilled(b, hole, held);
    const ev = evaluateBoard(evalBoard, skyfall);
    const pot = potentialScore(evalBoard, mode);
    let score = calcScore(ev, pot, 0, cfg, target, mode, priority);
    score = applyValueGuidance({ board: evalBoard, boardWithHole: b, held, hole, cursor: { r, c }, moveKind: "init" }, ev, pot, 0, score);
    const key = `${getBoardKey(b)}|${held}|${r},${c}|${locked ? 1 : 0}|0`;
    if (!betterThanVisited(key, ev, score, 0)) return;
    const node = makeNode(null, r, c);
    considerBest(ev, score, node);
    if (ev.combos >= target && shouldAcceptEnd(node)) return;
    beam.push({ board: b, held, hole, r, c, node, locked, ev, score });
  };

  for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) for (let c = 0; c < COLS; c++) pushInitState(r, c, false);

  for (let step = 0; step < cfg.maxSteps; step++) {
    if (bestReachedSteps !== Infinity && step >= bestReachedSteps) break;
    if (cfg.timeBudgetMs > 0 && performance.now() - t0 >= cfg.timeBudgetMs) { timedOut = true; break; }
    if (nodesExpanded >= maxNodes) break;

    const primitiveMoves = [];
    const macroMoves = [];
    const candidates = [];

    for (const st of beam) {
      if (nodesExpanded >= maxNodes) break;
      if (st.locked) continue;
      for (const [dr, dc] of dirsPlay) {
        if (nodesExpanded >= maxNodes) break;
        const nr = st.r + dr, nc = st.c + dc;
        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
        if (st.node?.parent && nr === st.node.parent.r && nc === st.node.parent.c) continue;
        const node = makeNode(st.node, nr, nc);
        const cheapSig = `p|${st.r},${st.c}|${dr},${dc}`;

        if (st.r === 0) {
          if (nr !== 1) continue;
          const chk = stepConstraint(st.board[nr][nc]);
          if (!chk.ok) continue;
          const nextBoard = clone2D(st.board);
          nextBoard[nr][nc] = -1;
          primitiveMoves.push({
            moveKind: "primitive",
            nextBoard, held: st.held, hole: { r: nr, c: nc }, r: nr, c: nc, node,
            locked: chk.locked || isAtQ2(nr, nc),
            cheapSig, cheapScore: getMoveCheapScore(st, nr, nc, chk.locked, step, q2Pos),
          });
          nodesExpanded++;
          continue;
        }

        if (st.r >= PLAY_ROWS_START && nr === 0) {
          const chk = stepConstraint(st.board[0][nc]);
          if (!chk.ok) continue;
          const evalBoard = boardWithHeldFilled(st.board, st.hole, st.held);
          const ev = evaluateBoard(evalBoard, skyfall);
          const pot = potentialScore(evalBoard, mode);
          const score = calcScore(ev, pot, stepsOf(node), cfg, target, mode, priority);
          considerBest(ev, score, node);
          continue;
        }

        if (nr < PLAY_ROWS_START || !st.hole) continue;
        const chk = stepConstraint(st.board[nr][nc]);
        if (!chk.ok) continue;
        const nextBoard = clone2D(st.board);
        const hole = holeStepInPlace(nextBoard, st.hole, { r: nr, c: nc });
        primitiveMoves.push({
          moveKind: "primitive",
          nextBoard, held: st.held, hole, r: nr, c: nc, node,
          locked: chk.locked || isAtQ2(nr, nc),
          cheapSig, cheapScore: getMoveCheapScore(st, nr, nc, chk.locked, step, q2Pos),
        });
        nodesExpanded++;
      }

      if (cfg.useMacro && st.r >= PLAY_ROWS_START && st.hole && cfg.macroPerStateMax > 0) {
        const targets = buildMacroTargets(st, step, cfg, q2Pos);
        let count = 0;
        for (const targetPos of targets) {
          if (count >= cfg.macroPerStateMax || nodesExpanded >= maxNodes) break;
          const path = buildStaticMacroPath(st, targetPos, dirsPlay, cfg.macroMaxLen);
          if (!path) continue;
          const sim = simulateMacro(st, path, isAtQ2);
          if (!sim) continue;
          macroMoves.push({
            moveKind: `macro:${targetPos.kind}`,
            nextBoard: sim.nextBoard, held: st.held, hole: sim.hole, r: sim.r, c: sim.c,
            node: extendNodeByPath(st.node, path), locked: sim.locked,
            cheapSig: `m|${targetPos.kind}|${sim.r},${sim.c}|${path.length}`,
            cheapScore: getMoveCheapScore(st, sim.r, sim.c, sim.locked, step, q2Pos) + 30 + path.length * 10,
          });
          nodesExpanded++;
          count++;
        }
      }
    }

    if (!primitiveMoves.length && !macroMoves.length) break;
    const evalBudget = Math.min(primitiveMoves.length + macroMoves.length, Math.max(cfg.beamWidth, Math.floor(cfg.beamWidth * cfg.evalBudgetFactor)));
    const selectedMoves = evalBudget >= primitiveMoves.length + macroMoves.length
      ? [...primitiveMoves, ...macroMoves]
      : pickMovesWithPrimitiveQuota(primitiveMoves, macroMoves, evalBudget, cfg.primitiveQuota);

    for (const mv of selectedMoves) {
      const s = stepsOf(mv.node);
      const evalBoard = boardWithHeldFilled(mv.nextBoard, mv.hole, mv.held);
      const ev = evaluateBoard(evalBoard, skyfall);
      const pot = potentialScore(evalBoard, mode);
      let score = calcScore(ev, pot, s, cfg, target, mode, priority);
      score = applyValueGuidance({ board: evalBoard, boardWithHole: mv.nextBoard, held: mv.held, hole: mv.hole, cursor: { r: mv.r, c: mv.c }, moveKind: mv.moveKind }, ev, pot, s, score);
      const key = `${getBoardKey(mv.nextBoard)}|${mv.held}|${mv.r},${mv.c}|${mv.locked ? 1 : 0}|${s}`;
      if (!betterThanVisited(key, ev, score, s)) continue;
      considerBest(ev, score, mv.node);
      if (ev.combos >= target && shouldAcceptEnd(mv.node)) continue;
      candidates.push({ board: mv.nextBoard, held: mv.held, hole: mv.hole, r: mv.r, c: mv.c, node: mv.node, locked: mv.locked, ev, score });
    }

    if (!candidates.length) break;
    beam = priority === "combo" ? pickBeamCombo(candidates, cfg, target) : candidates.sort((a, b) => b.score - a.score).slice(0, cfg.beamWidth);
  }

  best.path = best.node ? buildPath(best.node) : [];
  best.nodesExpanded = nodesExpanded;
  best.elapsedMs = performance.now() - t0;
  best.timedOut = timedOut;
  delete best.node;
  return best;
};

const generateRandomBoard = (rng) => {
  const b = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push(Math.floor(rng() * 6));
    b.push(row);
  }
  return b;
};

const runVariant = ({ name, solverCfg, boards, target, mode, priority, skyfall, diagonal }) => {
  const totals = { success: 0, combos: 0, steps: 0, ms: 0, nodes: 0, timeout: 0 };
  for (const board of boards) {
    const result = beamSolveAblation(board.map((r) => r.slice()), solverCfg, target, mode, priority, skyfall, diagonal);
    const combos = Number(result.combos || 0);
    const steps = Array.isArray(result.path) ? Math.max(0, result.path.length - 1) : 0;
    if (combos >= target) totals.success++;
    totals.combos += combos;
    totals.steps += steps;
    totals.ms += Number(result.elapsedMs || 0);
    totals.nodes += Number(result.nodesExpanded || 0);
    if (result.timedOut) totals.timeout++;
  }
  const n = Math.max(1, boards.length);
  return {
    variant: name,
    successAtTarget: totals.success / n,
    avgCombos: totals.combos / n,
    avgSteps: totals.steps / n,
    avgMs: totals.ms / n,
    avgNodes: totals.nodes / n,
    timeoutRate: totals.timeout / n,
  };
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const cfg = {
    boards: asInt(args.boards, 200),
    seed: asInt(args.seed, 20260409),
    target: asInt(args.target, 8),
    mode: args.mode ?? "combo",
    priority: args.priority ?? "combo",
    skyfall: asBool(args.skyfall, false),
    diagonal: asBool(args.diagonal, true),
    maxSteps: asInt(args["max-steps"], 30),
    beamWidth: asInt(args["beam-width"], 440),
    maxNodes: asInt(args["max-nodes"], 50000),
    stepPenalty: asInt(args["step-penalty"], 0),
    potentialWeight: asFloat(args["potential-weight"], 10),
    timeBudgetMs: asInt(args["time-budget-ms"], 0),
    primitiveQuota: asFloat(args["primitive-quota"], 0.35),
    evalBudgetFactor: asFloat(args["eval-budget-factor"], 3.8),
    macroMaxLen: asInt(args["macro-max-len"], 3),
    macroPerStateMax: asInt(args["macro-per-state-max"], 2),
    macroTargetCount: asInt(args["macro-target-count"], 4),
    valueLambdaBase: asFloat(args["value-lambda-base"], 0.12),
    valueLambdaMin: asFloat(args["value-lambda-min"], 0.05),
    valueLambdaMax: asFloat(args["value-lambda-max"], 0.2),
    valueLambdaPower: asFloat(args["value-lambda-power"], 1.0),
    valueScale: asFloat(args["value-scale"], 100000),
    valueClip: asFloat(args["value-clip"], 20),
    out: args.out || "",
  };

  cfg.primitiveQuota = clamp(cfg.primitiveQuota, 0.1, 0.95);
  cfg.evalBudgetFactor = clamp(cfg.evalBudgetFactor, 1, 12);
  cfg.macroMaxLen = clamp(cfg.macroMaxLen, 2, 4);
  cfg.macroPerStateMax = clamp(cfg.macroPerStateMax, 0, 4);
  cfg.macroTargetCount = clamp(cfg.macroTargetCount, 1, 10);
  cfg.valueLambdaMin = clamp(cfg.valueLambdaMin, 0, 1);
  cfg.valueLambdaMax = clamp(cfg.valueLambdaMax, 0, 1);
  if (cfg.valueLambdaMin > cfg.valueLambdaMax) [cfg.valueLambdaMin, cfg.valueLambdaMax] = [cfg.valueLambdaMax, cfg.valueLambdaMin];
  cfg.valueClip = Math.max(0.01, cfg.valueClip);

  const rng = mulberry32(cfg.seed >>> 0);
  const boards = Array.from({ length: cfg.boards }, () => generateRandomBoard(rng));

  const baseSolverCfg = {
    maxSteps: cfg.maxSteps,
    beamWidth: cfg.beamWidth,
    maxNodes: cfg.maxNodes,
    stepPenalty: cfg.stepPenalty,
    potentialWeight: cfg.potentialWeight,
    timeBudgetMs: cfg.timeBudgetMs,
    primitiveQuota: cfg.primitiveQuota,
    evalBudgetFactor: cfg.evalBudgetFactor,
    macroMaxLen: cfg.macroMaxLen,
    macroPerStateMax: cfg.macroPerStateMax,
    macroTargetCount: cfg.macroTargetCount,
    valueLambdaBase: cfg.valueLambdaBase,
    valueLambdaMin: cfg.valueLambdaMin,
    valueLambdaMax: cfg.valueLambdaMax,
    valueLambdaPower: cfg.valueLambdaPower,
    valueScale: cfg.valueScale,
    valueClip: cfg.valueClip,
    valuePredictor: defaultValuePredictor,
  };

  const variants = [
    { name: "Baseline", useValueGuidance: false, useMacro: false },
    { name: "+Vhat", useValueGuidance: true, useMacro: false },
    { name: "+Macro", useValueGuidance: false, useMacro: true },
    { name: "+Vhat+Macro", useValueGuidance: true, useMacro: true },
  ];

  const reports = variants.map((v) =>
    runVariant({
      name: v.name,
      solverCfg: { ...baseSolverCfg, ...v },
      boards,
      target: cfg.target,
      mode: cfg.mode,
      priority: cfg.priority,
      skyfall: cfg.skyfall,
      diagonal: cfg.diagonal,
    })
  );

  console.log("");
  console.log("[ablation] fixed budget benchmark");
  console.log(`[ablation] boards=${cfg.boards} target=${cfg.target} maxSteps=${cfg.maxSteps} beamWidth=${cfg.beamWidth} maxNodes=${cfg.maxNodes} timeBudgetMs=${cfg.timeBudgetMs}`);
  console.table(
    reports.map((r) => ({
      variant: r.variant,
      "success@target": `${(r.successAtTarget * 100).toFixed(2)}%`,
      avgCombos: r.avgCombos.toFixed(3),
      avgSteps: r.avgSteps.toFixed(3),
      avgMs: r.avgMs.toFixed(3),
      avgNodes: Math.round(r.avgNodes),
      timeout: `${(r.timeoutRate * 100).toFixed(2)}%`,
    }))
  );

  if (cfg.out) {
    fs.writeFileSync(cfg.out, JSON.stringify({ generated_at: new Date().toISOString(), config: cfg, reports }, null, 2), "utf8");
    console.log(`[ablation] wrote ${cfg.out}`);
  }
};

main();
