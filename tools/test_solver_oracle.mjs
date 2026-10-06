import assert from "node:assert/strict";
import test from "node:test";
import { enumerateOracle } from "./solver_oracle.mjs";
import { verifySolution } from "./solver_reference.mjs";

const sealed = () => Array.from({ length: 6 }, () => Array(6).fill(15));

test("START/END adjacent same-color swap proves five combos with one minimum step", () => {
  // Each play row is a different six-orb line, hence exactly five combos.
  // Only two cells may be touched; START forces the first and END the last.
  const board = sealed();
  for (let r = 1; r < 6; r++) board[r] = Array(6).fill(10 + r - 1);
  board[1][0] = 100;
  board[1][1] = 200;
  const result = enumerateOracle(board, { maxSteps: 3, diagonal: false, useRow0: false, initTargetCombo: 5 });
  assert.equal(result.exhaustive, true);
  assert.equal(result.optimalityProven, true);
  assert.equal(result.maxCombos, 5);
  assert.equal(result.minimumStepsForMaxCombos, 1);
  assert.equal(result.best.success, true);
  assert.deepEqual(result.best.path, [{ r: 1, c: 0 }, { r: 1, c: 1 }]);
  assert.equal(result.groups.length, 1);
  assert.ok(result.extendablePrefixes > 0, "the initial START prefix must remain extendable until END");
});

test("complete depth-two enumeration accounts for diagonal versus orthogonal paths", () => {
  const board = sealed();
  board[2][2] = 0;
  board[2][3] = 1;
  board[3][2] = 2;
  board[3][3] = 3;
  const options = { maxSteps: 2, useRow0: false, startCells: [[2, 2]] };
  const orthogonal = enumerateOracle(board, { ...options, diagonal: false });
  const diagonal = enumerateOracle(board, { ...options, diagonal: true });
  assert.equal(orthogonal.exhaustive, true);
  assert.equal(diagonal.exhaustive, true);
  // In the open 2x2 square: 1 + 2 + 2*2, versus 1 + 3 + 3*3.
  assert.equal(orthogonal.legalEndpoints, 7);
  assert.equal(diagonal.legalEndpoints, 13);
  assert.equal(orthogonal.best.steps, 0);
  assert.equal(diagonal.best.steps, 0);
  assert.equal(diagonal.proofScope.maxSteps, 2);
  assert.equal(diagonal.proofScope.restrictedStartingSet, true);
});

test("diagonal switch changes the proven shortest path to a fixed END", () => {
  const board = sealed();
  board[2][2] = 100;
  board[2][3] = 1;
  board[3][2] = 2;
  board[3][3] = 203;
  const options = { maxSteps: 2, useRow0: false, startCells: [[2, 2]] };
  const orthogonal = enumerateOracle(board, { ...options, diagonal: false });
  const diagonal = enumerateOracle(board, { ...options, diagonal: true });
  assert.equal(orthogonal.optimalityProven, true);
  assert.equal(diagonal.optimalityProven, true);
  assert.equal(orthogonal.best.steps, 2);
  assert.equal(diagonal.best.steps, 1);
  assert.equal(verifySolution(board, orthogonal.best, { ...options, diagonal: false }).legal, true);
  assert.equal(verifySolution(board, diagonal.best, { ...options, diagonal: true }).legal, true);
});

test("node cap preserves found candidates but never claims an optimality proof", () => {
  const board = Array.from({ length: 6 }, () => Array(6).fill(0));
  const result = enumerateOracle(board, { maxSteps: 4, maxStates: 2, useRow0: false, startCells: [[2, 2]] });
  assert.equal(result.statesVisited, 2);
  assert.equal(result.stopReason, "maxStates");
  assert.equal(result.exhaustive, false);
  assert.equal(result.optimalityProven, false);
  assert.ok(result.best);
});

test("zero time budget returns an explicit incomplete result", () => {
  const result = enumerateOracle(sealed(), { maxSteps: 2, timeLimitMs: 0 });
  assert.equal(result.statesVisited, 0);
  assert.equal(result.stopReason, "timeLimitMs");
  assert.equal(result.exhaustive, false);
  assert.equal(result.optimalityProven, false);
  assert.equal(result.best, null);
});

test("exhaustive search may prove no legal path in its restricted scope", () => {
  const board = sealed();
  board[2][2] = 100;
  board[3][3] = 201;
  const result = enumerateOracle(board, { maxSteps: 1, diagonal: false, useRow0: false, startCells: [[2, 2]] });
  assert.equal(result.exhaustive, true);
  assert.equal(result.best, null);
  assert.equal(result.legalEndpoints, 0);
  assert.equal(result.maxCombos, null);
});

test("explicit depth and bounded resources are required; a zero-step scope is supported", () => {
  assert.throws(() => enumerateOracle(sealed()), /Explicit maxSteps/);
  assert.throws(() => enumerateOracle(sealed(), { maxSteps: -1 }), /Explicit maxSteps/);
  assert.throws(() => enumerateOracle(sealed(), { maxSteps: 2, maxStates: Infinity }), /maxStates/);
  assert.throws(() => enumerateOracle(sealed(), { maxSteps: 2, timeLimitMs: -1 }), /timeLimitMs/);
  const board = sealed();
  board[2][2] = 0;
  const result = enumerateOracle(board, { maxSteps: 0, startCells: [[2, 2]], maxStates: 1 });
  assert.equal(result.exhaustive, true, "exactly consuming the cap after all work is still exhaustive");
  assert.equal(result.statesVisited, 1);
  assert.equal(result.best.steps, 0);
});

test("distinct first-plus-cascade signatures remain separate despite equal total combo", () => {
  const board = [
    [-1, -1, -1, -1, -1, -1],
    [3, 0, 1, 3, 3, 1],
    [0, 2, 3, 1, 2, 3],
    [1, 3, 2, 1, 3, 1],
    [2, 3, 1, 1, 3, 3],
    [0, 2, 1, 1, 1, 0],
  ];
  const result = enumerateOracle(board, { maxSteps: 1, skyfall: true, useRow0: false, diagonal: true });
  assert.equal(result.exhaustive, true);
  assert.equal(new Set(result.groups.map((group) => group.signature)).size, result.groups.length);
  const sameTotal = result.groups.some((group, index) => result.groups.slice(index + 1).some((other) =>
    group.combos === other.combos && group.initialCombos !== other.initialCombos));
  assert.equal(sameTotal, true);
  for (const group of result.groups) {
    assert.equal(verifySolution(board, group, { maxSteps: 1, skyfall: true, useRow0: false }).legal, true);
  }
});

test("same combo signature preserves the earlier requirement before minimizing steps", () => {
  const board = Array.from({ length: 6 }, () => Array(6).fill(-1));
  board[4][1] = 10;
  board[4][2] = 1;
  board[5] = [11, 11, 0, 10, 10, -1];
  // No move clears water 3. Dragging the fire downward clears fire 3 instead.
  // Both outcomes have the signature 1+0, but fire has first priority.
  const requirements = [
    { orb: 1, size: 3, count: 1, match: "exact" },
    { orb: 0, size: 3, count: 1, match: "exact" },
  ];
  const options = { maxSteps: 1, startCells: [[4, 2]], diagonal: false, useRow0: false };
  const fireFirst = enumerateOracle(board, { ...options, ruleProfile: { requirements } });
  assert.equal(fireFirst.exhaustive, true);
  assert.equal(fireFirst.groups.length, 1);
  assert.equal(fireFirst.best.steps, 1);
  assert.deepEqual(fireFirst.best.evaluation.requirements.map((req) => req.satisfied), [true, false]);
  const waterFirst = enumerateOracle(board, { ...options, ruleProfile: { requirements: [...requirements].reverse() } });
  assert.equal(waterFirst.best.steps, 0);
  assert.deepEqual(waterFirst.best.evaluation.requirements.map((req) => req.satisfied), [true, false]);
});
