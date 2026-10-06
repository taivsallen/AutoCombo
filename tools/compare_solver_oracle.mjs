#!/usr/bin/env node
// Reproducible small-depth exact-reference comparison of the actual Web core.
// This is a bounded correctness/quality experiment, not unrestricted optimality
// or a measurement of browser click-to-DOM delivery latency.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { loadWebSolver } from "./load_web_solver.mjs";
import { enumerateOracle } from "./solver_oracle.mjs";
import { verifySolution } from "./solver_reference.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[index + 1];
};
const seed = Number(option("--seed", 0x20260910)) >>> 0;
const caseCount = Number(option("--cases", 18));
if (!Number.isInteger(caseCount) || caseCount < 1 || caseCount > 24) throw new Error("--cases must be an integer in 1..24");
const sourcePath = path.resolve(option("--source", "src/App.jsx"));
const outputPath = path.resolve(option("--out", "reports/solver-update-20260909/oracle-comparison.json"));
const markdownPath = outputPath.replace(/\.json$/i, "") + ".md";
const budgetMs = 160;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const dependencyPaths = ["tools/compare_solver_oracle.mjs", "tools/solver_reference.mjs", "tools/solver_oracle.mjs", "tools/load_web_solver.mjs",
  "src/solver/solutionRanking.js", "src/solver/pathReplay.js", "src/solver/comboBound.js"];
const dependencyHashes = Object.fromEntries(dependencyPaths.map((file) => [file, sha256(fs.readFileSync(file))]));

let randomState = seed || 0x6d2b79f5;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
};
const makeProfile = () => ({
  orbRules: Array.from({ length: 6 }, () => ({ minClear: 3, clearMode: "line" })),
  requirements: [],
});
const scenarios = ["ordinary", "no_diagonal", "no_skyfall", "row0_start", "row0_collision",
  "start_end_markers", "ordered_requirements", "mixed_clear_rules", "shape_shields"];
const cases = Array.from({ length: caseCount }, (_, index) => {
  const scenario = scenarios[Math.floor(index / 2) % scenarios.length];
  const variant = index % 2;
  const board = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => Math.floor(random() * 6)));
  // Every fixture contains all six orb types, independently of random chance.
  board[5] = Array.from({ length: 6 }, (_, orb) => (orb + index) % 6);
  const maxSteps = variant === 0 ? 2 : 3;
  const start = scenario === "row0_start" ? { r: 0, c: 2 }
    : scenario === "row0_collision" ? { r: 1, c: 2 } : { r: 2, c: 2 };
  const end = scenario === "row0_start" ? { r: 2, c: 3 }
    : scenario === "row0_collision" ? { r: 0, c: 3 }
      : variant === 0 ? { r: 3, c: 3 } : { r: 2, c: 3 };
  const ruleProfile = makeProfile();
  const specials = [];
  if (scenario === "start_end_markers") {
    board[1][1] += 10; // X1
    board[4][2] += 1000; // N1
    board[3][4] += 2000; // N2
  }
  if (scenario === "ordered_requirements") {
    ruleProfile.requirements = [
      { orb: 1, size: 3, count: 1, match: "exact" },
      { orb: 0, size: 3, count: 1, match: "atLeast" },
    ];
    board[4][0] = board[4][1] = 1;
    board[3][0] = 1;
  }
  if (scenario === "mixed_clear_rules") {
    ruleProfile.orbRules = Array.from({ length: 6 }, (_, orb) => ({
      minClear: 1 + ((orb + variant) % 5), clearMode: orb % 2 === variant ? "connected" : "line",
    }));
    board[4][2] += 1000;
    board[3][4] += 2000;
    specials.push({ type: "clearCount", clearCount: 6 }, { type: "equalFirst", equalOrbs: [0, 1] });
  }
  if (scenario === "shape_shields") {
    for (const [r, c] of [[2, 3], [3, 2], [3, 3], [3, 4], [4, 3]]) board[r][c] = 4;
    specials.push({ type: "cross", orb: 4, count: 1 }, { type: "clearCount", clearCount: 5 });
    if (variant === 1) specials.push({ type: "equalFirst", equalOrbs: [1, 4] });
  }
  // Different START/END coordinates exclude zero-step paths identically in the
  // oracle and the current Web core, whose result pools require >=1 step.
  board[start.r][start.c] += 100;
  board[end.r][end.c] += 200 + (scenario === "start_end_markers" ? 20 : 0);
  return {
    id: `${scenario}-${variant + 1}`, scenario, variant, board, start, end, maxSteps,
    boardHash: sha256(JSON.stringify(board)), searchSeed: Math.floor(random() * 4294967296),
    diagonal: scenario !== "no_diagonal" && (variant === 0 || scenario === "shape_shields"),
    skyfall: scenario !== "no_skyfall", useRow0: scenario.startsWith("row0_"),
    initTargetCombo: 2 + variant, ruleProfile, specials,
  };
});

const config = {
  beamWidth: 440, maxNodes: 50000, timeBudgetMs: budgetMs,
  evalWorkers: 1, browserYield: false, humanPlanner: false, reversePlanner: false,
  reverseMaxSteps: 60, deferMoveMaterialization: true, cheapLocalGuidance: true,
  cheapLegacyReserve: 0.25, cheapEvalScale: 2, cheapEvalConstraintScale: 2.5,
  stepPenalty: 0, potentialWeight: 10, clearedWeight: 300,
};
const compare = (left, right) => {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};
const specialRank = (done) => {
  const mask = (done[0] ? 4 : 0) | (done[1] ? 2 : 0) | (done[2] ? 1 : 0);
  return [0, 1, 2, 4, 3, 5, 6, 7][mask];
};
const caseOptions = (testCase) => ({
  maxSteps: testCase.maxSteps, diagonal: testCase.diagonal, useRow0: testCase.useRow0,
  skyfall: testCase.skyfall, ruleProfile: testCase.ruleProfile,
  specials: testCase.specials, initTargetCombo: testCase.initTargetCombo,
});
const serialize = (solution, verified) => {
  if (!verified.legal || !verified.evaluation) return { legal: false, errors: verified.errors, path: solution?.path ?? null };
  const ev = verified.evaluation;
  const requirementsDone = ev.requirements.map((req) => Number(req.satisfied));
  const specialsDone = ev.specials.map((special) => Number(special.satisfied));
  return {
    legal: true, errors: [], path: solution.path, steps: verified.steps,
    signature: `${ev.initialCombos}|${ev.skyfallCombos}`, initialCombos: ev.initialCombos,
    skyfallCombos: ev.skyfallCombos, combos: ev.combos,
    requirementsDone, specialsDone, requirementsSatisfied: verified.requirements_satisfied,
    specialsSatisfied: verified.special_satisfied, initialSatisfied: verified.initial_satisfied,
    allRequirementsSuccess: verified.success,
    rank: [1, ...requirementsDone, specialRank(specialsDone), Number(verified.initial_satisfied), ev.combos, -verified.steps],
  };
};
const solver = await loadWebSolver(sourcePath);
process.stderr.write(`Loaded Web source ${solver.sourceMetadata.sha256}\n`);

async function runCore(testCase) {
  const started = performance.now();
  let result = null;
  let error = null;
  try {
    result = await solver.beamSolve(testCase.board.map((row) => row.slice()),
      { ...config, maxSteps: testCase.maxSteps, hardStepLimitEnabled: true,
        hardStepLimit: testCase.maxSteps, searchSeed: testCase.searchSeed },
      10, "free", "combo", testCase.skyfall, testCase.diagonal,
      testCase.specials, testCase.initTargetCombo, testCase.useRow0, testCase.ruleProfile, null);
  } catch (caught) { error = caught?.stack ?? String(caught); }
  return { result, error, elapsedCoreMs: performance.now() - started };
}

// Exercise the actual solve path, not a no-op adapter warmup branch.
const warmups = [];
for (let i = 0; i < Math.min(3, cases.length); i++) {
  const warmup = await runCore(cases[i]);
  warmups.push({ caseId: cases[i].id, elapsedCoreMs: warmup.elapsedCoreMs, error: warmup.error });
}

const rows = [];
for (const testCase of cases) {
  const options = caseOptions(testCase);
  const oracle = enumerateOracle(testCase.board, { ...options, startCells: [testCase.start],
    maxStates: 100000, timeLimitMs: 10000 });
  const run = await runCore(testCase);
  const nativeSolutions = run.result?.topCombos ?? [];
  const nativeTop10 = nativeSolutions.map((solution, index) => ({ index,
    ...serialize(solution, verifySolution(testCase.board, solution, options)) }));
  const extraBest = run.result?.path?.length
    ? serialize(run.result, verifySolution(testCase.board, run.result, options)) : null;
  const bySignature = new Map();
  for (const candidate of [...nativeTop10, ...(extraBest ? [extraBest] : [])]) {
    if (!candidate.legal) continue;
    const previous = bySignature.get(candidate.signature);
    if (!previous || compare(candidate.rank, previous.rank) > 0) bySignature.set(candidate.signature, candidate);
  }
  const top10 = [...bySignature.values()].sort((a, b) => -compare(a.rank, b.rank)).slice(0, 10);
  const serializeOracle = (solution) => solution
    ? serialize(solution, verifySolution(testCase.board, solution, options)) : null;
  const oracleTop10 = oracle.top10.map(serializeOracle);
  const oracleGroups = oracle.groups.map(serializeOracle);
  const oracleBest = serializeOracle(oracle.best);
  const best = top10[0] ?? null;
  const oracleBySignature = new Map(oracleGroups.map((group) => [group.signature, group]));
  const nativeSeen = new Set();
  const nativeViolations = { illegal: 0, duplicateGroups: 0, outOfOrderPairs: 0, inferiorGroupRepresentatives: 0 };
  for (let i = 0; i < nativeTop10.length; i++) {
    const candidate = nativeTop10[i];
    if (!candidate.legal) { nativeViolations.illegal++; continue; }
    if (nativeSeen.has(candidate.signature)) nativeViolations.duplicateGroups++;
    nativeSeen.add(candidate.signature);
    if (nativeTop10[i - 1]?.legal && compare(candidate.rank, nativeTop10[i - 1].rank) > 0) nativeViolations.outOfOrderPairs++;
    const canonical = bySignature.get(candidate.signature);
    if (canonical && compare(canonical.rank, candidate.rank) > 0) nativeViolations.inferiorGroupRepresentatives++;
  }
  const proven = oracle.exhaustive && oracle.optimalityProven;
  const matchedGroups = oracleTop10.filter((group) => bySignature.has(group.signature));
  const exactRepresentatives = oracleTop10.filter((group) => {
    const candidate = bySignature.get(group.signature);
    return candidate && compare(candidate.rank, group.rank) === 0;
  });
  const sameHigherPriority = best && oracleBest && compare(best.rank.slice(0, -2), oracleBest.rank.slice(0, -2)) === 0;
  const sameGroupAndQuality = best && oracleBest && best.signature === oracleBest.signature &&
    compare(best.rank.slice(0, -1), oracleBest.rank.slice(0, -1)) === 0;
  const groupGaps = top10.map((candidate) => {
    const expected = oracleBySignature.get(candidate.signature);
    const sameQuality = expected && compare(candidate.rank.slice(0, -1), expected.rank.slice(0, -1)) === 0;
    return {
      signature: candidate.signature,
      oraclePresent: Boolean(expected),
      canonicalRankComparison: proven && expected ? compare(candidate.rank, expected.rank) : null,
      stepGapAtSameGroupQuality: proven && sameQuality ? candidate.steps - expected.steps : null,
    };
  });
  const row = {
    caseId: testCase.id, scenario: testCase.scenario, error: run.error,
    elapsedCoreMs: run.elapsedCoreMs, budgetMs, deadlineMiss: run.elapsedCoreMs > budgetMs,
    nativeTop10, nativeViolations, reportedBest: extraBest,
    reportedBestInvalid: extraBest != null && !extraBest.legal,
    canonicalBest: best, canonicalTop10: top10,
    oracle: { exhaustive: oracle.exhaustive, optimalityProven: oracle.optimalityProven,
      stopReason: oracle.stopReason, elapsedMs: oracle.elapsedMs, statesVisited: oracle.statesVisited,
      legalEndpoints: oracle.legalEndpoints, proofScope: oracle.proofScope,
      startSetEquivalentToCore: true, minimumCandidateSteps: 1,
      best: oracleBest, top10: oracleTop10, groups: oracleGroups,
      maxCombos: oracle.maxCombos, minimumStepsForMaxCombos: oracle.minimumStepsForMaxCombos },
    gaps: {
      eligibleForOptimalityComparison: proven,
      canonicalBestRankComparison: proven && best && oracleBest ? compare(best.rank, oracleBest.rank) : null,
      missingCandidateDespiteFeasibleOracle: proven && Boolean(oracleBest) && !best,
      comboGapAtSameHigherPriority: proven && sameHigherPriority ? oracleBest.combos - best.combos : null,
      unconstrainedMaxComboGap: proven && top10.length && oracle.maxCombos != null
        ? oracle.maxCombos - Math.max(...top10.map((candidate) => candidate.combos)) : null,
      top1StepGapAtSameGroupQuality: proven && sameGroupAndQuality ? best.steps - oracleBest.steps : null,
      top10SignatureRecall: proven ? (oracleTop10.length ? matchedGroups.length / oracleTop10.length : top10.length ? 0 : 1) : null,
      top10OptimalRepresentativeRecall: proven ? (oracleTop10.length ? exactRepresentatives.length / oracleTop10.length : top10.length ? 0 : 1) : null,
      groups: groupGaps,
    },
  };
  rows.push(row);
  process.stderr.write(`${testCase.id}: core=${run.elapsedCoreMs.toFixed(1)}ms oracle=${oracle.exhaustive ? "complete" : oracle.stopReason} groups=${top10.length}/${oracleTop10.length}\n`);
}

if (sha256(fs.readFileSync(sourcePath)) !== solver.sourceMetadata.sha256) throw new Error("Web source changed during comparison; rerun after freezing edits.");
for (const [file, expected] of Object.entries(dependencyHashes)) {
  if (sha256(fs.readFileSync(file)) !== expected) throw new Error(`Dependency changed during comparison: ${file}`);
}
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const provenRows = rows.filter((row) => row.gaps.eligibleForOptimalityComparison);
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), seed,
  source: solver.sourceMetadata, dependencyHashes,
  environment: { platform: process.platform, arch: process.arch, node: process.version,
    cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length },
  methodology: {
    timer: "Node Web-core invocation only; independent verification/oracle excluded; not browser DOM delivery.",
    scope: "Every case has exactly one START and a different END. Oracle enumerates all legal paths from that START through maxSteps=2 or 3; both implementations exclude zero-step endpoints.",
    ranking: "Ordered requirement completion flags, shield combination rank, exact initial combo target, total combo, then fewer steps.",
    grouping: "Initial combo plus cascade combo; same-group step gaps are compared only at equal higher-priority quality.",
    deadline: "Returned-result quality and <=160ms delivery are separate; a late result is not counted as a deadline success.",
    exclusion: "Incomplete oracle runs are excluded from proof-based gaps and recall. No unrestricted 6x6 optimality claim.",
    determinism: "Seeded boards and search seeds are fixed; wall-clock limited search results may still vary between runs.",
  },
  config, warmups, cases,
  summary: {
    caseCount: rows.length, provenCaseCount: provenRows.length, incompleteOracleCases: rows.length - provenRows.length,
    coreErrors: rows.filter((row) => row.error).length,
    coreDeadlineMisses: rows.filter((row) => row.deadlineMiss).length,
    meanCoreMs: average(rows.map((row) => row.elapsedCoreMs)),
    invalidNativeEndpoints: rows.reduce((sum, row) => sum + row.nativeViolations.illegal, 0),
    invalidReportedBestEndpoints: rows.filter((row) => row.reportedBestInvalid).length,
    oracleBestRankMatched: provenRows.filter((row) => row.gaps.canonicalBestRankComparison === 0).length,
    oracleBestRankMatchedWithinBudget: provenRows.filter((row) => !row.deadlineMiss && row.gaps.canonicalBestRankComparison === 0).length,
    missingFeasibleCases: provenRows.filter((row) => row.gaps.missingCandidateDespiteFeasibleOracle).length,
    meanTop10SignatureRecall: average(provenRows.map((row) => row.gaps.top10SignatureRecall)),
    meanTop10OptimalRepresentativeRecall: average(provenRows.map((row) => row.gaps.top10OptimalRepresentativeRecall)),
    meanComparableComboGap: average(provenRows.map((row) => row.gaps.comboGapAtSameHigherPriority).filter((value) => value != null)),
    meanComparableStepGap: average(provenRows.map((row) => row.gaps.top1StepGapAtSameGroupQuality).filter((value) => value != null)),
  }, rows,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
const show = (value, digits = 2) => value == null ? "n/a" : Number(value).toFixed(digits);
const comboLabel = (candidate) => candidate ? `${candidate.initialCombos}+${candidate.skyfallCombos} / ${candidate.steps}步` : "無合法解";
const relation = (row) => !row.gaps.eligibleForOptimalityComparison ? "未證明"
  : row.gaps.canonicalBestRankComparison === 0 ? "相同"
    : row.gaps.canonicalBestRankComparison === -1 ? "低於 oracle"
      : row.gaps.canonicalBestRankComparison === 1 ? "矛盾：需調查" : "無可比較候選";
const markdown = [
  "# Web 小步數精確基準比較", "",
  `固定 seed：${seed}；Web SHA-256：\`${solver.sourceMetadata.sha256}\`。`, "",
  `共 ${rows.length} 例，完整證明 ${provenRows.length} 例。範圍限定 2～3 步、唯一 START 與不同 END；oracle 的起點集合與 Web 限制相同，排除 0 步候選。不能據此宣稱一般 6×6 長路徑已達全域最優。`, "",
  `核心平均 ${show(report.summary.meanCoreMs)}ms；超過 160ms：${report.summary.coreDeadlineMisses} 例。這裡不包含瀏覽器排程、React 或 DOM 提交時間。`, "",
  `最佳業務順位及最短步數完全符合 oracle：${report.summary.oracleBestRankMatched}/${provenRows.length}；其中準時交付 ${report.summary.oracleBestRankMatchedWithinBudget} 例。原生回傳端點驗證錯誤：${report.summary.invalidNativeEndpoints}。`, "",
  `Top10 分組平均找回率 ${show(report.summary.meanTop10SignatureRecall == null ? null : report.summary.meanTop10SignatureRecall * 100)}%；各組最優代表平均找回率 ${show(report.summary.meanTop10OptimalRepresentativeRecall == null ? null : report.summary.meanTop10OptimalRepresentativeRecall * 100)}%。未完整窮舉的案例排除最優差距與找回率計算。`, "",
  "| 案例 | 核心 ms | Oracle 最佳 | Web 最佳 | 業務順位比較 | 同高順位 combo 差 | 同組同品質步數差 | Top10 找回率 |",
  "|---|---:|---|---|---|---:|---:|---:|",
  ...rows.map((row) => `| ${row.caseId} | ${show(row.elapsedCoreMs)}${row.deadlineMiss ? "（超時）" : ""} | ${comboLabel(row.oracle.best)} | ${comboLabel(row.canonicalBest)} | ${relation(row)} | ${show(row.gaps.comboGapAtSameHigherPriority, 0)} | ${show(row.gaps.top1StepGapAtSameGroupQuality, 0)} | ${show(row.gaps.top10SignatureRecall == null ? null : row.gaps.top10SignatureRecall * 100)}% |`),
  "",
  "combo 差只在需求完成向量、盾順位、首消目標達成程度相同時比較；步數差再要求相同首消＋疊消分組與相同品質。n/a 代表條件不成立，不當作 0。詳見 JSON 的逐組差距、原生回傳順序及完整 proofScope。",
  "",
  "重跑：`node tools/compare_solver_oracle.mjs`。可指定 `--seed`、`--cases`（1～24）、`--source`、`--out`。",
  "",
];
fs.writeFileSync(markdownPath, markdown.join("\n"));
process.stdout.write(JSON.stringify({ outputPath, markdownPath, summary: report.summary }, null, 2) + "\n");
