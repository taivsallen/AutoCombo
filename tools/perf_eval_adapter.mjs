#!/usr/bin/env node
/*
 * Generic JSON-lines adapter for a JavaScript solver module.
 *
 * Usage:
 *   node tools/perf_eval_adapter.mjs --module path/to/solver-module.mjs
 *
 * The module must export either:
 *   export async function solveCase(request) { ... }
 * or a default function with the same signature.
 * The function should return the strict response fields documented in
 * tools/perf_eval.py. Logs belong on stderr, not stdout.
 */

import readline from "node:readline";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const moduleFlag = args.indexOf("--module");
if (moduleFlag < 0 || !args[moduleFlag + 1]) {
  console.error("Missing --module path");
  process.exit(2);
}

const modulePath = args[moduleFlag + 1];
const loaded = await import(pathToFileURL(modulePath).href);
const solveCase = loaded.solveCase || loaded.default;
if (typeof solveCase !== "function") {
  console.error("Solver module must export solveCase or default function");
  process.exit(2);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    const started = performance.now();
    const result = await solveCase(request);
    const response = result && typeof result === "object" ? { ...result } : {};
    response.case_id ??= request.case_id;
    response.adapter_wall_ms = performance.now() - started;
    if (request.warmup) response.warmup = true;
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({
      case_id: request?.case_id ?? null,
      legal: false,
      requirements_satisfied: false,
      special_satisfied: false,
      initial_satisfied: false,
      success: false,
      error: error?.stack || String(error),
    }) + "\n");
  }
}
