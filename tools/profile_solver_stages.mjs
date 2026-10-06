#!/usr/bin/env node
// Diagnostic only: instrument a private App copy, then sample the unmodified core.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import inspector from "node:inspector";
import { performance, PerformanceObserver } from "node:perf_hooks";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";
import { loadWebSolver } from "./load_web_solver.mjs";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const sourcePath = path.resolve(option("--source", "src/App.jsx"));
const fixturePath = path.resolve(option("--fixtures", "reports/solver-update-20260909/core-ab-final.json"));
const outputPath = path.resolve(option("--out", "reports/solver-next-20260909/deadline-profile.json"));
const directory = path.dirname(outputPath);
const copyPath = outputPath.replace(/\.json$/i, "") + ".instrumented-App.jsx";
const cpuPath = outputPath.replace(/\.json$/i, "") + ".cpuprofile";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const source = fs.readFileSync(sourcePath, "utf8");
const sourceHash = hash(source);
const fixtureText = fs.readFileSync(fixturePath, "utf8");
const allCases = JSON.parse(fixtureText).cases;
const seenScenarios = new Set();
const fixtures = allCases.filter((fixture) => {
  if (seenScenarios.has(fixture.scenario)) return false;
  seenScenarios.add(fixture.scenario);
  return true;
}).slice(0, 6);
if (fixtures.length !== 6) throw new Error("Need six distinct scenario fixtures");
const normalizedSource = source.replace(/\r\n/g, "\n");
let instrumented = normalizedSource;
const anchors = [];
const insert = (anchor, replacement, label) => {
  const count = instrumented.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Instrumentation anchor ${label} matched ${count} times`);
  anchors.push({ label, originalLine: normalizedSource.slice(0, normalizedSource.indexOf(anchor)).split("\n").length });
  instrumented = instrumented.replace(anchor, replacement);
};
insert("  const startedAt = nowMs();", "  const startedAt = nowMs();\n  __deadlineStage('init');", "init");
insert("  for (let step = 0; step < solverMaxSteps && !expired(); step++) {",
  "  for (let step = 0; step < solverMaxSteps && !expired(); step++) {\n    __deadlineStage('move_generation');", "move_generation");
insert("    for (const mv of pendingTerminalMoves) {", "    __deadlineStage('terminal_evaluation');\n    for (const mv of pendingTerminalMoves) {", "terminal_evaluation");
insert("    const evalBudget = getCheapEvalBudget(", "    __deadlineStage('move_selection');\n    const evalBudget = getCheapEvalBudget(", "move_selection");
insert("    const selectedMoveMeta = acquireArrayFromPool(", "    __deadlineStage('move_materialization');\n    const selectedMoveMeta = acquireArrayFromPool(", "move_materialization");
insert("      parallelPrimitivesByIndex =\n        pendingParallelJobs.length > 0", "      __deadlineStage('parallel_dispatch');\n      parallelPrimitivesByIndex =\n        pendingParallelJobs.length > 0", "parallel_dispatch");
insert("      for (let i = 0; i < selectedMoveMeta.length; i++) {\n        if (expired()) break;", "      __deadlineStage('state_evaluation');\n      for (let i = 0; i < selectedMoveMeta.length; i++) {\n        if (expired()) break;", "state_evaluation");
insert("    } finally {\n      if (Array.isArray(parallelPrimitivesByIndex)) {", "    } finally {\n      __deadlineStage('pool_cleanup');\n      if (Array.isArray(parallelPrimitivesByIndex)) {", "pool_cleanup");
insert("    if (!candidates.length) {\n      if (depthMilestones.includes(step + 1)) flushPendingPools();", "    __deadlineStage('beam_selection');\n    if (!candidates.length) {\n      if (depthMilestones.includes(step + 1)) flushPendingPools();", "beam_selection");
insert("    const currentBestScore = Number(bestGlobal.score);", "    __deadlineStage('round_bookkeeping');\n    const currentBestScore = Number(bestGlobal.score);", "round_bookkeeping");
if (instrumented.includes("  flushPendingPools();\n\n  // Spend the final slice")) {
  insert("  flushPendingPools();\n\n  // Spend the final slice", "  __deadlineStage('pre_repair_flush');\n  flushPendingPools();\n  __deadlineStage('repair');\n\n  // Spend the final slice", "pre_repair_flush_and_repair");
} else {
  insert("  const searchFinishedAt = nowMs();\n  flushPendingPools();", "  const searchFinishedAt = nowMs();\n  __deadlineStage('pre_repair_flush');\n  flushPendingPools();\n  __deadlineStage('repair');", "pre_repair_flush_and_repair");
}
insert("  flushPendingPools();\n  reportProgress(true);\n\n  bestGlobal.path", "  __deadlineStage('final_flush');\n  flushPendingPools();\n  reportProgress(true);\n  __deadlineStage('return_assembly');\n\n  bestGlobal.path", "final_flush");

const countedNames = new Set(["computeEvalPrimitives", "findMatches", "combinedPotentialScore", "potentialScore", "unlockN2Board",
  "clone2D", "terminalRank", "buildNoSpecialRankTuple", "flushPendingPools", "getBoardKey", "buildEvalStateFromPrimitives",
  "pickCheapPortfolioMoves", "pickBeamCombo", "pickBeamStepsNoSpecial", "pickBeamLexicographicDiverse"]);
const countedFunctions = [];
const ast = parser.parse(instrumented, { sourceType: "module", plugins: ["jsx"] });
traverse(ast, { VariableDeclarator(p) {
  const name = p.node.id.name;
  if (!countedNames.has(name) || !t.isFunction(p.node.init)) return;
  if (!t.isBlockStatement(p.node.init.body)) p.node.init.body = t.blockStatement([t.returnStatement(p.node.init.body)]);
  const statement = parser.parse(`__deadlineCounters[${JSON.stringify(name)}] = (__deadlineCounters[${JSON.stringify(name)}] || 0) + 1;`).program.body[0];
  p.node.init.body.body.unshift(statement);
  countedFunctions.push(name);
} });
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(copyPath, generate(ast, { comments: true }).code);

const counters = {};
let activeStages = [];
const stage = (name) => activeStages.push({ name, at: performance.now() });
const stageSolver = await loadWebSolver(copyPath, { __deadlineStage: stage, __deadlineCounters: counters });
const originalSolver = await loadWebSolver(sourcePath);
const config = { beamWidth: 440, maxSteps: 30, timeBudgetMs: 160, hardStepLimitEnabled: false, maxNodes: 50000,
  humanPlanner: true, reversePlanner: true, reverseMaxSteps: 60, evalWorkers: 1, browserYield: false,
  deferMoveMaterialization: true, cheapLocalGuidance: true, cheapLegacyReserve: 0.25, cheapEvalScale: 2,
  cheapEvalConstraintScale: 2.5, stepPenalty: 0, potentialWeight: 10, clearedWeight: 300 };
const gcEntries = [];
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) gcEntries.push({ start: entry.startTime, duration: entry.duration, kind: entry.detail?.kind });
});
observer.observe({ entryTypes: ["gc"] });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const solve = async (solver, fixture, mode, warmup = false) => {
  activeStages = [];
  for (const key of Object.keys(counters)) delete counters[key];
  const beforeMemory = process.memoryUsage();
  const startedAt = performance.now();
  const result = await solver.beamSolve(fixture.board.map((row) => row.slice()), { ...config, searchSeed: fixture.searchSeed },
    8, "free", "combo", fixture.skyfall ?? true, fixture.diagonal ?? true, fixture.specials ?? [],
    fixture.initTargetCombo ?? 6, fixture.useRow0 ?? false, fixture.ruleProfile);
  const endedAt = performance.now();
  const afterMemory = process.memoryUsage();
  const events = activeStages.slice();
  const functionCalls = { ...counters };
  await tick(); // Deliver PerformanceObserver entries outside measured solve time.
  if (warmup) return null;
  const stageTotalsMs = {};
  const intervals = events.map((event, i) => {
    const end = events[i + 1]?.at ?? endedAt;
    const duration = end - event.at;
    stageTotalsMs[event.name] = (stageTotalsMs[event.name] ?? 0) + duration;
    return { stage: event.name, startMs: event.at - startedAt, endMs: end - startedAt, durationMs: duration };
  });
  const gc = gcEntries.filter((entry) => entry.start < endedAt && entry.start + entry.duration >= startedAt)
    .map((entry) => ({ ...entry, relativeStartMs: entry.start - startedAt,
      stage: intervals.find((interval) => interval.startMs <= entry.start - startedAt && interval.endMs >= entry.start - startedAt)?.stage ?? null }));
  return { id: fixture.id, scenario: fixture.scenario, mode, startedAt, endedAt, wallMs: endedAt - startedAt, reportedRuntimeMs: result.runtimeMs,
    deadlineMiss: result.deadlineMiss, nodesExpanded: result.nodesExpanded, combos: result.combos, initialCombos: result.initialCombos,
    skyfallCombos: result.skyfallCombos, steps: result.path?.length - 1, repairAttempts: result.repairAttempts, repairImprovements: result.repairImprovements,
    stageTotalsMs, intervals, functionCalls, memory: { before: beforeMemory, after: afterMemory, heapUsedDelta: afterMemory.heapUsed - beforeMemory.heapUsed },
    gc: { count: gc.length, durationMs: gc.reduce((sum, entry) => sum + entry.duration, 0), entries: gc } };
};

for (let i = 0; i < 2; i++) await solve(stageSolver, fixtures[i], "stage", true);
const stageRuns = [];
for (const fixture of fixtures) stageRuns.push(await solve(stageSolver, fixture, "stage"));
for (let i = 0; i < 2; i++) await solve(originalSolver, fixtures[i], "sampling", true);
const session = new inspector.Session();
session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params,
  (error, result) => error ? reject(error) : resolve(result)));
await post("Profiler.enable");
await post("Profiler.setSamplingInterval", { interval: 1000 });
await post("Profiler.start");
const sampleRuns = [];
for (const fixture of fixtures) sampleRuns.push(await solve(originalSolver, fixture, "sampling"));
const { profile: cpuProfile } = await post("Profiler.stop");
session.disconnect();
await tick();
await tick();
for (const entry of observer.takeRecords()) gcEntries.push({ start: entry.startTime, duration: entry.duration, kind: entry.detail?.kind });
// GC observer delivery can lag by a turn. Attribute only after all callbacks drain.
for (const run of [...stageRuns, ...sampleRuns]) {
  const entries = gcEntries.filter((entry) => entry.start < run.endedAt && entry.start + entry.duration >= run.startedAt)
    .map((entry) => ({ ...entry, relativeStartMs: entry.start - run.startedAt,
      stage: run.intervals.find((interval) => interval.startMs <= entry.start - run.startedAt && interval.endMs >= entry.start - run.startedAt)?.stage ?? null }));
  run.gc = { count: entries.length, durationMs: entries.reduce((sum, entry) => sum + entry.duration, 0), entries };
}
observer.disconnect();
fs.writeFileSync(cpuPath, JSON.stringify(cpuProfile));

const nodes = new Map(cpuProfile.nodes.map((node) => [node.id, node]));
const parents = new Map();
for (const node of cpuProfile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
const sampledFunctions = new Map();
const record = (node, timeMs, inclusive) => {
  const name = node.callFrame.functionName || "(anonymous)";
  const key = `${name}:${node.callFrame.url}:${node.callFrame.lineNumber}`;
  let value = sampledFunctions.get(key);
  if (!value) {
    value = { name, url: node.callFrame.url, line: node.callFrame.lineNumber + 1, selfMs: 0, inclusiveMs: 0, selfSamples: 0 };
    sampledFunctions.set(key, value);
  }
  if (inclusive) value.inclusiveMs += timeMs;
  else { value.selfMs += timeMs; value.selfSamples++; }
};
let excludedProfilerSetupMs = 0;
for (let i = 0; i < cpuProfile.samples.length; i++) {
  const id = cpuProfile.samples[i];
  const timeMs = cpuProfile.timeDeltas[i] / 1000;
  // The first sample in this environment includes Profiler.start synchronous
  // setup (~250ms) before any solve. Keep it in raw profile, not solver totals.
  if (i === 0 && nodes.get(id)?.callFrame.url === "node:inspector") {
    excludedProfilerSetupMs += timeMs;
    continue;
  }
  record(nodes.get(id), timeMs, false);
  let current = id;
  while (current) {
    record(nodes.get(current), timeMs, true);
    current = parents.get(current);
  }
}
const mean = (values) => values.reduce((sum, n) => sum + n, 0) / values.length;
const stageNames = [...new Set(stageRuns.flatMap((run) => Object.keys(run.stageTotalsMs)))];
const stageSummary = Object.fromEntries(stageNames.map((name) => [name, {
  meanMs: mean(stageRuns.map((run) => run.stageTotalsMs[name] ?? 0)),
  maxMs: Math.max(...stageRuns.map((run) => run.stageTotalsMs[name] ?? 0)),
}]));
const report = { generatedAt: new Date().toISOString(), experiment: "short-core-deadline-profile",
  source: { path: sourcePath, sha256: sourceHash, hashAfter: hash(fs.readFileSync(sourcePath)) },
  instrumentation: { path: copyPath, sha256: hash(fs.readFileSync(copyPath)), anchors, countedFunctions },
  helperHashes: Object.fromEntries(["tools/profile_solver_stages.mjs", "tools/load_web_solver.mjs", "src/solver/solutionRanking.js", "src/solver/pathReplay.js", "src/solver/comboBound.js"].map((file) => [file, hash(fs.readFileSync(file))])),
  fixtures: { path: fixturePath, sha256: hash(fixtureText), ids: fixtures.map((fixture) => fixture.id) },
  runtime: { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform }, config,
  summary: { stageSummary, stageWallMeanMs: mean(stageRuns.map((run) => run.wallMs)), sampleWallMeanMs: mean(sampleRuns.map((run) => run.wallMs)),
    sampleWallMaxMs: Math.max(...sampleRuns.map((run) => run.wallMs)), sampledGCTotalMs: sampleRuns.reduce((sum, run) => sum + run.gc.durationMs, 0), excludedProfilerSetupMs },
  stageRuns, sampleRuns, cpuProfilePath: cpuPath, gcEntries,
  cpuFunctions: [...sampledFunctions.values()].sort((a, b) => b.selfMs - a.selfMs),
  limitations: ["Six scenarios, one attempt each per mode: not a latency benchmark or a tail guarantee",
    "Stage copy has timing/counter overhead; sampling pass uses original source and 1ms inspector sampling",
    "GC durations overlap solve/stage time; never add them to wall or stage totals",
    "CPU function sample durations exclude an initial node:inspector setup sample; full unfiltered samples remain in .cpuprofile",
    "Heap delta is retained/net memory, not total allocated bytes",
    "Nodes are generated moves, not all fully evaluated boards; compare call counters separately",
    "No browser render or input-to-DOM time is measured"],
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, summary: report.summary, topCpuFunctions: report.cpuFunctions.slice(0, 15) }));
