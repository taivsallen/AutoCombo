#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const optionArgs = rawArgs.filter((arg) => arg.startsWith("--"));
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith("--"));
const outOption = optionArgs.find((arg) => arg.startsWith("--out="));
const legacyOutputArg = positionalArgs.length === 3 ? positionalArgs[2] : null;
const outputArg = outOption?.slice("--out=".length) || legacyOutputArg;
const reportArgs = outputArg
  ? positionalArgs.filter((arg) => arg !== outputArg)
  : positionalArgs;

if (reportArgs.length < 2) {
  console.error(
    "Usage: node tools/compare_policy_benchmark_reports.mjs <report-a.json> <report-b.json> [...report.json] [output.json]"
  );
  process.exit(2);
}

const readJson = (input) => {
  const file = path.resolve(input);
  return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
};

const variants = ["baseline", "candidate_w160", "candidate_w80", "candidate_w40"];

const percentDelta = (value, baseline) =>
  Number.isFinite(value) && Number.isFinite(baseline) && baseline !== 0
    ? (value - baseline) / baseline
    : null;

const summarizeReport = ({ file, data }) => {
  const aggregate = data.aggregate || data.summaries || {};
  const baseline = aggregate.baseline || {};
  return {
    file,
    boardSet: data.protocol?.boardSet || null,
    corpusSource:
      data.protocol?.sourceFile || data.protocol?.corpusSource?.file || null,
    cases: baseline.cases || null,
    gate: data.gate || null,
    variants: Object.fromEntries(
      variants.map((variant) => {
        const summary = aggregate[variant] || {};
        return [
          variant,
          {
            cases: summary.cases || null,
            avgMs: summary.avgMs ?? null,
            p95Ms: summary.p95Ms ?? null,
            successRate: summary.successRate ?? null,
            requirementRate: summary.requirementRate ?? null,
            avgMsDeltaPct: percentDelta(summary.avgMs, baseline.avgMs),
            p95MsDeltaPct: percentDelta(summary.p95Ms, baseline.p95Ms),
            successRateDelta: Number.isFinite(summary.successRate) &&
              Number.isFinite(baseline.successRate)
              ? summary.successRate - baseline.successRate
              : null,
            requirementRateDelta: Number.isFinite(summary.requirementRate) &&
              Number.isFinite(baseline.requirementRate)
              ? summary.requirementRate - baseline.requirementRate
              : null,
          },
        ];
      })
    ),
  };
};

const reports = reportArgs.map((reportArg) => summarizeReport(readJson(reportArg)));
const gateForVariant = (report, variant) =>
  report.gate?.candidates?.[variant] || report.gate?.[variant] || null;
const candidateGate = (variant) =>
  reports.map((report) => ({
    file: report.file,
    pass: gateForVariant(report, variant)?.pass ?? false,
    successNonRegression:
      gateForVariant(report, variant)?.successNonRegression ?? null,
    requirementNonRegression:
      gateForVariant(report, variant)?.requirementNonRegression ?? null,
    p95WithinTenPercent:
      gateForVariant(report, variant)?.p95WithinTenPercent ?? null,
  }));

const w40Gate = candidateGate("candidate_w40");
const w160Gate = candidateGate("candidate_w160");
const w40PassesAll = w40Gate.length > 0 && w40Gate.every((item) => item.pass);
const w160PassesAll = w160Gate.length > 0 && w160Gate.every((item) => item.pass);
const result = {
  generatedAt: new Date().toISOString(),
  scope: "web-dev-only",
  reports,
  crossProxyGate: {
    candidate_w40: w40Gate,
    candidate_w160: w160Gate,
    w40PassesAll,
    w160PassesAll,
    stableRecommendation: w40PassesAll ? "candidate_w40" : null,
  },
  decision: w40PassesAll
    ? "w40 is the only candidate that passes all currently available proxy reports; do not promote until real Web capture is validated."
    : "No candidate is stable across all currently available proxy reports; keep the production default unchanged.",
};

if (outputArg) {
  const outputPath = path.resolve(outputArg);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath, ...result }, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
