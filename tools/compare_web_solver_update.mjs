#!/usr/bin/env node
// Paired, instrumented core-search experiment. This does not measure original
// browser UI latency and never declares a statistical quality PASS.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { loadWebSolver } from "./load_web_solver.mjs";
import { verifySolution } from "./solver_reference.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[index + 1];
};
const positive = (name, fallback) => {
  const n = Number(option(name, fallback));
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
};
const boardsPerScenario = positive("--boards", 3);
const repeats = positive("--repeats", 2);
const seed = Number(option("--seed", 0x20260909)) >>> 0;
const outputPath = path.resolve(option("--out", "reports/solver-update-20260909/core-ab.json"));
const excludeReportPath = option("--exclude-report", "");
const sourcePaths = {
  baseline: "reports/solver-update-20260909/baseline/App.jsx",
  candidate: "src/App.jsx",
};
const budgetMs = 160;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sourceHashes = Object.fromEntries(Object.entries(sourcePaths).map(([name, file]) => [name, hash(fs.readFileSync(file))]));
const helperPaths = ["src/solver/solutionRanking.js", "src/solver/pathReplay.js", "src/solver/comboBound.js", "tools/solver_reference.mjs", "tools/load_web_solver.mjs", "tools/compare_web_solver_update.mjs"];
const helperHashes = Object.fromEntries(helperPaths.filter((file) => fs.existsSync(file))
  .map((file) => [file, hash(fs.readFileSync(file))]));
const profile = () => ({
  orbRules: Array.from({ length: 6 }, () => ({ minClear: 3, clearMode: "line" })),
  requirements: [],
});
const scenarioNames = ["ordinary", "no_diagonal", "no_skyfall", "row0_start_markers", "ordered_requirement", "special_shape"];

// Reject exact color-board overlaps with the existing tuning corpus, rather
// than relying only on the very low chance of a seeded random collision.
const corpusPath = "public/solver-bench/proxy_web_corpus_20260810.jsonl";
const fixedSuitePath = "fixed_test_suite.json";
const corpusBoards = new Set();
const fixedSuite = JSON.parse(fs.readFileSync(fixedSuitePath, "utf8"));
if (!Array.isArray(fixedSuite) || fixedSuite.some((board) => !Array.isArray(board) || board.flat().length !== 36)) {
  throw new Error(`Invalid fixed board suite: ${fixedSuitePath}`);
}
for (const board of fixedSuite) corpusBoards.add(board.flat().map((cell) => cell % 10).join(","));
const fixedSuiteDistinctBoards = corpusBoards.size;
let webCorpusRows = 0;
if (!fs.existsSync(corpusPath)) throw new Error(`Missing overlap-check corpus: ${corpusPath}`);
for (const line of fs.readFileSync(corpusPath, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  webCorpusRows++;
  if (Array.isArray(row.board)) corpusBoards.add(row.board.flat().map((cell) => cell % 10).join(","));
}
const excludedReports = [];
if (excludeReportPath) {
  const reportText = fs.readFileSync(excludeReportPath, "utf8");
  const priorReport = JSON.parse(reportText);
  if (!Array.isArray(priorReport.cases) || priorReport.cases.some((testCase) =>
    !Array.isArray(testCase.board) || testCase.board.flat().length !== 36)) {
    throw new Error(`Invalid cases in excluded report: ${excludeReportPath}`);
  }
  const before = corpusBoards.size;
  for (const testCase of priorReport.cases) corpusBoards.add(testCase.board.flat().map((cell) => cell % 10).join(","));
  excludedReports.push({ path: excludeReportPath, sha256: hash(reportText),
    rows: priorReport.cases.length, additionalDistinctBoards: corpusBoards.size - before });
}
let randomState = seed || 0x6d2b79f5;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
};
const cases = [];
const generatedBoards = new Set();
for (const scenario of scenarioNames) for (let boardIndex = 0; boardIndex < boardsPerScenario; boardIndex++) {
  let board;
  let key;
  do {
    board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => Math.floor(random() * 6)));
    key = board.flat().join(",");
  } while (corpusBoards.has(key) || generatedBoards.has(key));
  generatedBoards.add(key);
  const ruleProfile = profile();
  const specials = [];
  if (scenario === "row0_start_markers") {
    board[0][2] += 100;       // START in fixed row 0.
    board[3][2] += 220;       // END and X2 share the final coordinate.
    board[2][4] += 10;        // X1.
    board[3][4] += 1000;      // N1.
    board[4][4] += 2000;      // N2.
  }
  if (scenario === "ordered_requirement") ruleProfile.requirements = [
    { orb: 1, size: 5, count: 1, match: "exact" },
    { orb: 0, size: 3, count: 2, match: "exact" },
  ];
  if (scenario === "special_shape") specials.push({ type: "cross", orb: -1, count: 1 });
  cases.push({
    id: `${scenario}-${boardIndex + 1}`, scenario, boardIndex, board,
    boardHash: hash(JSON.stringify(board)), searchSeed: Math.floor(random() * 4294967296),
    diagonal: scenario !== "no_diagonal", skyfall: scenario !== "no_skyfall",
    useRow0: scenario === "row0_start_markers", initTargetCombo: 6, ruleProfile, specials,
  });
}

const config = {
  beamWidth: 440, maxSteps: 30, maxNodes: 50000, timeBudgetMs: budgetMs,
  evalWorkers: 1, browserYield: false, humanPlanner: true, reversePlanner: true,
  reverseMaxSteps: 60, deferMoveMaterialization: true, cheapLocalGuidance: true,
  cheapLegacyReserve: 0.25, cheapEvalScale: 2, cheapEvalConstraintScale: 2.5,
  stepPenalty: 0, potentialWeight: 10, clearedWeight: 300,
};
const compare = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
};
// Deliberately independent of both solvers' ranking helpers.
const specialRank = (done) => {
  const mask = (done[0] ? 4 : 0) | (done[1] ? 2 : 0) | (done[2] ? 1 : 0);
  return [0, 1, 2, 4, 3, 5, 6, 7][mask];
};
const serializeVerified = (solution, verified) => {
  const ev = verified.evaluation;
  if (!verified.legal || !ev) return { legal: false, errors: verified.errors, path: solution.path };
  const requirementsDone = ev.requirements.map((item) => Number(item.satisfied));
  const specialsDone = ev.specials.map((item) => Number(item.satisfied));
  return {
    legal: true, errors: [], path: solution.path, steps: verified.steps,
    signature: `${ev.initialCombos}+${ev.skyfallCombos}`, initialCombos: ev.initialCombos,
    skyfallCombos: ev.skyfallCombos, totalCombos: ev.combos,
    requirementsDone, specialsDone,
    requirementsSatisfied: verified.requirements_satisfied,
    specialsSatisfied: verified.special_satisfied,
    initialSatisfied: verified.initial_satisfied, allRequirementsSuccess: verified.success,
    rank: [1, ...requirementsDone, specialRank(specialsDone), Number(verified.initial_satisfied), ev.combos, -verified.steps],
  };
};
const verify = (testCase, solution) => serializeVerified(solution, verifySolution(testCase.board, solution, {
  diagonal: testCase.diagonal, skyfall: testCase.skyfall, useRow0: testCase.useRow0,
  maxSteps: config.maxSteps, initTargetCombo: testCase.initTargetCombo,
  ruleProfile: testCase.ruleProfile, specials: testCase.specials,
}));

let activeRun = null;
const deadlineSentinel = Object.freeze({ code: "INSTRUMENTED_CORE_DEADLINE" });
const observer = (event) => {
  const run = activeRun;
  if (!run) throw new Error("Observer called outside an active trial");
  const observedAtMs = performance.now() - run.startedAt;
  run.nativeSnapshot = event.nativePools.combo || [];
  run.nativeSnapshotObservedAtMs = observedAtMs;
  if (observedAtMs >= budgetMs) {
    run.lateObserverCalls++;
    if (run.variant === "baseline") throw deadlineSentinel;
    return;
  }
  if (!event.endpointAccepted || event.violatesN2 || event.path.length < 2) return;
  // Only immutable numeric claims and the freshly built path are retained.
  // Independent replay happens after timing stops, and recomputes every rank.
  const ev = event.ev;
  run.captures.push({ observedAtMs, solution: {
    path: event.path, combos: ev.combos, initialCombos: ev.initialCombos,
    skyfallCombos: ev.skyfallCombos, clearedCount: ev.clearedCount,
    initialClearedCount: ev.initialClearedCount,
  } });
};
const solvers = {};
for (const variant of ["baseline", "candidate"]) {
  solvers[variant] = await loadWebSolver(sourcePaths[variant], { __solverObserver: observer });
  sourceHashes[variant] = solvers[variant].sourceMetadata.sha256;
  process.stderr.write(`Loaded ${variant} at ${solvers[variant].sourceMetadata.sourceReadAt}, SHA-256 ${sourceHashes[variant]}\n`);
}

async function runCore(variant, testCase) {
  const run = { variant, captures: [], nativeSnapshot: [], lateObserverCalls: 0, startedAt: performance.now() };
  activeRun = run;
  let result;
  let error = null;
  let interruptedAtDeadline = false;
  try {
    result = await solvers[variant].beamSolve(testCase.board.map((row) => row.slice()),
      { ...config, searchSeed: testCase.searchSeed }, 10, "free", "combo",
      testCase.skyfall, testCase.diagonal, testCase.specials, testCase.initTargetCombo,
      testCase.useRow0, testCase.ruleProfile, null);
  } catch (caught) {
    if (caught === deadlineSentinel) interruptedAtDeadline = true;
    else error = caught?.stack || String(caught);
  } finally {
    run.elapsedCoreMs = performance.now() - run.startedAt;
    activeRun = null;
  }
  return { ...run, result, error, interruptedAtDeadline };
}

function analyze(run, testCase, repeat, executionOrder) {
  const bySignature = new Map();
  let verifiedLegalCount = 0;
  let replayErrorCount = 0;
  const replayErrors = [];
  for (const capture of run.captures) {
    if (capture.observedAtMs >= budgetMs) throw new Error("Late endpoint entered scoring");
    const candidate = verify(testCase, capture.solution);
    if (!candidate.legal) {
      replayErrorCount++;
      if (replayErrors.length < 16) replayErrors.push({ observedAtMs: capture.observedAtMs, ...candidate });
      continue;
    }
    verifiedLegalCount++;
    candidate.observedAtMs = capture.observedAtMs;
    const previous = bySignature.get(candidate.signature);
    if (!previous || compare(candidate.rank, previous.rank) > 0) bySignature.set(candidate.signature, candidate);
  }
  // A candidate may produce its repaired final pool without calling the search
  // observer. Admit that pool only when the entire core return met the budget.
  if (run.result && run.elapsedCoreMs <= budgetMs) {
    for (const solution of [...(run.result.topCombos || []), ...(run.result.path?.length ? [run.result] : [])]) {
      const candidate = verify(testCase, solution);
      if (!candidate.legal) continue;
      candidate.observedAtMs = run.elapsedCoreMs;
      const previous = bySignature.get(candidate.signature);
      if (!previous || compare(candidate.rank, previous.rank) > 0) bySignature.set(candidate.signature, candidate);
    }
  }
  const top10 = [...bySignature.values()].sort((a, b) => -compare(a.rank, b.rank)).slice(0, 10);
  const nativeSolutions = run.result?.topCombos || run.nativeSnapshot;
  const nativeTop10 = nativeSolutions.map((solution, index) => ({ index, ...verify(testCase, solution) }));
  const nativeViolations = { illegal: 0, duplicateGroups: 0, outOfOrderPairs: 0, inferiorGroupRepresentatives: 0 };
  const nativeGroups = new Set();
  for (let i = 0; i < nativeTop10.length; i++) {
    const item = nativeTop10[i];
    if (!item.legal) { nativeViolations.illegal++; continue; }
    if (nativeGroups.has(item.signature)) nativeViolations.duplicateGroups++;
    nativeGroups.add(item.signature);
    const previous = nativeTop10[i - 1];
    if (previous?.legal && compare(item.rank, previous.rank) > 0) nativeViolations.outOfOrderPairs++;
    const commonRepresentative = bySignature.get(item.signature);
    if (commonRepresentative && compare(commonRepresentative.rank, item.rank) > 0) {
      nativeViolations.inferiorGroupRepresentatives++;
    }
  }
  return {
    variant: run.variant, caseId: testCase.id, scenario: testCase.scenario,
    repeat, executionOrder, elapsedCoreMs: run.elapsedCoreMs, budgetMs,
    deadlineMiss: run.elapsedCoreMs > budgetMs, interruptedAtDeadline: run.interruptedAtDeadline,
    error: run.error, lateObserverCalls: run.lateObserverCalls,
    lastObserverAtMs: run.nativeSnapshotObservedAtMs ?? null,
    capturedCount: run.captures.length, verifiedLegalCount, replayErrorCount, replayErrors,
    replayErrorDetailLimit: 16, validGroupCount: bySignature.size,
    allRequirementsSuccessTop1: top10[0]?.allRequirementsSuccess ?? false,
    allRequirementsSuccessTop10: top10.some((item) => item.allRequirementsSuccess),
    top1: top10[0] ?? null, top10,
    nativeReturned: !!run.result, nativeSnapshotFinalized: !!run.result,
    nativePoolAvailableAtMs: run.result ? run.elapsedCoreMs : run.nativeSnapshotObservedAtMs ?? null,
    nativePoolDeliveredOnTime: !!run.result && !run.error && run.elapsedCoreMs <= budgetMs,
    nativeAllRequirementsSuccessTop1: nativeTop10[0]?.allRequirementsSuccess ?? false,
    nativeAllRequirementsSuccessTop10: nativeTop10.some((item) => item.allRequirementsSuccess),
    nativeTop10, nativeViolations,
    nativeBest: run.result?.path?.length ? verify(testCase, run.result) : null,
    nativeSuccessClaim: run.result?.success ?? null,
    nativeDeadlineMissClaim: run.result?.deadlineMiss ?? null,
    nativeCoreMetadata: run.result ? {
      runtimeMs: run.result.runtimeMs ?? null,
      nodesExpanded: run.result.nodesExpanded ?? null,
      repairAttempts: run.result.repairAttempts ?? null,
      repairImprovements: run.result.repairImprovements ?? null,
      status: run.result.status ?? null,
      deadlineReached: run.result.deadlineReached ?? null,
      comboBounds: run.result.comboBounds ?? null,
    } : null,
  };
}

const warmups = [];
for (let repetition = 0; repetition < 2; repetition++) for (const variant of ["baseline", "candidate"]) {
  const warmup = await runCore(variant, cases[repetition % cases.length]);
  warmups.push({ variant, elapsedCoreMs: warmup.elapsedCoreMs, error: warmup.error,
    interruptedAtDeadline: warmup.interruptedAtDeadline, capturedCount: warmup.captures.length });
}
const trials = [];
let pairIndex = 0;
for (let repeat = 0; repeat < repeats; repeat++) for (const testCase of cases) {
  const order = pairIndex++ % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
  // Both core runs finish before offline replay, so verifier allocations cannot
  // be inserted between the A and B member of this pair.
  const runs = [];
  for (const variant of order) runs.push(await runCore(variant, testCase));
  for (let index = 0; index < runs.length; index++) {
    trials.push(analyze(runs[index], testCase, repeat, index));
  }
  process.stderr.write(`Compared ${testCase.id}, repeat ${repeat + 1}/${repeats}\n`);
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const summarize = (rows) => ({
  trials: rows.length,
  elapsedCoreMs: { p50: quantile(rows.map((r) => r.elapsedCoreMs), 0.5),
    p95: quantile(rows.map((r) => r.elapsedCoreMs), 0.95),
    p99: quantile(rows.map((r) => r.elapsedCoreMs), 0.99),
    max: rows.length ? Math.max(...rows.map((r) => r.elapsedCoreMs)) : null },
  deadlineMissRate: mean(rows.map((r) => Number(r.deadlineMiss))),
  noLegalCandidateRate: mean(rows.map((r) => Number(!r.top1))),
  allRequirementsSuccessTop1Rate: mean(rows.map((r) => Number(r.allRequirementsSuccessTop1))),
  allRequirementsSuccessTop10Rate: mean(rows.map((r) => Number(r.allRequirementsSuccessTop10))),
  onTimeAllRequirementsTop10Rate: mean(rows.map((r) => Number(r.nativePoolDeliveredOnTime && r.nativeAllRequirementsSuccessTop10))),
  onTimeLegalTop10DeliveryRate: mean(rows.map((r) => Number(r.nativePoolDeliveredOnTime && r.nativeTop10.some((item) => item.legal)))),
  meanTotalCombosWhenPresent: mean(rows.filter((r) => r.top1).map((r) => r.top1.totalCombos)),
  meanValidTop10Groups: mean(rows.map((r) => r.top10.length)),
  replayErrorCount: rows.reduce((sum, row) => sum + row.replayErrorCount, 0),
  nativeViolations: Object.fromEntries(["illegal", "duplicateGroups", "outOfOrderPairs", "inferiorGroupRepresentatives"]
    .map((key) => [key, rows.reduce((sum, row) => sum + row.nativeViolations[key], 0)])),
  solverErrors: rows.filter((r) => r.error).length,
});
const summary = Object.fromEntries(["baseline", "candidate"].map((variant) =>
  [variant, summarize(trials.filter((trial) => trial.variant === variant))]));
const pairs = [];
for (let repeat = 0; repeat < repeats; repeat++) for (const testCase of cases) {
  const rows = trials.filter((r) => r.caseId === testCase.id && r.repeat === repeat);
  const a = rows.find((r) => r.variant === "baseline");
  const b = rows.find((r) => r.variant === "candidate");
  const comparableSteps = a.top1 && b.top1 && a.top1.signature === b.top1.signature &&
    compare(a.top1.rank.slice(0, -1), b.top1.rank.slice(0, -1)) === 0;
  pairs.push({ caseId: testCase.id, repeat,
    qualityWinner: !a.top1 && !b.top1 ? "neither" : !a.top1 ? "candidate" : !b.top1 ? "baseline" :
      compare(b.top1.rank, a.top1.rank) > 0 ? "candidate" : compare(b.top1.rank, a.top1.rank) < 0 ? "baseline" : "tie",
    bothOnTime: !a.deadlineMiss && !b.deadlineMiss,
    elapsedDeltaMs: b.elapsedCoreMs - a.elapsedCoreMs,
    sameQualitySignature: !!comparableSteps,
    stepDelta: comparableSteps ? b.top1.steps - a.top1.steps : null,
  });
}
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), conclusion: "DESCRIPTIVE_ONLY_NO_STATISTICAL_PASS",
  measurement: "Paired instrumented Web core search under the same 160 ms budget; not original browser UI latency.",
  limitations: [
    "Endpoint hooks and candidate capture add symmetric instrumentation overhead; baseline interruption is cooperative at observed endpoints.",
    "No candidate first observed at or after 160 ms is scored; late core returns are always counted as deadline misses.",
    "Native pools retain their original order. An interrupted baseline snapshot may have an unflushed pending batch.",
    "Common portfolios are independently replayed and ranked; native pool violations are reported separately.",
    "On-time delivery metrics require a successful native return and inspect its actual returned Top10, not the independently reconstructed research portfolio.",
    "No global optimum, minimum-step proof, statistical significance, or browser end-to-end latency claim is made.",
    "Case feasibility has not been proven; an unsuccessful search does not establish that its requirements are impossible.",
    "Repeated runs of one board are paired repeated measurements, not additional independent boards.",
  ],
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  sourcePaths, sourceHashes, sourceMetadata: Object.fromEntries(Object.entries(solvers).map(([variant, solver]) => [variant, solver.sourceMetadata])),
  helperHashes,
  sourcesUnchangedDuringRun: Object.entries(sourcePaths).every(([variant, file]) => hash(fs.readFileSync(file)) === sourceHashes[variant]) &&
    Object.entries(helperHashes).every(([file, expected]) => hash(fs.readFileSync(file)) === expected),
  seed, boardsPerScenario, repeats, independentBoards: cases.length,
  corpusOverlapCheck: { sources: [
    { path: fixedSuitePath, rows: fixedSuite.length, distinctBoards: fixedSuiteDistinctBoards },
    { path: corpusPath, rows: webCorpusRows },
  ], excludedReports, distinctExistingBoards: corpusBoards.size, overlaps: 0 },
  budgetMs, config, cases, warmups, summary,
  byScenario: Object.fromEntries(scenarioNames.map((scenario) => [scenario,
    Object.fromEntries(["baseline", "candidate"].map((variant) =>
      [variant, summarize(trials.filter((r) => r.scenario === scenario && r.variant === variant))]))])),
  pairedSummary: {
    pairs: pairs.length, wins: Object.fromEntries(["candidate", "baseline", "tie", "neither"].map((winner) =>
      [winner, pairs.filter((pair) => pair.qualityWinner === winner).length])),
    comparableStepPairs: pairs.filter((pair) => pair.sameQualitySignature).length,
    meanStepDeltaAtSameQualitySignature: mean(pairs.filter((pair) => pair.sameQualitySignature).map((pair) => pair.stepDelta)),
  }, pairs, trials,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
const pct = (n) => n == null ? "n/a" : `${(n * 100).toFixed(1)}%`;
const markdown = [
  "# Web solver update: descriptive paired core comparison", "",
  report.measurement, "",
  `Seed: ${seed}; independent boards: ${cases.length}; repeats: ${repeats}. No statistical PASS is claimed.`, "",
  "| Metric | Baseline | Candidate |", "|---|---:|---:|",
  ...["p50", "p95", "p99", "max"].map((key) => `| Core ${key} ms | ${summary.baseline.elapsedCoreMs[key]?.toFixed(2)} | ${summary.candidate.elapsedCoreMs[key]?.toFixed(2)} |`),
  `| Deadline miss rate | ${pct(summary.baseline.deadlineMissRate)} | ${pct(summary.candidate.deadlineMissRate)} |`,
  `| All requirements met in Top10 | ${pct(summary.baseline.allRequirementsSuccessTop10Rate)} | ${pct(summary.candidate.allRequirementsSuccessTop10Rate)} |`,
  `| On-time Top10 all-requirements delivery | ${pct(summary.baseline.onTimeAllRequirementsTop10Rate)} | ${pct(summary.candidate.onTimeAllRequirementsTop10Rate)} |`,
  `| Replayed endpoint errors | ${summary.baseline.replayErrorCount} | ${summary.candidate.replayErrorCount} |`,
  `| Mean legal groups in Top10 | ${summary.baseline.meanValidTop10Groups?.toFixed(2)} | ${summary.candidate.meanValidTop10Groups?.toFixed(2)} |`, "",
  `Paired quality outcomes: ${JSON.stringify(report.pairedSummary.wins)}.`,
  `Step-comparable pairs: ${report.pairedSummary.comparableStepPairs}; mean candidate minus baseline steps: ${report.pairedSummary.meanStepDeltaAtSameQualitySignature ?? "n/a"}.`, "",
  ...report.limitations.map((item) => `- ${item}`), "",
].join("\n");
fs.writeFileSync(outputPath.replace(/\.json$/i, "") + ".md", markdown);
process.stdout.write(JSON.stringify({ outputPath, summary, pairedSummary: report.pairedSummary }) + "\n");
