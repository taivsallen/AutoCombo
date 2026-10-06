#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , sourceArg, outputArg, ...optionArgs] = process.argv;
if (!sourceArg || !outputArg) {
  console.error(
    "Usage: node tools/build_production_like_solver_corpus.mjs <source-jsonl> <output-jsonl> [--boards=48] [--state-indices=0,4,8,12]"
  );
  process.exit(2);
}

const readOption = (name, fallback) => {
  const arg = optionArgs.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
};

const boardCount = Number.parseInt(readOption("--boards", "48"), 10);
const stateIndices = readOption("--state-indices", "0,4,8,12")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10));

if (!Number.isInteger(boardCount) || boardCount < 1) {
  console.error("--boards must be a positive integer");
  process.exit(2);
}
if (
  stateIndices.length === 0 ||
  stateIndices.some((value) => !Number.isInteger(value) || value < 0) ||
  new Set(stateIndices).size !== stateIndices.length
) {
  console.error("--state-indices must be a comma-separated list of unique non-negative integers");
  process.exit(2);
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
const rows = fs
  .readFileSync(sourcePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const isValidBoard = (board) =>
  Array.isArray(board) &&
  board.length === 36 &&
  board.every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 5
  );

const grouped = new Map();
let invalidRows = 0;
for (const entry of rows) {
  const board = entry.board_filled ?? entry.board;
  if (!isValidBoard(board)) {
    invalidRows++;
    continue;
  }
  const boardKey =
    entry.board_id ?? entry.board_seed ?? board.join(",");
  const group = grouped.get(String(boardKey)) ?? [];
  group.push({ entry, board });
  grouped.set(String(boardKey), group);
}

const boardGroups = [...grouped.entries()]
  .map(([key, group]) => ({
    key,
    rows: group.sort(
      (a, b) =>
        Number(a.entry.state_index ?? 0) - Number(b.entry.state_index ?? 0)
    ),
  }))
  .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

if (boardGroups.length === 0) {
  console.error("source corpus has no valid board groups");
  process.exit(1);
}

const sampleCount = Math.min(boardCount, boardGroups.length);
const selectedGroups = Array.from({ length: sampleCount }, (_, index) => {
  const sourceIndex = Math.floor((index * boardGroups.length) / sampleCount);
  return boardGroups[sourceIndex];
});

const phaseNames = ["initial", "early", "mid", "late"];
const selectedRows = [];
const seenBoards = new Set();
const phaseCounts = Object.fromEntries(
  stateIndices.map((requested, index) => [
    phaseNames[index] ?? `phase-${index + 1}`,
    { requestedStateIndex: requested, rows: 0, exactStateRows: 0 },
  ])
);

for (let phaseIndex = 0; phaseIndex < stateIndices.length; phaseIndex++) {
  const requestedStateIndex = stateIndices[phaseIndex];
  const phaseName = phaseNames[phaseIndex] ?? `phase-${phaseIndex + 1}`;
  for (const group of selectedGroups) {
    const chosen = group.rows.reduce((best, candidate) => {
      if (!best) return candidate;
      const bestDistance = Math.abs(
        Number(best.entry.state_index ?? 0) - requestedStateIndex
      );
      const candidateDistance = Math.abs(
        Number(candidate.entry.state_index ?? 0) - requestedStateIndex
      );
      if (candidateDistance !== bestDistance) {
        return candidateDistance < bestDistance ? candidate : best;
      }
      return Number(candidate.entry.state_index ?? 0) <
        Number(best.entry.state_index ?? 0)
        ? candidate
        : best;
    }, null);

    const boardKey = chosen.board.join(",");
    if (seenBoards.has(boardKey)) continue;
    seenBoards.add(boardKey);
    const actualStateIndex = Number(chosen.entry.state_index ?? 0);
    selectedRows.push({
      board: chosen.board,
      source_board_id: chosen.entry.board_id ?? null,
      source_board_seed: chosen.entry.board_seed ?? null,
      source_state_index: actualStateIndex,
      source_requested_state_index: requestedStateIndex,
      source_state_phase: phaseName,
    });
    phaseCounts[phaseName].rows++;
    if (actualStateIndex === requestedStateIndex) {
      phaseCounts[phaseName].exactStateRows++;
    }
  }
}

if (selectedRows.length === 0) {
  console.error("sampling produced no unique boards");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${selectedRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      source: sourcePath,
      output: outputPath,
      parsedRows: rows.length,
      invalidRows,
      sourceBoardGroups: boardGroups.length,
      sampledBoardGroups: selectedGroups.length,
      requestedStateIndices: stateIndices,
      outputRows: selectedRows.length,
      uniqueBoards: seenBoards.size,
      phaseCounts,
      sampling: "board-even-state-phase-v1",
      corpusType: "production-like-proxy",
      valid: invalidRows === 0 && selectedRows.length > 0,
    },
    null,
    2
  )
);
