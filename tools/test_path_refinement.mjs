import assert from "node:assert/strict";
import test from "node:test";
import { refineSolverPath } from "../src/solver/pathRefinement.js";
import { replayPath, evaluateReference, verifySolution } from "./solver_reference.mjs";

const coords = (cells) => cells.map(([r, c]) => ({ r, c }));
const boardOf = (value = 0) => Array.from({ length: 6 }, () => Array(6).fill(value));
const initial = (board, path, options = {}) => {
  const replay = replayPath(board, path, options);
  assert.equal(replay.legal, true, replay.errors.join("; "));
  return { ...evaluateReference(replay.board, options), path };
};
const keepRequirements = (candidate, current) =>
  candidate.requirements.every((item, index) => !current.requirements[index].satisfied || item.satisfied) &&
  candidate.specials.every((item, index) => !current.specials[index].satisfied || item.satisfied) &&
  (!current.initial_satisfied || candidate.initial_satisfied);
const callbacks = (options = {}) => ({
  evaluate: (board) => evaluateReference(board, options),
  accept: keepRequirements,
});

test("a new two-edge bridge shortens a four-edge detour that no deletion can remove", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const beforeBoard = structuredClone(board);
  const beforeSolution = structuredClone(solution);
  const deletionOnly = refineSolverPath(board, solution, { ...options, ...callbacks(options), bridgeMaxSteps: 1 });
  assert.equal(deletionOnly.improvements, 0);
  assert.equal(deletionOnly.solution.path.length - 1, 4);
  const saved = [];
  const bridged = refineSolverPath(board, solution, { ...options, ...callbacks(options),
    onImprovement: (candidate, detail) => saved.push({ candidate, detail }) });
  assert.deepEqual(bridged.solution.path, coords([[2, 1], [2, 2], [2, 3]]));
  assert.equal(bridged.solution.combos, 1);
  assert.equal(saved[0].detail.kind, "bridge2");
  assert.equal(saved[0].detail.savedSteps, 2);
  assert.equal(verifySolution(board, bridged.solution, options).legal, true);
  assert.deepEqual(board, beforeBoard);
  assert.deepEqual(solution, beforeSolution);
});

test("bridge-only phase does not repeat prefix and suffix deletion work", () => {
  const board = boardOf();
  const path = coords([[2, 1], [2, 2], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const result = refineSolverPath(board, solution, { ...options, ...callbacks(options), bridgesOnly: true });
  assert.equal(result.attempts, 0);
  assert.deepEqual(result.solution.path, path);
  const ordinary = refineSolverPath(board, solution, { ...options, ...callbacks(options) });
  assert.equal(ordinary.solution.path.length - 1, 1);
});

test("eight-direction bridges shorten a six-edge chordless detour", () => {
  const board = boardOf();
  board[3][1] = 100;
  board[3][3] = 200;
  const path = coords([[3, 1], [2, 0], [1, 1], [1, 2], [1, 3], [2, 4], [3, 3]]);
  const options = { diagonal: true, useRow0: false };
  const solution = initial(board, path, options);
  const deletionOnly = refineSolverPath(board, solution, { ...options, ...callbacks(options), bridgeMaxSteps: 1 });
  assert.equal(deletionOnly.improvements, 0);
  const bridged = refineSolverPath(board, solution, { ...options, ...callbacks(options) });
  assert.equal(bridged.solution.path.length - 1, 2);
  assert.equal(verifySolution(board, bridged.solution, options).legal, true);
});

test("a bridge cannot cross X1, and a terminal X2/END remains the final coordinate", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 220;
  board[2][2] = 10;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const result = refineSolverPath(board, solution, { ...options, ...callbacks(options) });
  assert.equal(result.improvements, 0);
  assert.ok(result.invalidPaths > 0);
  assert.deepEqual(result.solution.path, path);
});

test("row0 bridges preserve N1/N2 entry semantics and exact first-clear shield", () => {
  for (const noClear of [1000, 2000]) {
    const board = boardOf();
    board[0][1] = 104;
    board[1][1] = noClear;
    board[1][3] = 200;
    const path = coords([[0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [1, 3]]);
    const ruleProfile = { orbRules: Array.from({ length: 6 }, (_, orb) => ({ minClear: orb === 4 && noClear === 2000 ? 1 : 3, clearMode: "line" })) };
    const options = { diagonal: true, useRow0: true, skyfall: true, ruleProfile,
      specials: [{ type: "clearCount", clearCount: 29 }] };
    const solution = initial(board, path, options);
    assert.equal(solution.initialCombos, 1);
    assert.equal(solution.skyfallCombos, noClear === 1000 ? 0 : 1);
    assert.equal(solution.special_satisfied, true);
    const naiveShortcut = initial(board, coords([[0, 1], [1, 2], [1, 3]]), options);
    if (noClear === 1000) {
      assert.equal(naiveShortcut.initialCombos, 1);
      assert.equal(naiveShortcut.initialClearedCount, 28);
      assert.equal(naiveShortcut.special_satisfied, false, "same-signature shortcut loses the exact first-clear shield");
    } else {
      assert.equal(naiveShortcut.initialCombos, 2, "a different row1 entry loses N2, so dark clears in the first batch");
      assert.equal(naiveShortcut.skyfallCombos, 0);
    }
    const result = refineSolverPath(board, solution, { ...options, ...callbacks(options) });
    assert.equal(result.solution.path.length - 1, 3);
    const checked = verifySolution(board, result.solution, options);
    assert.equal(checked.legal, true);
    assert.equal(checked.special_satisfied, true);
    assert.equal(result.solution.initialCombos, solution.initialCombos);
    assert.equal(result.solution.skyfallCombos, solution.skyfallCombos);
    assert.deepEqual(checked.board[0], board[0]);
  }
});

test("callbacks cannot accept a different first-plus-cascade signature", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  let acceptCalls = 0;
  const result = refineSolverPath(board, solution, { ...options,
    evaluate: () => ({ initialCombos: 0, skyfallCombos: 1, combos: 1 }),
    accept: () => { acceptCalls++; return true; } });
  assert.equal(result.improvements, 0);
  assert.equal(acceptCalls, 0);
  assert.deepEqual(result.solution.path, path);
});

test("a same-signature shortcut that loses a higher-priority requirement is rejected", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  // The injected policy represents an existing satisfied higher-priority goal;
  // the refiner must honor it even when geometry and combo signature improve.
  let acceptCalls = 0;
  const result = refineSolverPath(board, solution, { ...options, ...callbacks(options),
    accept: () => { acceptCalls++; return false; } });
  assert.ok(acceptCalls > 0);
  assert.equal(result.improvements, 0);
  assert.deepEqual(result.solution.path, path);
});

test("evaluation that crosses the shared deadline is discarded before accept or publish", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  let time = 0;
  let accepted = 0;
  let published = 0;
  const result = refineSolverPath(board, solution, { ...options, deadlineAt: 10, now: () => time,
    evaluate: (candidateBoard) => { time = 11; return evaluateReference(candidateBoard, options); },
    accept: () => { accepted++; return true; }, onImprovement: () => { published++; } });
  assert.equal(result.deadlineReached, true);
  assert.equal(result.evaluations, 1);
  assert.equal(result.improvements, 0);
  assert.equal(accepted, 0);
  assert.equal(published, 0);
  assert.deepEqual(result.solution.path, path);
});

test("an improvement is published immediately and survives the next shared stop check", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const published = [];
  const result = refineSolverPath(board, solution, { ...options, ...callbacks(options),
    check: () => published.length > 0,
    onImprovement: (candidate) => published.push(candidate) });
  assert.equal(published.length, 1);
  assert.equal(published[0], result.solution);
  assert.equal(result.solution.path.length - 1, 2);
  assert.equal(result.stopReason, "external");
});

test("attempt limits are explicit and expired calls perform no replay/evaluation work", () => {
  const board = boardOf();
  board[2][1] = 100;
  board[2][3] = 200;
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const capped = refineSolverPath(board, solution, { ...options, ...callbacks(options), maxAttempts: 0 });
  assert.equal(capped.stopReason, "maxAttempts");
  assert.equal(capped.attempts, 0);
  const expired = refineSolverPath(board, solution, { ...options, ...callbacks(options), now: () => 10, deadlineAt: 10 });
  assert.equal(expired.deadlineReached, true);
  assert.equal(expired.attempts, 0);
  assert.equal(expired.evaluations, 0);
  assert.throws(() => refineSolverPath(board, solution, { evaluate: () => ({}) }), /evaluate and accept/);
});

test("unconstrained prefixes and suffixes still shorten while fixed coordinates stay intact", () => {
  const board = boardOf();
  const path = coords([[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]]);
  const options = { diagonal: false, useRow0: false };
  const solution = initial(board, path, options);
  const result = refineSolverPath(board, solution, { ...options, ...callbacks(options) });
  assert.equal(result.solution.path.length - 1, 1);
  assert.equal(verifySolution(board, result.solution, options).legal, true);
});
