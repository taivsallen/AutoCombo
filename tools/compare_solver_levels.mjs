#!/usr/bin/env node
// Real Web solver, native deadline, independent replay. Run timing experiments
// alone: concurrent builds/tests/other solver benchmarks invalidate latency data.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as parser from '@babel/parser';
import { loadWebSolver } from './load_web_solver.mjs';
import { verifyNative, compareRanks, canonicalTop10, compareTrialPair,
  summarizeTrials, summarizePairs } from './compare_solver_round2.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const clone = (value) => structuredClone(value);
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const baseConfig = { maxSteps: 80, hardStepLimitEnabled: false, hardStepLimit: 80,
  evalWorkers: 1, browserYield: false, humanPlanner: true, reversePlanner: true,
  reverseMaxSteps: 60, deferMoveMaterialization: true, cheapLocalGuidance: true,
  cheapLegacyReserve: 0.25, cheapEvalScale: 2, cheapEvalConstraintScale: 2.5,
  stepPenalty: 0, potentialWeight: 10, clearedWeight: 300 };

export function normalizeProfiles(value) {
  const container = value?.PERFORMANCE_PRESETS ?? value?.profiles ?? value;
  const entries = Array.isArray(container) ? container : Object.entries(container ?? {}).map(([key, item]) =>
    ({ level: Number(String(key).replace(/^Lv/i, '')), ...item }));
  const profiles = entries.map((item) => ({ ...item, level: Number(item.level), timeBudgetMs: Number(item.timeBudgetMs) }));
  assert.ok(profiles.length > 0, 'At least one level profile is required');
  assert.equal(new Set(profiles.map((item) => item.level)).size, profiles.length, 'Duplicate profile level');
  for (const profile of profiles) {
    assert.ok(Number.isInteger(profile.level) && profile.level >= 1 && profile.level <= 5, 'Level must be 1..5');
    assert.ok(Number.isFinite(profile.timeBudgetMs) && profile.timeBudgetMs >= 160 && profile.timeBudgetMs <= 3200,
      'timeBudgetMs must be between 160 and 3200');
    for (const field of ['beamWidth', 'maxNodes', 'repairReserveMs', 'repairMaxAttempts']) if (profile[field] != null) {
      assert.ok(Number.isFinite(profile[field]) && profile[field] >= 0, `Invalid ${field}`);
    }
  }
  return profiles.sort((a, b) => a.level - b.level);
}

export function normalizeCase(value, index, priority = 'steps') {
  assert.ok(Array.isArray(value.board) && value.board.length === 6 && value.board.every((row) =>
    Array.isArray(row) && row.length === 6 && row.every(Number.isInteger)), `Case ${index} must have a 6x6 integer board`);
  const maxSteps = value.maxSteps ?? value.config?.maxSteps ?? 80;
  assert.ok(Number.isInteger(maxSteps) && maxSteps >= 0 && maxSteps <= 500, `Case ${index}: invalid maxSteps`);
  return { ...clone(value), id: value.id ?? `case-${index + 1}`, scenario: value.scenario ?? 'fixture',
    boardIndex: value.boardIndex ?? index, boardHash: hash(JSON.stringify(value.board)),
    searchSeed: Number(value.searchSeed ?? index) >>> 0, diagonal: value.diagonal ?? true,
    skyfall: value.skyfall ?? true, useRow0: value.useRow0 ?? false,
    initTargetCombo: value.initTargetCombo ?? 6, target: value.target ?? 10,
    mode: value.mode ?? 'free', fixturePriority: value.priority ?? null,
    priority: priority === 'fixture' ? value.priority ?? 'steps' : priority, maxSteps,
    ruleProfile: clone(value.ruleProfile ?? { orbRules: Array.from({ length: 6 }, () =>
      ({ minClear: 3, clearMode: 'line' })), requirements: [] }), specials: clone(value.specials ?? []) };
}

export function levelOrder(profiles, blockIndex) {
  const rotated = profiles.map((_, index) => profiles[(index + blockIndex) % profiles.length]);
  return Math.floor(blockIndex / profiles.length) % 2 ? rotated.reverse() : rotated;
}

function args(argv) {
  const values = {};
  const flags = new Set(['--help', '--self-test', '--prepare-only']);
  const allowed = new Set(['--fixture-report', '--repeats', '--out', '--source', '--profiles', '--levels', '--max-cases', '--priority', '--warmups']);
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (flags.has(key)) { values[key] = true; continue; }
    if (!allowed.has(key)) throw new Error(`Unknown option ${key}`);
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
    values[key] = argv[++index];
  }
  const integer = (key, fallback, min = 1) => {
    const value = Number(values[key] ?? fallback);
    if (!Number.isInteger(value) || value < min) throw new Error(`Invalid ${key}`);
    return value;
  };
  const priority = values['--priority'] ?? 'steps';
  if (!['steps', 'combo', 'fixture'].includes(priority)) throw new Error('--priority must be steps, combo, or fixture');
  const levels = (values['--levels'] ?? '1,2,3,4,5').split(',').map(Number);
  if (!levels.every((level) => Number.isInteger(level) && level >= 1 && level <= 5)) throw new Error('--levels must be a comma-separated subset of 1..5');
  return { fixtureReport: path.resolve(values['--fixture-report'] ?? 'reports/solver-next-20260909/holdout-final.json'),
    repeats: integer('--repeats', 1), warmups: integer('--warmups', 1, 0),
    maxCases: values['--max-cases'] ? integer('--max-cases', 1) : null, levels,
    out: path.resolve(values['--out'] ?? 'reports/solver-levels-20260909/levels-comparison.json'),
    source: path.resolve(values['--source'] ?? 'src/App.jsx'), profiles: values['--profiles'] ? path.resolve(values['--profiles']) : null,
    priority, selfTest: !!values['--self-test'], prepareOnly: !!values['--prepare-only'], help: !!values['--help'] };
}

async function loadVariant(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const globals = {};
  const dependencies = [];
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || !statement.source.value.startsWith('./solver/')) continue;
    const relative = statement.source.value + (path.extname(statement.source.value) ? '' : '.js');
    const adjacent = path.resolve(path.dirname(sourcePath), relative);
    const resolved = fs.existsSync(adjacent) ? adjacent : path.resolve('src', relative);
    const sha256 = fileHash(resolved);
    const imported = await import(`${pathToFileURL(resolved).href}?levels=${sha256}`);
    for (const specifier of statement.specifiers) {
      globals[specifier.local.name] = specifier.type === 'ImportNamespaceSpecifier' ? imported :
        specifier.type === 'ImportDefaultSpecifier' ? imported.default : imported[specifier.imported.name];
      if (globals[specifier.local.name] === undefined) throw new Error(`Missing solver binding ${specifier.local.name}`);
    }
    dependencies.push({ path: resolved, sha256, source: resolved === adjacent ? 'source_adjacent' : 'workspace_fallback' });
  }
  const solver = await loadWebSolver(sourcePath, globals);
  assert.equal(solver.sourceMetadata.sha256, hash(source), 'Source changed while loading');
  return { solver, metadata: { ...solver.sourceMetadata, dependencies } };
}

function nativeMetadata(result) {
  return Object.fromEntries(Object.entries(result ?? {}).filter(([key, value]) =>
    /runtime|timing|elapsed|duration|stage|repair|nodesExpanded|searchParameters|deadline|budget|comboBounds|status|success/i.test(key) &&
    value !== undefined && typeof value !== 'function').map(([key, value]) => [key, clone(value)]));
}

function caseConfig(config, profile, testCase) {
  const merged = { ...config, ...testCase.config, ...profile, maxSteps: testCase.maxSteps, searchSeed: testCase.searchSeed };
  delete merged.deadlineAt;
  delete merged.label;
  return merged;
}

async function runCore(loaded, testCase, profile, config, repeat, executionOrder) {
  const board = clone(testCase.board), rules = clone(testCase.ruleProfile), specials = clone(testCase.specials);
  const cfg = caseConfig(config, profile, testCase);
  let result = null, error = null;
  const startedAt = performance.now();
  cfg.deadlineAt = startedAt + profile.timeBudgetMs;
  try {
    result = await loaded.solver.beamSolve(board, cfg, testCase.target, testCase.mode, testCase.priority,
      testCase.skyfall, testCase.diagonal, specials, testCase.initTargetCombo, testCase.useRow0, rules, null);
  } catch (caught) { error = caught?.stack ?? String(caught); }
  const elapsedCoreMs = performance.now() - startedAt;
  return { level: profile.level, variant: `Lv${profile.level}`, caseId: testCase.id, scenario: testCase.scenario,
    repeat, executionOrder, elapsedCoreMs, budgetMs: profile.timeBudgetMs,
    budgetUtilization: elapsedCoreMs / profile.timeBudgetMs,
    unusedBudgetMs: Math.max(0, profile.timeBudgetMs - elapsedCoreMs),
    deadlineMiss: elapsedCoreMs > profile.timeBudgetMs,
    onTimeReturn: !!result && !error && elapsedCoreMs <= profile.timeBudgetMs, error, result };
}

function analyzeRun(run, testCase, config) {
  const poolName = testCase.priority === 'steps' ? 'topSteps' : 'topCombos';
  const rawTop10 = clone(Array.isArray(run.result?.[poolName]) ? run.result[poolName] : []);
  const verifiedTop10 = rawTop10.map((solution, originalIndex) => ({ originalIndex, ...verifyNative(testCase, solution, config) }));
  const canonical = canonicalTop10(verifiedTop10);
  const bestBySignature = new Map(canonical.map((item) => [item.signature, item]));
  const nativeViolations = { illegal: 0, duplicateGroups: 0, outOfOrderPairs: 0, inferiorDuplicateRepresentative: 0 };
  const seen = new Set();
  verifiedTop10.forEach((item, index) => {
    if (!item.legal) { nativeViolations.illegal++; return; }
    if (seen.has(item.signature)) nativeViolations.duplicateGroups++;
    seen.add(item.signature);
    if (verifiedTop10[index - 1]?.legal && compareRanks(item.rank, verifiedTop10[index - 1].rank) > 0) nativeViolations.outOfOrderPairs++;
    if (compareRanks(bestBySignature.get(item.signature).rank, item.rank) > 0) nativeViolations.inferiorDuplicateRepresentative++;
  });
  const { result, ...timing } = run;
  return { ...timing, nativePoolName: poolName, rawTop10, verifiedTop10,
    nativeTop10: verifiedTop10, canonicalTop10: canonical, nativeViolations,
    nativeMetadata: nativeMetadata(result), nativeClaimedSuccess: result?.success ?? null,
    nativeBest: result?.path?.length ? verifyNative(testCase, result, config) : null };
}

function summarizeLevel(trials) {
  const stageKeys = [...new Set(trials.flatMap((trial) => Object.keys(trial.nativeMetadata?.stageTimingsMs ?? {})))];
  return { ...summarizeTrials(trials), meanBudgetUtilization: mean(trials.map((trial) => trial.budgetUtilization)),
    meanUnusedBudgetMs: mean(trials.map((trial) => trial.unusedBudgetMs)),
    meanNodesExpanded: mean(trials.map((trial) => trial.nativeMetadata?.nodesExpanded).filter(Number.isFinite)),
    meanStagesMs: Object.fromEntries(stageKeys.map((key) => [key,
      mean(trials.map((trial) => trial.nativeMetadata?.stageTimingsMs?.[key]).filter(Number.isFinite))])) };
}

function selfTest() {
  const board = Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => (row + col) % 6));
  const testCase = normalizeCase({ board, priority: 'combo' }, 0);
  assert.equal(testCase.priority, 'steps');
  assert.equal(testCase.fixturePriority, 'combo');
  assert.equal(testCase.maxSteps, 80);
  assert.equal(normalizeCase({ board, maxSteps: 3 }, 0).maxSteps, 3);
  assert.equal(normalizeCase({ board, priority: 'combo' }, 0, 'fixture').priority, 'combo');
  const profiles = normalizeProfiles({ Lv1: { timeBudgetMs: 160 }, Lv5: { timeBudgetMs: 3200 } });
  assert.deepEqual(profiles.map((item) => item.level), [1, 5]);
  assert.throws(() => normalizeProfiles([{ level: 1, timeBudgetMs: 3201 }]));
  assert.throws(() => normalizeProfiles([{ level: 1, timeBudgetMs: 160 }, { level: 1, timeBudgetMs: 160 }]));
  const five = Array.from({ length: 5 }, (_, index) => ({ level: index + 1, timeBudgetMs: 160 * 2 ** index }));
  for (let position = 0; position < 5; position++) assert.equal(new Set(five.map((_, block) => levelOrder(five, block)[position].level)).size, 5);
  assert.notDeepEqual(levelOrder(five, 0), levelOrder(five, 5));
  const solution = { path: [{ r: 1, c: 0 }, { r: 1, c: 1 }] };
  const verified = verifyNative(testCase, solution, { maxSteps: 80 });
  assert.equal(verified.legal, true);
  assert.equal(verified.steps, 1);
  const run = { result: { topSteps: [solution] }, elapsedCoreMs: 159, budgetMs: 160, onTimeReturn: true, deadlineMiss: false };
  const row = analyzeRun(run, testCase, { maxSteps: 80 });
  assert.equal(row.rawTop10.length, 1);
  assert.equal(row.verifiedTop10[0].legal, true);
  assert.equal(row.canonicalTop10.length, 1);
  const late = { ...row, elapsedCoreMs: 161, onTimeReturn: false, deadlineMiss: true };
  assert.equal(compareTrialPair(row, late).qualityWinnerOnTime, 'baseline');
  assert.equal(summarizeLevel([row, late]).deadlineMissCount, 1);
  process.stdout.write('level harness self-test: 21 assertions passed; no timing benchmark was run.\n');
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node tools/compare_solver_levels.mjs --fixture-report FILE [--profiles JSON] [--source App.jsx] [--levels 1,2,3,4,5] [--repeats 1] [--max-cases N] [--priority steps|combo|fixture] [--warmups 1] [--out FILE]\n  --prepare-only saves normalized cases/config/profiles without solving. --self-test checks the harness.\n  Default profiles: src/solver/performanceLevels.js PERFORMANCE_PRESETS. Timing is native core only, not Web UI latency.\n');
    return;
  }
  if (options.selfTest) { selfTest(); return; }
  const fixtureText = fs.readFileSync(options.fixtureReport, 'utf8');
  const fixture = JSON.parse(fixtureText);
  if (!Array.isArray(fixture.cases) || !fixture.cases.length) throw new Error('Fixture report has no cases');
  const cases = fixture.cases.slice(0, options.maxCases ?? fixture.cases.length).map((value, index) => normalizeCase(value, index, options.priority));
  const profilePath = options.profiles ?? path.resolve('src/solver/performanceLevels.js');
  const profileHash = fileHash(profilePath);
  const profileInput = options.profiles ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) :
    (await import(`${pathToFileURL(profilePath).href}?levels=${profileHash}`)).PERFORMANCE_PRESETS;
  const profiles = normalizeProfiles(profileInput).filter((profile) => options.levels.includes(profile.level));
  if (!profiles.length) throw new Error('No selected profiles');
  const config = { ...fixture.config, ...baseConfig };
  delete config.deadlineAt;
  const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), cases, profiles, config,
    caseSetSha256: hash(JSON.stringify(cases)), repeats: options.repeats,
    independentBoards: new Set(cases.map((testCase) => testCase.board.flat().map((cell) => cell < 0 ? -1 : cell % 10).join(','))).size,
    provenance: { mode: 'saved_fixture_reuse', fixtureReport: options.fixtureReport, fixtureSha256: hash(fixtureText),
      holdoutClaim: false, priorityOverride: options.priority, defaultMaxSteps: 80, profilePath, profileSha256: profileHash } };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  if (options.prepareOnly) {
    fs.writeFileSync(options.out, JSON.stringify({ ...manifest, status: 'PREPARED_NOT_BENCHMARKED', trials: [] }, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ outputPath: options.out, cases: cases.length, profiles }) + '\n'); return;
  }
  const scripts = ['tools/compare_solver_levels.mjs', 'tools/compare_solver_round2.mjs', 'tools/load_web_solver.mjs', 'tools/solver_reference.mjs'];
  const scriptHashes = Object.fromEntries(scripts.map((file) => [file, fileHash(file)]));
  const loaded = await loadVariant(options.source);
  const warmups = [];
  for (let index = 0; index < options.warmups; index++) for (const profile of levelOrder(profiles, index)) {
    const run = await runCore(loaded, cases[index % cases.length], profile, config, index, 0);
    warmups.push({ level: profile.level, elapsedCoreMs: run.elapsedCoreMs, deadlineMiss: run.deadlineMiss, error: run.error });
  }
  const trials = [];
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
    const testCase = cases[caseIndex], blockRuns = [];
    for (let repeat = 0; repeat < options.repeats; repeat++) {
      const order = levelOrder(profiles, caseIndex * options.repeats + repeat);
      for (let position = 0; position < order.length; position++) blockRuns.push(await runCore(loaded, testCase, order[position], config, repeat, position));
    }
    // Full board/level block finishes before expensive independent verification.
    trials.push(...blockRuns.map((run) => analyzeRun(run, testCase,
      caseConfig(config, profiles.find((profile) => profile.level === run.level), testCase))));
    process.stderr.write(`Verified ${testCase.id}: ${profiles.length} levels x ${options.repeats} repeats\n`);
  }
  const comparisons = {};
  const pairsFor = (baselineLevel, candidateLevel) => cases.flatMap((testCase) => Array.from({ length: options.repeats }, (_, repeat) => ({
    baselineLevel, candidateLevel, ...compareTrialPair(
      trials.find((row) => row.caseId === testCase.id && row.repeat === repeat && row.level === baselineLevel),
      trials.find((row) => row.caseId === testCase.id && row.repeat === repeat && row.level === candidateLevel)) })));
  const addComparison = (baselineLevel, candidateLevel) => {
    const key = `Lv${baselineLevel}_to_Lv${candidateLevel}`;
    if (!comparisons[key]) { const pairs = pairsFor(baselineLevel, candidateLevel); comparisons[key] = { ...summarizePairs(pairs), pairs }; }
  };
  profiles.forEach((profile, index) => {
    if (profile.level !== 1 && profiles.some((item) => item.level === 1)) addComparison(1, profile.level);
    if (index > 0) addComparison(profiles[index - 1].level, profile.level);
  });
  const summary = Object.fromEntries(profiles.map((profile) => [`Lv${profile.level}`, summarizeLevel(trials.filter((row) => row.level === profile.level))]));
  const unchanged = fileHash(options.source) === loaded.metadata.sha256 && loaded.metadata.dependencies.every((item) => fileHash(item.path) === item.sha256) &&
    Object.entries(scriptHashes).every(([file, expected]) => fileHash(file) === expected) && fileHash(profilePath) === profileHash;
  const report = { ...manifest, generatedAt: new Date().toISOString(), status: 'DESCRIPTIVE_NATIVE_LEVEL_COMPARISON',
    measurement: 'Native Web solver core from ready inputs through returned Top10, using each level budget. Browser postMessage/rendering are outside this clock.',
    schedule: 'Levels rotate across execution positions, then reverse each full cycle; independent verification follows the complete per-board block.',
    limitations: ['Saved fixtures are development evidence, not a fresh holdout.',
      'All late/empty/error runs remain included. More budget does not certify global optimality or monotonic improvement.',
      'Every common Top10 signature is compared only at equal higher-priority quality; correlated groups/repeats are not independent boards.',
      'No observer, artificial early interruption, or substituted result pool is used.',
      'Cold UI delivery, device throttling, and universal hard deadlines require separate browser measurements.'],
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    sourceMetadata: loaded.metadata, scriptHashes, sourcesUnchangedDuringRun: unchanged, warmups, summary, comparisons,
    byScenario: Object.fromEntries([...new Set(cases.map((item) => item.scenario))].map((scenario) => [scenario,
      Object.fromEntries(profiles.map((profile) => [`Lv${profile.level}`, summarizeLevel(trials.filter((row) => row.scenario === scenario && row.level === profile.level))]))])), trials };
  fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n');
  const number = (value) => value == null ? 'n/a' : value.toFixed(2);
  const lines = ['# Solver levels comparison', '', report.measurement, '',
    `Cases: ${cases.length}; independent boards: ${manifest.independentBoards}; repeats: ${options.repeats}; source unchanged: ${unchanged}.`, '',
    '| Level | Budget ms | Core p50 | Core p95 | Core max | Late | All requirements Top10 | Mean combo |', '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...profiles.map((profile) => { const value = summary[`Lv${profile.level}`]; return `| Lv${profile.level} | ${profile.timeBudgetMs} | ${number(value.elapsedCoreMs.p50)} | ${number(value.elapsedCoreMs.p95)} | ${number(value.elapsedCoreMs.max)} | ${value.deadlineMissCount}/${value.trials} | ${number(value.allRequirementsSuccessTop10Rate * 100)}% | ${number(value.meanTotalCombosWhenPresent)} |`; }), '',
    '| Comparison | Higher level wins | Lower level wins | Tie | Equal-quality signature pairs | Shorter | Equal | Longer | Mean step delta |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(comparisons).map(([key, value]) => { const wins = value.returnedQualityWLT, steps = value.allCommonSignatureSteps;
      return `| ${key} | ${wins.candidate} | ${wins.baseline} | ${wins.tie} | ${steps.comparableGroupPairs} | ${steps.shorter} | ${steps.equal} | ${steps.longer} | ${number(steps.pooledMeanStepDelta)} |`; }), '',
    ...report.limitations.map((item) => `- ${item}`), ''];
  fs.writeFileSync(options.out.replace(/\.json$/i, '') + '.md', lines.join('\n'));
  process.stdout.write(JSON.stringify({ outputPath: options.out, sourcesUnchangedDuringRun: unchanged, summary,
    comparisons: Object.fromEntries(Object.entries(comparisons).map(([key, { pairs: _pairs, ...value }]) => [key, value])) }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
