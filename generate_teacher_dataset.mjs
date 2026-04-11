import fs from "fs";
import path from "path";
import { once } from "events";

const COLS = 6;
const TOTAL_ROWS = 6;
const PLAY_ROWS_START = 1;
const DIRS_4 = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const DIRS_8 = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
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
  if (s === "1" || s === "true" || s === "yes" || s === "y") return true;
  if (s === "0" || s === "false" || s === "no" || s === "n") return false;
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

const flattenBoard = (b) => {
  const out = new Array(TOTAL_ROWS * COLS);
  let k = 0;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) out[k++] = Number(b[r][c] ?? -1);
  }
  return out;
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

const applyGravity = (b, toClear1D) => {
  const next = clone2D(b);
  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;
    for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) {
      if (!toClear1D[r * COLS + c]) {
        next[writeRow][c] = b[r][c];
        writeRow--;
      }
    }
    for (let r = writeRow; r >= PLAY_ROWS_START; r--) next[r][c] = -1;
  }
  return next;
};

const findMatches = (tempBoard) => {
  let combos = 0;
  let clearedCount = 0;
  let vC = 0;
  let hC = 0;

  const totalCells = TOTAL_ROWS * COLS;
  const isH = new Uint8Array(totalCells);
  const isV = new Uint8Array(totalCells);
  const toClear1D = new Uint8Array(totalCells);

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
      let hasHM = false;
      let hasVM = false;

      let head = 0;
      let tail = 0;
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
          const nr = cr + drs[i];
          const nc = cc + dcs[i];
          if (
            nr >= PLAY_ROWS_START &&
            nr < TOTAL_ROWS &&
            nc >= 0 &&
            nc < COLS
          ) {
            const nidx = nr * COLS + nc;
            if (
              toClear1D[nidx] &&
              !visited[nidx] &&
              orbOf(tempBoard[nr][nc]) === type
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
    }
  }

  return { combos, clearedCount, vC, hC, toClearMap: toClear1D };
};

const evaluateBoard = (tempBoard, skyfall) => {
  let result = findMatches(tempBoard);
  const initialCombos = result.combos;
  const initialH = result.hC;
  const initialV = result.vC;
  const initialCleared = result.clearedCount;

  if (!skyfall) {
    return {
      combos: initialCombos,
      initialCombos,
      skyfallCombos: 0,
      clearedCount: initialCleared,
      verticalCombos: initialV,
      horizontalCombos: initialH,
    };
  }

  let currentBoard = clone2D(tempBoard);
  let totalCombos = initialCombos;
  let totalV = initialV;
  let totalH = initialH;
  let totalCleared = initialCleared;
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

const objectiveScore = (ev, stepsUsed, target, mode) => {
  const major =
    mode === "vertical"
      ? ev.verticalCombos || 0
      : mode === "horizontal"
      ? ev.horizontalCombos || 0
      : 0;
  const combos = ev.combos || 0;
  const cleared = ev.clearedCount || 0;
  const miss = Math.max(0, target - combos);
  const over = Math.max(0, combos - target);
  return (
    combos * 1000000 +
    major * 250000 +
    cleared * 1000 -
    miss * miss * 180000 -
    over * over * 150000 -
    stepsUsed * 80
  );
};

const makeNode = (parent, r, c) => ({
  parent,
  r,
  c,
  len: parent ? parent.len + 1 : 1,
});

const stepsOf = (node) => Math.max(0, (node?.len || 0) - 1);

const cloneState = (s) => ({
  board: clone2D(s.board),
  held: s.held,
  hole: { r: s.hole.r, c: s.hole.c },
  cursor: { r: s.cursor.r, c: s.cursor.c },
  prevCursor: s.prevCursor ? { r: s.prevCursor.r, c: s.prevCursor.c } : null,
  stepsUsed: s.stepsUsed,
});

const legalMoves = (state, diagonal) => {
  const dirs = diagonal ? DIRS_8 : DIRS_4;
  const out = [];
  for (const [dr, dc] of dirs) {
    const nr = state.cursor.r + dr;
    const nc = state.cursor.c + dc;
    if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) {
      continue;
    }
    out.push({ r: nr, c: nc });
  }
  return out;
};

const randomBoard = (rng) => {
  const board = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(Math.floor(rng() * 6));
    }
    board.push(row);
  }
  return board;
};

const createInitialState = (board, r, c) => {
  const next = clone2D(board);
  const held = next[r][c];
  next[r][c] = -1;
  return {
    board: next,
    held,
    hole: { r, c },
    cursor: { r, c },
    prevCursor: null,
    stepsUsed: 0,
  };
};

const stepState = (state, to) => {
  const nextBoard = clone2D(state.board);
  const nextHole = holeStepInPlace(nextBoard, state.hole, to);
  return {
    board: nextBoard,
    held: state.held,
    hole: nextHole,
    cursor: { r: to.r, c: to.c },
    prevCursor: { ...state.cursor },
    stepsUsed: state.stepsUsed + 1,
  };
};

const rolloutStates = (seedBoard, cfg, boardRng) => {
  const startR = PLAY_ROWS_START + Math.floor(boardRng() * (TOTAL_ROWS - PLAY_ROWS_START));
  const startC = Math.floor(boardRng() * COLS);
  let cur = createInitialState(seedBoard, startR, startC);
  const out = [cloneState(cur)];

  for (let i = 0; i < cfg.rolloutSteps; i++) {
    const moves = legalMoves(cur, cfg.diagonal).filter((mv) => {
      if (!cur.prevCursor) return true;
      return !(mv.r === cur.prevCursor.r && mv.c === cur.prevCursor.c);
    });
    if (!moves.length) break;
    const pick = moves[Math.floor(boardRng() * moves.length)];
    cur = stepState(cur, pick);
    out.push(cloneState(cur));
  }

  return out;
};

const labelStateWithBeam = (rootState, cfg) => {
  const evalRoot = boardWithHeldFilled(rootState.board, rootState.hole, rootState.held);
  const evRoot = evaluateBoard(evalRoot, cfg.skyfall);
  const rootNode = makeNode(null, rootState.cursor.r, rootState.cursor.c);
  let best = {
    score: objectiveScore(evRoot, stepsOf(rootNode), cfg.target, cfg.mode),
    combos: evRoot.combos || 0,
    clearedCount: evRoot.clearedCount || 0,
    bestStepsUsed: 0,
    expansions: 0,
  };

  let beam = [
    {
      board: clone2D(rootState.board),
      held: rootState.held,
      hole: { ...rootState.hole },
      r: rootState.cursor.r,
      c: rootState.cursor.c,
      node: rootNode,
      score: best.score,
    },
  ];

  let expansions = 0;
  const visited = new Map();
  const dirs = cfg.diagonal ? DIRS_8 : DIRS_4;

  for (let depth = 0; depth < cfg.stepsLeft; depth++) {
    if (expansions >= cfg.maxNodes) break;
    const candidates = [];

    for (const st of beam) {
      if (expansions >= cfg.maxNodes) break;

      for (const [dr, dc] of dirs) {
        const nr = st.r + dr;
        const nc = st.c + dc;
        if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) {
          continue;
        }

        if (st.node?.parent && nr === st.node.parent.r && nc === st.node.parent.c) {
          continue;
        }

        const node = makeNode(st.node, nr, nc);
        const stepsUsed = stepsOf(node);
        const nextBoard = clone2D(st.board);
        const nextHole = holeStepInPlace(nextBoard, st.hole, { r: nr, c: nc });
        const evalBoard = boardWithHeldFilled(nextBoard, nextHole, st.held);
        const ev = evaluateBoard(evalBoard, cfg.skyfall);
        const score = objectiveScore(ev, stepsUsed, cfg.target, cfg.mode);

        if (score > best.score) {
          best = {
            score,
            combos: ev.combos || 0,
            clearedCount: ev.clearedCount || 0,
            bestStepsUsed: stepsUsed,
            expansions,
          };
        }

        const key = `${getBoardKey(nextBoard)}|${st.held}|${nextHole.r},${nextHole.c}|${depth + 1}`;
        const prev = visited.get(key);
        if (prev != null && prev >= score) {
          expansions++;
          continue;
        }
        visited.set(key, score);

        candidates.push({
          board: nextBoard,
          held: st.held,
          hole: nextHole,
          r: nr,
          c: nc,
          node,
          score,
        });

        expansions++;
      }
    }

    if (!candidates.length) break;
    candidates.sort((a, b) => b.score - a.score);
    beam = candidates.slice(0, cfg.beamWidth);
  }

  best.expansions = expansions;
  return best;
};

const sampleWithoutReplacement = (n, k, rng) => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(k, n));
};

const chooseSplit = (boardSeed) => {
  const m = Math.abs(boardSeed) % 10;
  if (m <= 7) return "train";
  if (m === 8) return "valid";
  return "test";
};

const writeJsonLine = async (stream, obj) => {
  const line = JSON.stringify(obj) + "\n";
  if (!stream.write(line)) await once(stream, "drain");
};

const closeStream = async (stream) => {
  stream.end();
  await once(stream, "finish");
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const cfg = {
    outputDir: args.output ?? "teacher_data",
    prefix: args.prefix ?? "teacher",
    baseSeed: asInt(args.seed, 12345),
    boards: asInt(args.boards, 1200),
    statesPerBoard: asInt(args["states-per-board"], 12),
    rolloutSteps: asInt(args["rollout-steps"], 14),
    stepsLeftMin: asInt(args["steps-left-min"], 4),
    stepsLeftMax: asInt(args["steps-left-max"], 18),
    beamWidth: asInt(args["beam-width"], 420),
    maxNodes: asInt(args["max-nodes"], 180000),
    target: asInt(args.target, 8),
    mode: args.mode ?? "combo",
    skyfall: asBool(args.skyfall, false),
    diagonal: asBool(args.diagonal, true),
    progressEvery: asInt(args["progress-every"], 50),
  };

  cfg.stepsLeftMin = clamp(cfg.stepsLeftMin, 1, 200);
  cfg.stepsLeftMax = clamp(cfg.stepsLeftMax, cfg.stepsLeftMin, 200);
  cfg.statesPerBoard = clamp(cfg.statesPerBoard, 1, 1000);
  cfg.rolloutSteps = clamp(cfg.rolloutSteps, 1, 300);
  cfg.beamWidth = clamp(cfg.beamWidth, 8, 5000);
  cfg.maxNodes = clamp(cfg.maxNodes, 1000, 2000000);

  fs.mkdirSync(cfg.outputDir, { recursive: true });
  const fileTrain = path.join(cfg.outputDir, `${cfg.prefix}.train.jsonl`);
  const fileValid = path.join(cfg.outputDir, `${cfg.prefix}.valid.jsonl`);
  const fileTest = path.join(cfg.outputDir, `${cfg.prefix}.test.jsonl`);
  const fileMeta = path.join(cfg.outputDir, `${cfg.prefix}.meta.json`);

  const streamTrain = fs.createWriteStream(fileTrain);
  const streamValid = fs.createWriteStream(fileValid);
  const streamTest = fs.createWriteStream(fileTest);

  const counts = {
    train: 0,
    valid: 0,
    test: 0,
    totalStates: 0,
    totalLabelExpansions: 0,
  };

  const runStart = Date.now();

  for (let boardIdx = 0; boardIdx < cfg.boards; boardIdx++) {
    const boardSeed = (cfg.baseSeed + boardIdx * 104729) >>> 0;
    const rng = mulberry32(boardSeed);
    const board = randomBoard(rng);
    const split = chooseSplit(boardSeed);
    const traj = rolloutStates(board, cfg, rng);
    const picked = sampleWithoutReplacement(traj.length, cfg.statesPerBoard, rng);

    for (let localIdx = 0; localIdx < picked.length; localIdx++) {
      const stateIdx = picked[localIdx];
      const s = traj[stateIdx];
      const stepsLeft =
        cfg.stepsLeftMin +
        Math.floor(rng() * (cfg.stepsLeftMax - cfg.stepsLeftMin + 1));

      const label = labelStateWithBeam(s, {
        stepsLeft,
        beamWidth: cfg.beamWidth,
        maxNodes: cfg.maxNodes,
        target: cfg.target,
        mode: cfg.mode,
        skyfall: cfg.skyfall,
        diagonal: cfg.diagonal,
      });

      const boardWithHole = flattenBoard(s.board);
      const boardFilled = flattenBoard(boardWithHeldFilled(s.board, s.hole, s.held));

      const row = {
        board_id: boardIdx,
        board_seed: boardSeed,
        split,
        state_index: stateIdx,
        target: cfg.target,
        mode: cfg.mode,
        skyfall: cfg.skyfall,
        diagonal: cfg.diagonal,
        steps_left: stepsLeft,
        steps_used: s.stepsUsed,
        held: s.held,
        cursor: [s.cursor.r, s.cursor.c],
        hole: [s.hole.r, s.hole.c],
        board_with_hole: boardWithHole,
        board_filled: boardFilled,
        label: {
          score: label.score,
          combos: label.combos,
          cleared_count: label.clearedCount,
          best_steps_used: label.bestStepsUsed,
          expansions: label.expansions,
        },
      };

      if (split === "train") {
        await writeJsonLine(streamTrain, row);
      } else if (split === "valid") {
        await writeJsonLine(streamValid, row);
      } else {
        await writeJsonLine(streamTest, row);
      }

      counts[split]++;
      counts.totalStates++;
      counts.totalLabelExpansions += label.expansions;
    }

    if ((boardIdx + 1) % cfg.progressEvery === 0 || boardIdx + 1 === cfg.boards) {
      const elapsed = Math.max(1, (Date.now() - runStart) / 1000);
      const perSec = (counts.totalStates / elapsed).toFixed(2);
      const avgExp = Math.round(
        counts.totalLabelExpansions / Math.max(1, counts.totalStates)
      );
      console.log(
        `[teacher-dataset] boards=${boardIdx + 1}/${cfg.boards} ` +
          `states=${counts.totalStates} (${perSec}/s) avgExp=${avgExp}`
      );
    }
  }

  await Promise.all([
    closeStream(streamTrain),
    closeStream(streamValid),
    closeStream(streamTest),
  ]);

  const elapsedSec = (Date.now() - runStart) / 1000;
  const meta = {
    generated_at: new Date().toISOString(),
    elapsed_sec: elapsedSec,
    config: cfg,
    counts,
    files: {
      train: fileTrain,
      valid: fileValid,
      test: fileTest,
    },
  };

  fs.writeFileSync(fileMeta, JSON.stringify(meta, null, 2), "utf8");
  console.log(`[teacher-dataset] done. meta: ${fileMeta}`);
};

main().catch((err) => {
  console.error("[teacher-dataset] failed:", err);
  process.exit(1);
});
