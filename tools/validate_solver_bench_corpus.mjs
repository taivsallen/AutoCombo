#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "Usage: node tools/validate_solver_bench_corpus.mjs <json-or-jsonl-path>"
  );
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(inputPath);
  const rawText = fs.readFileSync(absolutePath, "utf8").trim();
  const lines = rawText ? rawText.split(/\r?\n/).filter(Boolean) : [];
  let isJsonArray = false;
  let entries;
  try {
    if (rawText.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          entries = parsed;
          isJsonArray = true;
        }
      } catch {
        // A JSONL file whose first entry is a nested board also starts with "[".
      }
    }
    if (!entries) entries = lines.map((line) => JSON.parse(line));
  } catch (error) {
    console.error(`Invalid JSON/JSONL: ${error.message}`);
    process.exitCode = 1;
  }

  if (Array.isArray(entries)) {
    const seen = new Set();
    let invalidRows = 0;
    for (const entry of entries) {
      const candidate = Array.isArray(entry)
        ? entry
        : entry?.board ?? entry?.board_filled;
      const flat =
        Array.isArray(candidate) &&
        candidate.length === 6 &&
        candidate.every((row) => Array.isArray(row) && row.length === 6)
          ? candidate.flat()
          : candidate;
      if (
        !Array.isArray(flat) ||
        flat.length !== 36 ||
        flat.some((value) => !Number.isInteger(value) || value < 0 || value > 5)
      ) {
        invalidRows++;
        continue;
      }
      seen.add(flat.join(","));
    }
    const result = {
      file: absolutePath,
      format: isJsonArray ? "json-array" : "jsonl",
      rows: entries.length,
      validRows: entries.length - invalidRows,
      invalidRows,
      uniqueBoards: seen.size,
      duplicateBoards: entries.length - invalidRows - seen.size,
      schema: "6x6 orb board; integer values 0..5",
      valid: invalidRows === 0 && seen.size > 0,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  }
}
