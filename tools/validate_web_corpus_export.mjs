#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const inputArg = process.argv[2];
if (!inputArg) {
  console.error(
    "Usage: node tools/validate_web_corpus_export.mjs <web-corpus-jsonl>"
  );
  process.exit(2);
}

const file = path.resolve(inputArg);
const rawText = fs.readFileSync(file, "utf8").trim();
const lines = rawText ? rawText.split(/\r?\n/).filter(Boolean) : [];
let rows = [];
let format = "jsonl";

try {
  if (rawText.startsWith("[")) {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      rows = parsed;
      format = "json-array";
    }
  }
  if (rows.length === 0 && rawText) {
    rows = lines.map((line) => JSON.parse(line));
  }
} catch (error) {
  console.error(`Invalid JSON/JSONL: ${error.message}`);
  process.exit(1);
}

const isBoard = (value) =>
  Array.isArray(value) &&
  value.length === 36 &&
  value.every(
    (cell) => Number.isInteger(cell) && cell >= 0 && cell <= 5
  );

const isIsoTimestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const validRuleProfile = (profile) =>
  profile &&
  Array.isArray(profile.orbRules) &&
  profile.orbRules.length === 6 &&
  profile.orbRules.every(
    (rule) =>
      rule &&
      Number.isInteger(rule.minClear) &&
      rule.minClear >= 1 &&
      rule.minClear <= 5 &&
      ["line", "connected"].includes(rule.clearMode)
  ) &&
  Array.isArray(profile.requirements) &&
  profile.requirements.every(
    (req) =>
      req &&
      Number.isInteger(req.orb) &&
      req.orb >= 0 &&
      req.orb <= 5 &&
      Number.isInteger(req.size) &&
      req.size >= 1 &&
      req.size <= 5 &&
      Number.isInteger(req.count) &&
      req.count >= 1 &&
      ["exact", "atLeast"].includes(req.match)
  );

const invalidReasons = {};
const addReason = (reason) => {
  invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
};

const seenBoards = new Set();
const sourceCounts = {};
const modeCounts = {};
const priorityCounts = {};
const targetCounts = {};
let validRows = 0;
let hasSolutionRows = 0;

for (const row of rows) {
  let reason = "";
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    reason = "row-not-object";
  } else if (row.schema_version !== 1) {
    reason = "schema-version-not-1";
  } else if (row.source !== "web-local-opt-in") {
    reason = "source-not-web-local-opt-in";
  } else if (!isIsoTimestamp(row.captured_at)) {
    reason = "captured-at-invalid";
  } else if (!isBoard(row.board)) {
    reason = "board-invalid";
  } else if (!Number.isFinite(row.target) || row.target < 0) {
    reason = "target-invalid";
  } else if (!['combo', 'steps'].includes(row.priority)) {
    reason = "priority-invalid";
  } else if (typeof row.skyfall !== "boolean" || typeof row.diagonal !== "boolean") {
    reason = "solver-flags-invalid";
  } else if (!validRuleProfile(row.rule_profile)) {
    reason = "rule-profile-invalid";
  } else if (
    !row.result ||
    typeof row.result.has_solution !== "boolean" ||
    !Number.isInteger(row.result.steps) ||
    row.result.steps < 0 ||
    !Number.isFinite(row.result.combos) ||
    (row.result.skyfall_combos !== undefined &&
      !Number.isFinite(row.result.skyfall_combos)) ||
    (row.result.total_combos !== undefined &&
      !Number.isFinite(row.result.total_combos)) ||
    !Number.isFinite(row.result.cleared_orbs)
  ) {
    reason = "result-invalid";
  }

  if (reason) {
    addReason(reason);
    continue;
  }

  validRows++;
  const boardKey = row.board.join(",");
  seenBoards.add(boardKey);
  if (row.result.has_solution) hasSolutionRows++;
  sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;
  modeCounts[row.mode || "unknown"] = (modeCounts[row.mode || "unknown"] || 0) + 1;
  priorityCounts[row.priority] = (priorityCounts[row.priority] || 0) + 1;
  const targetKey = String(row.target);
  targetCounts[targetKey] = (targetCounts[targetKey] || 0) + 1;
}

const invalidRows = rows.length - validRows;
const duplicateBoards = Math.max(0, validRows - seenBoards.size);
const result = {
  file,
  format,
  rows: rows.length,
  validRows,
  invalidRows,
  invalidReasons,
  uniqueBoards: seenBoards.size,
  duplicateBoards,
  duplicateBoardRate: validRows > 0 ? duplicateBoards / validRows : 0,
  sourceCounts,
  modeCounts,
  priorityCounts,
  targetCounts,
  hasSolutionRows,
  hasSolutionRate: validRows > 0 ? hasSolutionRows / validRows : 0,
  readyForBenchmark: invalidRows === 0 && seenBoards.size >= 12,
  schema: "web-local-opt-in/v1; flat 36-value board",
  valid: invalidRows === 0 && validRows > 0,
};

if (result.valid && !result.readyForBenchmark) {
  result.warning = "Need at least 12 unique boards before Web benchmark sampling.";
}

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
