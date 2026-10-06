import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWebSolver } from './load_web_solver.mjs';
import { verifySolution } from './solver_reference.mjs';
import { replaySolverPath } from '../src/solver/pathReplay.js';

const solver = await loadWebSolver();
const rows = () => Array.from({ length: 6 }, (_, r) => Array(6).fill(r % 6));
const config = { timeBudgetMs: 0, maxSteps: 4, maxNodes: 300, beamWidth: 40,
  humanPlanner: false, reversePlanner: false, evalWorkers: 1, browserYield: false };
const solve = (board, options = {}) => solver.beamSolve(board,
  { ...config, ...options.config }, 8, 'free', options.priority || 'combo',
  options.skyfall ?? true, options.diagonal ?? true, options.specials || [],
  options.initTargetCombo ?? -1, options.useRow0 ?? true, options.ruleProfile || null);

test('path repair rejects malformed coordinates and empty-cell traversal', () => {
  const board = rows();
  assert.equal(replaySolverPath(board, [null, { r: 1, c: 0 }]), null);
  assert.equal(replaySolverPath(board, [{ r: 1, c: 0 }, { r: 9, c: 0 }]), null);
  board[1][1] = -1;
  assert.equal(replaySolverPath(board, [{ r: 1, c: 0 }, { r: 1, c: 1 }]), null);
});

test('disabled first-combo target is satisfied and every returned endpoint replays', async () => {
  const board = rows();
  board[1][0] += 100;
  board[1][1] += 200;
  const result = await solve(board, { useRow0: false });
  assert.equal(result.status, 'best_found');
  assert.equal(result.success, true);
  assert.equal(result.combos, 5);
  assert.equal(result.path.length - 1, 1);
  const signatures = new Set();
  for (const solution of result.topCombos) {
    const verified = verifySolution(board, solution, { useRow0: false, skyfall: true });
    assert.equal(verified.legal, true, JSON.stringify(verified.errors));
    const signature = `${solution.initialCombos}+${solution.skyfallCombos}`;
    assert.equal(signatures.has(signature), false);
    signatures.add(signature);
  }
});

test('an unmet enabled first-combo target is not reported successful', async () => {
  const result = await solve(rows(), { useRow0: false, initTargetCombo: 30 });
  assert.equal(result.success, false);
  assert.equal(result.status, 'best_found');
});

test('row0 start never returns to row0; type copy keeps destination marks', async () => {
  const board = rows();
  board[0][0] = 101;
  board[1][0] = 2002;
  const path = [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }];
  const replay = replaySolverPath(board, path);
  assert.equal(replay[0][0], 101);
  assert.equal(replay[1][1], 2001);
  assert.equal(replaySolverPath(board, [...path, { r: 0, c: 1 }]), null);
  const result = await solve(board);
  for (const solution of result.topCombos) {
    assert.deepEqual(solution.path[0], { r: 0, c: 0 });
    assert.ok(solution.path.slice(1).every((p) => p.r >= 1));
    assert.equal(verifySolution(board, solution, { skyfall: true, useRow0: true }).legal, true);
  }
});

test('X1, X2, fixed endpoint, and diagonal constraints survive replay', async () => {
  const board = rows();
  board[2][2] += 100;
  board[2][3] += 220; // END plus terminal-only X2.
  board[1][2] += 10;
  const result = await solve(board, { diagonal: false, useRow0: false });
  assert.equal(result.status, 'best_found');
  for (const solution of result.topCombos) {
    assert.deepEqual(solution.path.at(-1), { r: 2, c: 3 });
    assert.equal(verifySolution(board, solution, { diagonal: false, useRow0: false, skyfall: true }).legal, true);
  }
});

test('fully blocked board returns no_candidate, never a false success', async () => {
  const board = rows().map((r) => r.map((cell) => cell + 10));
  const result = await solve(board);
  assert.equal(result.status, 'no_candidate');
  assert.equal(result.success, false);
  assert.deepEqual(result.path, []);
  assert.deepEqual(result.topCombos, []);
});

test('elapsed request deadline returns without pretending a result exists', async () => {
  const result = await solve(rows(), { config: { timeBudgetMs: 160, deadlineAt: performance.now() - 1 } });
  assert.equal(result.deadlineReached, true);
  assert.equal(result.status, 'no_candidate');
  assert.equal(result.optimalityProven, false);
});

test('ordinary timed solve returns only independently verified candidates', async () => {
  const board = [ [0,1,2,3,4,5], [0,2,1,3,2,4], [1,2,4,3,5,0],
    [3,0,1,2,4,1], [1,5,3,2,0,4], [2,4,5,1,0,3] ];
  const result = await solve(board, { config: { timeBudgetMs: 160, maxSteps: 30, maxNodes: 20000, beamWidth: 120 } });
  assert.ok(Number.isFinite(result.runtimeMs));
  assert.equal(result.timeBudgetMs, 160);
  assert.equal(result.deadlineMiss, result.runtimeMs > 160);
  for (const solution of result.topCombos) {
    const verdict = verifySolution(board, solution, { useRow0: true, skyfall: true });
    assert.equal(verdict.legal, true, JSON.stringify(verdict.errors));
  }
});
