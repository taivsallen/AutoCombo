import assert from "node:assert/strict";
import test from "node:test";
import { estimateComboUpperBound } from "../src/solver/comboBound.js";

const profile = (minClear) => ({ orbRules: Array.from({ length: 6 }, () => ({ minClear })) });
const boardOf = (playable, row0 = Array(6).fill(-1)) => [row0.slice(),
  ...Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 6 }, (_, col) => playable[row * 6 + col] ?? -1))];

test("minClear one has at most 30 combos; row0 never adds a 31st bead", () => {
  const board = boardOf(Array(30).fill(0), Array(6).fill(1));
  for (const phase of ["initial", "total"]) {
    const result = estimateComboUpperBound(board, { ruleProfile: profile(1), phase });
    assert.equal(result.upperBound, 30);
    assert.equal(result.metadata.eligibleOrbCount, 30);
    assert.equal(result.optimalityProven, false);
    assert.equal(result.reachabilityProven, false);
  }
});

test("without row0 the bound is the sum of per-type stock divided by minimum", () => {
  const board = boardOf([0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2]);
  const rules = { orbRules: [{ minClear: 3 }, { minClear: 2 }, { minClear: 1 }] };
  assert.equal(estimateComboUpperBound(board, { useRow0: false, ruleProfile: rules }).upperBound, 5);
});

test("row0 replaces one eligible type and cannot add stock", () => {
  // 0:2, 1:4 => 1 group; replace one 1 with 0 => 3+3 => 2 groups.
  const board = boardOf([0, 0, 1, 1, 1, 1], [0, -1, -1, -1, -1, -1]);
  const before = JSON.stringify(board);
  const result = estimateComboUpperBound(board);
  assert.equal(result.metadata.baseUpperBound, 1);
  assert.equal(result.upperBound, 2);
  assert.deepEqual(result.metadata.relaxedBestRecolor, { fromType: 1, toType: 0 });
  assert.equal(result.metadata.eligibleOrbCount, 6);
  assert.equal(JSON.stringify(board), before);
  assert.equal(estimateComboUpperBound(board, { useRow0: false }).upperBound, 1);
});

test("row0 can be used at most once even when multiple source types are available", () => {
  // Two types each need one more bead, but only one replacement is permitted.
  const board = boardOf([0, 0, 1, 1, 2, 2, 2, 2, 2], [0, 1, 0, 1, 0, 1]);
  assert.equal(estimateComboUpperBound(board).upperBound, 2);
});

test("N1 is excluded in both phases and N2 only in the initial phase", () => {
  const board = boardOf([0, 0, 1000, 2000]);
  assert.equal(estimateComboUpperBound(board, { phase: "initial" }).upperBound, 0);
  assert.equal(estimateComboUpperBound(board, { phase: "total" }).upperBound, 1);
  assert.equal(estimateComboUpperBound(board, { phase: "initial", ruleProfile: profile(1) }).upperBound, 2);
  assert.equal(estimateComboUpperBound(board, { phase: "total", ruleProfile: profile(1) }).upperBound, 3);
});

test("recoloring does not unlock a destination N1 or initial N2", () => {
  for (const mark of [1000, 2000]) {
    const board = boardOf([0, 0, mark + 1], [0, -1, -1, -1, -1, -1]);
    assert.equal(estimateComboUpperBound(board, { phase: "initial" }).upperBound, 0);
    assert.equal(estimateComboUpperBound(board, { phase: "total" }).upperBound, mark === 1000 ? 0 : 1);
  }
});

test("source N1 and N2 permit TYPE copying, while source X1 does not", () => {
  for (const source of [1000, 2000, 20]) {
    const board = boardOf([0, 0, 1, 1, 1, 1], [source, -1, -1, -1, -1, -1]);
    assert.equal(estimateComboUpperBound(board, { phase: "initial" }).upperBound, 2);
  }
  const board = boardOf([0, 0, 1, 1, 1, 1], [1010, 2010, 10, -1, -1, -1]);
  assert.equal(estimateComboUpperBound(board).upperBound, 1);
});

test("START, END and movement restrictions are relaxed for an upper bound", () => {
  const board = boardOf([100, 200, 10, 20, 0, 0], [0, -1, -1, -1, -1, -1]);
  assert.equal(estimateComboUpperBound(board, { useRow0: false }).upperBound, 2);
});

test("minClear one through five and runtime rule contexts are supported", () => {
  const board = boardOf(Array(30).fill(0));
  for (let min = 1; min <= 5; min++) {
    assert.equal(estimateComboUpperBound(board, { ruleProfile: profile(min) }).upperBound, Math.floor(30 / min));
  }
  const context = { profile: profile(3), minClearByOrb: [5, 3, 3, 3, 3, 3] };
  assert.equal(estimateComboUpperBound(board, { ruleProfile: context }).upperBound, 6);
});

test("empty boards stay zero and malformed boards or phases are rejected", () => {
  assert.equal(estimateComboUpperBound(boardOf([]), { ruleProfile: profile(1) }).upperBound, 0);
  assert.throws(() => estimateComboUpperBound([[0]]), TypeError);
  assert.throws(() => estimateComboUpperBound(boardOf([6])), TypeError);
  assert.throws(() => estimateComboUpperBound(boardOf([]), { phase: "skyfall" }), TypeError);
});
