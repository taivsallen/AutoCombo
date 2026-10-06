#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , outputArg, ...rawArgs] = process.argv;
const inputArgs = rawArgs.filter((arg) => !arg.startsWith("--"));
const dedupeArg = rawArgs.find((arg) => arg.startsWith("--dedupe="));
const maxRowsArg = rawArgs.find((arg) => arg.startsWith("--max-rows="));
const dedupeMode = dedupeArg?.slice("--dedupe=".length) || "board";
const maxRows = maxRowsArg
  ? Number.parseInt(maxRowsArg.slice("--max-rows=".length), 10)
  : Infinity;

if (!outputArg || inputArgs.length === 0) {
  console.error(
    "Usage: node tools/merge_web_corpus_exports.mjs <output-jsonl> <input...> [--dedupe=board|none] [--max-rows=N]"
  );
  process.exit(2);
}
if (!["board", "none"].includes(dedupeMode)) {
  console.error("--dedupe must be board or none");
  process.exit(2);
}
if (
  (Number.isFinite(maxRows) && (!Number.isInteger(maxRows) || maxRows < 1)) ||
  Number.isNaN(maxRows)
) {
  console.error("--max-rows must be a positive integer");
  process.exit(2);
}

const isBoard = (value) =>
  Array.isArray(value) &&
  value.length === 36 &&
  value.every(
    (cell) => Number.isInteger(cell) && cell >= 0 && cell <= 5
  );

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

const isValidWebRow = (row) =>
  row &&
  typeof row === "object" &&
  !Array.isArray(row) &&
  row.schema_version === 1 &&
  row.source === "web-local-opt-in" &&
  typeof row.captured_at === "string" &&
  Number.isFinite(Date.parse(row.captured_at)) &&
  isBoard(row.board) &&
  Number.isFinite(row.target) &&
  row.target >= 0 &&
  typeof row.mode === "string" &&
  ["combo", "steps"].includes(row.priority) &&
  typeof row.skyfall === "boolean" &&
  typeof row.diagonal === "boolean" &&
  validRuleProfile(row.rule_profile) &&
  row.result &&
  typeof row.result.has_solution === "boolean" &&
  Number.isInteger(row.result.steps) &&
  row.result.steps >= 0 &&
  Number.isFinite(row.result.combos) &&
  (row.result.skyfall_combos === undefined ||
    Number.isFinite(row.result.skyfall_combos)) &&
  (row.result.total_combos === undefined ||
    Number.isFinite(row.result.total_combos)) &&
  Number.isFinite(row.result.cleared_orbs);

const readRows = (inputPath) => {
  const absolutePath = path.resolve(inputPath);
  const rawText = fs.readFileSync(absolutePath, "utf8").trim();
  if (!rawText) return [];
  if (rawText.startsWith("[")) {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed;
  }
  return rawText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const seen = new Set();
const outputRows = [];
const fileStats = [];
let invalidRows = 0;
let duplicateRows = 0;

for (const input of inputArgs) {
  const absolutePath = path.resolve(input);
  const rows = readRows(absolutePath);
  let fileInvalidRows = 0;
  let fileDuplicateRows = 0;
  for (const row of rows) {
    if (!isValidWebRow(row)) {
      invalidRows++;
      fileInvalidRows++;
      continue;
    }
    const key = dedupeMode === "board" ? row.board.join(",") : null;
    if (key && seen.has(key)) {
      duplicateRows++;
      fileDuplicateRows++;
      continue;
    }
    if (key) seen.add(key);
    outputRows.push(row);
  }
  fileStats.push({
    file: absolutePath,
    rows: rows.length,
    invalidRows: fileInvalidRows,
    duplicateRows: fileDuplicateRows,
  });
}

outputRows.sort(
  (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at)
);
const limitedRows = outputRows.slice(0, maxRows);
const outputPath = path.resolve(outputArg);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${limitedRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      inputs: fileStats,
      dedupeMode,
      maxRows: Number.isFinite(maxRows) ? maxRows : null,
      inputRows: fileStats.reduce((sum, item) => sum + item.rows, 0),
      invalidRows,
      duplicateRows,
      outputRows: limitedRows.length,
      uniqueBoards: new Set(limitedRows.map((row) => row.board.join(","))).size,
      valid: invalidRows === 0 && limitedRows.length > 0,
    },
    null,
    2
  )
);

if (invalidRows > 0 || limitedRows.length === 0) process.exitCode = 1;
