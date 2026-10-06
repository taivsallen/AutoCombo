#!/usr/bin/env node
// Native-return comparison: no endpoint observer, interruption, or solver ranking
// helper is used to decide independently verified solution quality.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import * as parser from "@babel/parser";
import { loadWebSolver } from "./load_web_solver.mjs";
import { verifySolution } from "./solver_reference.mjs";

const SCENARIOS = ["ordinary", "no_diagonal", "no_skyfall", "row0_start_markers", "ordered_requirement", "special_shape"];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const colorKey = (board) => board.flat().map((cell) => cell < 0 ? -1 : cell % 10).join(",");
const defaultProfile = () => ({ orbRules: Array.from({ length: 6 }, () => ({ minClear: 3, clearMode: "line" })), requirements: [] });
const defaultConfig = {
  beamWidth: 440, maxSteps: 30, maxNodes: 50000, evalWorkers: 1, browserYield: false,
  humanPlanner: true, reversePlanner: true, reverseMaxSteps: 60,
  deferMoveMaterialization: true, cheapLocalGuidance: true, cheapLegacyReserve: 0.25,
  cheapEvalScale: 2, cheapEvalConstraintScale: 2.5, stepPenalty: 0,
  potentialWeight: 10, clearedWeight: 300,
};
const clone = (value) => structuredClone(value);
const validBoard = (board) => Array.isArray(board) && board.length === 6 &&
  board.every((row) => Array.isArray(row) && row.length === 6 && row.every(Number.isInteger));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
};

export function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
function specialCombinationRank(done) {
  const mask = (done[0] ? 4 : 0) | (done[1] ? 2 : 0) | (done[2] ? 1 : 0);
  return [0, 1, 2, 4, 3, 5, 6, 7][mask];
}
function nativeSpecialSlots(testCase, verifiedSpecials) {
  let active = 0;
  return testCase.specials.slice(0, 3).map((special) => !special || special.type === "none"
    ? 0 : Number(verifiedSpecials[active++]?.satisfied === true));
}
export function verifyNative(testCase, solution, config) {
  const verified = verifySolution(testCase.board, solution, {
    diagonal: testCase.diagonal, skyfall: testCase.skyfall, useRow0: testCase.useRow0,
    maxSteps: config.hardStepLimitEnabled ? Math.min(config.maxSteps, config.hardStepLimit) : config.maxSteps,
    initTargetCombo: testCase.initTargetCombo, ruleProfile: testCase.ruleProfile,
    specials: testCase.specials,
  });
  const base = { legal: verified.legal, errors: verified.errors, path: solution?.path ?? [], steps: verified.steps };
  if (!verified.legal || !verified.evaluation) return base;
  const ev = verified.evaluation;
  const requirementsDone = ev.requirements.map((item) => Number(item.satisfied));
  const specialsDone = nativeSpecialSlots(testCase, ev.specials);
  const qualityPrefix = [1, ...requirementsDone, specialCombinationRank(specialsDone),
    Number(verified.initial_satisfied), ev.combos];
  return { ...base, signature: `${ev.initialCombos}+${ev.skyfallCombos}`,
    initialCombos: ev.initialCombos, skyfallCombos: ev.skyfallCombos, totalCombos: ev.combos,
    requirementsDone, specialsDone, initialSatisfied: verified.initial_satisfied,
    requirementsSatisfied: verified.requirements_satisfied, specialsSatisfied: verified.special_satisfied,
    allRequirementsSuccess: verified.success, qualityPrefix, rank: [...qualityPrefix, -verified.steps] };
}
export function canonicalTop10(nativeTop10) {
  const best = new Map();
  for (const candidate of nativeTop10) {
    if (!candidate.legal) continue;
    const previous = best.get(candidate.signature);
    if (!previous || compareRanks(candidate.rank, previous.rank) > 0) best.set(candidate.signature, candidate);
  }
  return [...best.values()].sort((a, b) => -compareRanks(a.rank, b.rank)).slice(0, 10);
}
function winner(a, b) {
  if (!a && !b) return "neither";
  if (!a) return "candidate";
  if (!b) return "baseline";
  const cmp = compareRanks(b.rank, a.rank);
  return cmp > 0 ? "candidate" : cmp < 0 ? "baseline" : "tie";
}
export function compareTrialPair(a, b) {
  const bBySignature = new Map(b.canonicalTop10.map((item) => [item.signature, item]));
  const commonSignatures = [];
  for (const previous of a.canonicalTop10) {
    const current = bBySignature.get(previous.signature);
    if (!current) continue;
    const sameQuality = compareRanks(previous.qualityPrefix, current.qualityPrefix) === 0;
    commonSignatures.push({ signature: previous.signature, sameQuality,
      bothOnTime: a.onTimeReturn && b.onTimeReturn,
      baselineSteps: previous.steps, candidateSteps: current.steps,
      baselineQualityPrefix: previous.qualityPrefix, candidateQualityPrefix: current.qualityPrefix,
      stepDelta: sameQuality ? current.steps - previous.steps : null,
      qualityWinner: winner(previous, current) });
  }
  return { caseId: a.caseId, scenario: a.scenario, repeat: a.repeat,
    qualityWinnerReturned: winner(a.canonicalTop10[0], b.canonicalTop10[0]),
    qualityWinnerOnTime: winner(a.onTimeReturn ? a.canonicalTop10[0] : null,
      b.onTimeReturn ? b.canonicalTop10[0] : null),
    baselineLate: a.deadlineMiss, candidateLate: b.deadlineMiss,
    baselineEmpty: a.canonicalTop10.length === 0, candidateEmpty: b.canonicalTop10.length === 0,
    elapsedDeltaMs: b.elapsedCoreMs - a.elapsedCoreMs, commonSignatures,
    meanStepDeltaAtSameQuality: mean(commonSignatures.filter((item) => item.sameQuality).map((item) => item.stepDelta)) };
}
function summarizeSteps(pairs, onTimeOnly = false) {
  const groups = pairs.flatMap((pair) => pair.commonSignatures.filter((item) =>
    item.sameQuality && (!onTimeOnly || item.bothOnTime)));
  const pairMeans = pairs.map((pair) => mean(pair.commonSignatures.filter((item) =>
    item.sameQuality && (!onTimeOnly || item.bothOnTime)).map((item) => item.stepDelta))).filter((value) => value != null);
  return { comparableGroupPairs: groups.length, comparableTrialPairs: pairMeans.length,
    shorter: groups.filter((item) => item.stepDelta < 0).length,
    equal: groups.filter((item) => item.stepDelta === 0).length,
    longer: groups.filter((item) => item.stepDelta > 0).length,
    meanBaselineSteps: mean(groups.map((item) => item.baselineSteps)),
    meanCandidateSteps: mean(groups.map((item) => item.candidateSteps)),
    pooledMeanStepDelta: mean(groups.map((item) => item.stepDelta)),
    meanOfTrialPairMeanStepDeltas: mean(pairMeans) };
}
export function summarizeTrials(rows) {
  const elapsed = rows.map((row) => row.elapsedCoreMs);
  const violations = ["illegal", "duplicateGroups", "outOfOrderPairs", "inferiorDuplicateRepresentative"];
  return { trials: rows.length,
    elapsedCoreMs: { p50: quantile(elapsed, 0.5), p95: quantile(elapsed, 0.95),
      p99: quantile(elapsed, 0.99), max: elapsed.length ? Math.max(...elapsed) : null },
    deadlineMissCount: rows.filter((row) => row.deadlineMiss).length,
    deadlineMissRate: mean(rows.map((row) => Number(row.deadlineMiss))),
    errorCount: rows.filter((row) => row.error).length,
    emptyNativePoolCount: rows.filter((row) => row.nativeTop10.length === 0).length,
    noVerifiedCandidateCount: rows.filter((row) => row.canonicalTop10.length === 0).length,
    allRequirementsSuccessTop1Rate: mean(rows.map((row) => Number(row.nativeTop10[0]?.allRequirementsSuccess === true))),
    allRequirementsSuccessTop10Rate: mean(rows.map((row) => Number(row.nativeTop10.some((item) => item.allRequirementsSuccess)))),
    onTimeAllRequirementsSuccessTop10Rate: mean(rows.map((row) => Number(row.onTimeReturn && row.nativeTop10.some((item) => item.allRequirementsSuccess)))),
    onTimeLegalPoolRate: mean(rows.map((row) => Number(row.onTimeReturn && row.canonicalTop10.length > 0))),
    meanLegalGroups: mean(rows.map((row) => row.canonicalTop10.length)),
    meanTotalCombosWhenPresent: mean(rows.filter((row) => row.canonicalTop10.length).map((row) => row.canonicalTop10[0].totalCombos)),
    nativeViolations: Object.fromEntries(violations.map((key) =>
      [key, rows.reduce((sum, row) => sum + row.nativeViolations[key], 0)])) };
}
export function summarizePairs(pairs) {
  const counts = (key) => Object.fromEntries(["candidate", "baseline", "tie", "neither"].map((value) =>
    [value, pairs.filter((pair) => pair[key] === value).length]));
  return { trialPairs: pairs.length, returnedQualityWLT: counts("qualityWinnerReturned"),
    onTimeQualityWLT: counts("qualityWinnerOnTime"),
    allCommonSignatureSteps: summarizeSteps(pairs), onTimeCommonSignatureSteps: summarizeSteps(pairs, true) };
}

function parseArgs(argv) {
  const values = {};
  const exclusions = [];
  const flags = new Set(["--help", "--self-test", "--prepare-only"]);
  const allowed = new Set(["--baseline", "--candidate", "--seed", "--boards", "--repeats", "--budget", "--out", "--fixture-report", "--exclude-report"]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (flags.has(key)) { values[key] = true; continue; }
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${key}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
    const value = argv[++i];
    if (key === "--exclude-report") exclusions.push(value);
    else values[key] = value;
  }
  const number = (key, fallback, integer = true) => {
    const value = Number(values[key] ?? fallback);
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) throw new Error(`${key} must be positive${integer ? " integer" : ""}`);
    return value;
  };
  const seed = Number(values["--seed"] ?? 539363595);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("--seed must be an unsigned 32-bit integer");
  return { baseline: values["--baseline"] ?? "reports/solver-next-20260909/baseline/App.jsx",
    candidate: values["--candidate"] ?? "src/App.jsx", seed,
    boards: number("--boards", 3), boardsExplicit: values["--boards"] != null,
    repeats: number("--repeats", 3), budgetMs: number("--budget", 160, false),
    out: path.resolve(values["--out"] ?? "reports/solver-next-20260909/native-comparison.json"),
    fixtureReport: values["--fixture-report"] ?? null, exclusions,
    help: !!values["--help"], selfTest: !!values["--self-test"], prepareOnly: !!values["--prepare-only"] };
}
function normalizeCase(value, index) {
  if (!validBoard(value.board)) throw new Error(`Case ${index} does not contain a 6x6 integer board`);
  return { id: value.id ?? `fixture-${index + 1}`, scenario: value.scenario ?? "fixture",
    boardIndex: value.boardIndex ?? index, board: clone(value.board), boardHash: hash(JSON.stringify(value.board)),
    searchSeed: Number(value.searchSeed ?? index) >>> 0, diagonal: value.diagonal ?? true,
    skyfall: value.skyfall ?? true, useRow0: value.useRow0 ?? false,
    initTargetCombo: value.initTargetCombo ?? 6, target: value.target ?? 10,
    mode: value.mode ?? "free", priority: value.priority ?? "combo",
    ruleProfile: clone(value.ruleProfile ?? defaultProfile()), specials: clone(value.specials ?? []) };
}
function loadCases(options) {
  if (options.fixtureReport) {
    const text = fs.readFileSync(options.fixtureReport, "utf8");
    const report = JSON.parse(text);
    if (!Array.isArray(report.cases) || !report.cases.length) throw new Error("Fixture report has no cases");
    const counts = new Map();
    const cases = report.cases.map(normalizeCase).filter((testCase) => {
      const seen = counts.get(testCase.scenario) ?? 0;
      counts.set(testCase.scenario, seen + 1);
      return !options.boardsExplicit || seen < options.boards;
    });
    return { cases, config: { ...defaultConfig, ...report.config }, provenance: {
      mode: "development_fixture_reuse", source: options.fixtureReport,
      sha256: hash(text), sourceCaseCount: report.cases.length,
      holdoutClaim: false, seedUsedForBoardGeneration: false } };
  }
  const exclusions = new Set();
  const sources = [];
  function addBoards(file, boards, text) {
    const before = exclusions.size;
    for (const board of boards) {
      const flat = board.flat();
      if (flat.length !== 36) throw new Error(`Invalid exclusion board in ${file}`);
      exclusions.add(colorKey(board));
    }
    sources.push({ path: file, sha256: hash(text), rows: boards.length, additionalDistinctBoards: exclusions.size - before });
  }
  const fixedPath = "fixed_test_suite.json";
  const fixed = fs.readFileSync(fixedPath, "utf8");
  addBoards(fixedPath, JSON.parse(fixed), fixed);
  const webPath = "public/solver-bench/proxy_web_corpus_20260810.jsonl";
  const webText = fs.readFileSync(webPath, "utf8");
  addBoards(webPath, webText.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line).board), webText);
  const reports = new Set(options.exclusions.map((file) => path.resolve(file)));
  for (const dir of ["reports/solver-update-20260909", "reports/solver-next-20260909"]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) if (name.endsWith(".json")) reports.add(path.resolve(dir, name));
  }
  for (const file of reports) {
    const text = fs.readFileSync(file, "utf8");
    const report = JSON.parse(text);
    if (Array.isArray(report.cases)) addBoards(file, report.cases.map((item) => item.board), text);
    else if (options.exclusions.some((explicit) => path.resolve(explicit) === file)) throw new Error(`Excluded report has no cases: ${file}`);
  }
  let state = options.seed || 0x6d2b79f5;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const cases = [];
  const generated = new Set();
  for (const scenario of SCENARIOS) for (let boardIndex = 0; boardIndex < options.boards; boardIndex++) {
    let board;
    let key;
    do {
      board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => Math.floor(random() * 6)));
      key = colorKey(board);
    } while (exclusions.has(key) || generated.has(key));
    generated.add(key);
    const ruleProfile = defaultProfile();
    const specials = [];
    if (scenario === "row0_start_markers") {
      board[0][2] += 100; board[3][2] += 220; board[2][4] += 10;
      board[3][4] += 1000; board[4][4] += 2000;
    }
    if (scenario === "ordered_requirement") ruleProfile.requirements = [
      { orb: 1, size: 5, count: 1, match: "exact" }, { orb: 0, size: 3, count: 2, match: "exact" },
    ];
    if (scenario === "special_shape") specials.push({ type: "cross", orb: -1, count: 1 });
    cases.push(normalizeCase({ id: `${scenario}-${boardIndex + 1}`, scenario, boardIndex, board,
      searchSeed: Math.floor(random() * 4294967296), diagonal: scenario !== "no_diagonal",
      skyfall: scenario !== "no_skyfall", useRow0: scenario === "row0_start_markers", ruleProfile, specials }, cases.length));
  }
  return { cases, config: { ...defaultConfig }, provenance: { mode: "fresh_generated_holdout",
    seed: options.seed, exclusionSources: sources, distinctExcludedBoards: exclusions.size,
    overlaps: 0, generatedDuplicateBoards: 0 } };
}

async function loadVariant(sourcePath) {
  const text = fs.readFileSync(sourcePath, "utf8");
  const ast = parser.parse(text, { sourceType: "module", plugins: ["jsx"] });
  const globals = {};
  const dependencies = [];
  for (const statement of ast.program.body) {
    if (statement.type !== "ImportDeclaration" || !statement.source.value.startsWith("./solver/")) continue;
    const relative = statement.source.value + (path.extname(statement.source.value) ? "" : ".js");
    const local = path.resolve(path.dirname(sourcePath), relative);
    const resolved = fs.existsSync(local) ? local : path.resolve("src", relative);
    const dependencyHash = fileHash(resolved);
    const module = await import(`${pathToFileURL(resolved).href}?round2sha=${dependencyHash}`);
    for (const specifier of statement.specifiers) {
      globals[specifier.local.name] = specifier.type === "ImportNamespaceSpecifier" ? module :
        specifier.type === "ImportDefaultSpecifier" ? module.default : module[specifier.imported.name];
      if (globals[specifier.local.name] === undefined) throw new Error(`Missing imported solver binding: ${specifier.local.name}`);
    }
    dependencies.push({ import: statement.source.value, path: resolved, sha256: dependencyHash,
      source: resolved === local ? "source_adjacent" : "shared_workspace_fallback" });
  }
  const solver = await loadWebSolver(sourcePath, globals);
  if (solver.sourceMetadata.sha256 !== hash(text)) throw new Error(`Source changed while loading: ${sourcePath}`);
  return { solver, metadata: { ...solver.sourceMetadata, dependencies } };
}
function nativeMetadata(result) {
  if (!result) return null;
  const metadata = {};
  for (const [key, value] of Object.entries(result)) {
    if (!/(?:runtime|timing|elapsed|duration|stage|repair|nodesExpanded|deadline|budget|comboBounds|status|success)/i.test(key)) continue;
    if (typeof value === "function" || value === undefined) continue;
    metadata[key] = clone(value);
  }
  return metadata;
}
async function runCore(variant, loaded, testCase, config, budgetMs, repeat, executionOrder) {
  // Prepare identical inputs before starting each native core clock. Absolute
  // deadlines are then passed to both versions from the same timing boundary.
  const board = clone(testCase.board);
  const rules = clone(testCase.ruleProfile);
  const specials = clone(testCase.specials);
  const cfg = { ...config, searchSeed: testCase.searchSeed, timeBudgetMs: budgetMs };
  delete cfg.deadlineAt;
  let result = null;
  let error = null;
  const startedAt = performance.now();
  cfg.deadlineAt = startedAt + budgetMs;
  try {
    result = await loaded.solver.beamSolve(board, cfg, testCase.target, testCase.mode,
      testCase.priority, testCase.skyfall, testCase.diagonal, specials,
      testCase.initTargetCombo, testCase.useRow0, rules, null);
  } catch (caught) { error = caught?.stack ?? String(caught); }
  const elapsedCoreMs = performance.now() - startedAt;
  return { variant, caseId: testCase.id, scenario: testCase.scenario, repeat, executionOrder,
    elapsedCoreMs, budgetMs, deadlineMiss: elapsedCoreMs > budgetMs,
    onTimeReturn: !!result && !error && elapsedCoreMs <= budgetMs, error, result };
}
function analyzeRun(run, testCase, config) {
  const poolName = testCase.priority === "steps" ? "topSteps" : "topCombos";
  const rawPool = Array.isArray(run.result?.[poolName]) ? run.result[poolName] : [];
  const nativeTop10 = rawPool.map((solution, originalIndex) => ({ originalIndex, ...verifyNative(testCase, solution, config) }));
  const canonical = canonicalTop10(nativeTop10);
  const bestByGroup = new Map(canonical.map((item) => [item.signature, item]));
  const seen = new Set();
  const nativeViolations = { illegal: 0, duplicateGroups: 0, outOfOrderPairs: 0, inferiorDuplicateRepresentative: 0 };
  for (let i = 0; i < nativeTop10.length; i++) {
    const item = nativeTop10[i];
    if (!item.legal) { nativeViolations.illegal++; continue; }
    if (seen.has(item.signature)) nativeViolations.duplicateGroups++;
    seen.add(item.signature);
    if (nativeTop10[i - 1]?.legal && compareRanks(item.rank, nativeTop10[i - 1].rank) > 0) nativeViolations.outOfOrderPairs++;
    if (compareRanks(bestByGroup.get(item.signature).rank, item.rank) > 0) nativeViolations.inferiorDuplicateRepresentative++;
  }
  const { result, ...timing } = run;
  return { ...timing, nativePoolName: poolName, nativeTop10, canonicalTop10: canonical, nativeViolations,
    nativeBest: result?.path?.length ? verifyNative(testCase, result, config) : null,
    nativeMetadata: nativeMetadata(result),
    nativeClaimedSuccess: result?.success ?? null,
    verifiedNativeSuccess: result?.path?.length ? verifyNative(testCase, result, config).allRequirementsSuccess ?? false : false };
}
function selfTest() {
  const item = (signature, steps, prefix = [1, 1, 0, 1, 6]) => ({ legal: true, signature, steps, qualityPrefix: prefix, rank: [...prefix, -steps] });
  assert.equal(compareRanks([1, 1, 0, 0, 0, 3, -30], [1, 0, 1, 7, 1, 10, -1]), 1);
  const group = canonicalTop10([item("6+0", 12), item("6+0", 8), { legal: false }, item("5+1", 10)]);
  assert.equal(group.length, 2);
  assert.equal(group[0].steps, 8);
  const a = { caseId: "x", scenario: "test", repeat: 0, elapsedCoreMs: 159, onTimeReturn: true,
    deadlineMiss: false, canonicalTop10: [item("6+0", 8), item("5+1", 12)] };
  const b = { ...a, elapsedCoreMs: 161, onTimeReturn: false, deadlineMiss: true,
    canonicalTop10: [item("6+0", 7), item("5+1", 10)] };
  const pair = compareTrialPair(a, b);
  assert.equal(pair.qualityWinnerReturned, "candidate");
  assert.equal(pair.qualityWinnerOnTime, "baseline");
  assert.equal(pair.commonSignatures.length, 2);
  assert.equal(summarizeSteps([pair]).pooledMeanStepDelta, -1.5);
  assert.equal(summarizeSteps([pair], true).comparableGroupPairs, 0);
  const empty = { ...b, canonicalTop10: [], error: "failure" };
  assert.equal(compareTrialPair(a, empty).qualityWinnerReturned, "baseline");
  const differentPriority = { ...b, canonicalTop10: [item("6+0", 2, [1, 0, 0, 1, 6])] };
  assert.equal(compareTrialPair(a, differentPriority).commonSignatures[0].stepDelta, null);
  process.stdout.write("round2 harness self-test: 11 assertions passed; no solver was run.\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node tools/compare_solver_round2.mjs [--baseline FILE] [--candidate FILE] [--seed N] [--boards N] [--repeats N] [--budget MS] [--out FILE]\n  --fixture-report FILE: reuse saved cases for development; --boards optionally caps each scenario.\n  --exclude-report FILE: additional fresh-board exclusions (repeatable).\n  --prepare-only: save case/config provenance without running either solver.\n  --self-test: check ranking, late/empty handling, and all-common-signature step comparisons without running solvers.\n");
    return;
  }
  if (options.selfTest) { selfTest(); return; }
  const fixture = loadCases(options);
  const config = { ...fixture.config, timeBudgetMs: options.budgetMs };
  delete config.deadlineAt;
  const manifest = { schemaVersion: 2, generatedAt: new Date().toISOString(), cases: fixture.cases,
    caseSetSha256: hash(JSON.stringify(fixture.cases)), config, provenance: fixture.provenance,
    independentBoards: new Set(fixture.cases.map((item) => colorKey(item.board))).size,
    seed: options.seed, repeats: options.repeats, budgetMs: options.budgetMs };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  if (options.prepareOnly) {
    fs.writeFileSync(options.out, JSON.stringify({ ...manifest, status: "PREPARED_NOT_BENCHMARKED", trials: [] }, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ outputPath: options.out, status: "PREPARED_NOT_BENCHMARKED", cases: fixture.cases.length, caseSetSha256: manifest.caseSetSha256 }) + "\n");
    return;
  }
  const scriptPaths = ["tools/compare_solver_round2.mjs", "tools/load_web_solver.mjs", "tools/solver_reference.mjs"];
  const scriptHashes = Object.fromEntries(scriptPaths.map((file) => [file, fileHash(file)]));
  const loaded = { baseline: await loadVariant(options.baseline), candidate: await loadVariant(options.candidate) };
  const sourceMetadata = Object.fromEntries(Object.entries(loaded).map(([variant, value]) => [variant, value.metadata]));
  for (const [variant, metadata] of Object.entries(sourceMetadata)) process.stderr.write(`Loaded ${variant} ${metadata.sha256} at ${metadata.sourceReadAt}\n`);
  const warmups = [];
  for (let repeat = 0; repeat < 2; repeat++) for (const variant of repeat ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
    const run = await runCore(variant, loaded[variant], fixture.cases[repeat % fixture.cases.length], config, options.budgetMs, repeat, 0);
    warmups.push({ variant, elapsedCoreMs: run.elapsedCoreMs, deadlineMiss: run.deadlineMiss,
      error: run.error, nativeMetadata: nativeMetadata(run.result) });
  }
  const trials = [];
  const pairs = [];
  for (let caseIndex = 0; caseIndex < fixture.cases.length; caseIndex++) {
    const testCase = fixture.cases[caseIndex];
    const blockRuns = [];
    for (let repeat = 0; repeat < options.repeats; repeat++) {
      const order = (caseIndex + repeat) % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
      for (let position = 0; position < order.length; position++) {
        const variant = order[position];
        blockRuns.push(await runCore(variant, loaded[variant], testCase, config, options.budgetMs, repeat, position));
      }
    }
    // Analyze only after the complete ABBA/BAAB block, never between its runs.
    const block = blockRuns.map((run) => analyzeRun(run, testCase, config));
    trials.push(...block);
    for (let repeat = 0; repeat < options.repeats; repeat++) pairs.push(compareTrialPair(
      block.find((run) => run.variant === "baseline" && run.repeat === repeat),
      block.find((run) => run.variant === "candidate" && run.repeat === repeat)));
    process.stderr.write(`Compared ${testCase.id}: ${options.repeats} paired native-return trials\n`);
  }
  const summary = Object.fromEntries(["baseline", "candidate"].map((variant) =>
    [variant, summarizeTrials(trials.filter((run) => run.variant === variant))]));
  const unchangedSources = Object.values(sourceMetadata).every((metadata) => fileHash(metadata.path) === metadata.sha256 &&
    metadata.dependencies.every((dependency) => fileHash(dependency.path) === dependency.sha256));
  const report = { ...manifest, generatedAt: new Date().toISOString(), status: "DESCRIPTIVE_NATIVE_CORE_COMPARISON",
    measurement: "Both versions run their native deadline and return their own Top10. No endpoint observer or forced interruption is installed; this is not browser UI latency.",
    schedule: "For each board, AB then BA (next board BA then AB), alternating for further repeats; reference replay runs only after the complete board block.",
    limitations: [
      "All late, empty, and error trials remain in the report. Returned-quality and on-time-delivery outcomes are separate.",
      "Canonical ranking only uses independently verified candidates actually returned in the native Top10; native order and violations are preserved separately.",
      "Every common Top10 signature is compared; steps are comparable only when all higher-priority outcomes are equal.",
      "Repeated trials and common signatures are correlated measurements, not additional independent boards. No statistical PASS is declared.",
      "Random-case feasibility and global minimum-step/maximum-combo optimality are not certified by this experiment.",
      "Per-stage timings are reported only when the native solver supplies them; missing timings are not inferred.",
    ], environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    sourceMetadata, scriptHashes, sourcesUnchangedDuringRun: unchangedSources &&
      Object.entries(scriptHashes).every(([file, expected]) => fileHash(file) === expected),
    warmups, summary, pairedSummary: summarizePairs(pairs),
    byScenario: Object.fromEntries([...new Set(fixture.cases.map((item) => item.scenario))].map((scenario) => [scenario, {
      baseline: summarizeTrials(trials.filter((run) => run.scenario === scenario && run.variant === "baseline")),
      candidate: summarizeTrials(trials.filter((run) => run.scenario === scenario && run.variant === "candidate")),
      paired: summarizePairs(pairs.filter((pair) => pair.scenario === scenario)),
    }])), trials, pairs };
  fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + "\n");
  const pct = (value) => value == null ? "n/a" : `${(value * 100).toFixed(2)}%`;
  const num = (value) => value == null ? "n/a" : value.toFixed(3);
  const markdown = ["# Native solver comparison", "", report.measurement, "",
    `Mode: ${fixture.provenance.mode}; independent boards: ${manifest.independentBoards}; repeats: ${options.repeats}; budget: ${options.budgetMs} ms.`, "",
    "| Metric | Previous version | Candidate |", "|---|---:|---:|",
    ...["p50", "p95", "p99", "max"].map((key) => `| Core ${key} ms | ${num(summary.baseline.elapsedCoreMs[key])} | ${num(summary.candidate.elapsedCoreMs[key])} |`),
    `| Deadline miss rate | ${pct(summary.baseline.deadlineMissRate)} | ${pct(summary.candidate.deadlineMissRate)} |`,
    `| All requirements met in returned Top10 | ${pct(summary.baseline.allRequirementsSuccessTop10Rate)} | ${pct(summary.candidate.allRequirementsSuccessTop10Rate)} |`,
    `| On-time all-requirements Top10 delivery | ${pct(summary.baseline.onTimeAllRequirementsSuccessTop10Rate)} | ${pct(summary.candidate.onTimeAllRequirementsSuccessTop10Rate)} |`, "",
    `Returned quality W/L/T: ${JSON.stringify(report.pairedSummary.returnedQualityWLT)}.`,
    `On-time quality W/L/T: ${JSON.stringify(report.pairedSummary.onTimeQualityWLT)}.`,
    `All common signatures at equal quality: ${JSON.stringify(report.pairedSummary.allCommonSignatureSteps)}.`,
    `Both on time, common signatures at equal quality: ${JSON.stringify(report.pairedSummary.onTimeCommonSignatureSteps)}.`, "",
    ...report.limitations.map((item) => `- ${item}`), ""].join("\n");
  fs.writeFileSync(options.out.replace(/\.json$/i, "") + ".md", markdown);
  process.stdout.write(JSON.stringify({ outputPath: options.out, sourcesUnchangedDuringRun: report.sourcesUnchangedDuringRun,
    summary, pairedSummary: report.pairedSummary }) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
