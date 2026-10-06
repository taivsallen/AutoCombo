#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith("--"));
const optionArgs = rawArgs.filter((arg) => arg.startsWith("--"));
const outputArg = positionalArgs[0];
const inputArgs = positionalArgs.slice(1);

if (!outputArg || inputArgs.length === 0) {
  console.error(
    "Usage: node tools/prepare_web_corpus.mjs <output-jsonl> <input...> [--dedupe=board|none] [--max-rows=N]"
  );
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mergeScript = path.join(rootDir, "tools", "merge_web_corpus_exports.mjs");
const validateScript = path.join(
  rootDir,
  "tools",
  "validate_web_corpus_export.mjs"
);

const mergeArgs = [mergeScript, outputArg, ...inputArgs];
if (!optionArgs.some((arg) => arg.startsWith("--dedupe="))) {
  mergeArgs.push("--dedupe=board");
}
mergeArgs.push(...optionArgs.filter((arg) => arg.startsWith("--dedupe=") || arg.startsWith("--max-rows=")));

const mergeResult = spawnSync(process.execPath, mergeArgs, {
  cwd: rootDir,
  encoding: "utf8",
});
if (mergeResult.stdout) process.stdout.write(mergeResult.stdout);
if (mergeResult.stderr) process.stderr.write(mergeResult.stderr);
if (mergeResult.status !== 0) {
  process.exit(mergeResult.status || 1);
}

const outputPath = path.resolve(outputArg);
if (!fs.existsSync(outputPath)) {
  console.error(`Merged corpus was not created: ${outputPath}`);
  process.exit(1);
}

const validateResult = spawnSync(process.execPath, [validateScript, outputPath], {
  cwd: rootDir,
  encoding: "utf8",
});
if (validateResult.stdout) process.stdout.write(validateResult.stdout);
if (validateResult.stderr) process.stderr.write(validateResult.stderr);
if (validateResult.status !== 0) {
  process.exit(validateResult.status || 1);
}

let report;
try {
  report = JSON.parse(validateResult.stdout);
} catch {
  console.error("Could not parse validator output.");
  process.exit(1);
}

if (!report.readyForBenchmark) {
  console.error(
    `Corpus is valid but not ready: need at least 12 unique boards; received ${report.uniqueBoards}.`
  );
  process.exit(3);
}

console.log(`Web corpus is ready for benchmark: ${report.uniqueBoards} unique boards.`);
