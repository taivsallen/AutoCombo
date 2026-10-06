/**
 * Independent, deliberately simple offline reference for the Web solver.
 *
 * No production solver helpers are imported. Cells use the existing decimal
 * encoding: orb + X*10 + START/END*100 + N*1000; -1 is empty. Coordinates are
 * zero-based. Only rows 1..5 clear or receive gravity; row 0 never changes.
 * A path includes its starting coordinate, so steps = path.length - 1.
 *
 * This module validates a candidate, not its optimality or its deadline.
 */

const ROWS = 6;
const COLS = 6;
const neighbors = (id) => {
  const r = Math.floor(id / COLS);
  const c = id % COLS;
  const out = [];
  if (r > 1) out.push(id - COLS);
  if (r < ROWS - 1) out.push(id + COLS);
  if (c > 0) out.push(id - 1);
  if (c < COLS - 1) out.push(id + 1);
  return out;
};

const orb = (cell) => (cell < 0 ? -1 : cell % 10);
const mark = (cell, place) => (cell < 0 ? 0 : Math.floor(cell / place) % 10);
const replaceOrb = (cell, kind) => cell - orb(cell) + kind;

function copyBoard(board) {
  if (!Array.isArray(board) || board.length !== ROWS ||
      board.some((row) => !Array.isArray(row) || row.length !== COLS)) {
    throw new TypeError("Board must have exactly 6 rows and 6 columns.");
  }
  for (const row of board) for (const cell of row) {
    if (!Number.isInteger(cell) || (cell !== -1 &&
        (cell < 0 || cell >= 3000 || orb(cell) > 5 ||
         mark(cell, 10) > 2 || mark(cell, 100) > 2))) {
      throw new TypeError(`Invalid encoded cell: ${cell}`);
    }
  }
  return board.map((row) => row.slice());
}

function point(value) {
  if (Array.isArray(value)) return { r: value[0], c: value[1] };
  if (value && typeof value === "object") return { r: value.r, c: value.c };
  return { r: NaN, c: NaN };
}

const samePoint = (a, b) => a.r === b.r && a.c === b.c;
const validPoint = ({ r, c }) => Number.isInteger(r) && Number.isInteger(c) &&
  r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** Replay complete-cell swaps, checking movement restrictions independently. */
export function replayPath(board, path, options = {}) {
  const errors = [];
  let result;
  try {
    result = copyBoard(board);
  } catch (error) {
    return { legal: false, board: null, errors: [error.message], steps: 0 };
  }
  if (!Array.isArray(path) || path.length === 0) {
    return { legal: false, board: result, errors: ["A solution must contain a nonempty path."], steps: 0 };
  }
  const coords = path.map(point);
  if (coords.some((p) => !validPoint(p))) {
    return { legal: false, board: result, errors: ["Path contains an invalid coordinate."], steps: coords.length - 1 };
  }
  const steps = coords.length - 1;
  const maxSteps = options.maxSteps ?? options.cfg?.maxSteps;
  if (maxSteps != null && (!Number.isInteger(Number(maxSteps)) || Number(maxSteps) < 0)) {
    errors.push("maxSteps must be a nonnegative integer.");
  } else if (maxSteps != null && steps > Number(maxSteps)) {
    errors.push(`Path has ${steps} steps, exceeding maxSteps=${maxSteps}.`);
  }
  const diagonal = options.diagonal ?? options.diagonalEnabled ?? true;
  const useRow0 = options.useRow0 ?? true;
  const starts = [];
  const ends = [];
  for (let r = useRow0 ? 0 : 1; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (mark(board[r][c], 100) === 1) starts.push({ r, c });
    if (mark(board[r][c], 100) === 2) ends.push({ r, c });
  }
  if (starts.length > 1) errors.push("Board contains multiple START coordinates.");
  if (ends.length > 1) errors.push("Board contains multiple END coordinates.");
  if (starts.length && !samePoint(coords[0], starts[0])) errors.push("Path does not begin at START.");
  if (ends.length && !samePoint(coords.at(-1), ends[0])) errors.push("Path does not finish at END.");
  if (!useRow0 && coords.some((p) => p.r === 0)) errors.push("Path touches disabled row 0.");
  const fromRow0 = coords[0].r === 0;
  let diagonalSteps = 0;
  for (let i = 0; i < coords.length; i++) {
    const here = coords[i];
    const cell = result[here.r][here.c];
    // Restrictions are checked before touching the destination. X marks move
    // with cells; START/END constraints remain at their initial coordinates.
    if (cell < 0) errors.push(`Path touches an empty cell at index ${i}.`);
    if (mark(cell, 10) === 1) errors.push(`Path touches X1 at index ${i}.`);
    if (mark(cell, 10) === 2 && i !== coords.length - 1) {
      errors.push(`X2 is only permitted at the final path coordinate (index ${i}).`);
    }
    if (ends.some((p) => samePoint(p, here)) && i !== coords.length - 1) {
      errors.push(`Path continues after reaching END at index ${i}.`);
    }
    if (i === 0) continue;
    const previous = coords[i - 1];
    const dr = Math.abs(here.r - previous.r);
    const dc = Math.abs(here.c - previous.c);
    if (dr > 1 || dc > 1 || dr + dc === 0) {
      errors.push(`Non-adjacent or stationary move at index ${i}.`);
      break;
    }
    if (dr && dc) {
      diagonalSteps++;
      if (!diagonal) errors.push(`Diagonal move is disabled (index ${i}).`);
    }
    if (previous.r === 0) {
      if (i !== 1 || here.r !== 1) {
        errors.push(`Row 0 may only be a start followed by an entry into row 1 (index ${i}).`);
        break;
      }
      // The original destination supplies all marks; row 0 supplies color only.
      if (cell >= 0) result[here.r][here.c] = replaceOrb(cell, orb(result[0][previous.c]));
    } else if (here.r === 0) {
      if (fromRow0) {
        errors.push("A row-0 start must stop before any later row-0 collision.");
        break;
      }
      if (i !== coords.length - 1) errors.push("A collision with row 0 must terminate the path.");
      const held = result[previous.r][previous.c];
      if (held >= 0) result[previous.r][previous.c] = replaceOrb(held, orb(cell));
    } else {
      [result[previous.r][previous.c], result[here.r][here.c]] =
        [result[here.r][here.c], result[previous.r][previous.c]];
    }
  }
  return { legal: errors.length === 0, board: result, errors, steps, diagonalSteps, path: coords };
}

function normalizeProfile(value) {
  const input = value?.profile ?? value ?? {};
  return {
    orbRules: Array.from({ length: 6 }, (_, i) => {
      const rule = input.orbRules?.[i] ?? {};
      const minClear = Number(rule.minClear ?? 3);
      if (!Number.isInteger(minClear) || minClear < 1 || minClear > 5) {
        throw new TypeError(`Orb ${i}: minClear must be an integer in 1..5.`);
      }
      if (rule.clearMode != null && !["line", "connected"].includes(rule.clearMode)) {
        throw new TypeError(`Orb ${i}: unsupported clearMode.`);
      }
      return { minClear, clearMode: rule.clearMode ?? "line" };
    }),
    requirements: (input.requirements ?? []).map((req) => {
      if (!Number.isInteger(req.orb) || req.orb < 0 || req.orb > 5 ||
          !Number.isInteger(req.size) || req.size < 1 || req.size > 5 ||
          !Number.isInteger(req.count) || req.count < 1 ||
          (req.match != null && !["exact", "atLeast"].includes(req.match))) {
        throw new TypeError("Invalid rule requirement.");
      }
      return { ...req, match: req.match ?? "exact" };
    }),
  };
}

function components(ids, kinds) {
  const todo = new Set(ids);
  const groups = [];
  while (todo.size) {
    const first = todo.values().next().value;
    const cells = [first];
    todo.delete(first);
    for (let at = 0; at < cells.length; at++) {
      for (const adjacent of neighbors(cells[at])) {
        if (todo.has(adjacent) && kinds[adjacent] === kinds[first]) {
          todo.delete(adjacent);
          cells.push(adjacent);
        }
      }
    }
    groups.push({ orb: kinds[first], size: cells.length, cellIds: cells.sort((a, b) => a - b) });
  }
  return groups;
}

function findBatch(board, profile, batchIndex) {
  const kinds = board.flat().map((cell) => {
    const n = mark(cell, 1000);
    return n === 1 || (n === 2 && batchIndex === 0) ? -1 : orb(cell);
  });
  const cleared = new Set();
  const eligible = Array.from({ length: 30 }, (_, i) => i + 6).filter((id) => kinds[id] >= 0);
  for (const group of components(eligible, kinds)) {
    const rule = profile.orbRules[group.orb];
    if (rule.clearMode === "connected") {
      if (group.size >= rule.minClear) for (const id of group.cellIds) cleared.add(id);
      continue;
    }
    // Scan straight rays only from their maximal run's first cell. Mark the
    // complete run; overlapping runs later merge into one connected combo.
    for (const id of group.cellIds) for (const delta of [1, COLS]) {
      const c = id % COLS;
      const predecessor = id - delta;
      const predecessorExists = delta === 1 ? c > 0 : id >= 2 * COLS;
      if (predecessorExists && kinds[predecessor] === group.orb) continue;
      const run = [];
      for (let next = id; next < ROWS * COLS; next += delta) {
        if (delta === 1 && Math.floor(next / COLS) !== Math.floor(id / COLS)) break;
        if (kinds[next] !== group.orb) break;
        run.push(next);
      }
      if (run.length >= rule.minClear) for (const next of run) cleared.add(next);
    }
  }
  const groups = components(cleared, kinds);
  return { groups, combos: groups.length, clearedCount: cleared.size, cleared: [...cleared].sort((a, b) => a - b) };
}

function fall(board, cleared) {
  const next = board.map((row) => row.slice());
  const removed = new Set(cleared);
  for (let c = 0; c < COLS; c++) {
    const survivors = [];
    for (let r = 1; r < ROWS; r++) {
      if (!removed.has(r * COLS + c) && board[r][c] >= 0) survivors.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 1; r--) next[r][c] = survivors.pop() ?? -1;
  }
  return next;
}

function shapeKey(cells) {
  const rs = cells.map(([r]) => r);
  const cs = cells.map(([, c]) => c);
  const minR = Math.min(...rs);
  const minC = Math.min(...cs);
  return cells.map(([r, c]) => `${r - minR},${c - minC}`).sort().join(";");
}

const shapeTemplates = {
  cross: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  l: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  t: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
};
const shapeVariants = Object.fromEntries(Object.entries(shapeTemplates).map(([type, cells]) => {
  const keys = new Set();
  for (const reflection of [1, -1]) {
    let rotated = cells.map(([r, c]) => [r, c * reflection]);
    for (let turn = 0; turn < 4; turn++) {
      keys.add(shapeKey(rotated));
      rotated = rotated.map(([r, c]) => [c, -r]);
    }
  }
  return [type, keys];
}));

function decorateGroup(group) {
  const cells = group.cellIds.map((id) => [Math.floor(id / COLS), id % COLS]);
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const height = Math.max(...rows) - Math.min(...rows) + 1;
  const width = Math.max(...cols) - Math.min(...cols) + 1;
  const key = shapeKey(cells);
  const shape = group.size === 5
    ? Object.keys(shapeVariants).find((type) => shapeVariants[type].has(key)) ?? null
    : null;
  const rectangle = group.size === height * width && height >= 3 && height <= 5 && width >= 3 && width <= 5
    ? { rows: height, columns: width }
    : null;
  return { ...group, cells, shape, rectangle };
}

function summarizePatterns(groups) {
  const counter = () => ({ total: 0, byOrb: Array(6).fill(0) });
  const counts = { cross: counter(), l: counter(), t: counter(), rect: {} };
  for (let m = 3; m <= 5; m++) for (let n = 3; n <= 5; n++) counts.rect[`${m}x${n}`] = counter();
  for (const group of groups) {
    const add = (value) => { value.total++; value.byOrb[group.orb]++; };
    if (group.shape) add(counts[group.shape]);
    if (group.rectangle) add(counts.rect[`${group.rectangle.rows}x${group.rectangle.columns}`]);
  }
  return counts;
}

function checkSpecial(special, evaluation) {
  const type = special.type;
  if (type === "clearCount") {
    const want = Number(special.clearCountValue ?? special.clearCount ?? special.count);
    return { type, satisfied: evaluation.initialClearedCount === want, got: evaluation.initialClearedCount, want };
  }
  if (type === "equalFirst") {
    const selected = [...new Set(special.selectedOrbs ?? special.equalOrbs ?? [])].map(Number);
    if (!selected.length || selected.some((id) => !Number.isInteger(id) || id < 0 || id > 5)) {
      return { type, satisfied: false, got: [], error: "equalFirst needs valid selected orb types." };
    }
    const got = selected.map((id) => evaluation.initialComboCountsByOrb[id]);
    return { type, satisfied: got[0] > 0 && got.every((count) => count === got[0]), got };
  }
  let counter;
  let requestedOrb;
  let want;
  if (type === "rect") {
    counter = evaluation.initialPatternCounts.rect[`${special.rectM ?? special.m ?? 3}x${special.rectN ?? special.n ?? 3}`];
    requestedOrb = special.rectOrb ?? -1;
    want = 1;
  } else if (["cross", "l", "t"].includes(type)) {
    counter = evaluation.initialPatternCounts[type];
    requestedOrb = special.orbValue ?? special.orb ?? -1;
    want = Number(special.countValue ?? special.count ?? 1);
  } else {
    return { type, satisfied: false, error: `Unsupported special: ${type}` };
  }
  const got = Number(requestedOrb) === -1 ? counter?.total ?? 0 : counter?.byOrb[requestedOrb] ?? 0;
  return { type, satisfied: Number.isFinite(want) && want >= 1 && got >= want, got, want };
}

/** Evaluate actual first-batch and cascade clears, without new random orbs. */
export function evaluateReference(board, options = {}) {
  let current = copyBoard(board);
  const profile = normalizeProfile(options.ruleProfile);
  const skyfall = options.skyfall ?? options.skyfallEnabled ?? false;
  const batches = [];
  while (true) {
    const batch = findBatch(current, profile, batches.length);
    if (!batch.combos) break;
    batch.groups = batch.groups.map(decorateGroup);
    batches.push(batch);
    current = fall(current, batch.cleared);
    if (!skyfall) break;
  }
  const initial = batches[0] ?? { combos: 0, clearedCount: 0, groups: [], cleared: [] };
  const initialComboCountsByOrb = Array(6).fill(0);
  const initialComboSizeCountsByOrb = Array.from({ length: 6 }, () => ({}));
  for (const group of initial.groups) {
    initialComboCountsByOrb[group.orb]++;
    const sizes = initialComboSizeCountsByOrb[group.orb];
    sizes[group.size] = (sizes[group.size] ?? 0) + 1;
  }
  const evaluation = {
    combos: batches.reduce((sum, batch) => sum + batch.combos, 0),
    initialCombos: initial.combos,
    skyfallCombos: batches.slice(1).reduce((sum, batch) => sum + batch.combos, 0),
    clearedCount: batches.reduce((sum, batch) => sum + batch.clearedCount, 0),
    initialClearedCount: initial.clearedCount,
    initialComboCountsByOrb,
    initialComboSizeCountsByOrb,
    initialPatternCounts: summarizePatterns(initial.groups),
    groups: initial.groups,
    batches,
    finalBoard: current,
  };
  evaluation.requirements = profile.requirements.map((requirement) => {
    const got = initialComboSizeCountsByOrb[requirement.orb][requirement.size] ?? 0;
    const distance = requirement.match === "atLeast"
      ? Math.max(0, requirement.count - got)
      : Math.abs(requirement.count - got);
    return { ...requirement, got, distance, satisfied: distance === 0 };
  });
  // One tuple entry per configured priority. Earlier requirements always win.
  evaluation.ruleRequirementTuple = evaluation.requirements.flatMap((req) => [Number(req.satisfied), -req.distance]);
  const specialInput = options.specials ?? options.specialPriorities ?? options.specialPriority ?? [];
  const specials = (Array.isArray(specialInput) ? specialInput : [specialInput])
    .filter((special) => special && special.type && special.type !== "none");
  if (specials.length > 3) throw new TypeError("At most three simultaneous specials are supported.");
  evaluation.specials = specials.map((special) => checkSpecial(special, evaluation));
  const target = options.initTargetCombo;
  if (target != null && (!Number.isInteger(Number(target)) || Number(target) < 0)) {
    throw new TypeError("initTargetCombo must be a nonnegative integer.");
  }
  evaluation.requirements_satisfied = evaluation.requirements.every((req) => req.satisfied);
  evaluation.special_satisfied = evaluation.specials.every((special) => special.satisfied);
  evaluation.initial_satisfied = target == null || evaluation.initialCombos === Number(target);
  evaluation.success = evaluation.requirements_satisfied && evaluation.special_satisfied && evaluation.initial_satisfied;
  return evaluation;
}

/** Reject illegal paths and any supplied combo/count/step claim that disagrees. */
export function verifySolution(board, solution, options = {}) {
  const replay = replayPath(board, solution?.path, options);
  const errors = replay.errors.slice();
  let evaluation = null;
  if (replay.legal) {
    try { evaluation = evaluateReference(replay.board, options); }
    catch (error) { errors.push(error.message); }
  }
  if (evaluation) {
    const claims = {
      combos: evaluation.combos,
      totalCombos: evaluation.combos,
      total_combos: evaluation.combos,
      initialCombos: evaluation.initialCombos,
      initial_combos: evaluation.initialCombos,
      skyfallCombos: evaluation.skyfallCombos,
      skyfall_combos: evaluation.skyfallCombos,
      clearedCount: evaluation.clearedCount,
      initialClearedCount: evaluation.initialClearedCount,
      steps: replay.steps,
      step: replay.steps,
    };
    for (const [name, actual] of Object.entries(claims)) {
      if (solution[name] != null && (typeof solution[name] !== "number" || solution[name] !== actual)) {
        errors.push(`Reported ${name}=${solution[name]} differs from replayed ${actual}.`);
      }
    }
    if (solution.initialComboCountsByOrb != null) {
      const reported = Array.from(solution.initialComboCountsByOrb);
      if (reported.length < 6 || reported.slice(0, 6).some((count, id) => count !== evaluation.initialComboCountsByOrb[id]) ||
          reported.slice(6).some((count) => count !== 0)) {
        errors.push("Reported initialComboCountsByOrb differs from replayed color combo counts.");
      }
    }
    if (solution.initialComboSizeCountsByOrb != null) {
      const reported = solution.initialComboSizeCountsByOrb;
      const countsAgree = Array.isArray(reported) && reported.length === 6 && reported.every((counts, id) => {
        if (counts == null || typeof counts !== "object") return false;
        const actual = evaluation.initialComboSizeCountsByOrb[id];
        const sizes = new Set([...Object.keys(counts), ...Object.keys(actual)]);
        return [...sizes].every((size) => (counts[size] ?? 0) === (actual[size] ?? 0));
      });
      if (!countsAgree) errors.push("Reported initialComboSizeCountsByOrb differs from replayed group sizes.");
    }
  }
  const legal = replay.legal && errors.length === 0;
  return {
    legal,
    pathLegal: replay.legal,
    errors,
    evaluation,
    board: replay.board,
    steps: replay.steps,
    requirements_satisfied: legal && evaluation?.requirements_satisfied === true,
    special_satisfied: legal && evaluation?.special_satisfied === true,
    initial_satisfied: legal && evaluation?.initial_satisfied === true,
    success: legal && evaluation?.success === true,
  };
}
