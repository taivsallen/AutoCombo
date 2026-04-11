import wImg from './assets/w.png';
import fImg from './assets/f.png';
import pImg from './assets/p.png';
import lImg from './assets/l.png';
import dImg from './assets/d.png';
import hImg from './assets/h.png';
import x1Img from './assets/x1.png';
import x2Img from './assets/x2.png';
import n1Img from './assets/n1.png';
import n2Img from './assets/n2.png';
import logoImg from './assets/logo.png';

const ORB_TYPES = {
  WATER: { id: 0, img: wImg },
  FIRE: { id: 1, img: fImg },
  EARTH: { id: 2, img: pImg },
  LIGHT: { id: 3, img: lImg },
  DARK: { id: 4, img: dImg },
  HEART: { id: 5, img: hImg },
};

const TOTAL_ROWS = 6;
const COLS = 6;
const PLAY_ROWS_START = 1; // 0 是暫存列
const PLAY_ROWS = TOTAL_ROWS - PLAY_ROWS_START; // 5

// 定義移動方向
const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const SPECIAL_ORB_ANY = -1;

const clone2D = (b) => {
  const len = b.length;
  const copy = new Array(len);
  for (let i = 0; i < len; i++) copy[i] = b[i].slice();
  return copy;
};

const holeStepInPlace = (b, hole, toRC) => {
  const moved = b[toRC.r][toRC.c];
  b[hole.r][hole.c] = moved;
  b[toRC.r][toRC.c] = -1;
  return toRC; // new hole
};

const boardWithHeldFilled = (b, hole, held) => {
  if (!hole) return b;
  const next = clone2D(b);
  next[hole.r][hole.c] = held;
  return next;
};

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

  return (
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0")
  );
};

const orbOf = (v) => (v < 0 ? -1 : v % 10);                    // 0~5
const xMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 10) % 10); // 0/1/2
const qMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 100) % 10); // 0/1/2
const nMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 1000) % 10); // 0/1/2

const getInitialMatchCheck = (board) => {
  const initial = findMatches(board, "initial");

  const vanillaToClear = getVanillaInitialClearMap(board);

  return {
    initial,
    violatesN2: hasInitialN2Clear(board, vanillaToClear),
  };
};

const scoreRectGuideWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  orb,
  phase = "initial"
) => {
  const insideCount = countWindowOrb(board, baseR, baseC, m, n, orb, phase);
  const boundaryCount = countBoundaryOrb(board, baseR, baseC, m, n, orb, phase);
  const hits = countPatternHitsInWindow(board, baseR, baseC, m, n, orb, phase);

  let score = 0;

  score += insideCount * 100;
  score -= boundaryCount * 25;

  if (m === 3 && n === 3) {
    score += hits.cross * 2200;
    score += hits.t * 1700;
    score += hits.l * 1500;
    score += hits.block2x2 * 900;
    score += (hits.lineH3 + hits.lineV3) * 700;
    score += (hits.rect2x3 + hits.rect3x2) * 1200;
  } else {
    score += hits.cross * 1200;
    score += hits.t * 900;
    score += hits.l * 800;
    score += hits.block2x2 * 650;
    score += (hits.rect2x3 + hits.rect3x2) * 1000;
    score += (hits.lineH3 + hits.lineV3) * 500;
  }

  return score;
};


const beamSolve = (
  originalBoard,
  cfg,
  target,
  mode,
  priority,
  skyfall,
  diagonal,
  specialPriority,
  initTargetCombo,
  autoRow0Expanded,
  onProgress = null
) => {
  const useRow0 = !!autoRow0Expanded;

  const normalizedSpecials = normalizeSpecialPriorityList(specialPriority);
  const hasSpecial = normalizedSpecials.length > 0;
  const hasRectSpecial = normalizedSpecials.some((sp) => sp.type === "rect");

  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;
  const maxNodesEffective = cfg.maxNodes;

  const makeNode = (parent, r, c) => ({
    parent,
    r,
    c,
    len: parent ? parent.len + 1 : 1,
  });

  const buildPath = (node) => {
    const out = [];
    for (let cur = node; cur; cur = cur.parent) {
      out.push({ r: cur.r, c: cur.c });
    }
    out.reverse();
    return out;
  };

  const stepsOf = (node) => Math.max(0, (node?.len || 0) - 1);

  const exceedsInitialComboCap = (ev) => {
    const cap = Number(initTargetCombo);
    if (!Number.isFinite(cap) || cap <= 0) return false;
    const initialCombos = Number(
      ev?.initialCombos ?? ev?.initCombos ?? ev?.combos ?? 0
    );
    return initialCombos > cap;
  };

  const hitsInitTargetComboExactly = (ev) => {
    const t = Number(initTargetCombo);
    if (!Number.isFinite(t) || t <= 0) return false;
    return Number(ev?.initialCombos || 0) === t;
  };

  const stepConstraint = (cellVal) => {
    const m = xMarkOf(cellVal);
    if (m === 1) return { ok: false, locked: false };
    if (m === 2) return { ok: true, locked: true };
    return { ok: true, locked: false };
  };

  let q1Pos = null;
  let q2Pos = null;

  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (!useRow0 && r === 0) continue;
    for (let c = 0; c < COLS; c++) {
      const q = qMarkOf(originalBoard[r][c]);
      if (q === 1) q1Pos = { r, c };
      if (q === 2) q2Pos = { r, c };
    }
  }

  const isAtQ2 = (r, c) => q2Pos && r === q2Pos.r && c === q2Pos.c;
  const shouldAcceptEnd = (node) =>
    !q2Pos || (node?.r === q2Pos.r && node?.c === q2Pos.c);

  const isSolvedGoal = (ev, extraCtx = {}) => {
    if (!hasSpecial) return ev.combos >= target;
    return (
      ev.combos >= target &&
      isAllSpecialSatisfied(ev, normalizedSpecials, extraCtx)
    );
  };

  const buildPriorityTuple = (
    ev,
    steps,
    score,
    extraCtx = {},
    violatesN2 = false
  ) => {
    return [
      violatesN2 ? 0 : 1,
      ...getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx),
      ev.combos || 0,
      ev.clearedCount || 0,
      hitsInitTargetComboExactly(ev) ? 1 : 0,
      -steps,
      Math.floor(score),
    ];
  };

  let bestGlobal = {
    combos: -1,
    skyfallCombos: 0,
    clearedCount: -1,
    node: null,
    score: -Infinity,
    specialTuple: [],
    verticalCombos: 0,
    horizontalCombos: 0,
    rectGuide: 0,
    violatesN2: false,
  };

  let bestReachedSteps = Infinity;
  let topStepCandidates = [];
  let topComboCandidates = [];
  const pendingTopStepCandidates = [];
  const pendingTopComboCandidates = [];
  let beam = [];
  let nodesExpanded = 0;
  const visitedBest = new Map();

  let lastProgressReport = -1;
  const reportProgress = (force = false) => {
    if (!onProgress) return;

    const current = Math.min(nodesExpanded, maxNodesEffective);
    const shouldEmit =
      force ||
      lastProgressReport < 0 ||
      current >= maxNodesEffective ||
      current - lastProgressReport >= 256;

    if (!shouldEmit) return;

    lastProgressReport = current;
    onProgress({
      current,
      max: Math.max(1, maxNodesEffective),
    });
  };

  const packCandidateFromEv = (ev, node, score, extraCtx = {}) => ({
    ...ev,
    path: node ? buildPath(node) : [],
    score,
    rectGuide: extraCtx.rectGuide || 0,
    specialTuple: getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx),
  });

  const pushTopCandidate = (ev, node, score, violatesN2, extraCtx = {}) => {
    if (!node) return;
    const steps = stepsOf(node);
    if (steps <= 0) return;
    if (!shouldAcceptEnd(node)) return;

    const sol = {
      ...packCandidateFromEv(ev, node, score, extraCtx),
      violatesN2: !!violatesN2,
    };

    if (priority === "steps") {
      pendingTopStepCandidates.push(sol);
      if (pendingTopStepCandidates.length >= 32) {
        topStepCandidates = flushPendingSolutions(
          topStepCandidates,
          pendingTopStepCandidates,
          "steps",
          specialPriority,
          initTargetCombo,
          10
        );
      }
    } else {
      pendingTopComboCandidates.push(sol);
      if (pendingTopComboCandidates.length >= 32) {
        topComboCandidates = flushPendingSolutions(
          topComboCandidates,
          pendingTopComboCandidates,
          "combo",
          specialPriority,
          initTargetCombo,
          10
        );
      }
    }
  };

  const considerBest = (ev, score, node, violatesN2, extraCtx = {}) => {
    if (!shouldAcceptEnd(node)) return;

    const curSteps = stepsOf(node);
    const curTuple = buildPriorityTuple(
      ev,
      curSteps,
      score,
      extraCtx,
      violatesN2
    );

    const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;
    const bestTuple = bestGlobal.node
      ? buildPriorityTuple(
          bestGlobal,
          bestSteps,
          bestGlobal.score,
          { rectGuide: bestGlobal.rectGuide || 0 },
          bestGlobal.violatesN2
        )
      : null;

    let better = false;
    if (!bestTuple) better = true;
    else if (lexTupleBetter(curTuple, bestTuple)) better = true;

    if (better) {
      bestGlobal = {
        ...ev,
        node,
        score,
        specialTuple: getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx),
        rectGuide: extraCtx.rectGuide || 0,
        violatesN2: !!violatesN2,
      };
    }

    const solved = isSolvedGoal(ev, extraCtx);
    if (!violatesN2 && solved && curSteps > 0) {
      if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
    }
  };

  const betterThanVisited = (key, visitedTuple) => {
    const prev = visitedBest.get(key);

    if (!prev) {
      visitedBest.set(key, visitedTuple);
      return true;
    }

    const cmp = lexTupleCompareDesc(prev, visitedTuple);
    if (cmp <= 0) return false;

    visitedBest.set(key, visitedTuple);
    return true;
  };

  const evalState = (
    evalBoard,
    node,
    steps,
    scoreBias = 0,
    parentExtraCtx = null
  ) => {
    const { initial, violatesN2 } = getInitialMatchCheck(evalBoard);
    const ev = evaluateBoard(evalBoard, skyfall, initial);
    if (exceedsInitialComboCap(ev)) return null;

    const pot = combinedPotentialScore(evalBoard, mode);

    let rectGuide = 0;
    if (hasRectSpecial) {
      const prevRectGuide = parentExtraCtx?.rectGuide;
      rectGuide = shouldRefreshRectGuide(
        steps,
        prevRectGuide,
        hasRectSpecial
      )
        ? getRectGuideScoreFromSpecialList(
            evalBoard,
            normalizedSpecials,
            "initial"
          )
        : Number(prevRectGuide || 0);
    }

    const extraCtx = { rectGuide };

    const specialTuple = hasSpecial
      ? getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx)
      : EMPTY_SPECIAL_TUPLE;

    const rawScore = calcScore(
      ev,
      pot,
      steps,
      cfg,
      target,
      mode,
      priority,
      specialPriority,
      violatesN2,
      extraCtx
    );

    const score = rawScore + scoreBias;
    const initExact = hitsInitTargetComboExactly(ev);

    const visitedTuple = buildVisitedTupleFast({
      ev,
      steps,
      score,
      mode,
      hasSpecial,
      specialTuple,
      violatesN2,
      initExact,
    });

    const finalRankTuple = buildFinalRankTupleFast({
      ev,
      steps,
      score,
      specialTuple,
      violatesN2,
      initExact,
    });

    return {
      ev,
      score,
      violatesN2,
      pot,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
    };
  };

  const tryPushState = ({
    nextBoard,
    held,
    hole,
    r,
    c,
    node,
    locked,
    scoreBias = 0,
    outCandidates,
    parentExtraCtx = null,
  }) => {
    const steps = stepsOf(node);
    const evalBoard = boardWithHeldFilled(nextBoard, hole, held);
    const res = evalState(evalBoard, node, steps, scoreBias, parentExtraCtx);
    if (!res) return;

    const {
      ev,
      score,
      violatesN2,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
    } = res;

    const key = `${getBoardKey(nextBoard)}|${held}|${r},${c}|${locked ? 1 : 0}`;

    if (!betterThanVisited(key, visitedTuple)) return;

    pushTopCandidate(ev, node, score, violatesN2, extraCtx);
    considerBest(ev, score, node, violatesN2, extraCtx);

    const solved = isSolvedGoal(ev, extraCtx) && !violatesN2;
    if (solved && shouldAcceptEnd(node)) return "solved";

    outCandidates.push({
      board: nextBoard,
      held,
      hole,
      r,
      c,
      node,
      locked,
      score,
      ev,
      violatesN2,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      _poolRankCached: [],
    });

    return "keep";
  };

  const pushInitState = (r, c, heldFromRow0) => {
    if (!useRow0 && heldFromRow0) return;
    if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;

    const boardCopy = clone2D(originalBoard);
    let held, hole;

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

    const node = makeNode(null, r, c);
    const locked = heldMark === 2;

    tryPushState({
      nextBoard: boardCopy,
      held,
      hole,
      r,
      c,
      node,
      locked,
      scoreBias: hasSpecial ? -6000000 : 0,
      outCandidates: beam,
      parentExtraCtx: null,
    });
  };

  if (useRow0) {
    for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  }
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) pushInitState(r, c, false);
  }

  reportProgress(true);

  const sortCandidatesLexicographic = (candidates) => {
    for (const st of candidates) {
      if (!st.finalRankTuple) {
        const steps = stepsOf(st.node);
        const initExact = hitsInitTargetComboExactly(st.ev);

        st.finalRankTuple = buildFinalRankTupleFast({
          ev: st.ev,
          steps,
          score: st.score,
          specialTuple: st.specialTuple || EMPTY_SPECIAL_TUPLE,
          violatesN2: st.violatesN2,
          initExact,
        });
      }
    }

    candidates.sort((a, b) =>
      lexTupleCompareDesc(a.finalRankTuple, b.finalRankTuple)
    );
  };

  const getMissTier = (st) => {
    if (isSolvedGoal(st.ev, st.extraCtx)) return 0;
    return Math.max(1, target - (st.ev.combos || 0));
  };

  const buildQuota = (counts, remain, quotaW) => {
    let sumW = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) sumW += quotaW[i];
    }

    const quota = new Array(counts.length).fill(0);
    if (sumW <= 0) return quota;

    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        quota[i] = Math.max(1, Math.floor((remain * quotaW[i]) / sumW));
      }
    }
    return quota;
  };

  const pickBeamLexicographicDiverse = (
    candidates,
    beamWidth,
    mode,
    specialPriorities,
    initTargetCombo
  ) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    sortCandidatesLexicographic(candidates);

    const eliteN = Math.min(
      candidates.length,
      Math.max(6, (beamWidth / 3) | 0)
    );
    const out = candidates.slice(0, eliteN);

    if (out.length >= beamWidth) return out.slice(0, beamWidth);

    const buckets = new Map();

    for (let i = eliteN; i < candidates.length; i++) {
      const st = candidates[i];
      const doneCount = sumSpecialDoneFromTuple(
        st.specialTuple || EMPTY_SPECIAL_TUPLE
      );
      const rectGuideTier = Math.floor(
        Number(st.extraCtx?.rectGuide || 0) / 1000
      );
      const comboTier = st.ev.combos || 0;
      const clearTier = st.ev.clearedCount || 0;

      const key = [
        st.violatesN2 ? 0 : 1,
        doneCount,
        comboTier,
        clearTier,
        rectGuideTier,
      ].join("|");

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(st);
    }

    for (const arr of buckets.values()) {
      precomputeCandidateRanks(arr, mode, specialPriorities, initTargetCombo);
      arr.sort((a, b) => lexCompareDesc(a._poolRankCached, b._poolRankCached));
    }

    const bucketKeys = Array.from(buckets.keys());
    let idx = 0;

    while (out.length < beamWidth && bucketKeys.length > 0) {
      const k = bucketKeys[idx % bucketKeys.length];
      const arr = buckets.get(k);

      if (arr && arr.length) {
        out.push(arr.shift());
        idx++;
      } else {
        buckets.delete(k);
        const removeIdx = idx % bucketKeys.length;
        bucketKeys.splice(removeIdx, 1);
      }
    }

    return out.slice(0, beamWidth);
  };

  const pickBeamCombo = (candidates, explore) => {
    sortCandidatesLexicographic(candidates);

    const BW = cfg.beamWidth;
    const out = [];
    const eliteN = Math.min(candidates.length, Math.max(6, (BW / 3) | 0));

    for (let i = 0; i < eliteN && out.length < BW; i++) out.push(candidates[i]);
    if (out.length >= BW) return out;

    const maxTier = 8;
    const quotaW = [3.0, 2.2, 1.6, 1.1, 0.8, 0.55, 0.4, 0.3, 0.2];
    const counts = new Array(maxTier + 1).fill(0);

    for (let i = eliteN; i < candidates.length; i++) {
      const miss = getMissTier(candidates[i]);
      if (miss <= maxTier) counts[miss]++;
    }

    const quota = buildQuota(counts, BW - out.length, quotaW);
    const took = new Array(maxTier + 1).fill(0);
    const usedPos = new Set();
    const usedRegion = new Set();

    for (const st of out) {
      usedPos.add((st.r << 8) | st.c);
      if (explore) usedRegion.add(regionOf(st.r, st.c));
    }

    const regionSkipProb = cfg.beamWidth >= 300 ? 0.8 : 0.7;

    for (let pass = 0; pass < 3 && out.length < BW; pass++) {
      for (let i = eliteN; i < candidates.length && out.length < BW; i++) {
        const st = candidates[i];
        const miss = getMissTier(st);
        if (miss > maxTier) continue;
        if (pass < 2 && took[miss] >= quota[miss]) continue;

        const pc = (st.r << 8) | st.c;
        const rg = regionOf(st.r, st.c);

        if (pass === 0) {
          if (usedPos.has(pc)) continue;
          if (explore && usedRegion.has(rg) && Math.random() < regionSkipProb) {
            continue;
          }
        } else if (pass === 1) {
          if (usedPos.has(pc)) continue;
        }

        out.push(st);
        usedPos.add(pc);
        if (explore) usedRegion.add(rg);
        if (miss <= maxTier) took[miss]++;
      }
    }

    return out.slice(0, BW);
  };

  for (let step = 0; step < cfg.maxSteps; step++) {
    let candidates = [];
    if (bestReachedSteps !== Infinity && step >= bestReachedSteps) break;

    for (const state of beam) {
      if (nodesExpanded > maxNodesEffective) break;
      if (state.locked) continue;

      for (const [dr, dc] of dirsPlay) {
        const nr = state.r + dr;
        const nc = state.c + dc;

        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
        if (!useRow0 && nr === 0) continue;
        if (
          state.node?.parent &&
          nr === state.node.parent.r &&
          nc === state.node.parent.c
        ) {
          continue;
        }

        const newNode = makeNode(state.node, nr, nc);

        if (useRow0 && state.r === 0) {
          if (nr !== 1) continue;

          const destVal = state.board[nr][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const nextLocked = chk.locked || isAtQ2(nr, nc);
          const nextBoard = clone2D(state.board);
          nextBoard[nr][nc] = -1;
          const nextHole = { r: nr, c: nc };

          tryPushState({
            nextBoard,
            held: state.held,
            hole: nextHole,
            r: nr,
            c: nc,
            node: newNode,
            locked: nextLocked,
            scoreBias: 0,
            outCandidates: candidates,
            parentExtraCtx: state.extraCtx,
          });

          nodesExpanded++;
          reportProgress();
          continue;
        }

        if (useRow0 && state.r >= PLAY_ROWS_START && nr === 0) {
          const destVal = state.board[0][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const evalBoard = clone2D(state.board);
          if (state.hole) evalBoard[state.hole.r][state.hole.c] = destVal;

          const res = evalState(
            evalBoard,
            newNode,
            stepsOf(newNode),
            0,
            state.extraCtx
          );
          if (!res) continue;

          pushTopCandidate(
            res.ev,
            newNode,
            res.score,
            res.violatesN2,
            res.extraCtx
          );
          considerBest(
            res.ev,
            res.score,
            newNode,
            res.violatesN2,
            res.extraCtx
          );

          nodesExpanded++;
          reportProgress();
          continue;
        }

        if (nr < PLAY_ROWS_START || !state.hole) continue;

        const destVal = state.board[nr][nc];
        const chk = stepConstraint(destVal);
        if (!chk.ok) continue;

        const nextLocked = chk.locked || isAtQ2(nr, nc);
        const nextBoard = clone2D(state.board);
        const nextHole = holeStepInPlace(nextBoard, state.hole, {
          r: nr,
          c: nc,
        });

        tryPushState({
          nextBoard,
          held: state.held,
          hole: nextHole,
          r: nr,
          c: nc,
          node: newNode,
          locked: nextLocked,
          scoreBias: 0,
          outCandidates: candidates,
          parentExtraCtx: state.extraCtx,
        });

        nodesExpanded++;
        reportProgress();
      }
    }

    if (!candidates.length || nodesExpanded > maxNodesEffective) break;

    if (!hasSpecial) {
      if (priority === "combo") {
        beam = pickBeamCombo(candidates, diagonal && skyfall);
      } else {
        sortCandidatesLexicographic(candidates);
        beam = candidates.slice(0, cfg.beamWidth);
      }
    } else {
      beam = pickBeamLexicographicDiverse(
        candidates,
        cfg.beamWidth,
        mode,
        specialPriority,
        initTargetCombo
      );
    }
  }

  topStepCandidates = flushPendingSolutions(
    topStepCandidates,
    pendingTopStepCandidates,
    "steps",
    specialPriority,
    initTargetCombo,
    10
  );

  topComboCandidates = flushPendingSolutions(
    topComboCandidates,
    pendingTopComboCandidates,
    "combo",
    specialPriority,
    initTargetCombo,
    10
  );

  reportProgress(true);

  bestGlobal.path = bestGlobal.node ? buildPath(bestGlobal.node) : [];
  bestGlobal.nodesExpanded = nodesExpanded;
  delete bestGlobal.node;

  return {
    ...bestGlobal,
    topSteps: topStepCandidates,
    topCombos: topComboCandidates,
    success: hasSpecial
      ? isAllSpecialSatisfied(bestGlobal, normalizedSpecials, {
          rectGuide: bestGlobal.rectGuide || 0,
        })
      : undefined,
  };
};

const normalizeSpecialPriorityList = (specialPriority) => {
  if (Array.isArray(specialPriority)) {
    return specialPriority.filter((sp) => sp && sp.type && sp.type !== "none");
  }
  if (specialPriority && specialPriority.type && specialPriority.type !== "none") {
    return [specialPriority];
  }
  return [];
};

const normalizeSelectedEqualOrbs = (arr) => {
  if (!Array.isArray(arr)) return [];
  const set = new Set();
  for (const v of arr) {
    const n = Number(v);
    if (EQUAL_FIRST_ORBS.includes(n)) set.add(n);
  }
  return [...set];
};

const getRectMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "rect") return 0;

  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const key = `${m}x${n}`;
  const group = ev.initialPatternCounts?.rect?.[key];

  if (!group) return 0;

  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  // 沒指定屬性時，接受任何屬性
  if (wantOrb === SPECIAL_ORB_ANY || wantOrb === -1) {
    return group.total || 0;
  }

  // 有指定屬性時，只接受該屬性
  return group.byOrb?.[wantOrb] || 0;
};

const getEqualFirstMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "equalFirst") return 0;

  const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
  if (selected.length === 0) return 0;

  const counts = ev.initialComboCountsByOrb;
  if (!counts) return 0;

  const vals = selected.map((orb) => counts[orb] || 0);
  const first = vals[0] || 0;
  if (first <= 0) return 0;

  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== first) return 0;
  }
  return first;
};

const getSingleSpecialMatchedValue = (ev, sp) => {
  if (!sp || sp.type === "none") return 0;

  if (sp.type === "clearCount") {
    return ev.initialClearedCount || 0;
  }

  if (sp.type === "equalFirst") {
    return getEqualFirstMatchedValueBySpecial(ev, sp);
  }

  if (sp.type === "rect") {
    return getRectMatchedValueBySpecial(ev, sp);
  }

  const group = ev.initialPatternCounts?.[sp.type];
  if (!group) return 0;

  if (sp.orb === SPECIAL_ORB_ANY) return group.total || 0;
  return group.byOrb?.[sp.orb] || 0;
};

const isSingleSpecialSatisfied = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return true;

  if (sp.type === "clearCount") {
    return (ev.initialClearedCount || 0) === (sp.clearCount || 0);
  }

  if (sp.type === "equalFirst") {
    return getEqualFirstMatchedValueBySpecial(ev, sp) > 0;
  }

  if (sp.type === "rect") {
    return getRectMatchedValueBySpecial(ev, sp) >= 1;
  }

  if (sp.type === "cross" || sp.type === "l" || sp.type === "t") {
    const got = getSingleSpecialMatchedValue(ev, sp);
    return got >= (sp.count || 1);
  }

  return getSingleSpecialMatchedValue(ev, sp) >= (sp.count || 1);
};

const isAllSpecialSatisfied = (ev, specialPriorities = [], extraCtx = {}) => {
  const list = normalizeSpecialPriorityList(specialPriorities);
  return list.every((sp) => isSingleSpecialSatisfied(ev, sp, extraCtx));
};

const getSingleSpecialProgress = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return { done: 1, guide: 0 };

  if (sp.type === "rect") {
    return {
      done: isSingleSpecialSatisfied(ev, sp, extraCtx) ? 1 : 0,
      guide: extraCtx?.rectGuide || 0,
    };
  }

  if (sp.type === "clearCount") {
    const got = ev.initialClearedCount || 0;
    const want = sp.clearCount || 0;
    const diff = Math.abs(got - want);
    return {
      done: got === want ? 1 : 0,
      guide: 100000 - diff * 1000 - Math.max(0, got - want) * 10,
    };
  }

  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
    if (selected.length === 0) return { done: 0, guide: 0 };

    const counts = ev.initialComboCountsByOrb;
    if (!counts) return { done: 0, guide: 0 };

    const vals = selected.map((orb) => counts[orb] || 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const diff = maxV - minV;

    return {
      done: minV > 0 && diff === 0 ? 1 : 0,
      guide: minV * 1000 - diff * 300,
    };
  }

  const got = getSingleSpecialMatchedValue(ev, sp);
  const want = sp.count || 1;

  return {
    done: got >= want ? 1 : 0,
    guide: Math.min(got, want) * 1000 - Math.max(0, want - got) * 200,
  };
};

const getSpecialPriorityTuple = (ev, specialPriorities = [], extraCtx = {}) => {
  const list = normalizeSpecialPriorityList(specialPriorities);
  const tuple = [];

  for (const sp of list) {
    const p = getSingleSpecialProgress(ev, sp, extraCtx);
    tuple.push(p.done, p.guide);
  }

  return tuple;
};

const lexTupleCompareDesc = (a, b) => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
};

const lexTupleBetter = (a, b) => lexTupleCompareDesc(a, b) < 0;

const getRectGuideScoreBySpecial = (board, sp, phase = "initial") => {
  if (!sp || sp.type !== "rect") return 0;

  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  const RECT_ORBS = [
    ORB_TYPES.WATER.id,
    ORB_TYPES.FIRE.id,
    ORB_TYPES.EARTH.id,
    ORB_TYPES.LIGHT.id,
    ORB_TYPES.DARK.id,
    ORB_TYPES.HEART.id,
  ];

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      // 有指定屬性時：只看那個屬性
      if (wantOrb !== SPECIAL_ORB_ANY && wantOrb !== -1) {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, wantOrb, phase);
        if (s > best) best = s;
        continue;
      }

      // 沒指定屬性時：才枚舉全部屬性
      for (const orb of RECT_ORBS) {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, orb, phase);
        if (s > best) best = s;
      }
    }
  }

  return best;
};

const getRectGuideScoreFromSpecialList = (board, specialPriorities = [], phase = "initial") => {
  const list = normalizeSpecialPriorityList(specialPriorities);
  let best = 0;

  for (const sp of list) {
    if (sp.type !== "rect") continue;
    const s = getRectGuideScoreBySpecial(board, sp, phase);
    if (s > best) best = s;
  }

  return best;
};

const specialPriorityTupleToScore = (tuple = []) => {
  if (!Array.isArray(tuple) || tuple.length === 0) return 0;

  let score = 0;
  let weight = 1e15;

  for (let i = 0; i < tuple.length; i++) {
    const v = Number(tuple[i] || 0);
    score += v * weight;
    weight /= 1000;
  }

  return score;
};

const sumSpecialDoneFromTuple = (tuple = []) => {
  let s = 0;
  for (let i = 0; i < tuple.length; i += 2) s += Number(tuple[i] || 0);
  return s;
};

const sumSpecialGuideFromTuple = (tuple = []) => {
  let s = 0;
  for (let i = 1; i < tuple.length; i += 2) s += Number(tuple[i] || 0);
  return s;
};

const shouldRefreshRectGuide = (steps, prevRectGuide, hasRectSpecial) => {
  if (!hasRectSpecial) return false;
  if (prevRectGuide == null) return true;
  if (steps <= 6) return true;
  return steps % 2 === 0;
};

const buildVisitedTupleFast = ({
  ev,
  steps,
  score,
  mode,
  hasSpecial,
  specialTuple,
  violatesN2,
  initExact,
}) => {
  if (!hasSpecial) {
    return [
      violatesN2 ? 0 : 1,
      ev.combos || 0,
      mode === "vertical"
        ? ev.verticalCombos || 0
        : mode === "horizontal"
        ? ev.horizontalCombos || 0
        : 0,
      ev.clearedCount || 0,
      initExact ? 1 : 0,
      -steps,
      Math.floor(score),
    ];
  }

  return [
    violatesN2 ? 0 : 1,
    sumSpecialDoneFromTuple(specialTuple),
    sumSpecialGuideFromTuple(specialTuple),
    ev.combos || 0,
    ev.clearedCount || 0,
    initExact ? 1 : 0,
    -steps,
    Math.floor(score),
  ];
};

const buildFinalRankTupleFast = ({
  ev,
  steps,
  score,
  specialTuple,
  violatesN2,
  initExact,
}) => {
  return [
    violatesN2 ? 0 : 1,
    ...(specialTuple || EMPTY_SPECIAL_TUPLE),
    initExact ? 1 : 0,
    ev.combos || 0,
    ev.clearedCount || 0,
    -steps,
    Math.floor(score),
  ];
};

const precomputeCandidateRanks = (
  candidates,
  mode,
  specialPriorities,
  initTargetCombo
) => {
  for (const st of candidates) {
    if (!st._poolRank) {
      st._poolRank = makePoolRank(st, mode, specialPriorities, initTargetCombo);
    }
  }
  return candidates;
};

const flushPendingSolutions = (
  currentList,
  pendingList,
  mode,
  specialPriorities,
  initTargetCombo,
  limit = 10
) => {
  if (!pendingList.length) return currentList;
  const merged = mergeTopSolutions(
    currentList,
    pendingList,
    mode,
    specialPriorities,
    initTargetCombo,
    limit
  );
  pendingList.length = 0;
  return merged;
};

const findMatches = (tempBoard, phase = "initial") => {
  let combos = 0,
    clearedCount = 0,
    vC = 0,
    hC = 0;

  const totalCells = TOTAL_ROWS * COLS;
  const isH = new Uint8Array(totalCells);
  const isV = new Uint8Array(totalCells);
  const toClear1D = new Uint8Array(totalCells);
  const patternCounts = makePatternCounts();
  const comboCountsByOrb = makeComboCountsByOrb();

  // ===== 水平三連 =====
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; ) {
      const v0 = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (v0 === -1) {
        c++;
        continue;
      }

      const v1 = getOrbForMatchPhase(tempBoard[r][c + 1], phase);
      const v2 = getOrbForMatchPhase(tempBoard[r][c + 2], phase);
      if (v0 !== v1 || v0 !== v2) {
        c++;
        continue;
      }

      let k = c + 3;
      while (k < COLS && getOrbForMatchPhase(tempBoard[r][k], phase) === v0) k++;

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
      const v0 = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (v0 === -1) {
        r++;
        continue;
      }

      const v1 = getOrbForMatchPhase(tempBoard[r + 1][c], phase);
      const v2 = getOrbForMatchPhase(tempBoard[r + 2][c], phase);
      if (v0 !== v1 || v0 !== v2) {
        r++;
        continue;
      }

      let k = r + 3;
      while (k < TOTAL_ROWS && getOrbForMatchPhase(tempBoard[k][c], phase) === v0) k++;

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
      const type = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (type >= 0 && type < comboCountsByOrb.length) {
        comboCountsByOrb[type]++;
      }

      let hasHM = false;
      let hasVM = false;

      let head = 0;
      let tail = 0;
      qR[tail] = r;
      qC[tail] = c;
      tail++;
      visited[idx0] = 1;

      let groupSize = 0;
      const shapeCells = [];
      const groupCells = [];

      while (head < tail) {
        const cr = qR[head];
        const cc = qC[head];
        head++;

        clearedCount++;
        groupSize++;
        groupCells.push([cr, cc]);

        if (shapeCells.length < 5) shapeCells.push([cr, cc]);

        const idx = cr * COLS + cc;
        if (isH[idx]) hasHM = true;
        if (isV[idx]) hasVM = true;

        for (let i = 0; i < 4; i++) {
          const nr = cr + drs[i];
          const nc = cc + dcs[i];
          if (nr >= PLAY_ROWS_START && nr < TOTAL_ROWS && nc >= 0 && nc < COLS) {
            const nidx = nr * COLS + nc;
            if (
              toClear1D[nidx] &&
              !visited[nidx] &&
              getOrbForMatchPhase(tempBoard[nr][nc], phase) === type
            ) {
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

      // ===== exact 5 圖形 =====
      if (groupSize === 5) {
        const shape = detectExact5Shape(shapeCells);
        if (shape === SHAPE_KIND.CROSS) {
          patternCounts.cross.total++;
          patternCounts.cross.byOrb[type]++;
        } else if (shape === SHAPE_KIND.L) {
          patternCounts.l.total++;
          patternCounts.l.byOrb[type]++;
        } else if (shape === SHAPE_KIND.T) {
          patternCounts.t.total++;
          patternCounts.t.byOrb[type]++;
        }
      }

      // ===== 純 m*n 矩形（靈罩）=====
      for (const m of RECT_M_OPTIONS) {
        for (const n of RECT_N_OPTIONS) {
          if (isPureRectGroup(groupCells, m, n)) {
            const key = `${m}x${n}`;
            patternCounts.rect[key].total++;
            patternCounts.rect[key].byOrb[type]++;
          }
        }
      }
    }
  }

  return {
    combos,
    clearedCount,
    vC,
    hC,
    toClearMap: toClear1D,
    patternCounts,
    comboCountsByOrb,
  };
};

const unlockN2Board = (b) => {
  const next = clone2D(b);
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (nMarkOf(next[r][c]) === 2) {
        next[r][c] = setNMark(next[r][c], 0);
      }
    }
  }
  return next;
};

const evaluateBoard = (tempBoard, skyfall, initialResult = null) => {
  const result = initialResult ?? findMatches(tempBoard, "initial");

  const initialCombos = result.combos;
  const initialH = result.hC;
  const initialV = result.vC;
  const initialCleared = result.clearedCount;
  const initialPatternCounts = result.patternCounts;
  const initialComboCountsByOrb = result.comboCountsByOrb;

  if (!skyfall) {
    return {
      combos: initialCombos,
      initialCombos,
      skyfallCombos: 0,
      clearedCount: initialCleared,
      initialClearedCount: initialCleared,
      verticalCombos: initialV,
      horizontalCombos: initialH,

      // 新 multi-special helper 主要會吃這兩個
      initialPatternCounts,
      initialComboCountsByOrb,

      // 保留 alias，避免舊程式其他地方還在吃舊欄位
      patternCounts: initialPatternCounts,
      comboCountsByOrb: initialComboCountsByOrb,
    };
  }

  let currentBoard = clone2D(tempBoard);
  let totalCombos = initialCombos;
  let totalV = initialV;
  let totalH = initialH;
  let totalCleared = initialCleared;
  let loopResult = result;
  let firstCascade = true;

  while (loopResult.combos > 0) {
    currentBoard = applyGravity(currentBoard, loopResult.toClearMap);

    if (firstCascade) {
      currentBoard = unlockN2Board(currentBoard);
      firstCascade = false;
    }

    loopResult = findMatches(currentBoard, "skyfall");

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
    initialClearedCount: initialCleared,
    verticalCombos: totalV,
    horizontalCombos: totalH,

    // 新 multi-special helper 主要吃初盤圖形資訊
    initialPatternCounts,
    initialComboCountsByOrb,

    // 保留 alias
    patternCounts: initialPatternCounts,
    comboCountsByOrb: initialComboCountsByOrb,
  };
};

const combinedPotentialScore = (b, mode) => {

  const potInitial = potentialScore(b, mode, "initial");

  const unlocked = unlockN2Board(b);

  const potSkyfall = potentialScore(unlocked, mode, "skyfall");

  const edgePot = edgePotentialScore(b, "initial");

  const compact = compactnessScore(b, "initial");

  return (
    potInitial * 0.6 +
    potSkyfall * 0.2 +
    edgePot * 0.15 +
    compact * 0.05
  );
};

const calcScore = (
  ev,
  pot,
  pathLen,
  cfg,
  target,
  mode,
  priority,
  specialPriorities,
  violatesN2 = false,
  extraCtx = {}
) => {
  const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
  const normalizedSpecials = normalizeSpecialPriorityList(specialPriorities);
  const hasSpecial = normalizedSpecials.length > 0;

  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;
  const effectiveStepPenalty =
    priority === "steps" ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const clearedW = priority === "combo" ? 1000 : 200;
  const illegalPenalty = violatesN2 ? 2200000 : 0;

  // =========================
  // 無特優先：盡量退回舊版味道
  // =========================
  if (!hasSpecial) {
    if (ev.combos >= target) {
      const stepCost = pathLen * effectiveStepPenalty;
      return (
        5200000 -
        stepCost -
        overPenalty +
        ev.clearedCount * clearedW -
        illegalPenalty
      );
    }

    const miss = target - ev.combos;
    const missPenalty = -(miss * miss * 320000);
    const nearBonus =
      (target - miss) * 50000 +
      (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);

    const t = Math.max(0, 1 - miss / Math.max(1, target));
    const majorBonus = major * (1200000 * t * t);
    const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
    const stepSoft = pathLen * 35;
    const clearedBonus = ev.clearedCount * clearedW;

    return (
      missPenalty +
      nearBonus +
      majorBonus +
      pot * potWeight +
      clearedBonus -
      stepSoft -
      illegalPenalty
    );
  }

  // =========================
  // 有特優先：新版 multi-special
  // =========================
  const specialTuple = getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx);
  const specialScore = specialPriorityTupleToScore(specialTuple);

  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return (
      specialScore +
      5200000 -
      stepCost -
      overPenalty +
      ev.clearedCount * clearedW -
      illegalPenalty
    );
  }

  const miss = target - ev.combos;
  const missPenalty = -(miss * miss * 320000);
  const nearBonus =
    (target - miss) * 50000 +
    (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);

  const t = Math.max(0, 1 - miss / Math.max(1, target));
  const majorBonus = major * (1200000 * t * t);
  const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
  const stepSoft = pathLen * 35;
  const clearedBonus = ev.clearedCount * clearedW;

  return (
    specialScore +
    missPenalty +
    nearBonus +
    majorBonus +
    pot * potWeight +
    clearedBonus -
    stepSoft -
    illegalPenalty
  );
};

const mergeTopSolutions = (
  oldList,
  newList,
  mode,
  specialPriorities,
  initTargetCombo,
  limit = 10,
  perSignatureLimit = 2
) => {
  const normalized = normalizeSpecialPriorityList(specialPriorities);
  const hasSpecial = normalized.length > 0;

  if (!hasSpecial) {
    const bestBySig = new Map();

    for (const sol of [...(oldList || []), ...(newList || [])]) {
      if (!sol || !sol.path || sol.path.length === 0) continue;

      const sig = getSolutionMergeSignature(sol);
      const prev = bestBySig.get(sig);

      if (!prev) {
        bestBySig.set(sig, sol);
        continue;
      }

      const replace = shouldReplaceSameComboSignature(
        prev,
        sol,
        mode,
        specialPriorities,
        initTargetCombo
      );

      if (replace) bestBySig.set(sig, sol);
    }

    const arr = Array.from(bestBySig.values());
    precomputeCandidateRanks(arr, mode, specialPriorities, initTargetCombo);

    arr.sort((a, b) => lexCompareDesc(a._poolRank, b._poolRank));
    return arr.slice(0, limit);
  }

  const grouped = new Map();

  for (const sol of [...(oldList || []), ...(newList || [])]) {
    if (!sol || !sol.path || sol.path.length === 0) continue;

    const sig = getSolutionMergeSignature(sol);
    if (!grouped.has(sig)) grouped.set(sig, []);
    grouped.get(sig).push(sol);
  }

  const merged = [];

  for (const arr of grouped.values()) {
    precomputeCandidateRanks(arr, mode, specialPriorities, initTargetCombo);
    arr.sort((a, b) => lexCompareDesc(a._poolRank, b._poolRank));

    const chosen = [];
    const seenPath = new Set();

    for (const sol of arr) {
      const pathKey = JSON.stringify(sol.path || []);
      if (seenPath.has(pathKey)) continue;
      seenPath.add(pathKey);
      chosen.push(sol);
      if (chosen.length >= perSignatureLimit) break;
    }

    merged.push(...chosen);
  }

  precomputeCandidateRanks(merged, mode, specialPriorities, initTargetCombo);
  merged.sort((a, b) => lexCompareDesc(a._poolRank, b._poolRank));

  return merged.slice(0, limit);
};

const SHAPE_CANONICAL = Object.fromEntries(
  Object.entries(SHAPE_TEMPLATES).map(([k, cells]) => [k, canonicalShapeKey(cells)])
);

const detectExact5Shape = (cells) => {
  if (!cells || cells.length !== 5) return null;
  const key = canonicalShapeKey(cells);
  for (const [kind, canon] of Object.entries(SHAPE_CANONICAL)) {
    if (key === canon) return kind;
  }
  return null;
};

const makePatternCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8),
});

const makeRectCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8),
});

const makeRectCounts = () => {
  const out = {};
  for (const m of RECT_M_OPTIONS) {
    for (const n of RECT_N_OPTIONS) {
      out[`${m}x${n}`] = makeRectCounter();
    }
  }
  return out;
};

const makePatternCounts = () => ({
  cross: makePatternCounter(),
  l: makePatternCounter(),
  t: makePatternCounter(),
  rect: makeRectCounts(),
});

const makeComboCountsByOrb = () => new Int16Array(8);

const isPureRectGroup = (cells, expectedRows, expectedCols) => {
  if (!cells || cells.length !== expectedRows * expectedCols) return false;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;

  const set = new Set();

  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    set.add(`${r},${c}`);
  }

  const h = maxR - minR + 1;
  const w = maxC - minC + 1;
  if (h !== expectedRows || w !== expectedCols) return false;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!set.has(`${r},${c}`)) return false;
    }
  }

  return true;
};

const getRectMatchedValue = (ev, special) => {
  const activeSpecial = getActiveSpecialPriority(special);
  if (!activeSpecial) return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const key = `${m}x${n}`;
  const group = ev.initialPatternCounts?.rect?.[key];
  if (!group) return 0;

  if (activeSpecial.rectOrb === SPECIAL_ORB_ANY) return group.total || 0;
  return group.byOrb?.[activeSpecial.rectOrb] || 0;
};

const getRectPotentialScore = (board, special, phase = "initial") => {
  const activeSpecial = getActiveSpecialPriority(special);
  if (!activeSpecial || activeSpecial.type !== "rect") return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const wantOrb = activeSpecial.rectOrb ?? SPECIAL_ORB_ANY;

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      const counts = new Int16Array(8);

      for (let r = r0; r < r0 + m; r++) {
        for (let c = c0; c < c0 + n; c++) {
          const v = getOrbForMatchPhase(board[r][c], phase);
          if (v >= 0 && v < counts.length) counts[v]++;
        }
      }

      let orb = wantOrb;
      let insideCount = 0;

      if (wantOrb === SPECIAL_ORB_ANY) {
        for (let k = 0; k < counts.length; k++) {
          if (counts[k] > insideCount) {
            insideCount = counts[k];
            orb = k;
          }
        }
      } else {
        insideCount = counts[wantOrb] || 0;
      }

      if (orb < 0) continue;

      let boundarySameCount = 0;

      for (let r = r0; r < r0 + m; r++) {
        if (c0 - 1 >= 0) {
          const v = getOrbForMatchPhase(board[r][c0 - 1], phase);
          if (v === orb) boundarySameCount++;
        }
        if (c0 + n < COLS) {
          const v = getOrbForMatchPhase(board[r][c0 + n], phase);
          if (v === orb) boundarySameCount++;
        }
      }

      for (let c = c0; c < c0 + n; c++) {
        if (r0 - 1 >= PLAY_ROWS_START) {
          const v = getOrbForMatchPhase(board[r0 - 1][c], phase);
          if (v === orb) boundarySameCount++;
        }
        if (r0 + m < TOTAL_ROWS) {
          const v = getOrbForMatchPhase(board[r0 + m][c], phase);
          if (v === orb) boundarySameCount++;
        }
      }

      const score = insideCount * 100 - boundarySameCount * 25;
      if (score > best) best = score;
    }
  }

  return best;
};

const getEqualFirstMatchedValue = (ev, special) => {
  const activeSpecial = getActiveSpecialPriority(special);
  const selected = normalizeSelectedEqualOrbs(activeSpecial?.equalOrbs);
  if (selected.length === 0) return 0;

  const counts = ev.initialComboCountsByOrb;
  if (!counts) return 0;

  const vals = selected.map((orb) => counts[orb] || 0);
  const first = vals[0] || 0;

  if (first <= 0) return 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== first) return 0;
  }
  return first;
};

const SHAPE_TEMPLATES = {
  [SHAPE_KIND.CROSS]: [
    [0, 1],
    [1, 0], [1, 1], [1, 2],
    [2, 1],
  ],
  [SHAPE_KIND.L]: [
    [0, 0],
    [1, 0],
    [2, 0], [2, 1], [2, 2],
  ],
  [SHAPE_KIND.T]: [
    [0, 0], [0, 1], [0, 2],
            [1, 1],
            [2, 1],
  ],
};

const RECT_GUIDE_PATTERNS = {
  cross: [
    [0, 1],
    [1, 0], [1, 1], [1, 2],
    [2, 1],
  ],
  l: [
    [0, 0],
    [1, 0],
    [2, 0], [2, 1], [2, 2],
  ],
  t: [
    [0, 0], [0, 1], [0, 2],
            [1, 1],
            [2, 1],
  ],
  block2x2: [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
  ],
  rect2x3: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
  ],
  rect3x2: [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
    [2, 0], [2, 1],
  ],
  lineH3: [
    [0, 0], [0, 1], [0, 2],
  ],
  lineV3: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
};

const matchSubPatternAt = (
  board,
  r0,
  c0,
  winR,
  winC,
  pattern,
  orb,
  phase = "initial"
) => {
  for (const [dr, dc] of pattern) {
    const r = r0 + winR + dr;
    const c = c0 + winC + dc;

    if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
      return false;
    }

    if (winR + dr < 0 || winR + dr >= 999) return false;
    if (winC + dc < 0 || winC + dc >= 999) return false;

    const v = getOrbForMatchPhase(board[r][c], phase);
    if (v !== orb) return false;
  }

  return true;
};

const matchSubPatternInWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  startR,
  startC,
  pattern,
  orb,
  phase = "initial"
) => {
  for (const [dr, dc] of pattern) {
    const wr = startR + dr;
    const wc = startC + dc;

    if (wr < 0 || wr >= m || wc < 0 || wc >= n) return false;

    const r = baseR + wr;
    const c = baseC + wc;
    const v = getOrbForMatchPhase(board[r][c], phase);
    if (v !== orb) return false;
  }
  return true;
};

const countWindowOrb = (board, baseR, baseC, m, n, orb, phase = "initial") => {
  let cnt = 0;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      const v = getOrbForMatchPhase(board[baseR + r][baseC + c], phase);
      if (v === orb) cnt++;
    }
  }
  return cnt;
};

const countBoundaryOrb = (board, baseR, baseC, m, n, orb, phase = "initial") => {
  let cnt = 0;

  for (let r = baseR; r < baseR + m; r++) {
    if (baseC - 1 >= 0) {
      const v = getOrbForMatchPhase(board[r][baseC - 1], phase);
      if (v === orb) cnt++;
    }
    if (baseC + n < COLS) {
      const v = getOrbForMatchPhase(board[r][baseC + n], phase);
      if (v === orb) cnt++;
    }
  }

  for (let c = baseC; c < baseC + n; c++) {
    if (baseR - 1 >= PLAY_ROWS_START) {
      const v = getOrbForMatchPhase(board[baseR - 1][c], phase);
      if (v === orb) cnt++;
    }
    if (baseR + m < TOTAL_ROWS) {
      const v = getOrbForMatchPhase(board[baseR + m][c], phase);
      if (v === orb) cnt++;
    }
  }

  return cnt;
};

const countPatternHitsInWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  orb,
  phase = "initial"
) => {
  let cross = 0;
  let t = 0;
  let l = 0;
  let block2x2 = 0;
  let rect2x3 = 0;
  let rect3x2 = 0;
  let lineH3 = 0;
  let lineV3 = 0;

  for (let sr = 0; sr < m; sr++) {
    for (let sc = 0; sc < n; sc++) {
      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.cross, orb, phase
        )
      ) cross++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.t, orb, phase
        )
      ) t++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.l, orb, phase
        )
      ) l++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.block2x2, orb, phase
        )
      ) block2x2++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.rect2x3, orb, phase
        )
      ) rect2x3++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.rect3x2, orb, phase
        )
      ) rect3x2++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.lineH3, orb, phase
        )
      ) lineH3++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.lineV3, orb, phase
        )
      ) lineV3++;
    }
  }

  return { cross, t, l, block2x2, rect2x3, rect3x2, lineH3, lineV3 };
};

const scoreRectGuideWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  orb,
  phase = "initial"
) => {
  const insideCount = countWindowOrb(board, baseR, baseC, m, n, orb, phase);
  const boundaryCount = countBoundaryOrb(board, baseR, baseC, m, n, orb, phase);
  const hits = countPatternHitsInWindow(board, baseR, baseC, m, n, orb, phase);

  let score = 0;

  score += insideCount * 100;
  score -= boundaryCount * 25;

  if (m === 3 && n === 3) {
    score += hits.cross * 2200;
    score += hits.t * 1700;
    score += hits.l * 1500;
    score += hits.block2x2 * 900;
    score += (hits.lineH3 + hits.lineV3) * 700;
    score += (hits.rect2x3 + hits.rect3x2) * 1200;
  } else {
    score += hits.cross * 1200;
    score += hits.t * 900;
    score += hits.l * 800;
    score += hits.block2x2 * 650;
    score += (hits.rect2x3 + hits.rect3x2) * 1000;
    score += (hits.lineH3 + hits.lineV3) * 500;
  }

  return score;
};

const getRectPatternGuideScore = (board, specialPriority, phase = "initial") => {
  const activeSpecial = getActiveSpecialPriority(specialPriority);
  if (!activeSpecial || activeSpecial.type !== "rect") return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const wantOrb = activeSpecial.rectOrb ?? SPECIAL_ORB_ANY;

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      if (wantOrb === SPECIAL_ORB_ANY) {
        for (const orb of [
          ORB_TYPES.WATER.id,
          ORB_TYPES.FIRE.id,
          ORB_TYPES.EARTH.id,
          ORB_TYPES.LIGHT.id,
          ORB_TYPES.DARK.id,
          ORB_TYPES.HEART.id,
        ]) {
          const s = scoreRectGuideWindow(board, r0, c0, m, n, orb, phase);
          if (s > best) best = s;
        }
      } else {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, wantOrb, phase);
        if (s > best) best = s;
      }
    }
  }

  return best;
};


export { beamSolve };
