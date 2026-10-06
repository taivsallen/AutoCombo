import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadWebSolver } from './load_web_solver.mjs';

// Equal deterministic work, rather than equal wall time, checks that caching
// and allocation changes preserve the same search before timed refinement.
const old = await loadWebSolver('reports/solver-next-20260909/baseline/App.jsx');
const current = await loadWebSolver();
const cases = JSON.parse(fs.readFileSync('reports/solver-update-20260909/core-ab-delivery.json', 'utf8')).cases;
const normalize = (result) => ({ success: result.success, status: result.status,
  top: result.topCombos.map((sol) => ({ path: sol.path, initial: sol.initialCombos,
    cascade: sol.skyfallCombos, cleared: sol.clearedCount })) });
const rows = [];
for (const item of cases) {
  const cfg = { timeBudgetMs: 0, maxSteps: 6, maxNodes: 1200, beamWidth: 64,
    humanPlanner: false, reversePlanner: false, browserYield: false, evalWorkers: 1,
    searchSeed: item.searchSeed, stepPenalty: 0, potentialWeight: 10, clearedWeight: 300 };
  const args = [item.board, cfg, 8, 'free', 'combo', item.skyfall, item.diagonal,
    item.specials, item.initTargetCombo, item.useRow0, item.ruleProfile];
  const before = normalize(await old.beamSolve(...args));
  const after = normalize(await current.beamSolve(...args));
  assert.deepEqual(after, before, `Fixed-work search changed: ${item.id}`);
  rows.push({ id: item.id, equal: true, groups: after.top.length });
}
const result = { status: 'PASS', scope: 'Same 1200-node / 6-step offline search; no timed refinement',
  sourceMetadata: { baseline: old.sourceMetadata, candidate: current.sourceMetadata }, rows };
fs.writeFileSync('reports/solver-next-20260909/search-equivalence.json', JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ status: result.status, cases: rows.length }) + '\n');
