import { replaySolverPath } from "./pathReplay.js";

const pointId = (point) => point.r * 6 + point.c;
const samePoint = (a, b) => a.r === b.r && a.c === b.c;
const defaultNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();

function signature(solution) {
  const ev = solution?.evaluation ?? solution?.ev ?? solution;
  const initial = ev?.initialCombos;
  const total = ev?.combos;
  if (!Number.isInteger(initial) || !Number.isInteger(total) || initial < 0 || total < initial) return null;
  if (ev.skyfallCombos != null && ev.skyfallCombos !== total - initial) return null;
  return `${initial}|${total - initial}`;
}

const directions4 = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const directions8 = [...directions4, [-1, -1], [-1, 1], [1, -1], [1, 1]];

/**
 * Shorten one incumbent under the caller's existing absolute deadline.
 *
 * evaluate(board, path, detail) -> evaluation (synchronous)
 * accept(candidate, incumbent, detail) -> boolean (synchronous, required)
 * onImprovement(candidate, detail) immediately publishes each accepted result.
 *
 * Candidates passed to accept/onImprovement are fresh {...evaluation, path}
 * objects: stale ranking caches from the incumbent are deliberately not copied.
 * The module enforces strictly fewer steps and the same initial|cascade combo
 * signature. accept must enforce the caller's complete business-priority rank.
 * Both callbacks must be pure with respect to input paths/boards/incumbents.
 *
 * shouldStop (alias check) returns TRUE when work must stop. Deadline checks
 * precede replay and evaluation and follow evaluation/accept. An evaluation
 * finishing after the deadline is discarded. JavaScript cannot preempt a
 * synchronous callback, so one callback's own running time remains unbounded.
 */
export function refineSolverPath(originalBoard, initialSolution, options = {}) {
  const { evaluate, accept, onImprovement } = options;
  if (typeof evaluate !== "function" || typeof accept !== "function") {
    throw new TypeError("refineSolverPath requires synchronous evaluate and accept callbacks.");
  }
  const now = options.now ?? defaultNow;
  const deadlineAt = options.deadlineAt ?? Infinity;
  const shouldStop = options.shouldStop ?? options.check;
  const maxAttempts = options.maxAttempts ?? 512;
  const maxPasses = options.maxPasses ?? 16;
  const minSteps = options.minSteps ?? 1;
  const maxSteps = options.maxSteps ?? Infinity;
  const bridgeMaxSteps = options.bridgeMaxSteps ?? 2;
  const bridgesOnly = options.bridgesOnly === true;
  if (typeof now !== "function" || (shouldStop != null && typeof shouldStop !== "function") ||
      typeof deadlineAt !== "number" || Number.isNaN(deadlineAt) ||
      !Number.isInteger(maxAttempts) || maxAttempts < 0 ||
      !Number.isInteger(maxPasses) || maxPasses < 0 ||
      !Number.isInteger(minSteps) || minSteps < 0 ||
      (maxSteps !== Infinity && (!Number.isInteger(maxSteps) || maxSteps < minSteps)) ||
      ![1, 2].includes(bridgeMaxSteps)) {
    throw new TypeError("Invalid refinement deadline, limits or callbacks.");
  }
  const diagonal = options.diagonal ?? true;
  const useRow0 = options.useRow0 ?? true;
  const directions = diagonal ? directions8 : directions4;
  let solution = initialSolution;
  let attempts = 0;
  let evaluations = 0;
  let improvements = 0;
  let invalidPaths = 0;
  let duplicateCandidates = 0;
  let passes = 0;
  let stopReason = null;
  const incumbentSignature = signature(initialSolution);
  const result = () => ({ solution, attempts, evaluations, improvements, invalidPaths,
    duplicateCandidates, passes, stopReason, deadlineReached: stopReason === "deadline",
    limitReached: stopReason === "maxAttempts" || stopReason === "maxPasses" });
  const stopped = () => {
    if (stopReason) return true;
    if (now() >= deadlineAt) { stopReason = "deadline"; return true; }
    if (shouldStop?.()) { stopReason = "external"; return true; }
    return false;
  };
  if (stopped()) return result();
  if (!Array.isArray(initialSolution?.path) || initialSolution.path.length - 1 < minSteps ||
      incumbentSignature == null || !replaySolverPath(originalBoard, initialSolution.path, { diagonal, useRow0, maxSteps })) {
    stopReason = "invalid_incumbent";
    return result();
  }
  if (stopped()) return result();

  let fixedStart = false;
  let fixedEnd = false;
  for (const row of originalBoard) for (const cell of row) {
    const mark = cell < 0 ? 0 : Math.floor(cell / 100) % 10;
    if (mark === 1) fixedStart = true;
    if (mark === 2) fixedEnd = true;
  }
  const pathKey = (path) => path.map(pointId).join(",");
  const seen = new Set([pathKey(initialSolution.path)]);
  const adjacent = (a, b) => {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return Math.max(dr, dc) === 1 && (diagonal || dr + dc === 1);
  };
  const validCoordinate = (point) => point.r >= (useRow0 ? 0 : 1) && point.r < 6 && point.c >= 0 && point.c < 6;

  function tryCandidate(path, operation) {
    if (stopped()) return false;
    if (path.length - 1 < minSteps || path.length >= solution.path.length) return false;
    if (attempts >= maxAttempts) { stopReason = "maxAttempts"; return false; }
    const key = pathKey(path);
    if (seen.has(key)) { duplicateCandidates++; return false; }
    seen.add(key);
    attempts++;
    // Replay always begins at the immutable request board. Marks and row-0
    // operations cannot be inferred from geometry or a cached final board.
    const board = replaySolverPath(originalBoard, path, { diagonal, useRow0, maxSteps });
    if (!board) { invalidPaths++; return false; }
    if (stopped()) return false;
    const detail = { ...operation, previousSteps: solution.path.length - 1,
      steps: path.length - 1, savedSteps: solution.path.length - path.length };
    evaluations++;
    const evaluation = evaluate(board, path, detail);
    if (stopped()) return false;
    if (evaluation?.then) throw new TypeError("evaluate must be synchronous.");
    if (signature(evaluation) !== incumbentSignature) return false;
    const candidate = { ...evaluation, path };
    const accepted = accept(candidate, solution, detail);
    if (stopped()) return false;
    if (accepted?.then) throw new TypeError("accept must be synchronous.");
    if (accepted !== true) return false;
    solution = candidate;
    improvements++;
    // Save immediately, before another replay/evaluation can exhaust the budget.
    onImprovement?.(candidate, detail);
    return true;
  }

  let converged = false;
  for (; passes < maxPasses && !stopped();) {
    passes++;
    const path = solution.path;
    if (path.length - 1 <= minSteps) { converged = true; break; }
    let improved = false;
    // Large prefix/suffix deletions are cheapest, and can be skipped entirely
    // when the corresponding immutable coordinate is explicitly constrained.
    if (!bridgesOnly && (!fixedStart || !fixedEnd)) {
      for (let remove = path.length - minSteps - 1; remove >= 1 && !stopped(); remove--) {
        if (!fixedStart && tryCandidate(path.slice(remove), { kind: "prefix", removed: remove })) { improved = true; break; }
        if (!fixedEnd && tryCandidate(path.slice(0, -remove), { kind: "suffix", removed: remove })) { improved = true; break; }
      }
    }
    if (improved) continue;
    // Consider largest windows first. A replacement uses zero edges for a
    // closed loop, one direct edge, or two edges via a potentially NEW cell.
    // New bridge cells are why this can improve a chordless detour that no
    // contiguous path deletion can shorten.
    for (let span = path.length - 1; span >= 2 && !stopped() && !improved; span--) {
      for (let from = 0; from + span < path.length && !stopped() && !improved; from++) {
        const to = from + span;
        const a = path[from];
        const b = path[to];
        const prefix = path.slice(0, from + 1);
        const suffix = path.slice(to + 1);
        if (!bridgesOnly && samePoint(a, b)) {
          improved = tryCandidate([...prefix, ...suffix], { kind: "loop", from, to });
        } else if (!bridgesOnly && adjacent(a, b)) {
          improved = tryCandidate([...prefix, b, ...suffix], { kind: "direct", from, to });
        }
        if (improved || bridgeMaxSteps < 2 || span <= 2 || stopped()) continue;
        const distance = diagonal ? Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c))
          : Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
        if (distance > 2) continue;
        for (const [dr, dc] of directions) {
          if (stopped()) break;
          const middle = { r: a.r + dr, c: a.c + dc };
          if (!validCoordinate(middle) || !adjacent(middle, b)) continue;
          if (tryCandidate([...prefix, middle, b, ...suffix], { kind: "bridge2", from, to, via: middle })) {
            improved = true;
            break;
          }
        }
      }
    }
    if (!improved) { converged = true; break; }
  }
  if (!stopReason && !converged && passes >= maxPasses && solution.path.length - 1 > minSteps) stopReason = "maxPasses";
  return result();
}
