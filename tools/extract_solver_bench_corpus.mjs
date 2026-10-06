#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , sourceArg, outputArg, ...optionArgs] = process.argv;
if (!sourceArg || !outputArg) {
  console.error(
    "Usage: node tools/extract_solver_bench_corpus.mjs <source-jsonl> <output-jsonl> [--state-index=0]"
  );
  process.exit(2);
}

const stateIndexOption = optionArgs.find((arg) => arg.startsWith("--state-index="));
const stateIndex = stateIndexOption
  ? Number.parseInt(stateIndexOption.slice("--state-index=".length), 10)
  : 0;
if (!Number.isInteger(stateIndex) || stateIndex < 0) {
  console.error("--state-index must be a non-negative integer");
  process.exit(2);
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
const lines = fs
  .readFileSync(sourcePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const seen = new Set();
const outputRows = [];
let parsedRows = 0;
let selectedRows = 0;
let invalidRows = 0;

for (const line of lines) {
  const entry = JSON.parse(line);
  parsedRows++;
  if (entry.state_index !== stateIndex) continue;
  selectedRows++;

  const board = entry.board_filled ?? entry.board;
  if (
    !Array.isArray(board) ||
    board.length !== 36 ||
    board.some((value) => !Number.isInteger(value) || value < 0 || value > 5)
  ) {
    invalidRows++;
    continue;
  }

  const key = board.join(",");
  if (seen.has(key)) continue;
  seen.add(key);
  outputRows.push({
    board,
    source_board_id: entry.board_id ?? null,
    source_board_seed: entry.board_seed ?? null,
    source_state_index: entry.state_index,
  });
}

if (invalidRows > 0 || outputRows.length === 0) {
  console.error(
    JSON.stringify(
      {
        source: sourcePath,
        stateIndex,
        parsedRows,
        selectedRows,
        invalidRows,
        uniqueBoards: outputRows.length,
        valid: false,
      },
      null,
      2
    )
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${outputRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      source: sourcePath,
      output: outputPath,
      stateIndex,
      parsedRows,
      selectedRows,
      invalidRows,
      uniqueBoards: outputRows.length,
      format: "jsonl",
      valid: true,
    },
    null,
    2
  )
);
