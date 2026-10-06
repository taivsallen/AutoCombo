#!/usr/bin/env node
// Reproducible differential check of pure elimination, not path search or speed.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { loadWebSolver } from "./load_web_solver.mjs";
import { evaluateReference } from "./solver_reference.mjs";
import { estimateComboUpperBound } from "../src/solver/comboBound.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[index + 1];
};
const boardCount = Number(option("--boards", 500));
const seedInput = Number(option("--seed", 0x20260909));
if (!Number.isInteger(boardCount) || boardCount < 1) throw new Error("--boards must be a positive integer");
if (!Number.isInteger(seedInput) || seedInput < 0 || seedInput > 0xffffffff) throw new Error("--seed must be a uint32 integer");
const seed = seedInput >>> 0;
const sourcePath = path.resolve(option("--source", "src/App.jsx"));
const outputPath = path.resolve(option("--out", "reports/solver-update-20260909/reference-differential.json"));
const counterexamplePath = outputPath.replace(/\.json$/i, "") + ".counterexample.json";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const helperPaths = ["tools/check_solver_reference.mjs", "tools/load_web_solver.mjs", "tools/solver_reference.mjs",
  "src/solver/comboBound.js", "src/solver/solutionRanking.js", "src/solver/pathReplay.js", "package-lock.json"];
const helperHashes = Object.fromEntries(helperPaths.map((file) => [file, hash(fs.readFileSync(file))]));
const generatedAt = new Date().toISOString();
const started = performance.now();
const web = await loadWebSolver(sourcePath);

let randomState = seed || 0x6d2b79f5;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
};
const profileCoverage = Array.from({ length: 6 }, () => ({}));
const markCoverage = { unmarked: 0, N1: 0, N2: 0 };
const cases = Array.from({ length: boardCount }, (_, boardIndex) => {
  const board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => {
    const type = Math.floor(random() * 6);
    const markChoice = random();
    const noClearMark = markChoice < 0.1 ? 1 : markChoice < 0.2 ? 2 : 0;
    markCoverage[noClearMark === 1 ? "N1" : noClearMark === 2 ? "N2" : "unmarked"]++;
    return type + noClearMark * 1000;
  }));
  // Guarantee all six types in every board, preserving independently drawn marks.
  const colors = [0, 1, 2, 3, 4, 5];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  for (let col = 0; col < 6; col++) board[5][col] = Math.floor(board[5][col] / 10) * 10 + colors[col];
  const ruleProfile = {
    orbRules: Array.from({ length: 6 }, (_, orb) => {
      const minClear = 1 + ((boardIndex + orb) % 5);
      const clearMode = Math.floor((boardIndex + orb) / 5) % 2 ? "connected" : "line";
      const key = `${minClear}:${clearMode}`;
      profileCoverage[orb][key] = (profileCoverage[orb][key] ?? 0) + 1;
      return { minClear, clearMode };
    }),
    requirements: [],
  };
  return { id: `differential-${boardIndex}`, boardIndex, board, ruleProfile };
});

const count = (value, label) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative integer`);
  return value;
};
const sixCounts = (value, label) => {
  // Web uses Int16Array(8), with two unused zero slots; reference uses Array(6).
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  if (!Array.isArray(value) || ![6, 8].includes(value.length)) throw new TypeError(`${label} must contain six orb counts or eight zero-padded Web slots`);
  const checked = value.map((entry, orb) => count(entry, `${label}[${orb}]`));
  if (checked.slice(6).some((entry) => entry !== 0)) throw new TypeError(`${label} contains counts in unused orb slots`);
  return checked.slice(0, 6);
};
const patternCounter = (value, label) => {
  if (!value || typeof value !== "object") throw new TypeError(`${label} is missing`);
  const byOrb = sixCounts(value.byOrb, `${label}.byOrb`);
  const total = count(value.total, `${label}.total`);
  if (byOrb.reduce((sum, entry) => sum + entry, 0) !== total) throw new TypeError(`${label} count invariant failed`);
  return { total, byOrb };
};

// Only compare shared fields whose meaning agrees in both implementations.
// App's aliases comboCountsByOrb/comboSizeCountsByOrb describe the INITIAL batch,
// even with cascades enabled; there is no shared total-batch histogram schema.
function comparableEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object") throw new TypeError("Evaluation must be an object");
  const normalized = {};
  for (const key of ["combos", "initialCombos", "skyfallCombos", "initialClearedCount", "clearedCount"]) {
    normalized[key] = count(evaluation[key], key);
  }
  normalized.initialComboCountsByOrb = sixCounts(evaluation.initialComboCountsByOrb, "initialComboCountsByOrb");
  if (!Array.isArray(evaluation.initialComboSizeCountsByOrb) || evaluation.initialComboSizeCountsByOrb.length !== 6) {
    throw new TypeError("initialComboSizeCountsByOrb must contain six histogram objects");
  }
  normalized.initialComboSizeCountsByOrb = evaluation.initialComboSizeCountsByOrb.map((sizes, orb) => {
    if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) throw new TypeError(`Histogram ${orb} must be an object`);
    const result = {};
    for (const key of Object.keys(sizes).sort((a, b) => Number(a) - Number(b))) {
      if (!/^[1-9][0-9]*$/.test(key) || Number(key) > 30) throw new TypeError(`Invalid histogram size ${key}`);
      const n = count(sizes[key], `histogram[${orb}][${key}]`);
      if (n) result[key] = n; // An omitted size and an explicit zero mean the same count.
    }
    return result;
  });
  const patterns = evaluation.initialPatternCounts;
  normalized.initialPatternCounts = {};
  for (const key of ["cross", "l", "t"]) normalized.initialPatternCounts[key] = patternCounter(patterns?.[key], `initialPatternCounts.${key}`);
  normalized.initialPatternCounts.rect = {};
  for (let m = 3; m <= 5; m++) for (let n = 3; n <= 5; n++) {
    const key = `${m}x${n}`;
    normalized.initialPatternCounts.rect[key] = patternCounter(patterns?.rect?.[key], `initialPatternCounts.rect.${key}`);
  }
  const histogramGroups = normalized.initialComboSizeCountsByOrb.map((sizes) => Object.values(sizes).reduce((sum, n) => sum + n, 0));
  const histogramCleared = normalized.initialComboSizeCountsByOrb.reduce((sum, sizes) =>
    sum + Object.entries(sizes).reduce((subtotal, [size, n]) => subtotal + Number(size) * n, 0), 0);
  if (JSON.stringify(histogramGroups) !== JSON.stringify(normalized.initialComboCountsByOrb)
      || histogramGroups.reduce((sum, n) => sum + n, 0) !== normalized.initialCombos
      || histogramCleared !== normalized.initialClearedCount
      || normalized.initialCombos + normalized.skyfallCombos !== normalized.combos
      || normalized.initialClearedCount > normalized.clearedCount) {
    throw new TypeError("Evaluation combo/count/histogram invariants failed");
  }
  return normalized;
}

const summary = { plannedBoards: boardCount, plannedCases: boardCount * 2, checkedCases: 0,
  matchedCases: 0, mismatchedCases: 0, boundChecks: 0, boundViolations: 0,
  skyfallOff: { checked: 0, matched: 0 }, skyfallOn: { checked: 0, matched: 0 } };
const caseResults = [];
let counterexample = null;
checkCases: for (const fixture of cases) for (const skyfall of [false, true]) {
  const id = `${fixture.id}:${skyfall ? "skyfall-on" : "skyfall-off"}`;
  const differences = [];
  let actual, expected, actualNormalized, expectedNormalized, initialBound, totalBound;
  try {
    // Snapshot immediately: callers must not retain references to solver scratch data.
    actual = JSON.parse(JSON.stringify(web.evaluateBoard(fixture.board.map((row) => row.slice()), skyfall, null, fixture.ruleProfile),
      (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
    expected = evaluateReference(fixture.board, { skyfall, ruleProfile: fixture.ruleProfile });
    actualNormalized = comparableEvaluation(actual);
    expectedNormalized = comparableEvaluation(expected);
    for (const key of Object.keys(expectedNormalized)) {
      if (JSON.stringify(actualNormalized[key]) !== JSON.stringify(expectedNormalized[key])) {
        differences.push({ field: key, actual: actualNormalized[key], expected: expectedNormalized[key] });
      }
    }
    // This experiment has no route/row0 copy: disabling row0 yields the tighter bound.
    initialBound = estimateComboUpperBound(fixture.board, { useRow0: false, ruleProfile: fixture.ruleProfile, phase: "initial" });
    totalBound = estimateComboUpperBound(fixture.board, { useRow0: false, ruleProfile: fixture.ruleProfile, phase: "total" });
    for (const [field, bound] of [["initialCombos", initialBound], ["combos", totalBound]]) {
      summary.boundChecks++;
      if (expected[field] > bound.upperBound) {
        summary.boundViolations++;
        differences.push({ field: `${field} <= inventory upper bound`, actual: expected[field], upperBound: bound });
      }
    }
  } catch (error) {
    differences.push({ field: "schema_or_execution", error: error.stack || String(error) });
  }
  summary.checkedCases++;
  const stratum = skyfall ? summary.skyfallOn : summary.skyfallOff;
  stratum.checked++;
  const matched = differences.length === 0;
  if (matched) { summary.matchedCases++; stratum.matched++; }
  else summary.mismatchedCases++;
  caseResults.push({ id, boardHash: hash(JSON.stringify(fixture.board)), skyfall, matched,
    actual: actualNormalized, expected: expectedNormalized,
    initialUpperBound: initialBound?.upperBound, totalUpperBound: totalBound?.upperBound });
  if (!matched) {
    counterexample = { id, ...fixture, skyfall, differences, actual, expected, initialBound, totalBound };
    break checkCases;
  }
}
const helpersAfter = Object.fromEntries(helperPaths.map((file) => [file, hash(fs.readFileSync(file))]));
const sourceHashAfter = hash(fs.readFileSync(sourcePath));
const changedDuringRun = helperPaths.filter((file) => helperHashes[file] !== helpersAfter[file]);
if (sourceHashAfter !== web.sourceMetadata.sha256) changedDuringRun.push(sourcePath);
const passed = !counterexample && changedDuringRun.length === 0 && summary.checkedCases === summary.plannedCases;
const report = {
  experiment: "pure-elimination-reference-differential", generatedAt, completedAt: new Date().toISOString(),
  seed, seedHex: `0x${seed.toString(16).padStart(8, "0")}`, status: passed ? "PASS" : "FAIL",
  source: web.sourceMetadata, sourceHashAfter, helperHashes, helpersAfter, changedDuringRun,
  runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  elapsedMs: performance.now() - started,
  generation: { algorithm: "xorshift32", fallbackStateForZeroSeed: "0x6d2b79f5", ruleSchedule: "per-orb 10-board cycle covers minClear 1..5 x line/connected",
    marks: "independent 10% N1, 10% N2, 80% unmarked; no path markers", colors: "random six types; bottom row shuffled to guarantee every type", profileCoverage, markCoverage },
  comparedFields: ["combos", "initialCombos", "skyfallCombos", "initialClearedCount", "clearedCount",
    "initialComboCountsByOrb", "initialComboSizeCountsByOrb", "initialPatternCounts (cross/l/t/all 3..5 rectangles)"],
  schemaNormalization: "Web Int16Array(8) counters normalize to six orb counts after verifying unused slots 6/7 are zero; histogram missing/zero sizes are equivalent",
  boundChecks: "reference initial/total combos must not exceed phase-specific inventory bounds; row0 disabled because no path is applied",
  limitations: ["Pure board elimination only; no drag-route, shield achievement, ordering, Top10 or latency certification",
    "Random differential agreement is not a proof of correctness; shared misunderstandings remain possible",
    "Initial histograms only: App does not expose a total-batch histogram with matching semantics",
    "Stops at first counterexample; all generated fixtures remain in the report for replay"],
  summary, fixtureHash: hash(JSON.stringify(cases)), cases, caseResults,
  counterexamplePath: counterexample ? counterexamplePath : null, counterexample,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
if (counterexample) fs.writeFileSync(counterexamplePath, JSON.stringify({ source: report.source, helperHashes, seed, counterexample }, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, outputPath, summary, changedDuringRun, counterexamplePath: report.counterexamplePath }));
if (!passed) process.exitCode = 1;
