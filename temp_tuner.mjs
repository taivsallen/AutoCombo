import { performance } from 'perf_hooks';

// ==============================================================================
// 🟩 區塊 1：底層常數與基礎屬性 (不要更動此區)
// ==============================================================================
const COLS = 6;
const TOTAL_ROWS = 6; // 根據你的盤面邏輯，包含預備區
const PLAY_ROWS_START = 1;

const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const orbOf = (v) => (v < 0 ? -1 : (v % 10));                
const xMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 10) % 10); 
const qMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 100));     

// ==============================================================================
// 🟦 區塊 2：演算法粘貼區 (未來只要替換這裡面的 function 即可)
// 👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇👇
// ==============================================================================

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

// bestGlobal.nodesExpanded = nodesExpanded; 
// ==============================================================================
// 👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆👆
// 🟦 區塊 2 結束
// ==============================================================================


// ==============================================================================
// 🟧 區塊 3：評測框架 (不需要更動此區)
// ==============================================================================
const generateRandomBoard = () => {
  const board = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(Math.floor(Math.random() * 6)); 
    }
    board.push(row);
  }
  return board;
};

const runBenchmark = (versionName, solverFn, testBoards, targetCombo, config) => {
  let totalTimeMs = 0, totalNodes = 0, successCount = 0, totalSteps = 0, totalCombos = 0;
  const numBoards = testBoards.length;

  for (let i = 0; i < numBoards; i++) {
    const boardCopy = testBoards[i].map(row => [...row]);
    
    const startTime = performance.now();
    const result = solverFn(boardCopy, config, targetCombo, 'combo', 'combo', false, true);
    const endTime = performance.now();

    const timeMs = endTime - startTime;
    const steps = result.path && result.path.length > 0 ? result.path.length - 1 : 0; 
    // 防止忘記加上 nodesExpanded 導致 undefined，給予預設值 0
    const nodes = result.nodesExpanded || 0; 
    const combos = result.combos || 0;

    totalTimeMs += timeMs;
    totalNodes += nodes;
    totalSteps += steps;
    totalCombos += combos;

    if (combos >= targetCombo) successCount++;
  }

  const avgTime = totalTimeMs / numBoards;
  const avgNodes = totalNodes / numBoards;
  const avgSteps = totalSteps / numBoards;
  const avgCombos = totalCombos / numBoards;
  const successRate = (successCount / numBoards) * 100;

  // 綜合評分公式 (可依需求調整權重)
  const score = (successRate * 50) + (avgCombos * 100) - (avgTime * 2) - (avgSteps * 5) - (avgNodes * 0.1);

  return {
    versionName,
    metrics: {
      "達成率 (Success Rate)": successRate.toFixed(2) + '%',
      "平均時間 (Avg Time)": avgTime.toFixed(2) + ' ms',
      "平均展開節點 (Nodes)": Math.round(avgNodes),
      "平均步數 (Steps)": avgSteps.toFixed(1),
      "平均 Combo": avgCombos.toFixed(2)
    },
    finalScore: Math.round(score)
  };
};


// === 以下為 Python 動態加入的自動化調參區塊 ===
import fs from 'fs'; 

const TARGET_COMBO = 8;

// 🛑 讀取固定的測試題庫
const testSuite = JSON.parse(fs.readFileSync('fixed_test_suite.json', 'utf8'));

const args = process.argv.slice(2);
const configTest = {
    maxSteps: 70, // 固定
    beamWidth: parseInt(args[0], 10),
    maxNodes: parseInt(args[1], 10),
    stepPenalty: parseInt(args[2], 10),
    potentialWeight: parseInt(args[3], 10)
};

const report = runBenchmark("Tuning", beamSolve, testSuite, TARGET_COMBO, configTest);
console.log(JSON.stringify({
    config: configTest,
    metrics: report.metrics,
    finalScore: report.finalScore
}));
