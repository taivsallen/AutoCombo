import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReference, replayPath, verifySolution } from "./solver_reference.mjs";

const empty = () => Array.from({ length: 6 }, () => Array(6).fill(-1));
const fill = (board, cells, value) => {
  for (const [r, c] of cells) board[r][c] = value;
  return board;
};
const profile = (orbId, rule) => ({ orbRules: Array.from({ length: 6 }, (_, id) => id === orbId ? rule : {}) });
const path = (...cells) => cells.map(([r, c]) => ({ r, c }));

test("ordinary drag swaps complete encoded cells and may revisit a cell", () => {
  const board = empty();
  board[1][0] = 1100; // water, START, N1
  board[1][1] = 2001; // fire, N2
  board[2][1] = 2;
  const before = structuredClone(board);
  const result = replayPath(board, path([1, 0], [1, 1], [2, 1], [1, 1]));
  assert.equal(result.legal, true);
  assert.deepEqual(result.board[1].slice(0, 2), [2001, 1100]);
  assert.equal(result.board[2][1], 2);
  assert.equal(result.steps, 3);
  assert.deepEqual(board, before, "reference replay must not mutate the input");
});

test("row-0 entry copies color, preserves destination marks, and then drags normally", () => {
  const board = empty();
  board[0][0] = 2104; // dark, START, N2; these marks must not be copied
  board[1][0] = 1001; // fire, N1
  board[2][0] = 2;
  const result = replayPath(board, path([0, 0], [1, 0], [2, 0]));
  assert.equal(result.legal, true);
  assert.equal(result.board[0][0], 2104);
  assert.equal(result.board[1][0], 2);
  assert.equal(result.board[2][0], 1004);
});

test("a play-row start ends at row 0, recoloring only the held play cell", () => {
  const board = empty();
  board[0][1] = 2005; // heart, N2; only its color is copied
  board[1][0] = 1001; // held fire, N1
  const result = replayPath(board, path([1, 0], [0, 1]));
  assert.equal(result.legal, true);
  assert.equal(result.board[0][1], 2005);
  assert.equal(result.board[1][0], 1005);
  assert.equal(result.diagonalSteps, 1);
  assert.equal(replayPath(board, path([1, 0], [0, 1]), { diagonal: false }).legal, false);
});

test("row-0 restrictions reject lateral entry, a later collision, and nonterminal exit", () => {
  const board = Array.from({ length: 6 }, () => Array(6).fill(0));
  assert.equal(replayPath(board, path([0, 0], [0, 1])).legal, false);
  assert.equal(replayPath(board, path([0, 0], [1, 0], [0, 0])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [0, 0], [1, 1])).legal, false);
  assert.equal(replayPath(board, path([0, 0], [1, 0]), { useRow0: false }).legal, false);
  assert.equal(replayPath(board, path([0, 0], [2, 0])).legal, false);
});

test("X1 is never touched; X2 is permitted only as the last coordinate", () => {
  const board = empty();
  board[1][0] = 0;
  board[1][1] = 21;
  board[1][2] = 2;
  board[2][0] = 13;
  assert.equal(replayPath(board, path([1, 0], [1, 1])).legal, true);
  assert.equal(replayPath(board, path([1, 0], [1, 1], [1, 2])).legal, false);
  assert.equal(replayPath(board, path([1, 1], [1, 2])).legal, false);
  assert.equal(replayPath(board, path([1, 1])).legal, true);
  assert.equal(replayPath(board, path([1, 0], [2, 0])).legal, false);
  assert.equal(replayPath(board, path([2, 0])).legal, false);
});

test("START and END constrain initial coordinates despite mark movement", () => {
  const board = empty();
  board[1][0] = 100;
  board[1][1] = 1;
  board[1][2] = 202;
  assert.equal(replayPath(board, path([1, 0], [1, 1], [1, 2])).legal, true);
  assert.equal(replayPath(board, path([1, 1], [1, 2])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [1, 1])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [1, 1], [1, 2], [1, 1], [1, 2])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [1, 1], [1, 0], [1, 1], [1, 2])).legal, true);
});

test("step limit counts edges, rejects non-adjacent moves and malformed input", () => {
  const board = Array.from({ length: 6 }, () => Array(6).fill(0));
  assert.equal(replayPath(board, path([1, 0], [1, 1]), { maxSteps: 1 }).legal, true);
  assert.equal(replayPath(board, path([1, 0], [1, 1]), { maxSteps: 0 }).legal, false);
  assert.equal(replayPath(board, path([1, 0]), { maxSteps: 0 }).legal, true);
  assert.equal(replayPath(board, path([1, 0], [1, 0])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [1, 2])).legal, false);
  assert.equal(replayPath(board, path([1, 0], [6, 0])).legal, false);
  assert.equal(replayPath(board, []).legal, false);
  assert.equal(replayPath([[0]], path([0, 0])).legal, false);
});

test("six horizontal orbs are one six-orb combo, never two three-orb combos", () => {
  const board = empty();
  board[0] = Array(6).fill(1); // row 0 cannot create a combo
  board[5] = Array(6).fill(0);
  const result = evaluateReference(board, { skyfall: true });
  assert.equal(result.initialCombos, 1);
  assert.equal(result.initialClearedCount, 6);
  assert.deepEqual(result.initialComboSizeCountsByOrb[0], { 6: 1 });
  assert.equal(result.skyfallCombos, 0);
  assert.deepEqual(result.finalBoard[0], board[0]);
});

test("all six colors support each threshold from one through five", () => {
  for (let kind = 0; kind < 6; kind++) for (let minClear = 1; minClear <= 5; minClear++) {
    const board = empty();
    fill(board, Array.from({ length: minClear }, (_, i) => [5, i]), kind);
    for (const clearMode of ["line", "connected"]) {
      const options = { ruleProfile: profile(kind, { minClear, clearMode }) };
      const result = evaluateReference(board, options);
      assert.equal(result.initialCombos, 1, `orb=${kind}, min=${minClear}, mode=${clearMode}`);
      assert.equal(result.initialClearedCount, minClear);
      if (minClear > 1) {
        const tooShort = structuredClone(board);
        tooShort[5][minClear - 1] = -1;
        assert.equal(evaluateReference(tooShort, options).initialCombos, 0);
      }
    }
  }
});

test("connected mode clears a bent group while line mode does not; diagonals do not connect", () => {
  const board = fill(empty(), [[2, 0], [2, 1], [3, 1], [3, 2]], 1);
  assert.equal(evaluateReference(board).initialCombos, 0);
  const result = evaluateReference(board, { ruleProfile: profile(1, { minClear: 4, clearMode: "connected" }) });
  assert.equal(result.initialCombos, 1);
  assert.equal(result.initialClearedCount, 4);
  const diagonalPair = fill(empty(), [[1, 0], [2, 1]], 0);
  assert.equal(evaluateReference(diagonalPair, { ruleProfile: profile(0, { minClear: 2, clearMode: "connected" }) }).initialCombos, 0);
});

test("adjacent matched lines of one color merge into one combo", () => {
  const board = fill(empty(), [[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]], 2);
  const result = evaluateReference(board);
  assert.equal(result.initialCombos, 1);
  assert.equal(result.groups[0].size, 6);
});

test("N2 cannot clear first, but participates after a real first clear and gravity", () => {
  const board = empty();
  fill(board, [[5, 0], [5, 1], [5, 2]], 1);
  board[4][0] = 2000;
  board[3][1] = 0;
  board[3][2] = 0;
  const firstOnly = evaluateReference(board);
  assert.equal(firstOnly.initialCombos, 1);
  assert.equal(firstOnly.combos, 1);
  const cascade = evaluateReference(board, { skyfall: true });
  assert.equal(cascade.initialCombos, 1);
  assert.equal(cascade.skyfallCombos, 1);
  assert.equal(cascade.clearedCount, 6);
  assert.deepEqual(cascade.batches.map((batch) => batch.groups[0].orb), [1, 0]);
  assert.deepEqual(cascade.batches[1].cleared, [30, 31, 32]);
});

test("N1 stays uncleared during cascades, and N2 does not unlock without a first clear", () => {
  const board = empty();
  fill(board, [[5, 0], [5, 1], [5, 2]], 1);
  board[4][0] = 1000;
  board[3][1] = 0;
  board[3][2] = 0;
  const result = evaluateReference(board, { skyfall: true });
  assert.equal(result.skyfallCombos, 0);
  assert.equal(result.finalBoard[5][0], 1000);
  const locked = fill(empty(), [[5, 0], [5, 1], [5, 2]], 2000);
  assert.equal(evaluateReference(locked, { skyfall: true }).combos, 0);
  const blockedLine = fill(empty(), [[4, 0], [4, 1], [4, 2]], 0);
  blockedLine[4][1] = 1000;
  assert.equal(evaluateReference(blockedLine, { skyfall: true }).combos, 0);
});

test("cross, L and T shields recognize exact five-cell groups and rotations", () => {
  const cases = [
    ["cross", [[1, 2], [2, 1], [2, 2], [2, 3], [3, 2]]],
    ["l", [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3]]],
    ["l", [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3]]],
    ["t", [[1, 1], [1, 2], [1, 3], [2, 2], [3, 2]]],
    ["t", [[1, 3], [2, 1], [2, 2], [2, 3], [3, 3]]],
  ];
  for (const [type, cells] of cases) {
    const board = fill(empty(), cells, 4);
    const result = evaluateReference(board, { specials: [{ type, orb: 4, count: 1 }] });
    assert.equal(result.initialCombos, 1);
    assert.equal(result.initialClearedCount, 5);
    assert.equal(result.special_satisfied, true, type);
    assert.equal(evaluateReference(board, { specials: [{ type, orb: 1 }] }).special_satisfied, false);
  }
});

test("a sixth cleared orb attached to a cross invalidates its exact-five shield", () => {
  const board = fill(empty(), [[1, 2], [2, 1], [2, 2], [2, 3], [3, 2], [2, 4]], 4);
  const result = evaluateReference(board, { specials: [{ type: "cross", orb: -1 }] });
  assert.equal(result.initialClearedCount, 6);
  assert.equal(result.initialCombos, 1);
  assert.equal(result.special_satisfied, false);
});

test("all 3..5 rectangles must be complete groups with the requested orientation", () => {
  for (let m = 3; m <= 5; m++) for (let n = 3; n <= 5; n++) {
    const board = empty();
    for (let r = 1; r <= m; r++) for (let c = 0; c < n; c++) board[r][c] = 3;
    const options = { specials: [{ type: "rect", rectM: m, rectN: n, rectOrb: 3 }] };
    const result = evaluateReference(board, options);
    assert.equal(result.initialCombos, 1);
    assert.equal(result.initialClearedCount, m * n);
    assert.equal(result.special_satisfied, true, `${m}x${n}`);
    if (m !== n) {
      assert.equal(evaluateReference(board, { specials: [{ type: "rect", rectM: n, rectN: m }] }).special_satisfied, false);
    }
    board[m][n - 1] = -1;
    assert.equal(evaluateReference(board, options).special_satisfied, false);
  }
  const attached = empty();
  for (let r = 1; r <= 3; r++) for (let c = 0; c < 4; c++) attached[r][c] = 0;
  assert.equal(evaluateReference(attached, { specials: [{ type: "rect", rectM: 3, rectN: 3 }] }).special_satisfied, false);
});

test("requirements measure exact group sizes and ordered priorities, not consumption batches", () => {
  const board = empty();
  fill(board, [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]], 1);
  fill(board, [[3, 0], [3, 1], [3, 2], [5, 3], [5, 4], [5, 5]], 0);
  const ruleProfile = { requirements: [
    { orb: 1, size: 5, count: 1, match: "exact" },
    { orb: 0, size: 3, count: 2, match: "exact" },
  ] };
  const result = evaluateReference(board, { ruleProfile });
  assert.equal(result.requirements_satisfied, true);
  assert.equal(result.initialCombos, 3);
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.requirements.map((req) => req.got), [1, 2]);
  ruleProfile.requirements[1].count = 1;
  assert.equal(evaluateReference(board, { ruleProfile }).requirements_satisfied, false);
  ruleProfile.requirements[1].match = "atLeast";
  assert.equal(evaluateReference(board, { ruleProfile }).requirements_satisfied, true);
});

test("first-clear count, positive equal-color combos and exact initial target are independently checked", () => {
  const board = empty();
  fill(board, [[1, 0], [1, 1], [1, 2]], 0);
  fill(board, [[3, 3], [3, 4], [3, 5]], 1);
  const specials = [{ type: "clearCount", clearCount: 6 }, { type: "equalFirst", equalOrbs: [0, 1] }];
  const result = evaluateReference(board, { specials, initTargetCombo: 2 });
  assert.equal(result.special_satisfied, true);
  assert.equal(result.initial_satisfied, true);
  assert.equal(evaluateReference(board, { specials, initTargetCombo: 1 }).initial_satisfied, false);
  assert.equal(evaluateReference(board, { specials: [{ type: "equalFirst", equalOrbs: [2, 3] }] }).special_satisfied, false);
  assert.equal(evaluateReference(board, { specials: [{ type: "clearCount", clearCount: 3 }] }).special_satisfied, false);
  assert.throws(() => evaluateReference(board, { specials: Array(4).fill(specials[0]) }), /At most three/);
});

test("verifier rejects missing paths and fabricated combo/step claims, and recomputes success", () => {
  const board = fill(empty(), [[5, 0], [5, 1], [5, 2]], 0);
  assert.equal(verifySolution(board, { success: true }).legal, false);
  const solution = { path: path([5, 0]), combos: 1, initialCombos: 1, skyfallCombos: 0, steps: 0 };
  assert.equal(verifySolution(board, solution, { initTargetCombo: 1 }).success, true);
  const wrongCombo = verifySolution(board, { ...solution, combos: 9 });
  assert.equal(wrongCombo.pathLegal, true);
  assert.equal(wrongCombo.legal, false);
  assert.match(wrongCombo.errors.join(" "), /Reported combos/);
  assert.equal(verifySolution(board, { ...solution, steps: 1 }).legal, false);
  assert.equal(verifySolution(board, { ...solution, initialComboCountsByOrb: [0, 1, 0, 0, 0, 0] }).legal, false);
  assert.equal(verifySolution(board, { ...solution, initialComboCountsByOrb: new Int16Array([1, 0, 0, 0, 0, 0, 0, 0]) }).legal, true);
  assert.equal(verifySolution(board, { ...solution, initialComboSizeCountsByOrb: [{ 6: 1 }, {}, {}, {}, {}, {}] }).legal, false);
  const unmet = verifySolution(board, { ...solution, success: true }, { initTargetCombo: 2 });
  assert.equal(unmet.legal, true);
  assert.equal(unmet.success, false);
});
