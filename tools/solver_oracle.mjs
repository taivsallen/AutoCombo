/**
 * Small, bounded exhaustive oracle for offline quality measurements.
 *
 * Proofs apply ONLY to paths of at most maxSteps, the chosen starting cells,
 * and the supplied movement/rule options. This does not claim unrestricted
 * optimality on a 6x6 board. It deliberately performs no board-only deduplication:
 * cursor, held-cell marks, row-0 origin and path history can affect legality.
 */
import { performance } from "node:perf_hooks";
import { evaluateReference, verifySolution } from "./solver_reference.mjs";

const FOUR_DIRECTIONS = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const EIGHT_DIRECTIONS = [...FOUR_DIRECTIONS, [-1, -1], [-1, 1], [1, -1], [1, 1]];

function lexCompare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function getSpecialRank(evaluation, options) {
  const supplied = options.specials ?? options.specialPriorities ?? options.specialPriority ?? [];
  const slots = Array.isArray(supplied) ? supplied : [supplied];
  let activeIndex = 0;
  const done = Array.from({ length: 3 }, (_, slot) => {
    const special = slots[slot];
    if (!special?.type || special.type === "none") return false;
    return evaluation.specials[activeIndex++]?.satisfied === true;
  });
  // Same business order as Web: 123, 12, 13, 23, 1, 2, 3, none.
  const mask = Number(done[0]) * 4 + Number(done[1]) * 2 + Number(done[2]);
  return [0, 1, 2, 4, 3, 5, 6, 7][mask];
}

function makeRank(evaluation, steps, options) {
  return [
    1,
    ...evaluation.requirements.map((requirement) => Number(requirement.satisfied)),
    getSpecialRank(evaluation, options),
    Number(evaluation.initial_satisfied),
    evaluation.combos,
    -steps,
  ];
}

function normalizeStarts(startCells, useRow0) {
  const requested = startCells ?? Array.from({ length: useRow0 ? 36 : 30 }, (_, i) => {
    const id = i + (useRow0 ? 0 : 6);
    return { r: Math.floor(id / 6), c: id % 6 };
  });
  if (!Array.isArray(requested)) throw new TypeError("startCells must be an array of coordinates.");
  const unique = new Map();
  for (const value of requested) {
    const coordinate = Array.isArray(value) ? { r: value[0], c: value[1] } : { r: value?.r, c: value?.c };
    if (!Number.isInteger(coordinate.r) || !Number.isInteger(coordinate.c) ||
        coordinate.r < 0 || coordinate.r > 5 || coordinate.c < 0 || coordinate.c > 5) {
      throw new TypeError("startCells contains an invalid coordinate.");
    }
    if (!useRow0 && coordinate.r === 0) {
      throw new TypeError("startCells cannot include row 0 when useRow0 is false.");
    }
    unique.set(`${coordinate.r},${coordinate.c}`, coordinate);
  }
  return [...unique.values()];
}

/**
 * Enumerate every legal endpoint and every extendable path up to maxSteps.
 * maxSteps is mandatory; <=4 is recommended on an unrestricted board.
 * maxStates defaults to 100000 attempted paths, including invalid paths.
 * Set timeLimitMs (alias maxRuntimeMs) for an additional offline wall-time cap.
 */
export function enumerateOracle(board, options = {}) {
  if (!Object.hasOwn(options, "maxSteps") || !Number.isInteger(options.maxSteps) ||
      options.maxSteps < 0 || options.maxSteps > 250) {
    throw new TypeError("Explicit maxSteps is required (integer 0..250; <=4 is recommended).");
  }
  const maxStates = options.maxStates ?? 100000;
  if (!Number.isInteger(maxStates) || maxStates < 1) throw new TypeError("maxStates must be a positive integer.");
  const timeLimitMs = options.timeLimitMs ?? options.maxRuntimeMs ?? Infinity;
  if (typeof timeLimitMs !== "number" || Number.isNaN(timeLimitMs) || timeLimitMs < 0) {
    throw new TypeError("timeLimitMs must be a nonnegative number.");
  }
  const diagonal = options.diagonal ?? options.diagonalEnabled ?? true;
  const useRow0 = options.useRow0 ?? true;
  const startCells = normalizeStarts(options.startCells, useRow0);
  const directions = diagonal ? EIGHT_DIRECTIONS : FOUR_DIRECTIONS;
  // Fail malformed board/rule inputs explicitly before attempting an experiment.
  evaluateReference(board, options);
  const started = performance.now();
  const deadline = started + timeLimitMs;
  let stopReason = null;
  let statesVisited = 0;
  let legalEndpoints = 0;
  let extendablePrefixes = 0;
  let maximumDepthVisited = 0;
  let maximumComboSolution = null;
  let maximumSatisfiedComboSolution = null;
  const bySignature = new Map();

  const preferComboThenSteps = (current, incoming) => !current ||
    incoming.combos > current.combos ||
    (incoming.combos === current.combos && incoming.steps < current.steps);

  function visit(path) {
    if (stopReason) return;
    if (statesVisited >= maxStates) { stopReason = "maxStates"; return; }
    if (performance.now() >= deadline) { stopReason = "timeLimitMs"; return; }
    statesVisited++;
    const steps = path.length - 1;
    maximumDepthVisited = Math.max(maximumDepthVisited, steps);
    const verified = verifySolution(board, { path }, { ...options, diagonal, useRow0 });
    if (verified.legal) {
      legalEndpoints++;
      const evaluation = verified.evaluation;
      const signature = `${evaluation.initialCombos}|${evaluation.skyfallCombos}`;
      const rank = makeRank(evaluation, steps, options);
      const candidate = {
        signature,
        path: path.map((coordinate) => ({ ...coordinate })),
        steps,
        combos: evaluation.combos,
        initialCombos: evaluation.initialCombos,
        skyfallCombos: evaluation.skyfallCombos,
        requirements_satisfied: evaluation.requirements_satisfied,
        special_satisfied: evaluation.special_satisfied,
        initial_satisfied: evaluation.initial_satisfied,
        success: evaluation.success,
        rank,
        evaluation,
      };
      const previous = bySignature.get(signature);
      if (!previous || lexCompare(rank, previous.rank) > 0) bySignature.set(signature, candidate);
      if (preferComboThenSteps(maximumComboSolution, candidate)) maximumComboSolution = candidate;
      if (candidate.success && preferComboThenSteps(maximumSatisfiedComboSolution, candidate)) {
        maximumSatisfiedComboSolution = candidate;
      }
    } else {
      // An unmet final END coordinate is the sole error that a longer prefix
      // can repair. In particular, do not prune every path before reaching END.
      const mayReachEnd = verified.errors.length > 0 &&
        verified.errors.every((error) => error === "Path does not finish at END.");
      if (!mayReachEnd) return;
      extendablePrefixes++;
    }
    if (steps === options.maxSteps) return;
    const last = path.at(-1);
    // Row-0 collision is terminal. A row-0 starting coordinate may enter row 1.
    if (last.r === 0 && path.length > 1) return;
    for (const [dr, dc] of directions) {
      const r = last.r + dr;
      const c = last.c + dc;
      if (r < (useRow0 ? 0 : 1) || r > 5 || c < 0 || c > 5) continue;
      path.push({ r, c });
      visit(path);
      path.pop();
      if (stopReason) return;
    }
  }

  for (const coordinate of startCells) {
    visit([coordinate]);
    if (stopReason) break;
  }
  const elapsedMs = performance.now() - started;
  const groups = [...bySignature.values()].sort((a, b) =>
    -lexCompare(a.rank, b.rank) || a.signature.localeCompare(b.signature));
  const exhaustive = stopReason === null;
  return {
    exhaustive,
    optimalityProven: exhaustive,
    stopReason,
    elapsedMs,
    statesVisited,
    legalEndpoints,
    extendablePrefixes,
    maximumDepthVisited,
    maxStates,
    proofScope: {
      maxSteps: options.maxSteps,
      diagonal: Boolean(diagonal),
      useRow0: Boolean(useRow0),
      startCells: startCells.map((coordinate) => ({ ...coordinate })),
      restrictedStartingSet: options.startCells != null,
      ruleProfile: options.ruleProfile ?? null,
      specials: options.specials ?? options.specialPriorities ?? options.specialPriority ?? [],
      initTargetCombo: options.initTargetCombo ?? null,
      skyfall: options.skyfall ?? options.skyfallEnabled ?? false,
      description: "Only paths within this maximum depth and starting set under these rules were considered.",
    },
    best: groups[0] ?? null,
    top10: groups.slice(0, 10),
    groups,
    maximumComboSolution,
    maximumSatisfiedComboSolution,
    maxCombos: maximumComboSolution?.combos ?? null,
    minimumStepsForMaxCombos: maximumComboSolution?.steps ?? null,
  };
}
