import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERFORMANCE_PRESETS,
  getPerformancePreset,
  getPerformanceSettings,
  getPerformanceLevelFromConfig,
} from '../src/solver/performanceLevels.js';
import { loadWebSolver } from './load_web_solver.mjs';
import { verifySolution } from './solver_reference.mjs';

test('Lv1 to Lv5 provide increasing request budgets from 160 to 3200 ms', () => {
  assert.deepEqual(PERFORMANCE_PRESETS.map((preset) => preset.level), [1, 2, 3, 4, 5]);
  assert.deepEqual(PERFORMANCE_PRESETS.map((preset) => preset.timeBudgetMs),
    [160, 400, 800, 1600, 3200]);
  for (const [index, preset] of PERFORMANCE_PRESETS.entries()) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.finalReserveMs > 0);
    assert.ok(preset.repairReserveMs > preset.finalReserveMs);
    assert.ok(preset.repairReserveMs < preset.timeBudgetMs);
    assert.ok(preset.repairMaxAttempts > 0);
    if (index > 0) {
      const previous = PERFORMANCE_PRESETS[index - 1];
      assert.ok(preset.beamWidth >= previous.beamWidth);
      assert.ok(preset.maxNodes > previous.maxNodes);
      assert.ok(preset.repairMaxAttempts > previous.repairMaxAttempts);
    }
  }
});

test('profile selection applies every search setting and preserves independent user settings', () => {
  const original = {
    ...getPerformanceSettings(1),
    maxSteps: 17,
    hardStepLimitEnabled: true,
    hardStepLimit: 23,
    replaySpeed: 330,
    searchSeed: 90210,
    humanPlanner: false,
  };
  const selected = { ...original, ...getPerformanceSettings(5) };
  for (const [key, value] of Object.entries(getPerformanceSettings(5))) {
    assert.equal(selected[key], value, key);
  }
  for (const key of ['maxSteps', 'hardStepLimitEnabled', 'hardStepLimit',
    'replaySpeed', 'searchSeed', 'humanPlanner']) {
    assert.equal(selected[key], original[key], key);
  }
  assert.equal(original.timeBudgetMs, 160);
  assert.equal(selected.timeBudgetMs, 3200);
  assert.equal('level' in selected, false);
  assert.equal('label' in selected, false);
});

test('resetting with Lv1 settings clears all high-level budget and refinement overrides', () => {
  const selected = { ...getPerformanceSettings(5), hardStepLimit: 37 };
  const reset = { ...selected, ...getPerformanceSettings(1) };
  assert.equal(reset.hardStepLimit, 37);
  for (const [key, value] of Object.entries(getPerformanceSettings(1))) {
    assert.equal(reset[key], value, key);
  }
  assert.equal(getPerformanceLevelFromConfig(reset.beamWidth, reset.maxNodes,
    reset.timeBudgetMs), 1);
});

test('configuration budget determines displayed level even with a legacy beam width', () => {
  for (const preset of PERFORMANCE_PRESETS) {
    assert.equal(getPerformanceLevelFromConfig(2000, 400000, preset.timeBudgetMs),
      preset.level);
    assert.equal(getPerformanceLevelFromConfig(preset.beamWidth, preset.maxNodes),
      preset.level);
  }
  assert.equal(getPerformanceLevelFromConfig(550, 90000, 160), 1);
});

test('missing level selects Lv1; selected settings cannot mutate shared presets', () => {
  for (const level of [undefined, null, '', NaN, 'invalid', 0]) {
    assert.equal(getPerformancePreset(level).level, 1);
  }
  assert.equal(getPerformancePreset(-2).level, 1);
  assert.equal(getPerformancePreset(8).level, 5);
  assert.equal(getPerformancePreset('3').level, 3);
  const settings = getPerformanceSettings(5);
  settings.timeBudgetMs = 1;
  assert.equal(getPerformanceSettings(5).timeBudgetMs, 3200);
  assert.ok(Object.isFrozen(PERFORMANCE_PRESETS));
  assert.ok(PERFORMANCE_PRESETS.every(Object.isFrozen));
});

const solver = await loadWebSolver();
const rows = () => Array.from({ length: 6 }, (_, row) => Array(6).fill(row));
const solve = (board, level, overrides = {}) => solver.beamSolve(board, {
  ...getPerformanceSettings(level),
  maxSteps: 1,
  humanPlanner: false,
  reversePlanner: false,
  evalWorkers: 1,
  browserYield: false,
  ...overrides,
}, 8, 'free', 'combo', false, false, [], -1, false, null);

test('an expired absolute request deadline is respected at every performance level', async () => {
  for (const preset of PERFORMANCE_PRESETS) {
    const result = await solve(rows(), preset.level, { deadlineAt: performance.now() - 1000 });
    assert.equal(result.status, 'no_candidate', `Lv${preset.level}`);
    assert.equal(result.success, false);
    assert.equal(result.deadlineReached, true);
    assert.equal(result.optimalityProven, false);
    assert.deepEqual(result.topCombos, []);
    assert.deepEqual(result.path, []);
    assert.equal(result.timeBudgetMs, preset.timeBudgetMs);
  }
});

test('a superseded Lv5 request performs no search or refinement', async () => {
  const result = await solve(rows(), 5, { maxSteps: 80, shouldStop: () => true });
  assert.equal(result.cancelled, true);
  assert.equal(result.status, 'no_candidate');
  assert.equal(result.nodesExpanded, 0);
  assert.equal(result.repairAttempts, 0);
});

test('cancelling after search progress preserves legal incumbents and skips refinement', async () => {
  let cancelled = false;
  const board = rows();
  const result = await solver.beamSolve(board, {
    ...getPerformanceSettings(5), maxSteps: 80, browserYield: false,
    humanPlanner: false, reversePlanner: false, shouldStop: () => cancelled,
  }, 8, 'free', 'steps', true, true, [], -1, false, null,
  ({ current }) => { if (current > 0) cancelled = true; });
  assert.equal(result.cancelled, true);
  assert.ok(result.nodesExpanded > 0);
  assert.ok(result.nodesExpanded < getPerformancePreset(5).maxNodes);
  assert.equal(result.repairAttempts, 0);
  assert.ok(result.topSteps.length > 0);
  for (const solution of result.topSteps) {
    assert.equal(verifySolution(board, solution, { useRow0: false, skyfall: true, diagonal: true }).legal, true);
  }
});

test('Lv5 returns early after exhausting a fully blocked board instead of waiting for its budget', async () => {
  const board = rows().map((row) => row.map((cell) => cell + 10));
  const result = await solve(board, 5, { maxSteps: 30 });
  assert.equal(result.status, 'no_candidate');
  assert.equal(result.nodesExpanded, 0);
  assert.equal(result.success, false);
  assert.deepEqual(result.path, []);
  assert.deepEqual(result.topCombos, []);
  // This checks eager termination, not a machine-specific latency target.
  // A 75% reserve below the full Lv5 budget tolerates slow test hosts.
  assert.ok(result.runtimeMs < getPerformancePreset(5).timeBudgetMs / 4,
    `blocked board took ${result.runtimeMs} ms`);
});

test('each level returns legal short paths without spending its full available budget', async () => {
  for (const preset of PERFORMANCE_PRESETS) {
    const board = rows();
    const result = await solve(board, preset.level);
    assert.equal(result.status, 'best_found', `Lv${preset.level}`);
    assert.equal(result.success, true);
    assert.equal(result.timeBudgetMs, preset.timeBudgetMs);
    assert.deepEqual(result.searchParameters, {
      beamWidth: preset.beamWidth,
      maxNodes: preset.maxNodes,
      searchReserveMs: preset.repairReserveMs,
      finalReserveMs: preset.finalReserveMs,
      repairMaxAttempts: preset.repairMaxAttempts,
    });
    assert.ok(result.topCombos.length > 0);
    for (const solution of result.topCombos) {
      const verdict = verifySolution(board, solution, {
        useRow0: false, skyfall: false, diagonal: false, maxSteps: 1,
      });
      assert.equal(verdict.legal, true, JSON.stringify(verdict.errors));
      assert.ok(solution.path.length - 1 <= 1);
    }
  }
});
