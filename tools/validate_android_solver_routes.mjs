#!/usr/bin/env node

/**
 * Deterministic random-route regression test for the Android runner.
 *
 * It exercises the generated App.jsx BeamSolve core without an emulator and
 * verifies the contract expected by AccessibilityService:
 * - every route starts on a real row1~row5 orb;
 * - row0, when used, is only the final virtual terminal;
 * - every physical visit is a neighboring cell;
 * - every physical visit maps to the center of the saved square grid.
 */

import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window = globalThis;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
eval(fs.readFileSync("android/AutoCombo/app/src/main/assets/solverCore.js", "utf8"));

const ROWS = 6;
const COLS = 6;
const PLAY_START = 1;
const CASES = 50;
const REGION = { left: 0, top: 575, size: 900, height: 945 };
const cell = REGION.size / COLS;
const center = (r, c) => ({
  x: REGION.left + (c + 0.5) * cell,
  y: REGION.top + r * cell + (r >= 1 ? cell * 0.3 : 0) + cell * 0.5,
});

const random = (seed) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const config = {
  beamWidth: 80,
  maxSteps: 18,
  hardStepLimitEnabled: false,
  hardStepLimit: 18,
  maxNodes: 1800,
  evalWorkers: 1,
  humanPlanner: false,
  reversePlanner: false,
  reverseMaxSteps: 10,
  deferMoveMaterialization: true,
  cheapLocalGuidance: true,
  cheapLegacyReserve: 0.25,
  cheapEvalScale: 2,
  cheapEvalConstraintScale: 2.5,
  stepPenalty: 0,
  potentialWeight: 10,
  clearedWeight: 300,
  searchSeed: 0,
  browserYield: false,
  androidAutoCombo: true,
  androidTargetStepEnabled: false,
  androidTargetStep: 1,
};

const validateRoute = (path) => {
  assert.ok(Array.isArray(path) && path.length >= 2, "route must have at least one move");
  let sawRow0 = false;
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    assert.ok(point && point.r >= 0 && point.r < ROWS && point.c >= 0 && point.c < COLS, "route point out of bounds");
    if (point.r === 0) {
      assert.equal(index, path.length - 1, "row0 may only be the terminal");
      assert.equal(sawRow0, false, "row0 may only occur once");
      sawRow0 = true;
      continue;
    }
    assert.ok(point.r >= PLAY_START, "physical route entered row0 before terminal");
    if (index === 0) assert.ok(point.r >= PLAY_START, "Android route cannot start in row0");
    const previous = path[index - 1];
    if (!previous || previous.r === 0) continue;
    const dr = Math.abs(point.r - previous.r);
    const dc = Math.abs(point.c - previous.c);
    assert.ok(dr <= 1 && dc <= 1 && dr + dc > 0, "route contains a non-neighbor step");
    const from = center(previous.r, previous.c);
    const to = center(point.r, point.c);
    assert.ok(Math.abs(to.x - from.x) <= cell + 0.001, "x step exceeds one cell");
    assert.ok(Math.abs(to.y - from.y) <= cell + 0.001, "y step exceeds one cell");
  }
};

let routeCount = 0;
for (let seed = 1; seed <= CASES; seed += 1) {
  const next = random(seed);
  const board = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.floor(next() * 6))
  );
  const result = await globalThis.autoComboBeamSolve(
    board,
    config,
    8,
    "vertical",
    "combo",
    true,
    true,
    [],
    undefined,
    true,
    null,
    () => {}
  );
  for (const solution of result?.topCombos || []) {
    validateRoute(solution.path);
    routeCount += 1;
  }
}

console.log(`PASS  ${CASES} deterministic random boards / ${routeCount} Android routes`);
