// Single Android runtime bundle generated from App.jsx solver core.
// Do not edit this generated asset by hand.
// Auto-generated from ../../src/App.jsx by tools/generate_android_appjsx_solver.mjs.
// Do not edit this asset by hand. Android must use the same beamSolve core as App.jsx.
const normalizeSpecialPriorityList = specialPriority => {
  if (Array.isArray(specialPriority)) {
    return specialPriority.filter(sp => sp && sp.type && sp.type !== "none");
  }
  if (specialPriority && specialPriority.type && specialPriority.type !== "none") {
    return [specialPriority];
  }
  return [];
};

const SPECIAL_ORB_ANY = -1;

const ORB_TYPES = {
  WATER: {
    id: 0
  },
  FIRE: {
    id: 1
  },
  EARTH: {
    id: 2
  },
  LIGHT: {
    id: 3
  },
  DARK: {
    id: 4
  },
  HEART: {
    id: 5
  }
};

const EQUAL_FIRST_ORBS = [ORB_TYPES.WATER.id, ORB_TYPES.FIRE.id, ORB_TYPES.EARTH.id, ORB_TYPES.LIGHT.id, ORB_TYPES.DARK.id, ORB_TYPES.HEART.id];

const normalizeSelectedEqualOrbs = arr => {
  if (!Array.isArray(arr)) return [];
  const set = new Set();
  for (const v of arr) {
    const n = Number(v);
    if (EQUAL_FIRST_ORBS.includes(n)) set.add(n);
  }
  return [...set];
};

const compileSpecialPriorityList = specialPriority => {
  const raw = normalizeSpecialPriorityList(specialPriority);
  return raw.map(sp => {
    const type = sp.type;
    if (type === "rect") {
      const m = Number(sp.rectM) || 3;
      const n = Number(sp.rectN) || 3;
      const rectOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;
      return {
        ...sp,
        type,
        m,
        n,
        rectKey: `${m}x${n}`,
        rectOrb
      };
    }
    if (type === "equalFirst") {
      return {
        ...sp,
        type,
        selectedOrbs: normalizeSelectedEqualOrbs(sp.equalOrbs)
      };
    }
    if (type === "clearCount") {
      return {
        ...sp,
        type,
        clearCountValue: Number(sp.clearCount) || 0
      };
    }
    return {
      ...sp,
      type,
      countValue: Number(sp.count) || 1,
      orbValue: sp.orb ?? SPECIAL_ORB_ANY
    };
  });
};

const ORB_IDS = [0, 1, 2, 3, 4, 5];

const clampIntRange = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

const RULE_CLEAR_MODE_CONNECTED = "connected";

const RULE_CLEAR_MODE_LINE = "line";

const normalizeOrbRule = ruleLike => ({
  minClear: clampIntRange(ruleLike?.minClear, 1, 5, 3),
  clearMode: ruleLike?.clearMode === RULE_CLEAR_MODE_CONNECTED ? RULE_CLEAR_MODE_CONNECTED : RULE_CLEAR_MODE_LINE
});

const normalizeRuleRequirement = reqLike => {
  const orb = clampIntRange(reqLike?.orb, 0, 5, 0);
  const size = clampIntRange(reqLike?.size, 1, 5, 3);
  const count = Math.max(1, clampIntRange(reqLike?.count, 1, 999, 1));
  return {
    orb,
    size,
    count,
    match: reqLike?.match === "atLeast" ? "atLeast" : "exact"
  };
};

const normalizeRuleProfile = profileLike => {
  const orbRulesSrc = Array.isArray(profileLike?.orbRules) ? profileLike.orbRules : [];
  const reqSrc = Array.isArray(profileLike?.requirements) ? profileLike.requirements : [];
  return {
    orbRules: ORB_IDS.map(orb => normalizeOrbRule(orbRulesSrc[orb])),
    requirements: reqSrc.map(normalizeRuleRequirement)
  };
};

const buildRuleRuntimeContext = profileLike => {
  const profile = normalizeRuleProfile(profileLike);
  return {
    profile,
    minClearByOrb: ORB_IDS.map(orb => profile.orbRules[orb]?.minClear || 3),
    clearModeByOrb: ORB_IDS.map(orb => profile.orbRules[orb]?.clearMode || RULE_CLEAR_MODE_LINE)
  };
};

const getRuleRuntimeContext = ruleProfileLike => {
  if (ruleProfileLike && ruleProfileLike.profile && Array.isArray(ruleProfileLike.minClearByOrb) && Array.isArray(ruleProfileLike.clearModeByOrb)) {
    return ruleProfileLike;
  }
  return buildRuleRuntimeContext(ruleProfileLike);
};

const DIRS_8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const xMarkOf = v => v < 0 ? 0 : Math.floor(v / 10) % 10;

const qMarkOf = v => v < 0 ? 0 : Math.floor(v / 100) % 10;

const nMarkOf = v => v < 0 ? 0 : Math.floor(v / 1000) % 10;

const TOTAL_ROWS = 6;

const COLS = 6;

const getBoardKey = b => {
  // 兩個 32-bit hash 組成固定長度字串 key，避免 BigInt toString 開銷
  let h1 = 2166136261 >>> 0; // FNV-ish
  let h2 = 16777619 >>> 0;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = b[r];
    for (let c = 0; c < COLS; c++) {
      const x = row[c] + 11 ^ (r + 1) * 131 ^ (c + 1) * 257;
      h1 ^= x & 0xff;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 += x | 0;
      h2 = (h2 ^ h2 >>> 16) >>> 0;
      h2 = Math.imul(h2, 2246822507) >>> 0;
      h2 = (h2 ^ h2 >>> 13) >>> 0;
      h2 = Math.imul(h2, 3266489909) >>> 0;
      h2 = (h2 ^ h2 >>> 16) >>> 0;
    }
    h1 ^= 0x9e;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= 0x85ebca6b;
    h2 = Math.imul(h2, 2246822507) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
};

const PLAY_ROWS_START = 1;

const orbOf = v => v < 0 ? -1 : v % 10;

const getOrbForMatchPhase = (cellVal, phase) => {
  if (cellVal < 0) return -1;
  const n = nMarkOf(cellVal);

  // 擐嚗1 / n2 ?賢??其??臬?????
  if (phase === "initial") {
    if (n === 1 || n === 2) return -1;
  }

  // 天降嚗??n1 銝瘨?n2 ?臭誑瘨?
  if (phase === "skyfall") {
    if (n === 1) return -1;
  }
  return orbOf(cellVal);
};

const clone2D = b => {
  const len = b.length;
  const copy = new Array(len);
  for (let i = 0; i < len; i++) copy[i] = b[i].slice();
  return copy;
};

const BFS_DRS = [0, 0, 1, -1];

const BFS_DCS = [1, -1, 0, 0];

const createFindMatchesScratch = totalCells => ({
  totalCells,
  isH: new Uint8Array(totalCells),
  isV: new Uint8Array(totalCells),
  connVisited: new Uint8Array(totalCells),
  bfsQ: new Int16Array(totalCells),
  visited: new Uint8Array(totalCells),
  qR: new Int8Array(totalCells),
  qC: new Int8Array(totalCells),
  component: [],
  groupCells: [],
  groupCellPool: Array.from({
    length: totalCells
  }, () => [0, 0]),
  shapeCells: [],
  shapeCellPool: Array.from({
    length: 5
  }, () => [0, 0])
});

const getFindMatchesScratch = totalCells => {
  let scratch = getFindMatchesScratch._cache;
  if (!scratch || scratch.totalCells !== totalCells) {
    scratch = createFindMatchesScratch(totalCells);
    getFindMatchesScratch._cache = scratch;
  }
  scratch.isH.fill(0);
  scratch.isV.fill(0);
  scratch.connVisited.fill(0);
  scratch.visited.fill(0);
  return scratch;
};

const makePatternCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8)
});

const RECT_M_OPTIONS = [3, 4, 5];

const RECT_N_OPTIONS = [3, 4, 5];

const makeRectCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8)
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
  rect: makeRectCounts()
});

const makeComboCountsByOrb = () => new Int16Array(8);

const makeComboSizeCountsByOrb = () => Array.from({
  length: 6
}, () => Object.create(null));

const transformCells8 = cells => {
  return [cells.map(([r, c]) => [r, c]), cells.map(([r, c]) => [r, -c]), cells.map(([r, c]) => [-r, c]), cells.map(([r, c]) => [-r, -c]), cells.map(([r, c]) => [c, r]), cells.map(([r, c]) => [c, -r]), cells.map(([r, c]) => [-c, r]), cells.map(([r, c]) => [-c, -r])];
};

const normalizeCells = cells => {
  let minR = Infinity;
  let minC = Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
  }
  const arr = cells.map(([r, c]) => `${r - minR},${c - minC}`).sort();
  return arr.join("|");
};

const canonicalShapeKey = cells => {
  let best = null;
  for (const t of transformCells8(cells)) {
    const key = normalizeCells(t);
    if (best === null || key < best) best = key;
  }
  return best;
};

const SHAPE_KIND = {
  CROSS: "cross",
  L: "l",
  T: "t"
};

const SHAPE_TEMPLATES = {
  [SHAPE_KIND.CROSS]: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  [SHAPE_KIND.L]: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  [SHAPE_KIND.T]: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]
};

const SHAPE_CANONICAL = Object.fromEntries(Object.entries(SHAPE_TEMPLATES).map(([k, cells]) => [k, canonicalShapeKey(cells)]));

const detectExact5Shape = cells => {
  if (!cells || cells.length !== 5) return null;
  const key = canonicalShapeKey(cells);
  for (const [kind, canon] of Object.entries(SHAPE_CANONICAL)) {
    if (key === canon) return kind;
  }
  return null;
};

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

const findMatches = (tempBoard, phase = "initial", ruleProfileLike = null, collectGroups = false) => {
  let combos = 0,
    clearedCount = 0,
    vC = 0,
    hC = 0;
  const ruleCtx = getRuleRuntimeContext(ruleProfileLike);
  const minClearByOrb = ruleCtx.minClearByOrb;
  const clearModeByOrb = ruleCtx.clearModeByOrb;
  const totalCells = TOTAL_ROWS * COLS;
  const scratch = getFindMatchesScratch(totalCells);
  const isH = scratch.isH;
  const isV = scratch.isV;
  const toClear1D = new Uint8Array(totalCells);
  const patternCounts = makePatternCounts();
  const comboCountsByOrb = makeComboCountsByOrb();
  const comboSizeCountsByOrb = makeComboSizeCountsByOrb();
  const comboGroups = [];
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS;) {
      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb === -1) {
        c++;
        continue;
      }
      let k = c + 1;
      while (k < COLS && getOrbForMatchPhase(tempBoard[r][k], phase) === orb) k++;
      if (clearModeByOrb[orb] === RULE_CLEAR_MODE_LINE && k - c >= minClearByOrb[orb]) {
        for (let x = c; x < k; x++) {
          const idx = r * COLS + x;
          toClear1D[idx] = 1;
          isH[idx] = 1;
        }
      }
      c = k;
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS;) {
      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb === -1) {
        r++;
        continue;
      }
      let k = r + 1;
      while (k < TOTAL_ROWS && getOrbForMatchPhase(tempBoard[k][c], phase) === orb) {
        k++;
      }
      if (clearModeByOrb[orb] === RULE_CLEAR_MODE_LINE && k - r >= minClearByOrb[orb]) {
        for (let y = r; y < k; y++) {
          const idx = y * COLS + c;
          toClear1D[idx] = 1;
          isV[idx] = 1;
        }
      }
      r = k;
    }
  }
  const connVisited = scratch.connVisited;
  const bfsQ = scratch.bfsQ;
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx0 = r * COLS + c;
      if (connVisited[idx0]) continue;
      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb < 0 || clearModeByOrb[orb] !== RULE_CLEAR_MODE_CONNECTED) {
        connVisited[idx0] = 1;
        continue;
      }
      let head = 0;
      let tail = 0;
      bfsQ[tail++] = idx0;
      connVisited[idx0] = 1;
      const component = scratch.component;
      component.length = 0;
      let hasHAdj = false;
      let hasVAdj = false;
      while (head < tail) {
        const idx = bfsQ[head++];
        component.push(idx);
        const cr = Math.floor(idx / COLS);
        const cc = idx % COLS;
        for (let i = 0; i < 4; i++) {
          const nr = cr + BFS_DRS[i];
          const nc = cc + BFS_DCS[i];
          if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) {
            continue;
          }
          const nidx = nr * COLS + nc;
          const norb = getOrbForMatchPhase(tempBoard[nr][nc], phase);
          if (norb !== orb) continue;
          if (BFS_DRS[i] === 0) hasHAdj = true;
          if (BFS_DCS[i] === 0) hasVAdj = true;
          if (!connVisited[nidx]) {
            connVisited[nidx] = 1;
            bfsQ[tail++] = nidx;
          }
        }
      }
      if (component.length >= minClearByOrb[orb]) {
        for (const idx of component) {
          toClear1D[idx] = 1;
          if (hasHAdj) isH[idx] = 1;
          if (hasVAdj) isV[idx] = 1;
        }
      }
    }
  }
  const visited = scratch.visited;
  const qR = scratch.qR;
  const qC = scratch.qC;
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
      let minR = Infinity;
      let maxR = -Infinity;
      let minC = Infinity;
      let maxC = -Infinity;
      const shapeCells = scratch.shapeCells;
      const groupCells = scratch.groupCells;
      const shapeCellPool = scratch.shapeCellPool;
      const groupCellPool = scratch.groupCellPool;
      shapeCells.length = 0;
      groupCells.length = 0;
      let shapeWrite = 0;
      let groupWrite = 0;
      while (head < tail) {
        const cr = qR[head];
        const cc = qC[head];
        head++;
        clearedCount++;
        groupSize++;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        let groupCell = groupCellPool[groupWrite];
        if (!groupCell) {
          groupCell = [0, 0];
          groupCellPool[groupWrite] = groupCell;
        }
        groupCell[0] = cr;
        groupCell[1] = cc;
        groupCells.push(groupCell);
        groupWrite++;
        if (shapeWrite < 5) {
          let shapeCell = shapeCellPool[shapeWrite];
          if (!shapeCell) {
            shapeCell = [0, 0];
            shapeCellPool[shapeWrite] = shapeCell;
          }
          shapeCell[0] = cr;
          shapeCell[1] = cc;
          shapeCells.push(shapeCell);
          shapeWrite++;
        }
        const idx = cr * COLS + cc;
        if (isH[idx]) hasHM = true;
        if (isV[idx]) hasVM = true;
        for (let i = 0; i < 4; i++) {
          const nr = cr + BFS_DRS[i];
          const nc = cc + BFS_DCS[i];
          if (nr >= PLAY_ROWS_START && nr < TOTAL_ROWS && nc >= 0 && nc < COLS) {
            const nidx = nr * COLS + nc;
            if (toClear1D[nidx] && !visited[nidx] && getOrbForMatchPhase(tempBoard[nr][nc], phase) === type) {
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
      if (type >= 0 && type < 6) {
        const sizeKey = String(groupSize);
        comboSizeCountsByOrb[type][sizeKey] = (comboSizeCountsByOrb[type][sizeKey] || 0) + 1;
      }
      let exactShape = null;
      if (groupSize === 5) {
        const shape = detectExact5Shape(shapeCells);
        exactShape = shape;
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
      for (const m of RECT_M_OPTIONS) {
        for (const n of RECT_N_OPTIONS) {
          if (isPureRectGroup(groupCells, m, n)) {
            const key = `${m}x${n}`;
            patternCounts.rect[key].total++;
            patternCounts.rect[key].byOrb[type]++;
          }
        }
      }
      if (collectGroups) {
        const cellIds = new Array(groupCells.length);
        for (let i = 0; i < groupCells.length; i++) {
          const cell = groupCells[i];
          cellIds[i] = cell[0] * COLS + cell[1];
        }
        cellIds.sort((a, b) => a - b);
        const relKey = cellIds.map(id => {
          const r = Math.floor(id / COLS);
          const c = id % COLS;
          return `${r - minR},${c - minC}`;
        }).sort().join("|");
        comboGroups.push({
          orb: type,
          size: groupSize,
          cellIds,
          cellMask: cellIds.join("."),
          relKey,
          minR,
          maxR,
          minC,
          maxC,
          centerR2: minR + maxR,
          centerC2: minC + maxC,
          hasH: hasHM,
          hasV: hasVM,
          shape: exactShape
        });
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
    comboSizeCountsByOrb,
    groups: comboGroups
  };
};

const hasInitialN2Clear = (board, toClear1D) => {
  if (!toClear1D) return false;
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (toClear1D[idx] && nMarkOf(board[r][c]) === 2) {
        return true;
      }
    }
  }
  return false;
};

const getInitialMatchCheck = (board, ruleProfileLike = null, collectGroups = false) => {
  const initial = findMatches(board, "initial", ruleProfileLike, collectGroups);
  return {
    initial,
    violatesN2: hasInitialN2Clear(board, initial?.toClearMap)
  };
};

const applyGravity = (b, toClear1D) => {
  const next = clone2D(b);
  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;
    for (let r = TOTAL_ROWS - 1; r >= 1; r--) {
      // ?雁霈?? r * COLS + c
      if (!toClear1D[r * COLS + c]) {
        next[writeRow][c] = b[r][c];
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 1; r--) next[r][c] = -1;
  }
  return next;
};

const withMarks = (orbId, xMark = 0, qMark = 0, nMark = 0) => orbId + xMark * 10 + qMark * 100 + nMark * 1000;

const setNMark = (cellVal, nMark) => withMarks(orbOf(cellVal), xMarkOf(cellVal), qMarkOf(cellVal), nMark);

const unlockN2Board = b => {
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

const evaluateBoard = (tempBoard, skyfall, initialResult = null, ruleProfileLike = null) => {
  const ruleCtx = getRuleRuntimeContext(ruleProfileLike);
  const result = initialResult ?? findMatches(tempBoard, "initial", ruleCtx);
  const initialCombos = result.combos;
  const initialH = result.hC;
  const initialV = result.vC;
  const initialCleared = result.clearedCount;
  const initialPatternCounts = result.patternCounts;
  const initialComboCountsByOrb = result.comboCountsByOrb;
  const initialComboSizeCountsByOrb = result.comboSizeCountsByOrb;
  if (!skyfall) {
    return {
      combos: initialCombos,
      initialCombos,
      skyfallCombos: 0,
      clearedCount: initialCleared,
      initialClearedCount: initialCleared,
      verticalCombos: initialV,
      horizontalCombos: initialH,
      // ??multi-special helper 銝餉??????
      initialPatternCounts,
      initialComboCountsByOrb,
      initialComboSizeCountsByOrb,
      // 靽? alias嚗??蝔??嗡??唳???甈?
      patternCounts: initialPatternCounts,
      comboCountsByOrb: initialComboCountsByOrb,
      comboSizeCountsByOrb: initialComboSizeCountsByOrb
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
    loopResult = findMatches(currentBoard, "skyfall", ruleCtx);
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
    // ??multi-special helper 銝餉????文?敶Ｚ?閮?
    initialPatternCounts,
    initialComboCountsByOrb,
    initialComboSizeCountsByOrb,
    // 靽? alias
    patternCounts: initialPatternCounts,
    comboCountsByOrb: initialComboCountsByOrb,
    comboSizeCountsByOrb: initialComboSizeCountsByOrb
  };
};

const getSingleSpecialMatchedValueCompiled = (ev, sp) => {
  if (!sp || sp.type === "none") return 0;
  switch (sp.type) {
    case "clearCount":
      return ev.initialClearedCount || 0;
    case "equalFirst":
      {
        const selected = sp.selectedOrbs || [];
        if (selected.length === 0) return 0;
        const counts = ev.initialComboCountsByOrb;
        if (!counts) return 0;
        const vals = selected.map(orb => counts[orb] || 0);
        const first = vals[0] || 0;
        if (first <= 0) return 0;
        for (let i = 1; i < vals.length; i++) {
          if (vals[i] !== first) return 0;
        }
        return first;
      }
    case "rect":
      {
        const group = ev.initialPatternCounts?.rect?.[sp.rectKey];
        if (!group) return 0;
        if (sp.rectOrb === SPECIAL_ORB_ANY || sp.rectOrb === -1) {
          return group.total || 0;
        }
        return group.byOrb?.[sp.rectOrb] || 0;
      }
    default:
      {
        const group = ev.initialPatternCounts?.[sp.type];
        if (!group) return 0;
        if (sp.orbValue === SPECIAL_ORB_ANY) return group.total || 0;
        return group.byOrb?.[sp.orbValue] || 0;
      }
  }
};

const isSingleSpecialSatisfiedCompiled = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return true;
  const initCleared = Number(extraCtx?.initialClearedCount ?? ev?.initialClearedCount ?? ev?.initClearedCount ?? ev?.initialCleared ?? 0);
  const wantClearCount = Number(sp?.clearCountValue ?? sp?.clearCount ?? sp?.countValue ?? sp?.count ?? 0);
  switch (sp.type) {
    case "clearCount":
      return initCleared === wantClearCount;
    case "equalFirst":
      return getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) > 0;
    case "rect":
      return getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) >= 1;
    default:
      return getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) >= Number(sp?.countValue ?? sp?.count ?? 1);
  }
};

const getSingleSpecialProgressCompiled = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return {
    done: 1,
    guide: 0
  };
  const getInitCleared = () => Number(extraCtx?.initialClearedCount ?? ev?.initialClearedCount ?? ev?.initClearedCount ?? ev?.initialCleared ?? 0);
  const getInitComboCountsByOrb = () => extraCtx?.initialComboCountsByOrb ?? ev?.initialComboCountsByOrb ?? ev?.initComboCountsByOrb ?? null;
  const getClearCountWant = () => Number(sp?.clearCountValue ?? sp?.clearCount ?? sp?.countValue ?? sp?.count ?? 0);
  const getSelectedOrbs = () => sp?.selectedOrbs ?? sp?.equalOrbs ?? [];
  switch (sp.type) {
    case "rect":
      return {
        done: isSingleSpecialSatisfiedCompiled(ev, sp, extraCtx) ? 1 : 0,
        guide: extraCtx?.rectGuide || 0
      };
    case "clearCount":
      {
        const got = getInitCleared();
        const want = getClearCountWant();
        const diff = Math.abs(got - want);
        if (want >= 24) {
          const fullGuide = Number(extraCtx?.fullBoardClearGuide || 0);
          const deficit = Math.max(0, want - got);
          const overshoot = Math.max(0, got - want);
          return {
            done: got === want ? 1 : 0,
            guide: got === want ? 160000 + fullGuide : got > want ? -30000 - overshoot * 12000 + fullGuide * 0.25 : 50000 + got * 1500 - deficit * 1000 + fullGuide
          };
        }
        return {
          done: got === want ? 1 : 0,
          guide: 100000 - diff * 1000 - Math.max(0, got - want) * 10
        };
      }
    case "equalFirst":
      {
        const selected = getSelectedOrbs();
        if (!selected || selected.length === 0) return {
          done: 0,
          guide: 0
        };
        const counts = getInitComboCountsByOrb();
        if (!counts) return {
          done: 0,
          guide: 0
        };
        const vals = selected.map(orb => Number(counts[orb] || 0));
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        const diff = maxV - minV;
        return {
          done: minV > 0 && diff === 0 ? 1 : 0,
          guide: minV * 1000 - diff * 300
        };
      }
    default:
      {
        const got = getSingleSpecialMatchedValueCompiled(ev, sp);
        const want = Number(sp?.countValue ?? sp?.count ?? 1);
        return {
          done: got >= want ? 1 : 0,
          guide: Math.min(got, want) * 1000 - Math.max(0, want - got) * 200
        };
      }
  }
};

const getSpecialPriorityTupleCompiled = (ev, compiledSpecials = [], extraCtx = {}) => {
  const tuple = new Array(compiledSpecials.length * 2);
  let k = 0;
  for (let i = 0; i < compiledSpecials.length; i++) {
    const p = getSingleSpecialProgressCompiled(ev, compiledSpecials[i], extraCtx);
    tuple[k++] = p.done;
    tuple[k++] = p.guide;
  }
  return tuple;
};

const EMPTY_SPECIAL_TUPLE = Object.freeze([]);

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

const isAllSpecialSatisfiedCompiled = (ev, compiledSpecials = [], extraCtx = {}) => {
  for (let i = 0; i < compiledSpecials.length; i++) {
    if (!isSingleSpecialSatisfiedCompiled(ev, compiledSpecials[i], extraCtx)) {
      return false;
    }
  }
  return true;
};

const getSolutionMergeSignature = sol => {
  const initialCombos = Number(sol?.initialCombos || 0);
  const totalCombos = Number(sol?.combos || 0);
  const skyfallCombos = Math.max(0, totalCombos - initialCombos);

  // ?芰????+ ??蝯??? merge signature
  return `${initialCombos}|${skyfallCombos}`;
};

const getNormalizedRuleProfileForCache = ruleProfileLike => {
  if (ruleProfileLike && Array.isArray(ruleProfileLike.orbRules) && Array.isArray(ruleProfileLike.requirements)) {
    return ruleProfileLike;
  }
  if (ruleProfileLike && ruleProfileLike.profile && Array.isArray(ruleProfileLike.profile.orbRules) && Array.isArray(ruleProfileLike.profile.requirements)) {
    return ruleProfileLike.profile;
  }
  return normalizeRuleProfile(ruleProfileLike);
};

const normalizeSpecialPriorityListKeepSlots = specialPriority => {
  if (Array.isArray(specialPriority)) {
    return [specialPriority[0] && specialPriority[0].type ? specialPriority[0] : {
      type: "none"
    }, specialPriority[1] && specialPriority[1].type ? specialPriority[1] : {
      type: "none"
    }, specialPriority[2] && specialPriority[2].type ? specialPriority[2] : {
      type: "none"
    }];
  }
  if (specialPriority && specialPriority.type) {
    return [specialPriority, {
      type: "none"
    }, {
      type: "none"
    }];
  }
  return [{
    type: "none"
  }, {
    type: "none"
  }, {
    type: "none"
  }];
};

const getPathSteps = path => Math.max(0, (path?.length || 0) - 1);

const compileSpecialPriorityListKeepSlots = specialPriority => {
  const raw = normalizeSpecialPriorityListKeepSlots(specialPriority);
  return raw.map(sp => {
    const type = sp?.type || "none";
    if (type === "none") {
      return {
        type: "none"
      };
    }
    if (type === "rect") {
      const m = Number(sp.rectM) || 3;
      const n = Number(sp.rectN) || 3;
      const rectOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;
      return {
        ...sp,
        type,
        m,
        n,
        rectKey: `${m}x${n}`,
        rectOrb
      };
    }
    if (type === "equalFirst") {
      return {
        ...sp,
        type,
        selectedOrbs: normalizeSelectedEqualOrbs(sp.equalOrbs)
      };
    }
    if (type === "clearCount") {
      return {
        ...sp,
        type,
        clearCountValue: Number(sp.clearCount) || 0
      };
    }
    return {
      ...sp,
      type,
      countValue: Number(sp.count) || 1,
      orbValue: sp.orb ?? SPECIAL_ORB_ANY
    };
  });
};

const getSpecialPriorityDoneTupleKeepSlots = (ev, compiledSpecials = [], extraCtx = {}) => {
  const fixed = [compiledSpecials[0] || {
    type: "none"
  }, compiledSpecials[1] || {
    type: "none"
  }, compiledSpecials[2] || {
    type: "none"
  }];
  return fixed.map(sp => {
    if (!sp || sp.type === "none") return 0;
    return isSingleSpecialSatisfiedCompiled(ev, sp, extraCtx) ? 1 : 0;
  });
};

const makePoolRank = (sol, mode, specialPriorities, initTargetCombo, ruleProfile = null) => {
  const normalizedRuleProfile = getNormalizedRuleProfileForCache(ruleProfile);
  const compiledRequirements = normalizedRuleProfile.requirements;
  const requirementTuple = [];
  if (compiledRequirements.length > 0) {
    let allDone = 1;
    let totalDone = 0;
    let totalMissing = 0;
    const countsByOrb = sol?.initialComboSizeCountsByOrb;
    for (const req of compiledRequirements) {
      const orb = clampIntRange(req.orb, 0, 5, 0);
      const size = clampIntRange(req.size, 1, 5, 3);
      const count = Math.max(1, clampIntRange(req.count, 1, 999, 1));
      const got = Number(countsByOrb?.[orb]?.[String(size)] || 0);
      const distance = req.match === "atLeast" ? Math.max(0, count - got) : Math.abs(count - got);
      const done = distance === 0 ? 1 : 0;
      if (!done) allDone = 0;
      totalDone += Math.min(got, count);
      totalMissing += distance;
      requirementTuple.push(done, -distance, Math.min(got, count));
    }
    requirementTuple.unshift(-totalMissing);
    requirementTuple.unshift(totalDone);
    requirementTuple.unshift(allDone);
  }
  const cacheKey = JSON.stringify({
    mode,
    initTargetCombo: Number(initTargetCombo) || 0,
    specialPriorities: normalizeSpecialPriorityListKeepSlots(specialPriorities),
    requirements: compiledRequirements
  });
  if (sol?._poolRankCached && sol?._poolRankCacheKey === cacheKey) {
    return sol._poolRankCached;
  }
  const initialCombos = Number(sol?.initialCombos || 0);
  const initialCleared = Number(sol?.initialClearedCount || 0);
  const totalCombos = Number(sol?.combos || 0);
  const skyfallCombos = Math.max(0, totalCombos - initialCombos);
  const steps = getPathSteps(sol?.path || []);
  const legal = sol?.violatesN2 ? 0 : 1;
  const initTarget = Number(initTargetCombo);
  const initExact = Number.isFinite(initTarget) && initTarget >= 0 && initialCombos === initTarget ? 1 : 0;
  const compiledKeepSlots = sol?._compiledKeepSlotsCache && sol?._compiledKeepSlotsCacheKey === JSON.stringify(normalizeSpecialPriorityListKeepSlots(specialPriorities)) ? sol._compiledKeepSlotsCache : compileSpecialPriorityListKeepSlots(specialPriorities);
  const extraCtx = {
    rectGuide: Number(sol?.rectGuide || 0)
  };
  const doneTuple = getSpecialPriorityDoneTupleKeepSlots(sol, compiledKeepSlots, extraCtx);
  const d1 = Number(doneTuple[0] || 0);
  const d2 = Number(doneTuple[1] || 0);
  const d3 = Number(doneTuple[2] || 0);
  const highClearTarget = normalizeSpecialPriorityListKeepSlots(specialPriorities).reduce((maxValue, sp) => {
    if (sp?.type !== "clearCount") return maxValue;
    const value = Number(sp.clearCountValue ?? sp.clearCount ?? sp.count ?? 0);
    return value >= 24 ? Math.max(maxValue, value) : maxValue;
  }, 0);

  // Keep the three shield slots lexicographic.  #1 must beat #2, and #2
  // must beat #3; collapsing them into one combination score loses that
  // ordering (for example, #2 done could outrank #1 unfinished).
  const specialSlotTuple = [d1, d2, d3];
  sol._compiledKeepSlotsCache = compiledKeepSlots;
  sol._compiledKeepSlotsCacheKey = JSON.stringify(normalizeSpecialPriorityListKeepSlots(specialPriorities));
  const initDistance = Number.isFinite(initTarget) && initTarget >= 0 ? Math.abs(initialCombos - initTarget) : 0;
  const rank = [legal, ...requirementTuple, ...specialSlotTuple];

  // For an unsatisfied 24~30 clear-count shield, a high-combo route that
  // leaves half the board is less useful than a route that is close to the
  // required full-board clear.  Keep this preference only for high targets;
  // normal Top10 ordering remains unchanged.
  if (highClearTarget > 0) {
    rank.push(initialCleared === highClearTarget ? 1 : 0, initialCleared, Number(sol?.fullBoardClearGuide || 0));
  }
  rank.push(initExact, -initDistance, initialCombos);
  if (mode === "steps") {
    rank.push(-steps, totalCombos, skyfallCombos);
  } else {
    rank.push(totalCombos, -steps, skyfallCombos);
  }
  sol._poolRankCached = rank;
  sol._poolRankCacheKey = cacheKey;
  return rank;
};

const lexCompareDesc = (a, b) => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
};

const shouldReplaceSameComboSignature = (prev, cur, mode, specialPriorities, initTargetCombo, ruleProfile = null) => {
  const prevRank = makePoolRank(prev, mode, specialPriorities, initTargetCombo, ruleProfile);
  const curRank = makePoolRank(cur, mode, specialPriorities, initTargetCombo, ruleProfile);
  const cmp = lexCompareDesc(curRank, prevRank);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  const prevSteps = getPathSteps(prev?.path || []);
  const curSteps = getPathSteps(cur?.path || []);
  return curSteps < prevSteps;
};

const precomputeCandidateRanks = (candidates, mode, specialPriorities, initTargetCombo, ruleProfile = null) => {
  for (const st of candidates) {
    st._poolRank = makePoolRank(st, mode, specialPriorities, initTargetCombo, ruleProfile);
  }
  return candidates;
};

const mergeTopSolutions = (oldList, newList, mode, specialPriorities, initTargetCombo, ruleProfile = null, limit = 10) => {
  const bestBySig = new Map();
  for (const sol of [...(oldList || []), ...(newList || [])]) {
    if (!sol || !Array.isArray(sol.path) || sol.path.length === 0) continue;
    const sig = getSolutionMergeSignature(sol);
    const prev = bestBySig.get(sig);
    if (!prev) {
      bestBySig.set(sig, sol);
      continue;
    }
    if (shouldReplaceSameComboSignature(prev, sol, mode, specialPriorities, initTargetCombo, ruleProfile)) {
      bestBySig.set(sig, sol);
    }
  }
  const arr = Array.from(bestBySig.values());
  precomputeCandidateRanks(arr, mode, specialPriorities, initTargetCombo, ruleProfile);
  arr.sort((a, b) => lexCompareDesc(a._poolRankCached, b._poolRankCached));
  return arr.slice(0, limit);
};

const flushPendingSolutions = (currentList, pendingList, mode, specialPriorities, initTargetCombo, ruleProfile = null, limit = 10) => {
  if (!pendingList.length) return currentList;
  const merged = mergeTopSolutions(currentList, pendingList, mode, specialPriorities, initTargetCombo, ruleProfile, limit);
  pendingList.length = 0;
  return merged;
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

const potentialScore = (b, mode, phase = "initial") => {
  let p = 0;
  const hWeight = mode === "horizontal" ? 3 : 0.5;
  const vWeight = mode === "vertical" ? 3 : 0.5;

  // 瘞游像
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    let a = getOrbForMatchPhase(b[r][0], phase);
    let d = getOrbForMatchPhase(b[r][1], phase);
    for (let c = 0; c < COLS - 2; c++) {
      const e = getOrbForMatchPhase(b[r][c + 2], phase);
      if (a !== -1) {
        if (a === d && a !== e || d === e && a !== d || a === e && a !== d) {
          p += hWeight;
        }
      }
      a = d;
      d = e;
    }
  }

  // ?
  for (let c = 0; c < COLS; c++) {
    let a = getOrbForMatchPhase(b[PLAY_ROWS_START][c], phase);
    let d = PLAY_ROWS_START + 1 < TOTAL_ROWS ? getOrbForMatchPhase(b[PLAY_ROWS_START + 1][c], phase) : -1;
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const e = getOrbForMatchPhase(b[r + 2][c], phase);
      if (a !== -1) {
        if (a === d && a !== e || d === e && a !== d || a === e && a !== d) {
          p += vWeight;
        }
      }
      a = d;
      d = e;
    }
  }
  return p;
};

const edgePotentialScore = (b, phase = "initial") => {
  let p = 0;
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = getOrbForMatchPhase(b[r][c], phase);
      if (v === -1) continue;
      const isEdge = r === PLAY_ROWS_START || r === TOTAL_ROWS - 1 || c === 0 || c === COLS - 1;
      if (!isEdge) continue;
      if (c + 1 < COLS && getOrbForMatchPhase(b[r][c + 1], phase) === v) p += 2;
      if (r + 1 < TOTAL_ROWS && getOrbForMatchPhase(b[r + 1][c], phase) === v) p += 2;
    }
  }
  return p;
};

const compactnessScore = (b, phase = "initial") => {
  let minR = 99,
    maxR = -1;
  let minC = 99,
    maxC = -1;
  let cnt = 0;
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = getOrbForMatchPhase(b[r][c], phase);
      if (v === -1) continue;
      cnt++;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  if (cnt <= 1) return 0;
  const area = (maxR - minR + 1) * (maxC - minC + 1);
  return -area * 30;
};

const combinedPotentialScore = (b, mode) => {
  const potInitial = potentialScore(b, mode, "initial");
  const unlocked = unlockN2Board(b);
  const potSkyfall = potentialScore(unlocked, mode, "skyfall");
  const edgePot = edgePotentialScore(b, "initial");
  const compact = compactnessScore(b, "initial");
  return potInitial * 0.6 + potSkyfall * 0.2 + edgePot * 0.15 + compact * 0.05;
};

const fullBoardClearGuide = (b, phase = "initial") => {
  const candidate = new Uint8Array(TOTAL_ROWS * COLS);
  const exact = new Uint8Array(TOTAL_ROWS * COLS);
  let pairWindows = 0;
  let exactWindows = 0;
  const addWindow = cells => {
    const counts = new Map();
    for (const [r, c] of cells) {
      const v = getOrbForMatchPhase(b[r][c], phase);
      if (v < 0) continue;
      const item = counts.get(v);
      if (item) item.push([r, c]);else counts.set(v, [[r, c]]);
    }
    let best = null;
    for (const cellsForOrb of counts.values()) {
      if (!best || cellsForOrb.length > best.length) best = cellsForOrb;
    }
    if (!best || best.length < 2) return;
    pairWindows++;
    for (const [r, c] of best) candidate[r * COLS + c] = 1;
    if (best.length >= 3) {
      exactWindows++;
      for (const [r, c] of best) exact[r * COLS + c] = 1;
    }
  };
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      addWindow([[r, c], [r, c + 1], [r, c + 2]]);
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r <= TOTAL_ROWS - 3; r++) {
      addWindow([[r, c], [r + 1, c], [r + 2, c]]);
    }
  }
  let candidateCells = 0;
  let exactCells = 0;
  for (let i = PLAY_ROWS_START * COLS; i < TOTAL_ROWS * COLS; i++) {
    candidateCells += candidate[i] ? 1 : 0;
    exactCells += exact[i] ? 1 : 0;
  }

  // Keep the guide in the same order of magnitude as the existing special
  // guides.  This lets a completed slot still dominate, while giving
  // unfinished 24~30 shields a useful board-wide gradient.
  return Math.min(20000, candidateCells * 420 + exactCells * 180 + pairWindows * 35 + exactWindows * 70);
};

const shouldRefreshRectGuide = (steps, prevRectGuide, hasRectSpecial) => {
  if (!hasRectSpecial) return false;
  if (prevRectGuide == null) return true;
  if (steps <= 6) return true;
  return steps % 2 === 0;
};

const getCheapRectGuideScoreBySpecial = (board, sp, phase = "initial") => {
  if (!sp || sp.type !== "rect") return 0;
  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;
  const RECT_ORBS = wantOrb !== SPECIAL_ORB_ANY && wantOrb !== -1 ? [wantOrb] : [ORB_TYPES.WATER.id, ORB_TYPES.FIRE.id, ORB_TYPES.EARTH.id, ORB_TYPES.LIGHT.id, ORB_TYPES.DARK.id, ORB_TYPES.HEART.id];
  let best = 0;
  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      for (const orb of RECT_ORBS) {
        let inside = 0;
        let near = 0;
        for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const v = getOrbForMatchPhase(board[r][c], phase);
            if (v !== orb) continue;
            const inRect = r >= r0 && r < r0 + m && c >= c0 && c < c0 + n;
            if (inRect) {
              inside++;
              continue;
            }
            const nearRect = r >= r0 - 1 && r <= r0 + m && c >= c0 - 1 && c <= c0 + n;
            if (nearRect) near++;
          }
        }
        const score = inside * 1000 + near * 80;
        if (score > best) best = score;
      }
    }
  }
  return best;
};

const getCheapRectGuideScoreFromCompiledSpecialList = (board, compiledSpecials = [], phase = "initial") => {
  let best = 0;
  for (let i = 0; i < compiledSpecials.length; i++) {
    const sp = compiledSpecials[i];
    if (sp.type !== "rect") continue;
    const s = getCheapRectGuideScoreBySpecial(board, sp, phase);
    if (s > best) best = s;
  }
  return best;
};

const getEqualFirstMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "equalFirst") return 0;
  const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
  if (selected.length === 0) return 0;
  const counts = ev.initialComboCountsByOrb;
  if (!counts) return 0;
  const vals = selected.map(orb => counts[orb] || 0);
  const first = vals[0] || 0;
  if (first <= 0) return 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== first) return 0;
  }
  return first;
};

const getRectMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "rect") return 0;
  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const key = `${m}x${n}`;
  const group = ev.initialPatternCounts?.rect?.[key];
  if (!group) return 0;
  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  // 瘝?摰惇?扳?嚗?遙雿惇??
  if (wantOrb === SPECIAL_ORB_ANY || wantOrb === -1) {
    return group.total || 0;
  }

  // ??摰惇?扳?嚗?亙?閰脣惇??
  return group.byOrb?.[wantOrb] || 0;
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

const getSingleSpecialProgress = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return {
    done: 1,
    guide: 0
  };
  if (sp.type === "rect") {
    return {
      done: isSingleSpecialSatisfied(ev, sp, extraCtx) ? 1 : 0,
      guide: extraCtx?.rectGuide || 0
    };
  }
  if (sp.type === "clearCount") {
    const got = ev.initialClearedCount || 0;
    const want = sp.clearCount || 0;
    const diff = Math.abs(got - want);
    if (want >= 24) {
      const fullGuide = Number(extraCtx?.fullBoardClearGuide || 0);
      const deficit = Math.max(0, want - got);
      const overshoot = Math.max(0, got - want);
      return {
        done: got === want ? 1 : 0,
        guide: got === want ? 160000 + fullGuide : got > want ? -30000 - overshoot * 12000 + fullGuide * 0.25 : 50000 + got * 1500 - deficit * 1000 + fullGuide
      };
    }
    return {
      done: got === want ? 1 : 0,
      guide: 100000 - diff * 1000 - Math.max(0, got - want) * 10
    };
  }
  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
    if (selected.length === 0) return {
      done: 0,
      guide: 0
    };
    const counts = ev.initialComboCountsByOrb;
    if (!counts) return {
      done: 0,
      guide: 0
    };
    const vals = selected.map(orb => counts[orb] || 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const diff = maxV - minV;
    return {
      done: minV > 0 && diff === 0 ? 1 : 0,
      guide: minV * 1000 - diff * 300
    };
  }
  const got = getSingleSpecialMatchedValue(ev, sp);
  const want = sp.count || 1;
  return {
    done: got >= want ? 1 : 0,
    guide: Math.min(got, want) * 1000 - Math.max(0, want - got) * 200
  };
};

const getSpecialPriorityTuple = (ev, specialPriorities = [], extraCtx = {}) => {
  const slots = Array.isArray(specialPriorities) ? specialPriorities.slice(0, 3) : specialPriorities ? [specialPriorities] : [];
  while (slots.length < 3) slots.push({
    type: "none"
  });
  const p1 = slots[0] && slots[0].type !== "none" ? getSingleSpecialProgress(ev, slots[0], extraCtx) : {
    done: 0,
    guide: 0
  };
  const p2 = slots[1] && slots[1].type !== "none" ? getSingleSpecialProgress(ev, slots[1], extraCtx) : {
    done: 0,
    guide: 0
  };
  const p3 = slots[2] && slots[2].type !== "none" ? getSingleSpecialProgress(ev, slots[2], extraCtx) : {
    done: 0,
    guide: 0
  };
  const mask = (p1.done ? 4 : 0) | (p2.done ? 2 : 0) | (p3.done ? 1 : 0);

  // 雿?摰???嚗?
  // 111 > 110 > 101 > 011 > 100 > 010 > 001 > 000
  const SPECIAL_COMBO_SCORE = {
    7: 7,
    // 銝+鈭?銝?
    6: 6,
    // 銝+鈭?
    5: 5,
    // 銝+銝?
    3: 4,
    // 鈭?銝?
    4: 3,
    // 銝
    2: 2,
    // 鈭?
    1: 1,
    // 銝?
    0: 0 // ??
  };
  return [SPECIAL_COMBO_SCORE[mask] || 0, p1.done, p2.done, p3.done, p1.guide, p2.guide, p3.guide];
};

const calcScore = (ev, pot, pathLen, cfg, target, mode, priority, specialPriorities, violatesN2 = false, extraCtx = {}) => {
  const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
  const normalizedSpecials = normalizeSpecialPriorityList(specialPriorities);
  const hasSpecial = normalizedSpecials.length > 0;
  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;
  const androidAutoCombo = cfg.androidAutoCombo === true;
  const effectivePriority = androidAutoCombo ? "combo" : priority;
  const effectiveStepPenalty = androidAutoCombo ? 0 : effectivePriority === "steps" ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const clearedW = effectivePriority === "combo" ? 1000 : 200;
  const illegalPenalty = violatesN2 ? 2200000 : 0;

  // =========================
  // ?∠?芸?嚗??????
  // =========================
  if (!hasSpecial) {
    if (ev.combos >= target) {
      const stepCost = pathLen * effectiveStepPenalty;
      return 5200000 - stepCost - overPenalty + ev.clearedCount * clearedW - illegalPenalty;
    }
    const miss = target - ev.combos;
    const missPenalty = -(miss * miss * 320000);
    const nearBonus = (target - miss) * 50000 + (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);
    const t = Math.max(0, 1 - miss / Math.max(1, target));
    const majorBonus = major * (1200000 * t * t);
    const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
    const stepSoft = androidAutoCombo ? 0 : pathLen * 35;
    const clearedBonus = ev.clearedCount * clearedW;
    return missPenalty + nearBonus + majorBonus + pot * potWeight + clearedBonus - stepSoft - illegalPenalty;
  }

  // =========================
  // ??芸?嚗??multi-special
  // =========================
  const specialTuple = getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx);
  const specialScore = specialPriorityTupleToScore(specialTuple);
  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return specialScore + 5200000 - stepCost - overPenalty + ev.clearedCount * clearedW - illegalPenalty;
  }
  const miss = target - ev.combos;
  const missPenalty = -(miss * miss * 320000);
  const nearBonus = (target - miss) * 50000 + (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);
  const t = Math.max(0, 1 - miss / Math.max(1, target));
  const majorBonus = major * (1200000 * t * t);
  const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
  const stepSoft = androidAutoCombo ? 0 : pathLen * 35;
  const clearedBonus = ev.clearedCount * clearedW;
  return specialScore + missPenalty + nearBonus + majorBonus + pot * potWeight + clearedBonus - stepSoft - illegalPenalty;
};

const EVAL_PARALLEL_SHARED = {
  scriptURL: null,
  scriptVersion: "",
  workerPool: [],
  nextRequestId: 1,
  boardBufferPool: [],
  taskArrayPool: [],
  transferListPool: [],
  packedMovePool: [],
  moveMetaPool: [],
  moveMetaArrayPool: [],
  parallelJobPool: [],
  parallelJobArrayPool: [],
  parallelResultArrayPool: []
};

const EVAL_POOL_MAX = {
  boardBuffer: 4096,
  taskArray: 256,
  transferList: 256,
  packedMove: 8192,
  moveMeta: 8192,
  moveMetaArray: 256,
  parallelJob: 8192,
  parallelJobArray: 256,
  parallelResultArray: 256
};

const boardWithHeldFilled = (b, hole, held) => {
  if (!hole) return b;
  const next = clone2D(b);
  next[hole.r][hole.c] = held;
  return next;
};

const EVAL_WORKER_SCRIPT_VERSION = "eval-worker-v5";

const EVAL_BOARD_CELL_COUNT = TOTAL_ROWS * COLS;

const EVAL_BOARD_BUFFER_BYTES = EVAL_BOARD_CELL_COUNT * Int16Array.BYTES_PER_ELEMENT;

const acquireBoardTransferBuffer = () => EVAL_PARALLEL_SHARED.boardBufferPool.pop() || new ArrayBuffer(EVAL_BOARD_BUFFER_BYTES);

const recycleBoardTransferBuffer = buffer => {
  if (!(buffer instanceof ArrayBuffer)) return;
  if (buffer.byteLength !== EVAL_BOARD_BUFFER_BYTES) return;
  if (EVAL_PARALLEL_SHARED.boardBufferPool.length < EVAL_POOL_MAX.boardBuffer) {
    EVAL_PARALLEL_SHARED.boardBufferPool.push(buffer);
  }
};

const acquireArrayFromPool = pool => {
  if (Array.isArray(pool) && pool.length > 0) {
    const arr = pool.pop();
    arr.length = 0;
    return arr;
  }
  return [];
};

const releaseArrayToPool = (pool, arr, maxSize = 128) => {
  if (!Array.isArray(pool) || !Array.isArray(arr)) return;
  arr.length = 0;
  if (pool.length < maxSize) pool.push(arr);
};

const sumSpecialDoneFromTuple = (tuple = []) => {
  let s = 0;
  for (let i = 0; i < tuple.length; i += 2) s += Number(tuple[i] || 0);
  return s;
};

const regionOf = (r, c) => {
  const vr = r <= PLAY_ROWS_START + 1 ? 0 : r <= PLAY_ROWS_START + 3 ? 1 : 2;
  const vc = c <= 1 ? 0 : c <= 3 ? 1 : 2;
  return vr * 3 + vc;
};

const holeStepInPlace = (b, hole, toRC) => {
  const moved = b[toRC.r][toRC.c];
  b[hole.r][hole.c] = moved;
  b[toRC.r][toRC.c] = -1;
  return toRC; // new hole
};

const yieldToBrowser = () => new Promise(resolve => {
  (globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0)))(() => resolve());
});

const beamSolve = async (originalBoard, cfg, target, mode, priority, skyfall, diagonal, specialPriority, initTargetCombo, autoRow0Expanded, ruleProfile, onProgress = null) => {
  const useRow0 = !!autoRow0Expanded;
  // Android injects the route automatically, so path length is only a
  // finite search guard there and never an optimization objective.
  const androidAutoCombo = cfg.androidAutoCombo === true;
  const effectivePriority = androidAutoCombo ? "combo" : priority;
  const compiledSpecials = compileSpecialPriorityList(specialPriority);
  const hasSpecial = compiledSpecials.length > 0;
  const hasRectSpecial = compiledSpecials.some(sp => sp.type === "rect");
  const hasInitClearCountSpecial = compiledSpecials.some(sp => sp && (sp.type === "clearCount" || sp.type === "initClearCount" || sp.type === "firstClearCount"));

  // A 24~30 clear-count shield is effectively a full-board first-clear
  // problem.  Keep this as a separate mode so ordinary clear-count shields
  // retain the normal BeamSolve ordering and cost.
  const highClearCountTarget = compiledSpecials.reduce((maxValue, sp) => {
    if (!sp || !(sp.type === "clearCount" || sp.type === "initClearCount" || sp.type === "firstClearCount")) {
      return maxValue;
    }
    return Math.max(maxValue, Number(sp.clearCountValue ?? sp.clearCount ?? sp.countValue ?? sp.count ?? 0));
  }, 0);
  const hasHighClearCountSpecial = highClearCountTarget >= 24;
  const hasInitEqualSpecial = compiledSpecials.some(sp => sp && (sp.type === "same" || sp.type === "equal" || sp.type === "sameSize" || sp.type === "initEqual" || sp.type === "firstEqual"));
  const hasInitSensitiveSpecial = hasInitClearCountSpecial || hasInitEqualSpecial;
  const ruleRuntimeCtx = getRuleRuntimeContext(ruleProfile);
  const normalizedRuleProfile = ruleRuntimeCtx.profile;
  const compiledRuleRequirements = normalizedRuleProfile.requirements.map(req => ({
    orb: clampIntRange(req.orb, 0, 5, 0),
    size: clampIntRange(req.size, 1, 5, 3),
    count: Math.max(1, clampIntRange(req.count, 1, 999, 1)),
    match: req.match === "atLeast" ? "atLeast" : "exact"
  }));
  const hasRuleRequirements = compiledRuleRequirements.length > 0;
  const EMPTY_REQUIREMENT_TUPLE = [];
  const getRuleRequirementTuple = ev => {
    if (!hasRuleRequirements) return EMPTY_REQUIREMENT_TUPLE;
    let allDone = 1;
    let totalDone = 0;
    let totalMissing = 0;
    const tuple = [];
    const countsByOrb = ev?.initialComboSizeCountsByOrb;
    for (const req of compiledRuleRequirements) {
      const got = Number(countsByOrb?.[req.orb]?.[String(req.size)] || 0);
      const distance = req.match === "atLeast" ? Math.max(0, req.count - got) : Math.abs(req.count - got);
      const done = distance === 0 ? 1 : 0;
      if (!done) allDone = 0;
      totalDone += Math.min(got, req.count);
      totalMissing += distance;
      tuple.push(done, -distance, Math.min(got, req.count));
    }
    return [allDone, totalDone, -totalMissing, ...tuple];
  };
  const isRuleRequirementSatisfied = ev => {
    if (!hasRuleRequirements) return true;
    const countsByOrb = ev?.initialComboSizeCountsByOrb;
    for (const req of compiledRuleRequirements) {
      const got = Number(countsByOrb?.[req.orb]?.[String(req.size)] || 0);
      if (req.match === "atLeast") {
        if (got < req.count) return false;
      } else if (got !== req.count) {
        return false;
      }
    }
    return true;
  };
  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;
  const maxNodesEffective = cfg.maxNodes;
  const baseBeamWidth = Math.max(32, Number(cfg.beamWidth) || 32);
  const requestedEvalWorkers = Math.max(1, Number(cfg.evalWorkers) || 1);
  const maxHwWorkers = typeof navigator !== "undefined" && Number(navigator.hardwareConcurrency) > 0 ? Number(navigator.hardwareConcurrency) : 1;
  const evalWorkerCount = Math.min(requestedEvalWorkers, maxHwWorkers);
  const enableParallelEval = evalWorkerCount > 1 && typeof Worker !== "undefined";
  const hasMarkedBoardCells = originalBoard.some(row => row.some(cell => xMarkOf(cell) !== 0 || qMarkOf(cell) !== 0 || nMarkOf(cell) !== 0));
  const hasNonStandardMinClear = ruleRuntimeCtx.minClearByOrb.some(minClear => minClear !== 3);
  const REVERSE_PLAN_ENABLED = cfg.reversePlanner !== false && !useRow0 && !hasMarkedBoardCells && !hasSpecial && !hasRuleRequirements && !hasNonStandardMinClear;
  const REVERSE_MAX_STEPS = Math.max(1, Math.min(60, Math.floor(Number(cfg.reverseMaxSteps) || 60)));
  const configuredMaxSteps = Math.max(1, Math.floor(Number(cfg.maxSteps) || 1));
  const androidStepLimitEnabled = androidAutoCombo && cfg.androidStepLimitEnabled === true;
  const androidStepLimit = androidStepLimitEnabled ? Math.max(1, Math.floor(Number(cfg.androidStepLimit) || configuredMaxSteps)) : configuredMaxSteps;
  const hardStepLimitEnabled = cfg.hardStepLimitEnabled === true;
  const hardStepLimit = Math.max(1, Math.min(250, Math.floor(Number(cfg.hardStepLimit) || 1)));
  const solverMaxSteps = androidStepLimitEnabled ? Math.min(configuredMaxSteps, androidStepLimit) : hardStepLimitEnabled ? Math.min(configuredMaxSteps, hardStepLimit) : configuredMaxSteps;
  const REVERSE_TARGET_LIMIT = REVERSE_PLAN_ENABLED ? 10 : 0;
  const DEFER_MOVE_MATERIALIZATION = cfg.deferMoveMaterialization !== false;
  const CHEAP_EVAL_SCALE = Math.max(1, Number(cfg.cheapEvalScale) || 3.8);
  const CHEAP_EVAL_CONSTRAINT_SCALE = Math.max(1, Number(cfg.cheapEvalConstraintScale) || 4.6);
  const CHEAP_LOCAL_GUIDANCE = cfg.cheapLocalGuidance === true && effectivePriority !== "steps";
  const rawCheapLegacyReserve = Number(cfg.cheapLegacyReserve);
  const CHEAP_LEGACY_RESERVE = Math.max(0, Math.min(0.6, Number.isFinite(rawCheapLegacyReserve) ? rawCheapLegacyReserve : 0.25));
  const SHOULD_YIELD_TO_BROWSER = cfg.browserYield !== false;
  const boardSeed = Number.parseInt(getBoardKey(originalBoard).slice(0, 8), 16);
  let searchRandomState = (Number(cfg.searchSeed) >>> 0 ^ boardSeed >>> 0 ^ 0x9e3779b9) >>> 0;
  if (searchRandomState === 0) searchRandomState = 0x6d2b79f5;
  const searchRandom = () => {
    searchRandomState ^= searchRandomState << 13;
    searchRandomState ^= searchRandomState >>> 17;
    searchRandomState ^= searchRandomState << 5;
    return (searchRandomState >>> 0) / 4294967296;
  };
  const IS_STEP_MODE = priority === "steps" && !androidAutoCombo;
  const IS_COMBO_MODE = !IS_STEP_MODE;
  const getCheapTerminalMovePotential = (state, nr, nc) => {
    if (!state?.board) return 0;
    const destVal = state.board[nr]?.[nc];
    if (!Number.isFinite(destVal) || destVal < 0) return 0;
    const holeR = state.hole?.r ?? -1;
    const holeC = state.hole?.c ?? -1;
    const enteringFromRow0 = state.r === 0;
    const virtualCell = (r, c) => {
      if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
        return -1;
      }
      if (r === nr && c === nc) return state.held;
      if (!enteringFromRow0 && r === holeR && c === holeC) return destVal;
      return state.board[r][c];
    };
    const scoreCell = (r, c) => {
      if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
        return 0;
      }
      const orb = getOrbForMatchPhase(virtualCell(r, c), "initial");
      if (orb < 0) return 0;
      let score = 0;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        let run = 1;
        for (const sign of [-1, 1]) {
          let rr = r + dr * sign;
          let cc = c + dc * sign;
          while (rr >= PLAY_ROWS_START && rr < TOTAL_ROWS && cc >= 0 && cc < COLS && getOrbForMatchPhase(virtualCell(rr, cc), "initial") === orb) {
            run++;
            rr += dr * sign;
            cc += dc * sign;
          }
        }
        if (run >= 3) score += 360 + (run - 3) * 90;else if (run === 2) score += 55;
      }
      return score;
    };
    let score = scoreCell(nr, nc);
    if (!enteringFromRow0 && (holeR !== nr || holeC !== nc)) {
      score += scoreCell(holeR, holeC);
    }
    return score;
  };

  // Progressive beam schedule: early fast -> middle balanced -> late wider.
  const beamSchedule = (() => {
    const w3 = baseBeamWidth;
    const w2 = Math.max(48, Math.min(w3, Math.round(w3 * 0.7)));
    const w1 = Math.max(32, Math.min(w2, Math.round(w3 * 0.4), 200));
    return [w1, w2, w3];
  })();
  const getAdaptiveBeamWidth = (step, maxSteps, stagnantRounds, diversityRatio) => {
    const p = maxSteps <= 1 ? 1 : step / Math.max(1, maxSteps - 1);
    let tier = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
    if (stagnantRounds >= 2) tier = Math.min(2, tier + 1);
    if (diversityRatio < 0.35) tier = Math.min(2, tier + 1);
    return beamSchedule[tier];
  };
  const getNodeDirectionSignature = (node, maxEdges = 6) => {
    if (!node) return "none";
    const parts = [];
    let cur = node;
    let cnt = 0;
    while (cur && cur.parent && cnt < maxEdges) {
      const dr = cur.r - cur.parent.r;
      const dc = cur.c - cur.parent.c;
      parts.push(`${dr},${dc}`);
      cur = cur.parent;
      cnt++;
    }
    return parts.reverse().join("|") || "none";
  };
  const getMoveCheapScore = (state, nr, nc, nextLocked, step) => {
    let s = 0;
    const ev = state?.ev || {};
    s += (ev.initialCombos || 0) * 120;
    s += (ev.combos || 0) * 80;
    s += (ev.clearedCount || 0) * 8;
    s -= (ev.initialComboDistance || 0) * 70;
    s -= nextLocked ? 220 : 0;
    if (q2Pos) {
      const d = Math.abs(nr - q2Pos.r) + Math.abs(nc - q2Pos.c);
      s -= d * 16;
    }
    if (HUMAN_PLAN_ENABLED && state?.humanPlan) {
      s += getHumanCheapMoveBias(state.humanPlan, makeHumanMoveCtx(state.r, state.c, nr, nc, "cheap"));
    }

    // Small step bias: earlier layers keep slightly broader exploration.
    s -= step * 0.15;
    return s;
  };
  const getGuidedMoveCheapScore = (state, nr, nc, nextLocked, step) => getMoveCheapScore(state, nr, nc, nextLocked, step) + (CHEAP_LOCAL_GUIDANCE ? getCheapTerminalMovePotential(state, nr, nc) : 0);
  const pickCheapTopMoves = (moves, limit, perSigCap = 2) => {
    if (!Array.isArray(moves) || moves.length === 0) return [];
    const sorted = [...moves].sort((a, b) => b.cheapScore - a.cheapScore);
    const out = [];
    const sigCount = new Map();
    for (let i = 0; i < sorted.length && out.length < limit; i++) {
      const mv = sorted[i];
      const sig = mv.cheapSig || "none";
      const used = sigCount.get(sig) || 0;
      if (used >= perSigCap) continue;
      sigCount.set(sig, used + 1);
      out.push(mv);
    }

    // Exploration tail: keep a tiny random slice if room remains.
    if (out.length < limit && sorted.length > out.length) {
      for (let i = 0; i < sorted.length && out.length < limit; i++) {
        const mv = sorted[i];
        if (out.includes(mv)) continue;
        if (searchRandom() < 0.03) out.push(mv);
      }
    }
    return out;
  };
  const depthMilestones = (() => {
    const maxSteps = solverMaxSteps;
    const d1 = Math.max(1, Math.min(maxSteps, Math.ceil(maxSteps * 0.35)));
    const d2 = Math.max(d1, Math.min(maxSteps, Math.ceil(maxSteps * 0.7)));
    return Array.from(new Set([d1, d2, maxSteps])).sort((a, b) => a - b);
  })();
  const getDepthPhaseIndex = step => {
    for (let i = 0; i < depthMilestones.length; i++) {
      if (step < depthMilestones[i]) return i;
    }
    return depthMilestones.length - 1;
  };
  const getDepthPhaseBeamScale = phaseIdx => {
    if (depthMilestones.length <= 1) return 1;
    if (phaseIdx <= 0) return 0.55;
    if (phaseIdx === 1 && depthMilestones.length >= 3) return 0.78;
    return 1;
  };
  const getCheapEvalBudget = (moveCount, beamWidth, stagnantRounds, specialDriven) => {
    if (moveCount <= 0) return 0;
    let budget = Math.max(beamWidth + 48, Math.floor(beamWidth * (effectivePriority === "steps" ? specialDriven ? 4.6 : 3.8 : specialDriven ? CHEAP_EVAL_CONSTRAINT_SCALE : CHEAP_EVAL_SCALE)));
    if (stagnantRounds >= 2) budget = Math.floor(budget * 1.35);
    if (stagnantRounds >= 4) budget = Math.floor(budget * 1.2);
    return Math.max(beamWidth, Math.min(moveCount, budget));
  };
  const getStateFamilySignature = st => st?.familySig || st?.cheapSig || getNodeDirectionSignature(st?.node);
  const getDiversityRatio = states => {
    if (!Array.isArray(states) || states.length === 0) return 1;
    const uniq = new Set();
    for (const st of states) uniq.add(getStateFamilySignature(st));
    return uniq.size / states.length;
  };
  const SEARCH_PROFILE = IS_STEP_MODE ? {
    initComboBonus: 320000,
    initClearedBonus: 125000,
    initAllEqualBonus: 2000000,
    initExactBonus: 1800000,
    initTargetPenalty: 780000,
    freeMajorBonus: hasInitSensitiveSpecial ? 150000 : 0,
    hvDiffPenalty: hasInitSensitiveSpecial ? 18000 : 0,
    extraPotentialWeight: 0.05,
    extraStepPenalty: 9000,
    bestStepSlack: 0,
    comboVisitedPrefixLen: 0,
    stepsVisitedSlack: 0,
    comboExploreRegionSkipProb: cfg.beamWidth >= 300 ? 0.82 : 0.74,
    comboMaxTier: 8,
    comboQuotaW: [3.2, 2.3, 1.7, 1.15, 0.8, 0.55, 0.36, 0.24, 0.15],
    stepMaxTier: 8
  } : {
    initComboBonus: 170000,
    initClearedBonus: 70000,
    initAllEqualBonus: 1300000,
    initExactBonus: 900000,
    initTargetPenalty: 260000,
    freeMajorBonus: hasInitSensitiveSpecial ? 90000 : 0,
    hvDiffPenalty: hasInitSensitiveSpecial ? 10000 : 0,
    extraPotentialWeight: 0.3,
    extraStepPenalty: androidAutoCombo ? 0 : 2200,
    // Keep exploring after the first solved route on Android so the
    // returned pool can approach the theoretical Combo maximum.
    bestStepSlack: androidAutoCombo ? solverMaxSteps : 2,
    comboVisitedPrefixLen: androidAutoCombo ? 0 : hasInitSensitiveSpecial ? 7 : 6,
    stepsVisitedSlack: androidAutoCombo ? 0 : 2,
    comboExploreRegionSkipProb: cfg.beamWidth >= 300 ? 0.6 : 0.5,
    comboMaxTier: 10,
    comboQuotaW: [2.5, 2.0, 1.6, 1.25, 1.0, 0.8, 0.65, 0.5, 0.38, 0.28, 0.18],
    stepMaxTier: 8
  };
  const makeNode = (parent, r, c) => ({
    parent,
    r,
    c,
    len: parent ? parent.len + 1 : 1
  });
  const buildPath = node => {
    const out = [];
    for (let cur = node; cur; cur = cur.parent) out.push({
      r: cur.r,
      c: cur.c
    });
    out.reverse();
    return out;
  };
  const pickCheapPortfolioMoves = (moves, limit) => {
    if (!CHEAP_LOCAL_GUIDANCE || CHEAP_LEGACY_RESERVE <= 0) {
      return pickCheapTopMoves(moves, limit, 2);
    }
    const guidedLimit = Math.max(1, Math.min(limit, Math.round(limit * (1 - CHEAP_LEGACY_RESERVE))));
    const out = pickCheapTopMoves(moves, guidedLimit, 2);
    const picked = new Set(out);
    const legacySorted = [...moves].sort((a, b) => b.legacyCheapScore - a.legacyCheapScore);
    for (const mv of legacySorted) {
      if (out.length >= limit) break;
      if (picked.has(mv)) continue;
      out.push(mv);
      picked.add(mv);
    }
    if (out.length < limit) {
      const guidedSorted = [...moves].sort((a, b) => b.cheapScore - a.cheapScore);
      for (const mv of guidedSorted) {
        if (out.length >= limit) break;
        if (picked.has(mv)) continue;
        out.push(mv);
        picked.add(mv);
      }
    }
    return out;
  };
  const stepsOf = node => Math.max(0, (node?.len || 0) - 1);
  const toNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const toIntNonNegative = (v, d = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.max(0, Math.floor(n));
  };
  const STEP_COMBO_SLACK = toIntNonNegative(cfg.stepComboSlack ?? cfg.stepSlack, 1);
  const COMBO_STEP_SLACK = toIntNonNegative(cfg.comboStepSlack ?? cfg.comboSlack, 1);
  const HUMAN_PLAN_ENABLED = cfg.humanPlanner !== false;
  const HUMAN_TOTAL_PLAY_CELLS = Math.max(1, (TOTAL_ROWS - PLAY_ROWS_START) * COLS);
  const HUMAN_MAX_LOCKED_GROUPS = Math.max(1, Math.min(12, Math.max(Number(target) || 1, Number(initTargetCombo) || 1)));
  const HUMAN_GROUP_MATCH_MIN_SCORE = 90;
  const HUMAN_RECOVERY_GRACE_STEPS = 2;
  const humanCellId = (r, c) => r * COLS + c;
  const humanCellIdsInclude = (ids, id) => {
    if (!Array.isArray(ids)) return false;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === id) return true;
    }
    return false;
  };
  const countHumanCellOverlap = (aIds, bIds) => {
    if (!Array.isArray(aIds) || !Array.isArray(bIds)) return 0;
    let i = 0;
    let j = 0;
    let count = 0;
    while (i < aIds.length && j < bIds.length) {
      const a = aIds[i];
      const b = bIds[j];
      if (a === b) {
        count++;
        i++;
        j++;
      } else if (a < b) {
        i++;
      } else {
        j++;
      }
    }
    return count;
  };
  const normalizeHumanGroup = (rawGroup, id = "", lockedAtStep = 0) => {
    if (rawGroup && Array.isArray(rawGroup.cellIds) && rawGroup.cellIds.length >= 3 && typeof rawGroup.cellMask === "string" && typeof rawGroup.relKey === "string") {
      return {
        id,
        orb: clampIntRange(rawGroup.orb, 0, 7, 0),
        size: rawGroup.size || rawGroup.cellIds.length,
        cellIds: rawGroup.cellIds,
        cellMask: rawGroup.cellMask,
        relKey: rawGroup.relKey,
        minR: rawGroup.minR,
        maxR: rawGroup.maxR,
        minC: rawGroup.minC,
        maxC: rawGroup.maxC,
        centerR2: rawGroup.centerR2,
        centerC2: rawGroup.centerC2,
        hasH: !!rawGroup.hasH,
        hasV: !!rawGroup.hasV,
        shape: rawGroup.shape || null,
        lockedAtStep,
        missingAge: 0,
        carryAge: 0
      };
    }
    if (!rawGroup || !Array.isArray(rawGroup.cells)) return null;
    const cells = [];
    for (const cell of rawGroup.cells) {
      if (!Array.isArray(cell) || cell.length < 2) continue;
      const r = Number(cell[0]);
      const c = Number(cell[1]);
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
        continue;
      }
      cells.push([r, c]);
    }
    if (cells.length < 3) return null;
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    for (const [r, c] of cells) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    const cellIds = cells.map(([r, c]) => humanCellId(r, c)).sort((a, b) => a - b);
    const relKey = cells.map(([r, c]) => `${r - minR},${c - minC}`).sort().join("|");
    const cellMask = cellIds.join(".");
    const orb = clampIntRange(rawGroup.orb, 0, 7, 0);
    return {
      id,
      orb,
      size: cells.length,
      cells,
      cellIds,
      cellMask,
      relKey,
      minR,
      maxR,
      minC,
      maxC,
      centerR2: minR + maxR,
      centerC2: minC + maxC,
      hasH: !!rawGroup.hasH,
      hasV: !!rawGroup.hasV,
      shape: rawGroup.shape || null,
      lockedAtStep,
      missingAge: 0,
      carryAge: 0
    };
  };
  const scoreHumanGroupBuild = group => {
    if (!group) return -Infinity;
    const width = group.maxC - group.minC + 1;
    const height = group.maxR - group.minR + 1;
    const area = width * height;
    let score = 0;
    score += group.size === 3 ? 130 : Math.min(group.size, 8) * 20;
    score -= Math.max(0, group.size - 3) * 8;
    score -= Math.max(0, area - group.size) * 12;
    score += (group.maxR - PLAY_ROWS_START) * 13;
    score += group.maxR === TOTAL_ROWS - 1 ? 18 : 0;
    score += group.minC === 0 || group.maxC === COLS - 1 ? 10 : 0;
    if (mode === "vertical") {
      score += group.hasV ? 30 : 0;
      score += height * 3;
    } else if (mode === "horizontal") {
      score += group.hasH ? 30 : 0;
      score += width * 3;
    } else {
      score += group.hasH || group.hasV ? 18 : 0;
    }
    if (group.shape) score += 16;
    return score;
  };
  const getInitialHumanGroups = initial => {
    if (!HUMAN_PLAN_ENABLED || !Array.isArray(initial?.groups)) return [];
    const groups = [];
    for (let i = 0; i < initial.groups.length; i++) {
      const group = normalizeHumanGroup(initial.groups[i], "", 0);
      if (!group) continue;
      group.buildScore = scoreHumanGroupBuild(group);
      groups.push(group);
    }
    groups.sort((a, b) => b.buildScore - a.buildScore);
    return groups;
  };
  const scoreHumanGroupMatch = (locked, candidate) => {
    if (!locked || !candidate || locked.orb !== candidate.orb) return -Infinity;
    const overlap = countHumanCellOverlap(locked.cellIds, candidate.cellIds);
    const sameShape = locked.relKey === candidate.relKey;
    const sameCells = locked.cellMask === candidate.cellMask;
    const sizeDiff = Math.abs((locked.size || 0) - (candidate.size || 0));
    const dist2 = Math.abs((locked.centerR2 || 0) - (candidate.centerR2 || 0)) + Math.abs((locked.centerC2 || 0) - (candidate.centerC2 || 0));
    let score = overlap * 58;
    if (sameShape) score += 150;
    if (sameCells) score += 120;
    if (locked.shape && locked.shape === candidate.shape) score += 24;
    if (overlap >= Math.min(3, locked.size || 0, candidate.size || 0)) {
      score += 56;
    }
    score -= sizeDiff * 18;
    score -= dist2 * 10;
    return score;
  };
  const makeHumanGroupId = (group, steps) => `${steps}:${group.orb}:${group.relKey}:${group.cellMask}`;
  const matchHumanLockedGroups = (previousGroups, currentGroups, steps) => {
    const usedCurrent = new Set();
    const nextGroups = [];
    const metrics = {
      preserved: 0,
      moved: 0,
      damaged: 0,
      dropped: 0
    };
    for (const locked of previousGroups || []) {
      if (!locked) continue;
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < currentGroups.length; i++) {
        if (usedCurrent.has(i)) continue;
        const score = scoreHumanGroupMatch(locked, currentGroups[i]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestScore >= HUMAN_GROUP_MATCH_MIN_SCORE) {
        const matched = currentGroups[bestIdx];
        const moved = matched.cellMask !== locked.cellMask;
        usedCurrent.add(bestIdx);
        nextGroups.push({
          ...matched,
          id: locked.id || makeHumanGroupId(matched, steps),
          lockedAtStep: locked.lockedAtStep ?? steps,
          missingAge: 0,
          carryAge: moved ? Math.min(99, (locked.carryAge || 0) + 1) : 0,
          matchScore: bestScore
        });
        metrics.preserved++;
        if (moved) metrics.moved++;
        continue;
      }
      const missingAge = Math.min(99, (locked.missingAge || 0) + 1);
      metrics.damaged++;
      if (missingAge <= HUMAN_RECOVERY_GRACE_STEPS) {
        nextGroups.push({
          ...locked,
          missingAge,
          carryAge: Math.min(99, (locked.carryAge || 0) + 1)
        });
      } else {
        metrics.dropped++;
      }
    }
    return {
      groups: nextGroups,
      usedCurrent,
      metrics
    };
  };
  const humanGroupOverlapsAny = (group, groups) => {
    for (const other of groups || []) {
      if (!other || other.missingAge > 0) continue;
      if (countHumanCellOverlap(group.cellIds, other.cellIds) > 0) return true;
    }
    return false;
  };
  const pickNewHumanGroups = (currentGroups, usedCurrent, lockedGroups, steps, limit) => {
    if (limit <= 0) return [];
    const out = [];
    const existing = lockedGroups || [];
    for (let i = 0; i < currentGroups.length && out.length < limit; i++) {
      if (usedCurrent.has(i)) continue;
      const group = currentGroups[i];
      if (!group || group.size < 3) continue;
      if (humanGroupOverlapsAny(group, existing)) continue;
      if (humanGroupOverlapsAny(group, out)) continue;
      out.push({
        ...group,
        id: makeHumanGroupId(group, steps),
        lockedAtStep: steps,
        missingAge: 0,
        carryAge: 0
      });
    }
    return out;
  };
  const collectHumanProtectedCellIds = groups => {
    const set = new Set();
    for (const group of groups || []) {
      if (!group || group.missingAge > 0) continue;
      for (const id of group.cellIds || []) set.add(id);
    }
    return [...set].sort((a, b) => a - b);
  };
  const makeHumanMoveCtx = (fromR, fromC, toR, toC, kind = "move") => ({
    fromR,
    fromC,
    toR,
    toC,
    fromId: Number.isInteger(fromR) && Number.isInteger(fromC) ? humanCellId(fromR, fromC) : -1,
    toId: Number.isInteger(toR) && Number.isInteger(toC) ? humanCellId(toR, toC) : -1,
    kind
  });
  const countHumanProtectedMoveTouches = (plan, moveCtx) => {
    if (!plan || !moveCtx || !Array.isArray(plan.protectedCellIds)) return 0;
    const seen = new Set();
    if (moveCtx.fromId >= 0) seen.add(moveCtx.fromId);
    if (moveCtx.toId >= 0) seen.add(moveCtx.toId);
    let touches = 0;
    for (const id of seen) {
      if (humanCellIdsInclude(plan.protectedCellIds, id)) touches++;
    }
    return touches;
  };
  const buildHumanPlanSignature = (lockedGroups, protectedCellIds) => {
    const groupPart = (lockedGroups || []).map(group => `${group.orb}:${group.relKey}:${group.cellMask}:${group.missingAge || 0}`).sort().join(";");
    return `${protectedCellIds.join(".")}|${groupPart}`;
  };
  const advanceHumanPlan = (parentPlan, initial, moveCtx, steps) => {
    const currentGroups = getInitialHumanGroups(initial);
    const previousGroups = Array.isArray(parentPlan?.lockedGroups) ? parentPlan.lockedGroups : [];
    const matched = matchHumanLockedGroups(previousGroups, currentGroups, steps);
    const presentBeforeAdd = matched.groups.filter(group => group && group.missingAge <= 0).length;
    const addLimit = Math.max(0, Math.min(previousGroups.length === 0 ? 2 : 1, HUMAN_MAX_LOCKED_GROUPS - presentBeforeAdd));
    const newGroups = pickNewHumanGroups(currentGroups, matched.usedCurrent, matched.groups, steps, addLimit);
    let lockedGroups = [...matched.groups, ...newGroups];
    lockedGroups.sort((a, b) => {
      const am = a.missingAge || 0;
      const bm = b.missingAge || 0;
      if (am !== bm) return am - bm;
      const al = a.lockedAtStep ?? 0;
      const bl = b.lockedAtStep ?? 0;
      if (al !== bl) return al - bl;
      return (b.buildScore || 0) - (a.buildScore || 0);
    });
    if (lockedGroups.length > HUMAN_MAX_LOCKED_GROUPS) {
      lockedGroups = lockedGroups.slice(0, HUMAN_MAX_LOCKED_GROUPS);
    }
    const protectedCellIds = collectHumanProtectedCellIds(lockedGroups);
    const presentCount = lockedGroups.filter(group => group && group.missingAge <= 0).length;
    const missingCount = lockedGroups.length - presentCount;
    const protectedTouches = countHumanProtectedMoveTouches(parentPlan, moveCtx);
    const toProtected = moveCtx?.toId >= 0 && humanCellIdsInclude(parentPlan?.protectedCellIds, moveCtx.toId);
    const activeCells = Math.max(0, HUMAN_TOTAL_PLAY_CELLS - protectedCellIds.length);
    let scoreBias = 0;
    scoreBias += presentCount * 115000;
    scoreBias += newGroups.length * 165000;
    scoreBias += matched.metrics.preserved * 46000;
    scoreBias += matched.metrics.moved * 42000;
    scoreBias += Math.min(18, protectedCellIds.length) * 8500;
    scoreBias -= missingCount * 170000;
    scoreBias -= matched.metrics.damaged * 210000;
    scoreBias -= matched.metrics.dropped * 340000;
    if (protectedTouches > 0) {
      const brokeGroup = matched.metrics.damaged > 0 || missingCount > 0;
      scoreBias -= protectedTouches * (brokeGroup ? 230000 : 52000);
      if (!brokeGroup && matched.metrics.moved > 0) scoreBias += 76000;
    } else if (presentCount > 0 && moveCtx) {
      scoreBias += Math.min(72000, presentCount * 13000);
    }
    if (toProtected) scoreBias -= 42000;
    const rankTuple = [presentCount, -missingCount, newGroups.length, matched.metrics.preserved, matched.metrics.moved, -protectedTouches, protectedCellIds.length, -activeCells, Math.floor(scoreBias / 1000)];
    const sig = buildHumanPlanSignature(lockedGroups, protectedCellIds);
    return {
      lockedGroups,
      protectedCellIds,
      presentCount,
      missingCount,
      activeCells,
      protectedTouches,
      scoreBias,
      rankTuple,
      searchSig: sig || "empty",
      familySig: `${presentCount}:${missingCount}:${protectedCellIds.join(".")}`
    };
  };
  const applyHumanPlanToEvalResult = (res, parentHumanPlan, moveCtx, steps) => {
    if (!res) return null;
    if (!HUMAN_PLAN_ENABLED) return {
      ...res,
      humanPlan: null
    };
    const humanPlan = advanceHumanPlan(parentHumanPlan, res.extraCtx?.initial, moveCtx, steps);
    const ev = {
      ...res.ev,
      humanLockedGroups: humanPlan.presentCount,
      humanProtectedCells: humanPlan.protectedCellIds.length,
      humanPlanScore: humanPlan.scoreBias
    };
    return {
      ...res,
      ev,
      score: res.score + humanPlan.scoreBias,
      visitedTuple: res.visitedTuple,
      finalRankTuple: res.finalRankTuple,
      humanPlan
    };
  };
  const getHumanCheapMoveBias = (plan, moveCtx) => {
    if (!HUMAN_PLAN_ENABLED || !plan || !moveCtx) return 0;
    const touches = countHumanProtectedMoveTouches(plan, moveCtx);
    if (touches > 0) return -190 * touches;
    if ((plan.presentCount || 0) <= 0) return 0;
    return Math.min(90, (plan.presentCount || 0) * 18);
  };
  const cloneBoardOrbsOnly = boardLike => {
    const out = clone2D(boardLike);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const orb = orbOf(out[r][c]);
        out[r][c] = orb >= 0 ? orb : -1;
      }
    }
    return out;
  };
  const getReverseOrbStock = () => {
    const counts = Array(6).fill(0);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const orb = orbOf(originalBoard[r]?.[c]);
        if (orb >= 0 && orb < counts.length) counts[orb]++;
      }
    }
    return counts;
  };
  const getReverseFillPositions = (variant = 0) => {
    const rows = [];
    for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) rows.push(r);
    if (variant % 2 === 1) rows.reverse();
    const cols = [];
    for (let c = 0; c < COLS; c++) cols.push(c);
    if (variant % 3 === 1) cols.reverse();
    if (variant % 3 === 2 && cols.length > 0) {
      const first = cols.shift();
      cols.push(first);
    }
    const positions = [];
    for (const r of rows) {
      for (const c of cols) positions.push([r, c]);
    }
    return positions;
  };
  const getReverseGroupSlots = (orientation, variant = 0) => {
    const slots = [];
    if (orientation === "vertical") {
      const cols = [];
      for (let c = 0; c < COLS; c++) cols.push(c);
      if (variant % 2 === 1) cols.reverse();
      for (const c of cols) {
        for (let r = TOTAL_ROWS - 3; r >= PLAY_ROWS_START; r -= 3) {
          slots.push([[r, c], [r + 1, c], [r + 2, c]]);
        }
      }
      return slots;
    }
    if (orientation === "horizontal") {
      const rows = [];
      for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) rows.push(r);
      if (variant % 2 === 1) rows.reverse();
      for (const r of rows) {
        for (let c = 0; c <= COLS - 3; c += 3) {
          slots.push([[r, c], [r, c + 1], [r, c + 2]]);
        }
      }
      return slots;
    }
    const first = variant % 2 === 0 ? getReverseGroupSlots("horizontal", variant) : getReverseGroupSlots("vertical", variant);
    const second = variant % 2 === 0 ? getReverseGroupSlots("vertical", variant + 1) : getReverseGroupSlots("horizontal", variant + 1);
    return [...first, ...second];
  };
  const getReverseNeighborPenalty = (board, cells, orb) => {
    let penalty = 0;
    const own = new Set(cells.map(([r, c]) => `${r},${c}`));
    for (const [r, c] of cells) {
      for (let i = 0; i < 4; i++) {
        const nr = r + BFS_DRS[i];
        const nc = c + BFS_DCS[i];
        if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS || own.has(`${nr},${nc}`)) {
          continue;
        }
        if (orbOf(board[nr][nc]) === orb) penalty++;
      }
    }
    return penalty;
  };
  const pickReverseGroupOrb = (board, counts, cells, orbOrder) => {
    let bestOrb = -1;
    let bestScore = -Infinity;
    for (const orb of orbOrder) {
      if ((counts[orb] || 0) < 3) continue;
      const neighborPenalty = getReverseNeighborPenalty(board, cells, orb);
      const score = counts[orb] * 12 - neighborPenalty * 18;
      if (score > bestScore) {
        bestScore = score;
        bestOrb = orb;
      }
    }
    return bestOrb;
  };
  const placeReverseGroups = (board, counts, slots, orbOrder, maxGroups) => {
    let placed = 0;
    for (const cells of slots) {
      if (placed >= maxGroups) break;
      let open = true;
      for (const [r, c] of cells) {
        if (board[r][c] !== -1) {
          open = false;
          break;
        }
      }
      if (!open) continue;
      const orb = pickReverseGroupOrb(board, counts, cells, orbOrder);
      if (orb < 0) continue;
      for (const [r, c] of cells) board[r][c] = orb;
      counts[orb] -= 3;
      placed++;
    }
    return placed;
  };
  const scoreReverseRemainderOrb = (board, r, c, orb, counts) => {
    let score = counts[orb] || 0;
    if (c >= 2 && orbOf(board[r][c - 1]) === orb && orbOf(board[r][c - 2]) === orb) {
      score -= 80;
    }
    if (r >= PLAY_ROWS_START + 2 && orbOf(board[r - 1][c]) === orb && orbOf(board[r - 2][c]) === orb) {
      score -= 80;
    }
    if (c >= 1 && orbOf(board[r][c - 1]) === orb) score -= 8;
    if (r >= PLAY_ROWS_START + 1 && orbOf(board[r - 1][c]) === orb) score -= 8;
    return score;
  };
  const fillReverseRemainders = (board, counts, positions) => {
    for (const [r, c] of positions) {
      if (board[r][c] !== -1) continue;
      let bestOrb = -1;
      let bestScore = -Infinity;
      for (let orb = 0; orb < counts.length; orb++) {
        if ((counts[orb] || 0) <= 0) continue;
        const score = scoreReverseRemainderOrb(board, r, c, orb, counts);
        if (score > bestScore) {
          bestScore = score;
          bestOrb = orb;
        }
      }
      if (bestOrb < 0) break;
      board[r][c] = bestOrb;
      counts[bestOrb]--;
    }
  };
  const makeReverseTargetPlanFromBoard = (targetBoard, variantKey) => {
    const {
      initial,
      violatesN2
    } = getInitialMatchCheck(targetBoard, ruleRuntimeCtx, false);
    const evRaw = evaluateBoard(targetBoard, skyfall, initial, ruleRuntimeCtx);
    const initInfo = extractInitialInfo(initial, evRaw);
    const ev = {
      ...evRaw,
      initialCombos: toNum(evRaw?.initialCombos ?? evRaw?.initCombos ?? initInfo.combos, initInfo.combos),
      initialClearedCount: toNum(evRaw?.initialClearedCount ?? evRaw?.initClearedCount ?? evRaw?.initialCleared ?? initInfo.cleared, initInfo.cleared),
      initialMatchSizes: initInfo.matchSizes,
      initialComboSizes: initInfo.matchSizes,
      initialAllEqual: initInfo.allEqual,
      initialDistinctSizeCount: initInfo.distinctSizeCount
    };
    ev.ruleRequirementTuple = getRuleRequirementTuple(ev);
    const extraCtx = {
      initial,
      initialCombos: ev.initialCombos,
      initialClearedCount: ev.initialClearedCount,
      initialMatchSizes: ev.initialMatchSizes,
      initialComboSizes: ev.initialComboSizes,
      initialAllEqual: ev.initialAllEqual,
      initialDistinctSizeCount: ev.initialDistinctSizeCount
    };
    const specialTuple = hasSpecial ? getSpecialPriorityTupleCompiled(ev, compiledSpecials, extraCtx) : EMPTY_SPECIAL_TUPLE;
    const initComboInfo = getInitialComboInfo(ev);
    const solved = !violatesN2 && isSolvedGoal(ev, extraCtx);
    const comboGap = Math.max(0, target - (ev.combos || 0));
    const clearMap = initial?.toClearMap || null;
    const targetCells = [];
    const targetWeights = new Uint8Array(TOTAL_ROWS * COLS);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const orb = orbOf(targetBoard[r][c]);
        targetCells.push({
          r,
          c,
          orb,
          idx
        });
        targetWeights[idx] = clearMap?.[idx] ? 3 : 1;
      }
    }
    let quality = 0;
    quality += solved ? 6000000 : 0;
    quality += (ev.initialCombos || 0) * 900000;
    quality += (ev.combos || 0) * 340000;
    quality += (ev.initialClearedCount || 0) * 18000;
    quality -= comboGap * comboGap * 720000;
    quality -= initComboInfo.distance * 360000;
    quality += specialPriorityTupleToScore(specialTuple) / 1e9;
    if (violatesN2) quality -= 3000000;
    return {
      board: targetBoard,
      key: `${variantKey}:${getBoardKey(targetBoard)}`,
      ev,
      extraCtx,
      specialTuple,
      solved,
      violatesN2,
      quality,
      targetCells,
      targetWeights
    };
  };
  const buildReverseTargetPlans = () => {
    if (!REVERSE_PLAN_ENABLED || REVERSE_TARGET_LIMIT <= 0) return [];
    const stock = getReverseOrbStock();
    const maxPossibleGroups = stock.reduce((sum, count) => sum + Math.floor(count / 3), 0);
    if (maxPossibleGroups <= 0) return [];
    const desiredGroups = Math.max(1, Math.min(maxPossibleGroups, Math.max(Number(target) || 1, Number(initTargetCombo) || 1)));
    const baseOrbOrder = stock.map((count, orb) => ({
      orb,
      count
    })).sort((a, b) => b.count - a.count).map(x => x.orb);
    const orientations = mode === "vertical" ? ["vertical", "mixed", "horizontal"] : mode === "horizontal" ? ["horizontal", "mixed", "vertical"] : ["mixed", "horizontal", "vertical"];
    const plans = [];
    const seen = new Set();
    for (let v = 0; v < 6; v++) {
      const orbOrder = [...baseOrbOrder.slice(v % Math.max(1, baseOrbOrder.length)), ...baseOrbOrder.slice(0, v % Math.max(1, baseOrbOrder.length))];
      for (const orientation of orientations) {
        const board = cloneBoardOrbsOnly(originalBoard);
        for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
          for (let c = 0; c < COLS; c++) board[r][c] = -1;
        }
        const counts = stock.slice();
        const slots = getReverseGroupSlots(orientation, v);
        const groupLimit = Math.min(maxPossibleGroups, desiredGroups + v % 3);
        placeReverseGroups(board, counts, slots, orbOrder, groupLimit);
        fillReverseRemainders(board, counts, getReverseFillPositions(v));
        const key = getBoardKey(board);
        if (seen.has(key)) continue;
        seen.add(key);
        const plan = makeReverseTargetPlanFromBoard(board, `${orientation}:${v}`);
        plans.push(plan);
      }
    }
    plans.sort((a, b) => b.quality - a.quality);
    return plans.slice(0, REVERSE_TARGET_LIMIT);
  };
  const scoreReverseTargetAlignment = (evalBoard, steps) => {
    if (!REVERSE_PLAN_ENABLED || !evalBoard || !Array.isArray(reverseTargetPlans) || reverseTargetPlans.length === 0 || steps > REVERSE_MAX_STEPS) {
      return {
        enabled: false,
        exact: false,
        distance: 0,
        scoreBias: 0,
        rankTuple: EMPTY_REQUIREMENT_TUPLE
      };
    }
    let best = null;
    for (const plan of reverseTargetPlans) {
      let distance = 0;
      let weightedDistance = 0;
      let matched = 0;
      let weightedMatched = 0;
      for (const cell of plan.targetCells) {
        const actual = orbOf(evalBoard[cell.r][cell.c]);
        const weight = plan.targetWeights[cell.idx] || 1;
        if (actual === cell.orb) {
          matched++;
          weightedMatched += weight;
        } else {
          distance++;
          weightedDistance += weight;
        }
      }
      const exact = distance === 0;
      let scoreBias = 0;
      scoreBias += weightedMatched * 11500;
      scoreBias -= weightedDistance * 24000;
      scoreBias += Math.floor(plan.quality / 90);
      if (!androidAutoCombo) scoreBias -= steps * 3400;
      if (distance <= 6) scoreBias += (7 - distance) * 85000;
      if (exact) scoreBias += 2600000;
      if (plan.solved) scoreBias += 240000;
      const candidate = {
        enabled: true,
        plan,
        exact,
        distance,
        weightedDistance,
        matched,
        weightedMatched,
        scoreBias,
        rankTuple: [exact ? 1 : 0, -weightedDistance, -distance, plan.solved ? 1 : 0, plan.ev?.initialCombos || 0, plan.ev?.combos || 0, Math.floor(scoreBias / 1000)]
      };
      if (!best || candidate.scoreBias > best.scoreBias || candidate.scoreBias === best.scoreBias && candidate.weightedDistance < best.weightedDistance) {
        best = candidate;
      }
    }
    return best || {
      enabled: false,
      exact: false,
      distance: 0,
      scoreBias: 0,
      rankTuple: EMPTY_REQUIREMENT_TUPLE
    };
  };

  // ??蝯曹???擐? target 鞈?
  // 銝???cap / 銝???0 ?孵??????
  // ?芰?頝嚗istance = |initialCombos - target|
  const getInitialComboInfo = (evLike, targetLike = initTargetCombo) => {
    const targetNum = Number(targetLike);
    const initialCombos = toNum(evLike?.initialCombos ?? evLike?.initCombos ?? evLike?.combos, 0);
    if (!Number.isFinite(targetNum) || targetNum < 0) {
      return {
        enabled: false,
        target: null,
        initialCombos,
        distance: 0,
        exact: false
      };
    }
    const distance = Math.abs(initialCombos - targetNum);
    return {
      enabled: true,
      target: targetNum,
      initialCombos,
      distance,
      exact: initialCombos === targetNum
    };
  };
  const hitsInitTargetComboExactly = ev => getInitialComboInfo(ev).exact;
  const getInitComboDistance = ev => getInitialComboInfo(ev).distance;
  const stepConstraint = cellVal => {
    const m = xMarkOf(cellVal);
    if (m === 1) return {
      ok: false,
      locked: false
    };
    if (m === 2) return {
      ok: true,
      locked: true
    };
    return {
      ok: true,
      locked: false
    };
  };
  const extractInitialMatchSizes = (initial, ev = null) => {
    if (Array.isArray(initial?.matchSizes)) {
      return initial.matchSizes.map(x => toNum(x, 0)).filter(x => x > 0);
    }
    if (Array.isArray(initial?.comboSizes)) {
      return initial.comboSizes.map(x => toNum(x, 0)).filter(x => x > 0);
    }
    if (Array.isArray(initial?.groups)) {
      const arr = [];
      for (const g of initial.groups) {
        const sz = toNum(g?.size ?? g?.count ?? g?.len ?? g?.cells?.length ?? g?.orbs?.length, 0);
        if (sz > 0) arr.push(sz);
      }
      if (arr.length) return arr;
    }
    if (Array.isArray(initial?.matches)) {
      const arr = [];
      for (const g of initial.matches) {
        const sz = toNum(g?.size ?? g?.count ?? g?.len ?? g?.cells?.length ?? g?.orbs?.length, 0);
        if (sz > 0) arr.push(sz);
      }
      if (arr.length) return arr;
    }
    if (Array.isArray(ev?.initialMatchSizes)) {
      return ev.initialMatchSizes.map(x => toNum(x, 0)).filter(x => x > 0);
    }
    if (Array.isArray(ev?.initialComboSizes)) {
      return ev.initialComboSizes.map(x => toNum(x, 0)).filter(x => x > 0);
    }
    return [];
  };
  const extractInitialInfo = (initial, ev = null) => {
    const matchSizes = extractInitialMatchSizes(initial, ev);
    const combosFromSizes = matchSizes.length;
    const combos = toNum(initial?.combos ?? initial?.comboCount ?? ev?.initialCombos ?? ev?.initCombos ?? (combosFromSizes > 0 ? combosFromSizes : 0), 0);
    const cleared = toNum(initial?.clearedCount ?? initial?.clearCount ?? initial?.totalCleared ?? ev?.initialClearedCount ?? ev?.initClearedCount ?? ev?.initialCleared ?? (matchSizes.length ? matchSizes.reduce((a, b) => a + b, 0) : 0), 0);
    const distinctSizeCount = new Set(matchSizes).size;
    const allEqual = matchSizes.length > 0 && matchSizes.every(x => x === matchSizes[0]);
    return {
      combos,
      cleared,
      matchSizes,
      distinctSizeCount,
      allEqual,
      signature: `${combos}:${cleared}:${matchSizes.join(",")}`
    };
  };
  const buildVisitedInitPart = initInfo => `${initInfo.combos}|${initInfo.cleared}|${initInfo.matchSizes.join(".")}`;
  const getModeMajor = ev => mode === "vertical" ? ev?.verticalCombos || 0 : ev?.horizontalCombos || 0;
  const getFreeMajor = ev => Math.max(ev?.verticalCombos || 0, ev?.horizontalCombos || 0);
  const getAdaptiveMajor = ev => hasInitSensitiveSpecial ? getFreeMajor(ev) : getModeMajor(ev);
  const getInitShieldScoreBias = (initInfo, steps) => {
    let bias = 0;
    if (hasInitClearCountSpecial) {
      for (const sp of compiledSpecials) {
        if (!sp || !(sp.type === "clearCount" || sp.type === "initClearCount" || sp.type === "firstClearCount")) {
          continue;
        }
        const want = toNum(sp.clearCountValue ?? sp.clearCount ?? sp.count ?? 0, 0);
        if (want > 0) {
          const got = initInfo.cleared;
          const diff = Math.abs(got - want);
          if (want >= 24) {
            const fullGuide = Number(initInfo.fullBoardClearGuide || 0);
            const deficit = Math.max(0, want - got);
            const overshoot = Math.max(0, got - want);
            bias += got * 220000;
            bias += Math.round(fullGuide * 500);
            bias -= deficit * 90000;
            bias -= overshoot * 240000;
            if (got === want) bias += 5000000;
            continue;
          }
          bias += 4000000 - diff * 500000;
          if (got === want) bias += 4500000;else if (got < want) bias += got * 180000;else bias -= (got - want) * 220000;
        }
      }
    }
    if (hasInitEqualSpecial) {
      if (initInfo.matchSizes.length === 0) {
        bias -= 1200000;
      } else {
        if (initInfo.allEqual) bias += 5200000;
        bias += initInfo.combos * 260000;
        bias -= Math.max(0, initInfo.distinctSizeCount - 1) * 1100000;
        const sizes = initInfo.matchSizes;
        let spread = 0;
        if (sizes.length > 1) {
          const mn = Math.min(...sizes);
          const mx = Math.max(...sizes);
          spread = mx - mn;
        }
        bias -= spread * 260000;
      }
    }
    if (hasInitSensitiveSpecial) {
      bias += initInfo.combos * 220000;
      bias += initInfo.cleared * 90000;
      if (!androidAutoCombo) bias -= steps * 2500;
    }
    return bias;
  };
  const buildNoSpecialRankTuple = (ev, score, steps, violatesN2, initExact, initDistance = getInitComboDistance(ev), anchors = null) => {
    const legal = violatesN2 ? 0 : 1;
    const initEq = ev.initialAllEqual ? 1 : 0;
    const initCombos = ev.initialCombos || 0;
    const initCleared = ev.initialClearedCount || 0;
    const combos = ev.combos || 0;
    const cleared = ev.clearedCount || 0;
    const requirementTuple = Array.isArray(ev?.ruleRequirementTuple) ? ev.ruleRequirementTuple : EMPTY_REQUIREMENT_TUPLE;
    const adaptiveMajor = getAdaptiveMajor(ev);
    const bestStepsAnchor = Number.isFinite(Number(anchors?.bestSteps)) ? Number(anchors.bestSteps) : steps;
    const bestCombosAnchor = Number.isFinite(Number(anchors?.bestCombos)) ? Number(anchors.bestCombos) : combos;
    if (androidAutoCombo) {
      return [legal, ...requirementTuple, initExact ? 1 : 0, -initDistance, initEq, initCombos, initCleared, combos, cleared, adaptiveMajor, Math.floor(score), -steps];
    }
    if (IS_STEP_MODE) {
      const inStepBand = steps <= bestStepsAnchor + STEP_COMBO_SLACK;
      if (inStepBand) {
        return [legal, ...requirementTuple, initExact ? 1 : 0, -initDistance, initEq, initCombos, initCleared, combos, -steps, cleared, adaptiveMajor, Math.floor(score)];
      }
      return [legal, ...requirementTuple, initExact ? 1 : 0, -initDistance, initEq, initCombos, initCleared, -steps, combos, adaptiveMajor, cleared, Math.floor(score)];
    }
    const inComboBand = combos >= bestCombosAnchor - COMBO_STEP_SLACK;
    if (inComboBand) {
      return [legal, ...requirementTuple, initExact ? 1 : 0, -initDistance, initEq, initCombos, initCleared, -steps, combos, adaptiveMajor, cleared, Math.floor(score)];
    }
    return [legal, ...requirementTuple, initExact ? 1 : 0, -initDistance, initEq, initCombos, initCleared, combos, -steps, adaptiveMajor, cleared, Math.floor(score)];
  };
  const buildSpecialRankTuple = (ev, score, steps, violatesN2, specialTuple, initExact, initDistance) => {
    const prefix = [violatesN2 ? 0 : 1, ...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE), ...(specialTuple || EMPTY_SPECIAL_TUPLE), initExact ? 1 : 0, -initDistance, ev.initialAllEqual ? 1 : 0, ev.initialCombos || 0, ev.initialClearedCount || 0, ev.combos || 0, ev.clearedCount || 0];
    return androidAutoCombo ? [...prefix, getAdaptiveMajor(ev), Math.floor(score), -steps] : [...prefix, -steps, Math.floor(score)];
  };
  const softDominatesPrefix = (a, b, prefixLen) => {
    if (!a || !b || a.length !== b.length) return false;
    const len = Math.max(1, Math.min(prefixLen, a.length));
    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) return false;
    }
    return true;
  };
  const dominatesVec = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return false;
    }
    return true;
  };
  let q1Pos = null;
  let q2Pos = null;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (!useRow0 && r === 0) continue;
    for (let c = 0; c < COLS; c++) {
      const q = qMarkOf(originalBoard[r][c]);
      if (q === 1) q1Pos = {
        r,
        c
      };
      if (q === 2) q2Pos = {
        r,
        c
      };
    }
  }

  // Android sends the chosen coordinates explicitly. Prefer them over the
  // single encoded Q mark so the same physical cell may be both start and
  // end, while still retaining the original App.jsx mark-based behaviour for
  // web/manual boards.
  const androidCoord = (rowKey, colKey) => {
    if (!androidAutoCombo) return null;
    const r = Number(cfg?.[rowKey]);
    const c = Number(cfg?.[colKey]);
    return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS ? {
      r,
      c
    } : null;
  };
  const androidStartPos = androidCoord("androidStartRow", "androidStartCol");
  const androidEndPos = androidCoord("androidEndRow", "androidEndCol");
  if (androidStartPos) q1Pos = androidStartPos;
  if (androidEndPos) q2Pos = androidEndPos;
  const isAtQ2 = (r, c) => q2Pos && r === q2Pos.r && c === q2Pos.c;
  const shouldAcceptEnd = node => !q2Pos || node?.r === q2Pos.r && node?.c === q2Pos.c;
  const isSolvedGoal = (ev, extraCtx = {}) => {
    if (!isRuleRequirementSatisfied(ev)) return false;
    if (!hasSpecial) return ev.combos >= target;
    return ev.combos >= target && isAllSpecialSatisfiedCompiled(ev, compiledSpecials, extraCtx);
  };
  const reverseTargetPlans = buildReverseTargetPlans();
  const hasReverseTargets = reverseTargetPlans.length > 0;
  let bestGlobal = {
    combos: -1,
    skyfallCombos: 0,
    clearedCount: -1,
    initialCombos: 0,
    initialClearedCount: 0,
    initialMatchSizes: [],
    node: null,
    score: -Infinity,
    specialTuple: EMPTY_SPECIAL_TUPLE,
    verticalCombos: 0,
    horizontalCombos: 0,
    rectGuide: 0,
    violatesN2: false,
    initialComboDistance: Infinity
  };
  let bestReachedSteps = Infinity;
  let topStepCandidates = [];
  let topComboCandidates = [];
  const pendingTopStepCandidates = [];
  const pendingTopComboCandidates = [];
  let beam = [];
  let nodesExpanded = 0;
  const visitedBest = new Map();
  const visitedDominanceFrontier = new Map();
  const VISITED_FRONTIER_CAP = hasSpecial ? 8 : 6;
  const VISITED_FAMILY_CAP = 3;
  let stagnantRounds = 0;
  let lastBestScore = -Infinity;
  let diversityRatio = 1;
  const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  let adaptiveYieldStride = enableParallelEval ? 4 : 2;
  let lastYieldStep = -1;
  let lastYieldAt = nowMs();
  let lastStepAt = lastYieldAt;
  const getNoSpecialAnchors = (fallbackSteps = 0, fallbackCombos = 0) => ({
    bestSteps: bestGlobal.node ? stepsOf(bestGlobal.node) : fallbackSteps,
    bestCombos: bestGlobal.node ? bestGlobal.combos || 0 : fallbackCombos
  });
  let lastProgressReport = -1;
  let lastProgressReportAt = 0;
  const progressNodeBatch = enableParallelEval ? 384 : 256;
  const progressMinIntervalMs = enableParallelEval ? 48 : 24;
  const reportProgress = (force = false) => {
    if (!onProgress) return;
    const current = Math.min(nodesExpanded, maxNodesEffective);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const byNodeDelta = current - lastProgressReport >= progressNodeBatch;
    const byTimeDelta = now - lastProgressReportAt >= progressMinIntervalMs;
    const shouldEmit = force || lastProgressReport < 0 || current >= maxNodesEffective || byNodeDelta && byTimeDelta;
    if (!shouldEmit) return;
    lastProgressReport = current;
    lastProgressReportAt = now;
    onProgress({
      current,
      max: Math.max(1, maxNodesEffective)
    });
  };
  const flushPendingPools = () => {
    topStepCandidates = flushPendingSolutions(topStepCandidates, pendingTopStepCandidates, "steps", specialPriority, initTargetCombo, ruleProfile, 10);
    topComboCandidates = flushPendingSolutions(topComboCandidates, pendingTopComboCandidates, "combo", specialPriority, initTargetCombo, ruleProfile, 10);
  };
  const packCandidateFromEval = ({
    ev,
    node,
    score,
    extraCtx,
    specialTuple
  }) => ({
    ...ev,
    path: node ? buildPath(node) : [],
    score,
    rectGuide: extraCtx.rectGuide || 0,
    fullBoardClearGuide: Number(extraCtx.fullBoardClearGuide || 0),
    specialTuple,
    // Keep an explicit per-slot status for Android's Top10 indicator. The
    // tuple is [done, guide] for each configured shield slot.
    specialStatus: [0, 1, 2].map(slot => Number(specialTuple?.[slot * 2] || 0) > 0)
  });
  const pushTopCandidate = (ev, node, score, violatesN2, extraCtx = {}, specialTuple = EMPTY_SPECIAL_TUPLE) => {
    if (!node) return;
    const steps = stepsOf(node);
    if (steps <= 0) return;
    if (!shouldAcceptEnd(node)) return;
    const sol = {
      ...packCandidateFromEval({
        ev,
        node,
        score,
        extraCtx,
        specialTuple
      }),
      violatesN2: !!violatesN2
    };
    if (IS_STEP_MODE) {
      pendingTopStepCandidates.push(sol);
      if (pendingTopStepCandidates.length >= 32) {
        topStepCandidates = flushPendingSolutions(topStepCandidates, pendingTopStepCandidates, "steps", specialPriority, initTargetCombo, ruleProfile, 10);
      }
    } else {
      pendingTopComboCandidates.push(sol);
      if (pendingTopComboCandidates.length >= 32) {
        topComboCandidates = flushPendingSolutions(topComboCandidates, pendingTopComboCandidates, "combo", specialPriority, initTargetCombo, ruleProfile, 10);
      }
    }
  };
  const considerBest = (ev, score, node, violatesN2, extraCtx = {}, specialTuple = EMPTY_SPECIAL_TUPLE) => {
    if (!shouldAcceptEnd(node)) return;
    const curSteps = stepsOf(node);
    const curInitExact = hitsInitTargetComboExactly(ev);
    const curInitDistance = getInitComboDistance(ev);
    if (!hasSpecial) {
      const anchors = getNoSpecialAnchors(curSteps, ev.combos || 0);
      const curTuple = buildNoSpecialRankTuple(ev, score, curSteps, violatesN2, curInitExact, curInitDistance, anchors);
      const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;
      const bestInitExact = bestGlobal.node && hitsInitTargetComboExactly(bestGlobal);
      const bestInitDistance = bestGlobal.node ? getInitComboDistance(bestGlobal) : Infinity;
      const bestTuple = bestGlobal.node ? buildNoSpecialRankTuple(bestGlobal, bestGlobal.score, bestSteps, bestGlobal.violatesN2, bestInitExact, bestInitDistance, anchors) : null;
      let better = false;
      if (!bestTuple) better = true;else if (lexTupleBetter(curTuple, bestTuple)) better = true;
      if (better) {
        bestGlobal = {
          ...ev,
          node,
          score,
          specialTuple,
          rectGuide: extraCtx.rectGuide || 0,
          violatesN2: !!violatesN2
        };
      }
      const solved = isSolvedGoal(ev, extraCtx);
      if (!violatesN2 && solved && curSteps > 0) {
        if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
      }
      return;
    }
    const curTuple = buildSpecialRankTuple(ev, score, curSteps, violatesN2, specialTuple, curInitExact, curInitDistance);
    const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;
    const bestInitDistance = bestGlobal.node ? getInitComboDistance(bestGlobal) : Infinity;
    const bestTuple = bestGlobal.node ? buildSpecialRankTuple(bestGlobal, bestGlobal.score, bestSteps, bestGlobal.violatesN2, bestGlobal.specialTuple || EMPTY_SPECIAL_TUPLE, hitsInitTargetComboExactly(bestGlobal), bestInitDistance) : null;
    let better = false;
    if (!bestTuple) better = true;else if (lexTupleBetter(curTuple, bestTuple)) better = true;
    if (better) {
      bestGlobal = {
        ...ev,
        node,
        score,
        specialTuple,
        rectGuide: extraCtx.rectGuide || 0,
        violatesN2: !!violatesN2
      };
    }
    const solved = isSolvedGoal(ev, extraCtx);
    if (!violatesN2 && solved && curSteps > 0) {
      if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
    }
  };
  const betterThanVisited = (key, ev, score, steps, specialTuple, violatesN2, initExact, visitedTuple) => {
    const dominanceTuple = hasSpecial ? [...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE), ev.combos || 0, ...(specialTuple || EMPTY_SPECIAL_TUPLE), Math.floor(score)] : [...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE), ev.combos || 0, Math.floor(score)];
    const frontier = visitedDominanceFrontier.get(key) || [];
    for (const prevDom of frontier) {
      if (dominatesVec(prevDom, dominanceTuple)) return false;
    }
    const reducedFrontier = [];
    for (const prevDom of frontier) {
      if (!dominatesVec(dominanceTuple, prevDom)) {
        reducedFrontier.push(prevDom);
      }
    }
    reducedFrontier.push(dominanceTuple);
    reducedFrontier.sort((a, b) => lexTupleCompareDesc(a, b));
    if (reducedFrontier.length > VISITED_FRONTIER_CAP) {
      reducedFrontier.length = VISITED_FRONTIER_CAP;
    }
    visitedDominanceFrontier.set(key, reducedFrontier);
    const prev = visitedBest.get(key);
    if (hasSpecial) {
      if (!prev) {
        visitedBest.set(key, visitedTuple);
        return true;
      }
      const cmp = lexTupleCompareDesc(prev, visitedTuple);
      if (cmp <= 0) return false;
      visitedBest.set(key, visitedTuple);
      return true;
    }
    const curVec = buildNoSpecialRankTuple(ev, score, steps, violatesN2, initExact, getInitComboDistance(ev), getNoSpecialAnchors(steps, ev.combos || 0));
    if (!prev) {
      visitedBest.set(key, curVec);
      return true;
    }
    if (IS_STEP_MODE) {
      if (dominatesVec(prev, curVec)) return false;
    } else {
      const prefixLen = SEARCH_PROFILE.comboVisitedPrefixLen;
      if (prefixLen > 0 && softDominatesPrefix(prev, curVec, prefixLen)) {
        const prevStepsMetric = prev[prev.length - 2] || 0;
        const curStepsMetric = curVec[curVec.length - 2] || 0;
        if (prevStepsMetric >= curStepsMetric - SEARCH_PROFILE.stepsVisitedSlack) {
          return false;
        }
      }
    }
    let shouldUpdate = false;
    for (let i = 0; i < curVec.length; i++) {
      if (curVec[i] > prev[i]) {
        shouldUpdate = true;
        break;
      }
      if (curVec[i] < prev[i]) break;
    }
    if (shouldUpdate || !Array.isArray(prev) || prev.length !== curVec.length) {
      visitedBest.set(key, curVec);
    }
    return true;
  };
  const computeEvalPrimitives = evalBoard => {
    const {
      initial,
      violatesN2
    } = getInitialMatchCheck(evalBoard, ruleRuntimeCtx, HUMAN_PLAN_ENABLED);
    const evRaw = evaluateBoard(evalBoard, skyfall, initial, ruleRuntimeCtx);
    const pot = combinedPotentialScore(evalBoard, mode);
    const fullBoardGuide = hasHighClearCountSpecial ? fullBoardClearGuide(evalBoard, "initial") : 0;
    return {
      initial,
      violatesN2,
      evRaw,
      pot,
      fullBoardGuide
    };
  };
  const buildEvalStateFromPrimitives = (evalBoard, node, steps, scoreBias = 0, parentExtraCtx = null, primitives = null) => {
    const source = primitives || computeEvalPrimitives(evalBoard);
    const initial = source.initial;
    const violatesN2 = !!source.violatesN2;
    const evRaw = source.evRaw || {};
    const pot = Number(source.pot || 0);
    const fullBoardGuide = Number(source.fullBoardGuide || 0);
    const initInfo = extractInitialInfo(initial, evRaw);
    const ev = {
      ...evRaw,
      initialCombos: toNum(evRaw?.initialCombos ?? evRaw?.initCombos ?? initInfo.combos, initInfo.combos),
      initialClearedCount: toNum(evRaw?.initialClearedCount ?? evRaw?.initClearedCount ?? evRaw?.initialCleared ?? initInfo.cleared, initInfo.cleared),
      initialMatchSizes: initInfo.matchSizes,
      initialComboSizes: initInfo.matchSizes,
      initialAllEqual: initInfo.allEqual,
      initialDistinctSizeCount: initInfo.distinctSizeCount
    };
    const initComboInfo = getInitialComboInfo(ev);
    ev.initialComboDistance = initComboInfo.distance;
    ev.initTargetCombo = initComboInfo.target;
    ev.initialComboExact = initComboInfo.exact;
    let rectGuide = 0;
    if (hasRectSpecial) {
      const prevRectGuide = parentExtraCtx?.rectGuide;
      const needRefreshRectGuide = shouldRefreshRectGuide(steps, prevRectGuide, hasRectSpecial);
      rectGuide = needRefreshRectGuide ? getCheapRectGuideScoreFromCompiledSpecialList(evalBoard, compiledSpecials, "initial") : Number(prevRectGuide || 0);
    }
    const extraCtx = {
      rectGuide,
      fullBoardClearGuide: fullBoardGuide,
      initial,
      initialCombos: ev.initialCombos,
      initialClearedCount: ev.initialClearedCount,
      initialMatchSizes: ev.initialMatchSizes,
      initialComboSizes: ev.initialComboSizes,
      initialAllEqual: ev.initialAllEqual,
      initialDistinctSizeCount: ev.initialDistinctSizeCount,
      initSignature: initInfo.signature,
      initialComboDistance: initComboInfo.distance,
      initialComboExact: initComboInfo.exact,
      initTargetCombo: initComboInfo.target
    };
    const reverseGuide = scoreReverseTargetAlignment(evalBoard, steps);
    if (reverseGuide.enabled) {
      ev.reverseTargetDistance = reverseGuide.distance;
      ev.reverseTargetWeightedDistance = reverseGuide.weightedDistance;
      ev.reverseTargetExact = !!reverseGuide.exact;
      ev.reverseTargetCombos = reverseGuide.plan?.ev?.combos || 0;
      ev.reverseTargetInitialCombos = reverseGuide.plan?.ev?.initialCombos || 0;
      extraCtx.reverseGuide = reverseGuide;
    }
    const specialTuple = hasSpecial ? getSpecialPriorityTupleCompiled(ev, compiledSpecials, extraCtx) : EMPTY_SPECIAL_TUPLE;
    const requirementTuple = getRuleRequirementTuple(ev);
    ev.ruleRequirementTuple = requirementTuple;
    const rawScore = calcScore(ev, pot, steps, cfg, target, mode, effectivePriority, specialPriority, violatesN2, extraCtx);
    let score = rawScore + scoreBias;
    score += ev.initialCombos * SEARCH_PROFILE.initComboBonus;
    score += ev.initialClearedCount * SEARCH_PROFILE.initClearedBonus;
    if (ev.initialAllEqual) score += SEARCH_PROFILE.initAllEqualBonus;
    if (initComboInfo.enabled) {
      score -= initComboInfo.distance * SEARCH_PROFILE.initTargetPenalty;
      if (initComboInfo.exact) {
        score += SEARCH_PROFILE.initExactBonus;
      }
    }
    score += getInitShieldScoreBias({
      combos: ev.initialCombos,
      cleared: ev.initialClearedCount,
      matchSizes: ev.initialMatchSizes,
      distinctSizeCount: ev.initialDistinctSizeCount,
      allEqual: ev.initialAllEqual,
      fullBoardClearGuide: fullBoardGuide
    }, steps);
    if (reverseGuide.enabled) {
      score += reverseGuide.scoreBias;
    }
    if (hasInitSensitiveSpecial) {
      score += getFreeMajor(ev) * SEARCH_PROFILE.freeMajorBonus;
      score -= Math.abs((ev.verticalCombos || 0) - (ev.horizontalCombos || 0)) * SEARCH_PROFILE.hvDiffPenalty;
    }
    if (!hasSpecial) {
      if (IS_COMBO_MODE) {
        score += Math.floor((pot || 0) * SEARCH_PROFILE.extraPotentialWeight);
        score -= steps * SEARCH_PROFILE.extraStepPenalty;
      } else {
        score -= steps * SEARCH_PROFILE.extraStepPenalty;
        score += getAdaptiveMajor(ev) * 30000;
      }
    }
    const initExact = initComboInfo.exact;
    const initDistance = initComboInfo.distance;
    const baseVisitedTuple = hasSpecial ? buildSpecialRankTuple(ev, score, steps, violatesN2, specialTuple, initExact, initDistance) : buildNoSpecialRankTuple(ev, score, steps, violatesN2, initExact, initDistance, getNoSpecialAnchors(steps, ev.combos || 0));
    const baseFinalRankTuple = hasSpecial ? buildSpecialRankTuple(ev, score, steps, violatesN2, specialTuple, initExact, initDistance) : buildNoSpecialRankTuple(ev, score, steps, violatesN2, initExact, initDistance, getNoSpecialAnchors(steps, ev.combos || 0));
    const visitedTuple = baseVisitedTuple;
    const finalRankTuple = baseFinalRankTuple;
    return {
      ev,
      score,
      violatesN2,
      pot,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      initExact,
      initInfo
    };
  };
  const evalState = (evalBoard, node, steps, scoreBias = 0, parentExtraCtx = null) => buildEvalStateFromPrimitives(evalBoard, node, steps, scoreBias, parentExtraCtx, null);
  const evalPrimitiveCache = new Map();
  const EVAL_PRIMITIVE_CACHE_CAP = 120000;
  const getEvalPrimitiveCacheKey = (boardKey, hole, held) => `${boardKey}|${hole ? `${hole.r},${hole.c}` : "none"}|${held}|g:${HUMAN_PLAN_ENABLED ? 1 : 0}`;
  const getCachedEvalPrimitives = cacheKey => {
    if (!cacheKey) return null;
    const hit = evalPrimitiveCache.get(cacheKey);
    if (!hit) return null;
    // touch for simple LRU behavior
    evalPrimitiveCache.delete(cacheKey);
    evalPrimitiveCache.set(cacheKey, hit);
    return hit;
  };
  const putCachedEvalPrimitives = (cacheKey, primitives) => {
    if (!cacheKey || !primitives) return;
    if (evalPrimitiveCache.size >= EVAL_PRIMITIVE_CACHE_CAP) {
      const oldest = evalPrimitiveCache.keys().next().value;
      if (oldest !== undefined) evalPrimitiveCache.delete(oldest);
    }
    evalPrimitiveCache.set(cacheKey, primitives);
  };
  let parallelEvalFailed = false;
  const acquirePackedMove = () => EVAL_PARALLEL_SHARED.packedMovePool.pop() || {
    index: -1,
    boardBuffer: null,
    holeR: -1,
    holeC: -1,
    held: -1
  };
  const releasePackedMove = packed => {
    if (!packed) return;
    packed.index = -1;
    packed.boardBuffer = null;
    packed.holeR = -1;
    packed.holeC = -1;
    packed.held = -1;
    if (EVAL_PARALLEL_SHARED.packedMovePool.length < EVAL_POOL_MAX.packedMove) {
      EVAL_PARALLEL_SHARED.packedMovePool.push(packed);
    }
  };
  const acquireMoveMeta = () => EVAL_PARALLEL_SHARED.moveMetaPool.pop() || {
    mv: null,
    idx: -1,
    boardKey: "",
    primitiveCacheKey: "",
    primitives: null
  };
  const releaseMoveMeta = meta => {
    if (!meta) return;
    meta.mv = null;
    meta.idx = -1;
    meta.boardKey = "";
    meta.primitiveCacheKey = "";
    meta.primitives = null;
    if (EVAL_PARALLEL_SHARED.moveMetaPool.length < EVAL_POOL_MAX.moveMeta) {
      EVAL_PARALLEL_SHARED.moveMetaPool.push(meta);
    }
  };
  const acquireParallelJob = () => EVAL_PARALLEL_SHARED.parallelJobPool.pop() || {
    index: -1,
    nextBoard: null,
    hole: null,
    held: -1
  };
  const releaseParallelJob = job => {
    if (!job) return;
    job.index = -1;
    job.nextBoard = null;
    job.hole = null;
    job.held = -1;
    if (EVAL_PARALLEL_SHARED.parallelJobPool.length < EVAL_POOL_MAX.parallelJob) {
      EVAL_PARALLEL_SHARED.parallelJobPool.push(job);
    }
  };
  const buildEvalWorkerScript = () => {
    const fn = (name, value) => `const ${name} = ${value.toString()};`;
    return `
const TOTAL_ROWS = ${TOTAL_ROWS};
const COLS = ${COLS};
const PLAY_ROWS_START = ${PLAY_ROWS_START};
const BFS_DRS = ${JSON.stringify(BFS_DRS)};
const BFS_DCS = ${JSON.stringify(BFS_DCS)};
const ORB_IDS = ${JSON.stringify(ORB_IDS)};
const RULE_CLEAR_MODE_LINE = ${JSON.stringify(RULE_CLEAR_MODE_LINE)};
const RULE_CLEAR_MODE_CONNECTED = ${JSON.stringify(RULE_CLEAR_MODE_CONNECTED)};
const RECT_M_OPTIONS = ${JSON.stringify(RECT_M_OPTIONS)};
const RECT_N_OPTIONS = ${JSON.stringify(RECT_N_OPTIONS)};
const SHAPE_KIND = ${JSON.stringify(SHAPE_KIND)};
const SHAPE_TEMPLATES = ${JSON.stringify(SHAPE_TEMPLATES)};
${fn("clampIntRange", clampIntRange)}
${fn("normalizeOrbRule", normalizeOrbRule)}
${fn("normalizeRuleRequirement", normalizeRuleRequirement)}
${fn("normalizeRuleProfile", normalizeRuleProfile)}
${fn("buildRuleRuntimeContext", buildRuleRuntimeContext)}
${fn("getRuleRuntimeContext", getRuleRuntimeContext)}
${fn("orbOf", orbOf)}
${fn("xMarkOf", xMarkOf)}
${fn("qMarkOf", qMarkOf)}
${fn("nMarkOf", nMarkOf)}
${fn("withMarks", withMarks)}
${fn("setNMark", setNMark)}
${fn("getOrbForMatchPhase", getOrbForMatchPhase)}
${fn("clone2D", clone2D)}
${fn("boardWithHeldFilled", boardWithHeldFilled)}
${fn("compactnessScore", compactnessScore)}
${fn("edgePotentialScore", edgePotentialScore)}
${fn("applyGravity", applyGravity)}
${fn("potentialScore", potentialScore)}
${fn("normalizeCells", normalizeCells)}
${fn("transformCells8", transformCells8)}
${fn("canonicalShapeKey", canonicalShapeKey)}
${fn("makePatternCounter", makePatternCounter)}
${fn("makeRectCounter", makeRectCounter)}
${fn("makeRectCounts", makeRectCounts)}
${fn("makePatternCounts", makePatternCounts)}
${fn("makeComboCountsByOrb", makeComboCountsByOrb)}
${fn("makeComboSizeCountsByOrb", makeComboSizeCountsByOrb)}
${fn("isPureRectGroup", isPureRectGroup)}
${fn("createFindMatchesScratch", createFindMatchesScratch)}
${fn("getFindMatchesScratch", getFindMatchesScratch)}
${fn("detectExact5Shape", detectExact5Shape)}
${fn("findMatches", findMatches)}
${fn("hasInitialN2Clear", hasInitialN2Clear)}
${fn("getInitialMatchCheck", getInitialMatchCheck)}
${fn("unlockN2Board", unlockN2Board)}
${fn("evaluateBoard", evaluateBoard)}
${fn("combinedPotentialScore", combinedPotentialScore)}
const SHAPE_CANONICAL = Object.fromEntries(
  Object.entries(SHAPE_TEMPLATES).map(([k, cells]) => [k, canonicalShapeKey(cells)])
);
const WORKER_BOARD = Array.from({ length: TOTAL_ROWS }, () =>
  Array(COLS).fill(-1)
);
const boardFromBuffer = (buf) => {
  const flat = new Int16Array(buf);
  let p = 0;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = WORKER_BOARD[r];
    for (let c = 0; c < COLS; c++) row[c] = flat[p++];
  }
  return WORKER_BOARD;
};
const RESULT_ITEM_POOL = [];
const RESULT_PRIMITIVE_POOL = [];
const acquireResultPrimitive = () =>
  RESULT_PRIMITIVE_POOL.pop() || {
    initial: null,
    violatesN2: false,
    evRaw: null,
    pot: 0,
  };
const releaseResultPrimitive = (obj) => {
  if (!obj) return;
  obj.initial = null;
  obj.violatesN2 = false;
  obj.evRaw = null;
  obj.pot = 0;
  if (RESULT_PRIMITIVE_POOL.length < 8192) RESULT_PRIMITIVE_POOL.push(obj);
};
const acquireResultItem = () =>
  RESULT_ITEM_POOL.pop() || {
    index: -1,
    primitives: null,
  };
const releaseResultItem = (obj) => {
  if (!obj) return;
  if (obj.primitives) releaseResultPrimitive(obj.primitives);
  obj.index = -1;
  obj.primitives = null;
  if (RESULT_ITEM_POOL.length < 8192) RESULT_ITEM_POOL.push(obj);
};
self.onmessage = (e) => {
  const { type, payload, requestId } = e.data || {};
  if (type !== "evalBatch") return;
  let out = null;
  try {
    const { moves, mode, skyfall, ruleRuntimeCtx, collectGroups } = payload || {};
    const moveCount = Array.isArray(moves) ? moves.length : 0;
    out = new Array(moveCount);
    const returnedBuffers = new Array(moveCount);
    for (let i = 0; i < moveCount; i++) {
      const mv = moves[i];
      const nextBoard = boardFromBuffer(mv.boardBuffer);
      const hole = mv.holeR >= 0 && mv.holeC >= 0 ? { r: mv.holeR, c: mv.holeC } : null;
      const evalBoard = boardWithHeldFilled(nextBoard, hole, mv.held);
      const { initial, violatesN2 } = getInitialMatchCheck(
        evalBoard,
        ruleRuntimeCtx,
        !!collectGroups
      );
      const evRaw = evaluateBoard(evalBoard, skyfall, initial, ruleRuntimeCtx);
      const pot = combinedPotentialScore(evalBoard, mode);
      const item = acquireResultItem();
      const primitives = acquireResultPrimitive();
      primitives.initial = initial;
      primitives.violatesN2 = violatesN2;
      primitives.evRaw = evRaw;
      primitives.pot = pot;
      item.index = mv.index;
      item.primitives = primitives;
      out[i] = item;
      returnedBuffers[i] = mv.boardBuffer;
    }
    self.postMessage(
      {
        type: "evalBatchDone",
        requestId,
        payload: { out, returnedBuffers },
      },
      returnedBuffers
    );
  } catch (err) {
    const rawMoves = Array.isArray(payload?.moves) ? payload.moves : [];
    const returnedBuffers = [];
    for (let i = 0; i < rawMoves.length; i++) {
      const buf = rawMoves[i]?.boardBuffer;
      if (buf) returnedBuffers.push(buf);
    }
    self.postMessage(
      {
        type: "evalBatchError",
        requestId,
        payload: {
          message: err?.message || String(err),
          stack: err?.stack || "",
          returnedBuffers,
        },
      },
      returnedBuffers
    );
  } finally {
    if (Array.isArray(out)) {
      for (let i = 0; i < out.length; i++) {
        releaseResultItem(out[i]);
      }
    }
  }
};
`;
  };
  const terminateEvalWorkerPool = (revokeScript = false) => {
    for (const slot of EVAL_PARALLEL_SHARED.workerPool) {
      if (!slot) continue;
      if (slot.pending instanceof Map) {
        for (const [, p] of slot.pending) {
          p.reject(new Error("eval worker pool reset"));
        }
        slot.pending.clear();
      }
      if (slot.worker) {
        try {
          slot.worker.terminate();
        } catch (_e) {
          // noop
        }
      }
    }
    EVAL_PARALLEL_SHARED.workerPool = [];
    if (revokeScript && EVAL_PARALLEL_SHARED.scriptURL) {
      try {
        URL.revokeObjectURL(EVAL_PARALLEL_SHARED.scriptURL);
      } catch (_e) {
        // noop
      }
      EVAL_PARALLEL_SHARED.scriptURL = null;
      EVAL_PARALLEL_SHARED.scriptVersion = "";
    }
  };
  const ensureEvalWorkerScriptURL = () => {
    if (EVAL_PARALLEL_SHARED.scriptURL && EVAL_PARALLEL_SHARED.scriptVersion !== EVAL_WORKER_SCRIPT_VERSION) {
      terminateEvalWorkerPool(true);
    }
    if (!EVAL_PARALLEL_SHARED.scriptURL) {
      const src = buildEvalWorkerScript();
      EVAL_PARALLEL_SHARED.scriptURL = URL.createObjectURL(new Blob([src], {
        type: "text/javascript"
      }));
      EVAL_PARALLEL_SHARED.scriptVersion = EVAL_WORKER_SCRIPT_VERSION;
    }
    return EVAL_PARALLEL_SHARED.scriptURL;
  };
  const boardToTransferBuffer = board => {
    const buffer = acquireBoardTransferBuffer();
    const flat = new Int16Array(buffer);
    let idx = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      const row = board[r];
      for (let c = 0; c < COLS; c++) flat[idx++] = row[c];
    }
    return buffer;
  };
  const ensureEvalWorkerPool = workerN => {
    if (parallelEvalFailed) return false;
    const workerURL = ensureEvalWorkerScriptURL();
    try {
      for (let i = 0; i < workerN; i++) {
        const existingSlot = EVAL_PARALLEL_SHARED.workerPool[i];
        if (existingSlot?.worker && !existingSlot.broken) continue;
        if (existingSlot?.worker) {
          try {
            existingSlot.worker.terminate();
          } catch (_e) {
            // noop
          }
        }
        const worker = new Worker(workerURL);
        const slot = {
          worker,
          pending: new Map(),
          broken: false
        };
        worker.onmessage = evt => {
          const {
            type,
            payload,
            requestId
          } = evt.data || {};
          const p = slot.pending.get(requestId);
          if (!p) return;
          slot.pending.delete(requestId);
          const returnedBuffers = payload?.returnedBuffers;
          if (Array.isArray(returnedBuffers)) {
            for (let i = 0; i < returnedBuffers.length; i++) {
              recycleBoardTransferBuffer(returnedBuffers[i]);
            }
          }
          if (type === "evalBatchDone") {
            p.resolve(Array.isArray(payload?.out) ? payload.out : []);
            return;
          }
          if (type === "evalBatchError") {
            p.reject(new Error(payload?.message || "evalBatchError"));
            return;
          }
          p.reject(new Error(`unexpected worker message: ${type || "unknown"}`));
        };
        worker.onerror = err => {
          slot.broken = true;
          for (const [, p] of slot.pending) {
            p.reject(err?.error || new Error(err?.message || "worker error"));
          }
          slot.pending.clear();
        };
        EVAL_PARALLEL_SHARED.workerPool[i] = slot;
      }
      return true;
    } catch (_err) {
      parallelEvalFailed = true;
      terminateEvalWorkerPool(false);
      return false;
    }
  };
  const dispatchEvalChunkToWorker = (slot, chunk) => new Promise((resolve, reject) => {
    if (!slot || slot.broken) {
      reject(new Error("worker unavailable"));
      return;
    }
    const requestId = EVAL_PARALLEL_SHARED.nextRequestId++;
    slot.pending.set(requestId, {
      resolve,
      reject
    });
    const packedMoves = acquireArrayFromPool(EVAL_PARALLEL_SHARED.taskArrayPool);
    const transferList = acquireArrayFromPool(EVAL_PARALLEL_SHARED.transferListPool);
    for (let i = 0; i < chunk.length; i++) {
      const mv = chunk[i];
      const packed = acquirePackedMove();
      const boardBuffer = boardToTransferBuffer(mv.nextBoard);
      transferList.push(boardBuffer);
      packed.index = mv.index;
      packed.boardBuffer = boardBuffer;
      packed.holeR = mv.hole?.r ?? -1;
      packed.holeC = mv.hole?.c ?? -1;
      packed.held = mv.held;
      packedMoves.push(packed);
    }
    try {
      slot.worker.postMessage({
        type: "evalBatch",
        requestId,
        payload: {
          moves: packedMoves,
          mode,
          skyfall,
          ruleRuntimeCtx,
          collectGroups: HUMAN_PLAN_ENABLED
        }
      }, transferList);
    } catch (err) {
      slot.pending.delete(requestId);
      for (let i = 0; i < transferList.length; i++) {
        recycleBoardTransferBuffer(transferList[i]);
      }
      reject(err);
    } finally {
      for (let i = 0; i < packedMoves.length; i++) {
        releasePackedMove(packedMoves[i]);
      }
      releaseArrayToPool(EVAL_PARALLEL_SHARED.taskArrayPool, packedMoves, EVAL_POOL_MAX.taskArray);
      releaseArrayToPool(EVAL_PARALLEL_SHARED.transferListPool, transferList, EVAL_POOL_MAX.transferList);
    }
  });
  const runParallelPrimitiveEval = async (jobs, resultSize) => {
    if (!enableParallelEval || parallelEvalFailed) return null;
    if (!Array.isArray(jobs) || jobs.length === 0) return [];
    const workerN = Math.max(1, Math.min(evalWorkerCount, jobs.length));
    if (workerN <= 1) return null;
    if (!ensureEvalWorkerPool(evalWorkerCount)) return null;
    const chunks = [];
    const chunkSize = Math.ceil(jobs.length / workerN);
    for (let i = 0; i < workerN; i++) {
      const chunk = acquireArrayFromPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool);
      const start = i * chunkSize;
      const end = Math.min(jobs.length, start + chunkSize);
      for (let j = start; j < end; j++) chunk.push(jobs[j]);
      if (chunk.length > 0) chunks.push(chunk);else {
        releaseArrayToPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool, chunk, EVAL_POOL_MAX.parallelJobArray);
      }
    }
    const byIndex = acquireArrayFromPool(EVAL_PARALLEL_SHARED.parallelResultArrayPool);
    byIndex.length = resultSize;
    for (let i = 0; i < resultSize; i++) byIndex[i] = null;
    try {
      const chunkResults = await Promise.all(chunks.map((chunk, i) => dispatchEvalChunkToWorker(EVAL_PARALLEL_SHARED.workerPool[i], chunk)));
      for (const resultList of chunkResults) {
        if (!Array.isArray(resultList)) continue;
        for (const item of resultList) {
          if (!item || !Number.isInteger(item.index)) continue;
          if (item.index < 0 || item.index >= resultSize) continue;
          byIndex[item.index] = item.primitives || null;
        }
      }
      return byIndex;
    } catch (_err) {
      parallelEvalFailed = true;
      terminateEvalWorkerPool(false);
      releaseArrayToPool(EVAL_PARALLEL_SHARED.parallelResultArrayPool, byIndex, EVAL_POOL_MAX.parallelResultArray);
      return null;
    } finally {
      for (const chunk of chunks) {
        releaseArrayToPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool, chunk, EVAL_POOL_MAX.parallelJobArray);
      }
    }
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
    parentHumanPlan = null,
    moveCtx = null,
    familySig = null,
    precomputedBoardKey = null,
    precomputedPrimitives = null
  }) => {
    const steps = stepsOf(node);
    if (steps > solverMaxSteps) return;
    const boardKey = precomputedBoardKey || getBoardKey(nextBoard);
    const primitiveCacheKey = getEvalPrimitiveCacheKey(boardKey, hole, held);
    let primitives = precomputedPrimitives || getCachedEvalPrimitives(primitiveCacheKey);
    let evalBoard = null;
    const needEvalBoardForRectGuide = hasRectSpecial && shouldRefreshRectGuide(steps, parentExtraCtx?.rectGuide, hasRectSpecial);
    const needEvalBoardForReverseGuide = hasReverseTargets && steps <= REVERSE_MAX_STEPS;
    if (!primitives) {
      evalBoard = boardWithHeldFilled(nextBoard, hole, held);
      primitives = computeEvalPrimitives(evalBoard);
      putCachedEvalPrimitives(primitiveCacheKey, primitives);
    }
    if (!evalBoard && (needEvalBoardForRectGuide || needEvalBoardForReverseGuide)) {
      evalBoard = boardWithHeldFilled(nextBoard, hole, held);
    }
    const rawRes = buildEvalStateFromPrimitives(evalBoard, node, steps, scoreBias, parentExtraCtx, primitives);
    if (!rawRes) return;
    const res = applyHumanPlanToEvalResult(rawRes, parentHumanPlan, moveCtx, steps);
    const {
      ev,
      score,
      violatesN2,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      initExact
    } = res;
    const holeKey = hole ? `${hole.r},${hole.c}` : "none";
    const key = `${boardKey}|${holeKey}|${held}|${r},${c}|l:${locked ? 1 : 0}`;
    const resolvedFamilySig = `${familySig || `${getNodeDirectionSignature(node)}|${boardKey}`}|h:${res.humanPlan?.familySig || "0"}`;
    if (!betterThanVisited(key, ev, score, steps, specialTuple, violatesN2, initExact, visitedTuple)) {
      return;
    }
    pushTopCandidate(ev, node, score, violatesN2, extraCtx, specialTuple);
    considerBest(ev, score, node, violatesN2, extraCtx, specialTuple);
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
      humanPlan: res.humanPlan,
      familySig: resolvedFamilySig,
      _poolRankCached: []
    });
    return "keep";
  };
  const pushInitState = (r, c, heldFromRow0) => {
    // Android can only press a real orb in row1~row5.  App.jsx may explore
    // row0 as a virtual held-orb start, but emitting such a candidate makes
    // Accessibility start outside the game board and causes intermittent
    // failed auto-rotation.  Keep virtual row0 available as a terminal state;
    // only suppress the physically impossible starting state on Android.
    if (androidAutoCombo && heldFromRow0) return;
    if (!useRow0 && heldFromRow0) return;
    if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;
    const boardCopy = clone2D(originalBoard);
    let held, hole;
    if (heldFromRow0) {
      held = originalBoard[0][c];
      hole = null;
    } else {
      held = originalBoard[r][c];
      hole = {
        r,
        c
      };
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
      scoreBias: hasSpecial ? -2500000 : 0,
      outCandidates: beam,
      parentExtraCtx: null
    });
  };
  if (useRow0) {
    for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  }
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) pushInitState(r, c, false);
  }
  reportProgress(true);
  const sortCandidatesLexicographic = candidates => {
    for (const st of candidates) {
      if (!st.finalRankTuple) {
        const steps = stepsOf(st.node);
        const initExact = hitsInitTargetComboExactly(st.ev);
        const initDistance = getInitComboDistance(st.ev);
        st.finalRankTuple = buildSpecialRankTuple(st.ev, st.score, steps, st.violatesN2, st.specialTuple || EMPTY_SPECIAL_TUPLE, initExact, initDistance);
      }
    }
    candidates.sort((a, b) => lexTupleCompareDesc(a.finalRankTuple, b.finalRankTuple));
  };
  const sortCandidatesNoSpecialCombo = candidates => {
    const minSteps = candidates.reduce((mn, st) => Math.min(mn, stepsOf(st.node)), Infinity);
    const maxCombos = candidates.reduce((mx, st) => Math.max(mx, st?.ev?.combos || 0), -Infinity);
    const anchors = getNoSpecialAnchors(Number.isFinite(minSteps) ? minSteps : 0, Number.isFinite(maxCombos) ? maxCombos : 0);
    candidates.sort((a, b) => {
      const aInit = hitsInitTargetComboExactly(a.ev) ? 1 : 0;
      const bInit = hitsInitTargetComboExactly(b.ev) ? 1 : 0;
      const aDist = getInitComboDistance(a.ev);
      const bDist = getInitComboDistance(b.ev);
      const aSteps = stepsOf(a.node);
      const bSteps = stepsOf(b.node);
      const ta = buildNoSpecialRankTuple(a.ev, a.score, aSteps, a.violatesN2, aInit, aDist, anchors);
      const tb = buildNoSpecialRankTuple(b.ev, b.score, bSteps, b.violatesN2, bInit, bDist, anchors);
      return lexTupleCompareDesc(ta, tb);
    });
  };
  const getMissTier = st => {
    if (!hasSpecial) return Math.max(0, target - (st.ev.combos || 0));
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
        quota[i] = Math.max(1, Math.floor(remain * quotaW[i] / sumW));
      }
    }
    return quota;
  };
  const buildFamilyFreqMap = items => {
    const freq = new Map();
    for (const st of items) {
      const sig = getStateFamilySignature(st);
      freq.set(sig, (freq.get(sig) || 0) + 1);
    }
    return freq;
  };
  const takeWithFamilyCap = (out, picked, familyUsed, st, cap) => {
    if (!st || picked.has(st)) return false;
    const sig = getStateFamilySignature(st);
    const used = familyUsed.get(sig) || 0;
    if (used >= cap) return false;
    familyUsed.set(sig, used + 1);
    out.push(st);
    picked.add(st);
    return true;
  };
  const pickBeamLexicographicDiverse = (candidates, beamWidth, mode, specialPriorities, initTargetCombo) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    sortCandidatesLexicographic(candidates);
    const familyFreq = buildFamilyFreqMap(candidates);
    const out = [];
    const picked = new Set();
    const familyUsed = new Map();
    const familyCap = VISITED_FAMILY_CAP;
    const eliteN = Math.min(candidates.length, Math.max(6, beamWidth / 3 | 0));
    for (let i = 0; i < eliteN && out.length < beamWidth; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }
    if (out.length >= beamWidth) return out.slice(0, beamWidth);
    const buckets = new Map();
    for (let i = eliteN; i < candidates.length; i++) {
      const st = candidates[i];
      const doneCount = sumSpecialDoneFromTuple(st.specialTuple || EMPTY_SPECIAL_TUPLE);
      const rectGuideTier = Math.floor(Number(st.extraCtx?.rectGuide || 0) / 1000);
      const initComboTier = st.ev.initialCombos || 0;
      const initClearTier = st.ev.initialClearedCount || 0;
      const comboTier = st.ev.combos || 0;
      const clearTier = st.ev.clearedCount || 0;
      const initDistTier = Math.min(12, getInitComboDistance(st.ev));
      const requirementTier = (st.ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE).slice(0, 6).join(",");
      const key = [st.violatesN2 ? 0 : 1, requirementTier, doneCount, initDistTier, st.ev.initialAllEqual ? 1 : 0, initComboTier, initClearTier, comboTier, clearTier, rectGuideTier].join("|");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(st);
    }
    for (const arr of buckets.values()) {
      precomputeCandidateRanks(arr, mode, specialPriorities, initTargetCombo, ruleProfile);
      arr.sort((a, b) => {
        const t = lexCompareDesc(a._poolRankCached, b._poolRankCached);
        if (t !== 0) return t;
        const af = familyFreq.get(getStateFamilySignature(a)) || 1;
        const bf = familyFreq.get(getStateFamilySignature(b)) || 1;
        if (af !== bf) return af - bf;
        const ad = getInitComboDistance(a.ev);
        const bd = getInitComboDistance(b.ev);
        if (ad !== bd) return ad - bd;
        if ((a.ev.initialAllEqual ? 1 : 0) !== (b.ev.initialAllEqual ? 1 : 0)) {
          return (b.ev.initialAllEqual ? 1 : 0) - (a.ev.initialAllEqual ? 1 : 0);
        }
        if ((a.ev.initialCombos || 0) !== (b.ev.initialCombos || 0)) {
          return (b.ev.initialCombos || 0) - (a.ev.initialCombos || 0);
        }
        if ((a.ev.initialClearedCount || 0) !== (b.ev.initialClearedCount || 0)) {
          return (b.ev.initialClearedCount || 0) - (a.ev.initialClearedCount || 0);
        }
        return b.score - a.score;
      });
    }
    const pool = [];
    const bucketKeys = Array.from(buckets.keys());
    const bucketCursor = new Map();
    for (const k of bucketKeys) bucketCursor.set(k, 0);
    let idx = 0;
    while (bucketKeys.length > 0) {
      const pickIdx = idx % bucketKeys.length;
      const k = bucketKeys[pickIdx];
      const arr = buckets.get(k);
      const cur = bucketCursor.get(k) || 0;
      if (arr && cur < arr.length) {
        pool.push(arr[cur]);
        bucketCursor.set(k, cur + 1);
        idx++;
      } else {
        buckets.delete(k);
        bucketCursor.delete(k);
        bucketKeys.splice(pickIdx, 1);
      }
    }
    for (const st of pool) {
      if (out.length >= beamWidth) break;
      takeWithFamilyCap(out, picked, familyUsed, st, familyCap);
    }
    for (const st of candidates) {
      if (out.length >= beamWidth) break;
      if (!picked.has(st)) {
        out.push(st);
        picked.add(st);
      }
    }
    return out.slice(0, beamWidth);
  };
  const pickBeamCombo = (candidates, beamWidth, explore) => {
    if (hasSpecial) sortCandidatesLexicographic(candidates);else sortCandidatesNoSpecialCombo(candidates);
    const BW = beamWidth;
    const familyFreq = buildFamilyFreqMap(candidates);
    const out = [];
    const picked = new Set();
    const familyUsed = new Map();
    const familyCap = VISITED_FAMILY_CAP;
    const eliteN = Math.min(candidates.length, Math.max(6, BW * 0.28 | 0));
    for (let i = 0; i < eliteN && out.length < BW; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }
    if (out.length < Math.min(eliteN, BW)) {
      for (let i = 0; i < eliteN && out.length < BW; i++) {
        if (picked.has(candidates[i])) continue;
        out.push(candidates[i]);
        picked.add(candidates[i]);
      }
    }
    if (out.length >= BW) return out;
    const maxTier = SEARCH_PROFILE.comboMaxTier;
    const quotaW = SEARCH_PROFILE.comboQuotaW;
    const counts = new Array(maxTier + 1).fill(0);
    for (let i = eliteN; i < candidates.length; i++) {
      const miss = Math.min(maxTier, getMissTier(candidates[i]));
      if (miss <= maxTier) counts[miss]++;
    }
    const quota = buildQuota(counts, BW - out.length, quotaW);
    const took = new Array(maxTier + 1).fill(0);
    const usedPos = new Set();
    const usedRegion = new Set();
    for (const st of out) {
      usedPos.add(st.r << 8 | st.c);
      if (explore) usedRegion.add(regionOf(st.r, st.c));
    }
    const regionSkipProb = SEARCH_PROFILE.comboExploreRegionSkipProb;
    for (let pass = 0; pass < 4 && out.length < BW; pass++) {
      for (let i = eliteN; i < candidates.length && out.length < BW; i++) {
        const st = candidates[i];
        const miss = Math.min(maxTier, getMissTier(st));
        if (miss > maxTier) continue;
        if (pass < 2 && took[miss] >= quota[miss]) continue;
        const pc = st.r << 8 | st.c;
        const rg = regionOf(st.r, st.c);
        if (pass === 0) {
          if (usedPos.has(pc)) continue;
          if (explore && usedRegion.has(rg) && searchRandom() < regionSkipProb) {
            continue;
          }
        } else if (pass === 1) {
          if (usedPos.has(pc)) continue;
        } else if (pass === 2) {
          if (explore && usedRegion.has(rg) && searchRandom() < regionSkipProb * 0.6) {
            continue;
          }
        }
        if (!takeWithFamilyCap(out, picked, familyUsed, st, familyCap)) continue;
        usedPos.add(pc);
        if (explore) usedRegion.add(rg);
        if (miss <= maxTier) took[miss]++;
      }
    }
    if (out.length < BW) {
      for (const st of candidates) {
        if (out.length >= BW) break;
        if (picked.has(st)) continue;
        const sig = getStateFamilySignature(st);
        const rarity = familyFreq.get(sig) || 1;
        if (rarity > 1 && searchRandom() < 0.08) continue;
        out.push(st);
        picked.add(st);
      }
    }
    return out.slice(0, BW);
  };
  const pickBeamStepsNoSpecial = (candidates, beamWidth) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    const BW = beamWidth;
    sortCandidatesNoSpecialCombo(candidates);
    const minSteps = candidates.reduce((mn, st) => Math.min(mn, stepsOf(st.node)), Infinity);
    const maxCombos = candidates.reduce((mx, st) => Math.max(mx, st?.ev?.combos || 0), -Infinity);
    const modeAnchors = getNoSpecialAnchors(Number.isFinite(minSteps) ? minSteps : 0, Number.isFinite(maxCombos) ? maxCombos : 0);
    const familyFreq = buildFamilyFreqMap(candidates);
    const familyUsed = new Map();
    const picked = new Set();
    const familyCap = VISITED_FAMILY_CAP;
    const eliteN = Math.min(candidates.length, Math.max(10, BW / 3 | 0));
    const out = [];
    for (let i = 0; i < eliteN && out.length < BW; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }
    if (out.length < Math.min(BW, eliteN)) {
      for (let i = 0; i < eliteN && out.length < BW; i++) {
        const st = candidates[i];
        if (picked.has(st)) continue;
        out.push(st);
        picked.add(st);
      }
    }
    if (out.length >= BW) return out.slice(0, BW);
    const buckets = new Map();
    for (let i = eliteN; i < candidates.length; i++) {
      const st = candidates[i];
      const legal = st.violatesN2 ? 0 : 1;
      const initCombos = st.ev.initialCombos || 0;
      const initCleared = st.ev.initialClearedCount || 0;
      const combos = st.ev.combos || 0;
      const cleared = st.ev.clearedCount || 0;
      const initExact = hitsInitTargetComboExactly(st.ev) ? 1 : 0;
      const initEq = st.ev.initialAllEqual ? 1 : 0;
      const initDist = getInitComboDistance(st.ev);
      const miss = Math.min(SEARCH_PROFILE.stepMaxTier, Math.max(0, target - combos));
      const adaptiveMajor = getAdaptiveMajor(st.ev);
      const steps = stepsOf(st.node);
      const key = hasInitSensitiveSpecial ? [legal, initExact, initDist, initEq, initCombos, initCleared, miss, steps, combos, cleared].join("|") : [legal, initExact, initDist, initEq, initCombos, initCleared, miss, steps, adaptiveMajor, combos, cleared].join("|");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(st);
    }
    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        const aInit = hitsInitTargetComboExactly(a.ev) ? 1 : 0;
        const bInit = hitsInitTargetComboExactly(b.ev) ? 1 : 0;
        const aDist = getInitComboDistance(a.ev);
        const bDist = getInitComboDistance(b.ev);
        const aSteps = stepsOf(a.node);
        const bSteps = stepsOf(b.node);
        const ta = buildNoSpecialRankTuple(a.ev, a.score, aSteps, a.violatesN2, aInit, aDist, modeAnchors);
        const tb = buildNoSpecialRankTuple(b.ev, b.score, bSteps, b.violatesN2, bInit, bDist, modeAnchors);
        const t = lexTupleCompareDesc(ta, tb);
        if (t !== 0) return t;
        const af = familyFreq.get(getStateFamilySignature(a)) || 1;
        const bf = familyFreq.get(getStateFamilySignature(b)) || 1;
        return af - bf;
      });
    }
    const bucketKeys = Array.from(buckets.keys());
    const bucketCursor = new Map();
    for (const k of bucketKeys) bucketCursor.set(k, 0);
    let idx = 0;
    while (out.length < BW && bucketKeys.length > 0) {
      const pickIdx = idx % bucketKeys.length;
      const k = bucketKeys[pickIdx];
      const arr = buckets.get(k);
      const cur = bucketCursor.get(k) || 0;
      if (arr && cur < arr.length) {
        const st = arr[cur];
        bucketCursor.set(k, cur + 1);
        if (!takeWithFamilyCap(out, picked, familyUsed, st, familyCap)) {
          continue;
        }
        idx++;
      } else {
        buckets.delete(k);
        bucketCursor.delete(k);
        bucketKeys.splice(pickIdx, 1);
      }
    }
    if (out.length < BW) {
      for (const st of candidates) {
        if (out.length >= BW) break;
        if (picked.has(st)) continue;
        out.push(st);
        picked.add(st);
      }
    }
    return out.slice(0, BW);
  };
  const materializePendingPushMove = mv => {
    if (!mv) return null;
    if (mv.nextBoard && mv.hole) return mv;
    if (!mv.parentBoard) return null;
    const nextBoard = clone2D(mv.parentBoard);
    let nextHole;
    if (mv.transitionKind === "enter") {
      nextBoard[mv.r][mv.c] = -1;
      nextHole = {
        r: mv.r,
        c: mv.c
      };
    } else {
      if (!mv.parentHole) return null;
      nextHole = holeStepInPlace(nextBoard, mv.parentHole, {
        r: mv.r,
        c: mv.c
      });
    }
    mv.nextBoard = nextBoard;
    mv.hole = nextHole;
    mv.parentBoard = null;
    mv.parentHole = null;
    return mv;
  };
  for (let step = 0; step < solverMaxSteps; step++) {
    let candidates = [];
    const pendingPushMoves = [];
    const pendingTerminalMoves = [];
    const phaseIdx = getDepthPhaseIndex(step);
    const phaseScale = getDepthPhaseBeamScale(phaseIdx);
    const adaptiveBeamWidth = Math.max(24, Math.min(baseBeamWidth, Math.round(getAdaptiveBeamWidth(step, solverMaxSteps, stagnantRounds, diversityRatio) * phaseScale)));
    if (bestReachedSteps !== Infinity && step >= bestReachedSteps + (hasSpecial ? 0 : SEARCH_PROFILE.bestStepSlack)) {
      break;
    }
    for (const state of beam) {
      if (nodesExpanded > maxNodesEffective) break;
      if (state.locked) continue;
      for (const [dr, dc] of dirsPlay) {
        if (nodesExpanded > maxNodesEffective) break;
        const nr = state.r + dr;
        const nc = state.c + dc;
        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
        if (!useRow0 && nr === 0) continue;
        if (state.node?.parent && nr === state.node.parent.r && nc === state.node.parent.c) {
          continue;
        }
        const newNode = makeNode(state.node, nr, nc);
        const dirSig = `${dr},${dc}`;
        const cheapSig = `${getNodeDirectionSignature(newNode)}|${dirSig}`;
        if (useRow0 && state.r === 0) {
          if (nr !== 1) continue;
          const destVal = state.board[nr][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;
          const nextLocked = chk.locked || isAtQ2(nr, nc);
          let nextBoard = null;
          let nextHole = null;
          if (!DEFER_MOVE_MATERIALIZATION) {
            nextBoard = clone2D(state.board);
            nextBoard[nr][nc] = -1;
            nextHole = {
              r: nr,
              c: nc
            };
          }
          pendingPushMoves.push({
            nextBoard,
            held: state.held,
            hole: nextHole,
            parentBoard: DEFER_MOVE_MATERIALIZATION ? state.board : null,
            parentHole: null,
            transitionKind: "enter",
            r: nr,
            c: nc,
            node: newNode,
            locked: nextLocked,
            parentExtraCtx: state.extraCtx,
            parentHumanPlan: state.humanPlan,
            moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "enter"),
            cheapScore: getGuidedMoveCheapScore(state, nr, nc, nextLocked, step),
            legacyCheapScore: getMoveCheapScore(state, nr, nc, nextLocked, step),
            cheapSig,
            familySig: `${cheapSig}|enter`
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
          if (state.hole) {
            // Android cannot physically drag into the virtual row0. Its
            // Accessibility runner stops at the last real cell and releases
            // the held orb there. Keep the browser's row0 terminal semantics,
            // but evaluate Android's terminal exactly as the physical
            // release so the displayed first-clear/cascade counts match the
            // board that AUTO actually produces.
            evalBoard[state.hole.r][state.hole.c] = androidAutoCombo ? state.held : destVal;
          }
          pendingTerminalMoves.push({
            evalBoard,
            node: newNode,
            parentExtraCtx: state.extraCtx,
            parentHumanPlan: state.humanPlan,
            moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "exit"),
            cheapScore: getGuidedMoveCheapScore(state, nr, nc, chk.locked || isAtQ2(nr, nc), step) + 40,
            cheapSig,
            familySig: `${cheapSig}|exit`
          });
          nodesExpanded++;
          reportProgress();
          continue;
        }
        if (nr < PLAY_ROWS_START || !state.hole) continue;
        const destVal = state.board[nr][nc];
        const chk = stepConstraint(destVal);
        if (!chk.ok) continue;
        const nextLocked = chk.locked || isAtQ2(nr, nc);
        let nextBoard = null;
        let nextHole = null;
        if (!DEFER_MOVE_MATERIALIZATION) {
          nextBoard = clone2D(state.board);
          nextHole = holeStepInPlace(nextBoard, state.hole, {
            r: nr,
            c: nc
          });
        }
        pendingPushMoves.push({
          nextBoard,
          held: state.held,
          hole: nextHole,
          parentBoard: DEFER_MOVE_MATERIALIZATION ? state.board : null,
          parentHole: DEFER_MOVE_MATERIALIZATION ? state.hole : null,
          transitionKind: "move",
          r: nr,
          c: nc,
          node: newNode,
          locked: nextLocked,
          parentExtraCtx: state.extraCtx,
          parentHumanPlan: state.humanPlan,
          moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "move"),
          cheapScore: getGuidedMoveCheapScore(state, nr, nc, nextLocked, step),
          legacyCheapScore: getMoveCheapScore(state, nr, nc, nextLocked, step),
          cheapSig,
          familySig: `${cheapSig}|${nr},${nc}`
        });
        nodesExpanded++;
        reportProgress();
      }
    }
    if (!pendingPushMoves.length && !pendingTerminalMoves.length) break;
    for (const mv of pendingTerminalMoves) {
      const rawRes = evalState(mv.evalBoard, mv.node, stepsOf(mv.node), 0, mv.parentExtraCtx);
      const res = applyHumanPlanToEvalResult(rawRes, mv.parentHumanPlan, mv.moveCtx, stepsOf(mv.node));
      if (!res) continue;
      pushTopCandidate(res.ev, mv.node, res.score, res.violatesN2, res.extraCtx, res.specialTuple);
      considerBest(res.ev, res.score, mv.node, res.violatesN2, res.extraCtx, res.specialTuple);
    }
    const evalBudget = getCheapEvalBudget(pendingPushMoves.length, adaptiveBeamWidth, stagnantRounds, hasSpecial || hasRuleRequirements);
    const selectedPushMoves = evalBudget >= pendingPushMoves.length ? pendingPushMoves : pickCheapPortfolioMoves(pendingPushMoves, evalBudget);
    const selectedMoveMeta = acquireArrayFromPool(EVAL_PARALLEL_SHARED.moveMetaArrayPool);
    const pendingParallelJobs = acquireArrayFromPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool);
    let parallelPrimitivesByIndex = null;
    try {
      for (let idx = 0; idx < selectedPushMoves.length; idx++) {
        const mv = selectedPushMoves[idx];
        if (!materializePendingPushMove(mv)) continue;
        const boardKey = getBoardKey(mv.nextBoard);
        const primitiveCacheKey = getEvalPrimitiveCacheKey(boardKey, mv.hole, mv.held);
        const cached = getCachedEvalPrimitives(primitiveCacheKey);
        const meta = acquireMoveMeta();
        const materializedIndex = selectedMoveMeta.length;
        meta.mv = mv;
        meta.idx = materializedIndex;
        meta.boardKey = boardKey;
        meta.primitiveCacheKey = primitiveCacheKey;
        meta.primitives = cached;
        selectedMoveMeta.push(meta);
        if (!cached) {
          const job = acquireParallelJob();
          job.index = materializedIndex;
          job.nextBoard = mv.nextBoard;
          job.hole = mv.hole;
          job.held = mv.held;
          pendingParallelJobs.push(job);
        }
      }
      parallelPrimitivesByIndex = pendingParallelJobs.length > 0 ? await runParallelPrimitiveEval(pendingParallelJobs, selectedMoveMeta.length) : null;
      for (let i = 0; i < selectedMoveMeta.length; i++) {
        const meta = selectedMoveMeta[i];
        if (!meta.primitives && Array.isArray(parallelPrimitivesByIndex)) {
          const fromWorker = parallelPrimitivesByIndex[meta.idx];
          if (fromWorker) {
            meta.primitives = fromWorker;
            putCachedEvalPrimitives(meta.primitiveCacheKey, fromWorker);
          }
        }
        if (!meta.primitives) {
          const evalBoard = boardWithHeldFilled(meta.mv.nextBoard, meta.mv.hole, meta.mv.held);
          meta.primitives = computeEvalPrimitives(evalBoard);
          putCachedEvalPrimitives(meta.primitiveCacheKey, meta.primitives);
        }
        tryPushState({
          nextBoard: meta.mv.nextBoard,
          held: meta.mv.held,
          hole: meta.mv.hole,
          r: meta.mv.r,
          c: meta.mv.c,
          node: meta.mv.node,
          locked: meta.mv.locked,
          scoreBias: 0,
          outCandidates: candidates,
          parentExtraCtx: meta.mv.parentExtraCtx,
          parentHumanPlan: meta.mv.parentHumanPlan,
          moveCtx: meta.mv.moveCtx,
          familySig: meta.mv.familySig || meta.mv.cheapSig || null,
          precomputedBoardKey: meta.boardKey,
          precomputedPrimitives: meta.primitives
        });
      }
    } finally {
      if (Array.isArray(parallelPrimitivesByIndex)) {
        releaseArrayToPool(EVAL_PARALLEL_SHARED.parallelResultArrayPool, parallelPrimitivesByIndex, EVAL_POOL_MAX.parallelResultArray);
      }
      for (let i = 0; i < pendingParallelJobs.length; i++) {
        releaseParallelJob(pendingParallelJobs[i]);
      }
      releaseArrayToPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool, pendingParallelJobs, EVAL_POOL_MAX.parallelJobArray);
      for (let i = 0; i < selectedMoveMeta.length; i++) {
        releaseMoveMeta(selectedMoveMeta[i]);
      }
      releaseArrayToPool(EVAL_PARALLEL_SHARED.moveMetaArrayPool, selectedMoveMeta, EVAL_POOL_MAX.moveMetaArray);
    }
    if (!candidates.length) {
      if (depthMilestones.includes(step + 1)) flushPendingPools();
      break;
    }
    if (!hasSpecial) {
      if (IS_COMBO_MODE) {
        beam = pickBeamCombo(candidates, adaptiveBeamWidth, true);
      } else {
        beam = pickBeamStepsNoSpecial(candidates, adaptiveBeamWidth);
      }
    } else {
      beam = pickBeamLexicographicDiverse(candidates, adaptiveBeamWidth, mode, specialPriority, initTargetCombo);
    }
    const currentBestScore = Number(bestGlobal.score);
    if (Number.isFinite(currentBestScore) && currentBestScore > lastBestScore + 1e-6) {
      lastBestScore = currentBestScore;
      stagnantRounds = 0;
    } else {
      stagnantRounds++;
    }
    diversityRatio = getDiversityRatio(beam);
    if (depthMilestones.includes(step + 1)) flushPendingPools();
    reportProgress(true);
    const stepNow = nowMs();
    const stepDuration = stepNow - lastStepAt;
    lastStepAt = stepNow;
    if (stepDuration > 26) {
      adaptiveYieldStride = Math.max(1, adaptiveYieldStride - 1);
    } else if (stepDuration < 8) {
      const maxStride = enableParallelEval ? 12 : 6;
      adaptiveYieldStride = Math.min(maxStride, adaptiveYieldStride + 1);
    }
    const shouldYieldByStride = step - lastYieldStep >= adaptiveYieldStride;
    const shouldYieldByTime = stepNow - lastYieldAt >= 16;
    if (SHOULD_YIELD_TO_BROWSER && (nodesExpanded > maxNodesEffective || shouldYieldByStride || shouldYieldByTime)) {
      await yieldToBrowser();
      lastYieldAt = nowMs();
      lastYieldStep = step;
    }
    if (nodesExpanded > maxNodesEffective) break;
  }
  flushPendingPools();
  reportProgress(true);
  bestGlobal.path = bestGlobal.node ? buildPath(bestGlobal.node) : [];
  bestGlobal.nodesExpanded = nodesExpanded;
  delete bestGlobal.node;
  const finalExtraCtx = {
    rectGuide: bestGlobal.rectGuide || 0,
    initialCombos: bestGlobal.initialCombos || 0,
    initialClearedCount: bestGlobal.initialClearedCount || 0,
    initialMatchSizes: bestGlobal.initialMatchSizes || [],
    initialComboSizes: bestGlobal.initialComboSizes || [],
    initialAllEqual: !!bestGlobal.initialAllEqual,
    initialDistinctSizeCount: bestGlobal.initialDistinctSizeCount || 0,
    initialComboDistance: bestGlobal.initialComboDistance,
    initialComboExact: !!bestGlobal.initialComboExact,
    initTargetCombo: Number.isFinite(Number(initTargetCombo)) && Number(initTargetCombo) >= 0 ? Number(initTargetCombo) : null
  };
  return {
    ...bestGlobal,
    topSteps: topStepCandidates,
    topCombos: topComboCandidates,
    success: !bestGlobal.violatesN2 && isSolvedGoal(bestGlobal, finalExtraCtx)
  };
};

globalThis.autoComboBeamSolve = beamSolve;
// Export the exact App.jsx pool merge used after beamSolve so Android Top10
// has the same deduplication and ranking semantics.
if (typeof mergeTopSolutions === "function") {
  globalThis.autoComboMergeTopSolutions = mergeTopSolutions;
}
globalThis.autoComboSolverSource = "App.jsx";


// App.jsx applies a selected path to the source board only for preview.
function clone2DForRunner(board) {
  return (board || []).map(function (row) { return (row || []).slice(); });
}

function finalBoardFromPathForRunner(originalBoard, path) {
  var board = clone2DForRunner(originalBoard);
  if (!Array.isArray(path) || path.length < 1) return board;
  var start = path[0];
  if (!start || start.r == null || start.c == null) return board;
  var held = board[start.r] && board[start.r][start.c];
  if (held == null) return board;

  var hole = null;
  if (start.r !== 0) {
    hole = { r: start.r, c: start.c };
    board[hole.r][hole.c] = -1;
  }

  for (var i = 1; i < path.length; i++) {
    var current = path[i];
    if (!current || current.r == null || current.c == null) continue;
    if (current.r === 0) {
      if (hole) board[hole.r][hole.c] = board[0][current.c];
      return board;
    }
    if (!hole) {
      hole = { r: current.r, c: current.c };
      board[hole.r][hole.c] = -1;
    } else {
      board[hole.r][hole.c] = board[current.r][current.c];
      board[current.r][current.c] = -1;
      hole = { r: current.r, c: current.c };
    }
  }
  if (hole) board[hole.r][hole.c] = held;
  return board;
}

function specialStatusForRunner(solution, specials) {
  var tuple = solution && Array.isArray(solution.specialTuple)
    ? solution.specialTuple
    : [];
  var slots = Array.isArray(specials) ? specials.slice(0, 3) : [];
  while (slots.length < 3) slots.push({ type: "none" });
  var compactIndex = 0;
  return slots.map(function (special) {
    if (!special || !special.type || special.type === "none") return false;
    var done = Number(tuple[compactIndex * 2] || 0) > 0;
    compactIndex++;
    return done;
  });
}

function enrichSolutionForRunner(solution, originalBoard, specials) {
  if (!solution || !Array.isArray(solution.path)) return solution;
  return Object.assign({}, solution, {
    finalBoard: finalBoardFromPathForRunner(originalBoard, solution.path),
    specialStatus: specialStatusForRunner(solution, specials)
  });
}

globalThis.autoComboEnrichSolveResult = function (result, originalBoard, specials) {
  if (!result || typeof result !== "object") return result;
  var enriched = Object.assign({}, result);
  if (Array.isArray(result.path)) {
    enriched.finalBoard = finalBoardFromPathForRunner(originalBoard, result.path);
    enriched.specialStatus = specialStatusForRunner(result, specials);
  }
  enriched.topSteps = Array.isArray(result.topSteps)
    ? result.topSteps.map(function (solution) { return enrichSolutionForRunner(solution, originalBoard, specials); })
    : [];
  enriched.topCombos = Array.isArray(result.topCombos)
    ? result.topCombos.map(function (solution) { return enrichSolutionForRunner(solution, originalBoard, specials); })
    : [];
  return enriched;
};

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
