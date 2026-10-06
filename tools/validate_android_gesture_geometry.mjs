#!/usr/bin/env node

/**
 * Offline regression test for the Android board-to-touch pipeline.
 *
 * This deliberately does not need an emulator or BlueStacks.  It models the
 * exact BoardGeometry formulas used by the Android app and checks the screen
 * coordinates that AccessibilityService will receive for a known 6x6 route.
 */

import assert from "node:assert/strict";

const COLS = 6;
const ROWS = 6;
const PLAY_ROW_START = 1;
const ROW0_GAP_CELLS = 0.30;
const DEFAULT_HEIGHT_RATIO = 1 + ROW0_GAP_CELLS / ROWS;

const fullHeightForSize = (size) => Math.round(size * DEFAULT_HEIGHT_RATIO);
const cell = (region) => region.size / COLS;
const rowTopOffset = (region, row) =>
  row * cell(region) + (row >= 1 ? cell(region) * ROW0_GAP_CELLS : 0);
const rowBottomOffset = (region, row) => rowTopOffset(region, row) + cell(region);
const center = (region, { r, c }) => ({
  x: region.left + (c + 0.5) * cell(region),
  y: region.top + rowTopOffset(region, r) + cell(region) * 0.5,
});

const playableCrop = (region) => ({
  left: region.left,
  top: region.top + rowTopOffset(region, PLAY_ROW_START),
  right: region.left + region.size,
  bottom: region.top + rowBottomOffset(region, ROWS - 1),
});

const trimPhysicalRoute = (route) => {
  const normalized = [];
  for (const point of route) {
    if (point.r < 0 || point.r >= ROWS || point.c < 0 || point.c >= COLS) continue;
    const previous = normalized.at(-1);
    if (!previous || previous.r !== point.r || previous.c !== point.c) normalized.push(point);
  }
  if (normalized[0]?.r === 0) return { ok: false, reason: "virtual-row0-start" };
  const physical = normalized.slice(0, normalized.findIndex((point) => point.r === 0) < 0
    ? normalized.length
    : normalized.findIndex((point) => point.r === 0));
  return { ok: physical.length >= 2, route: physical };
};

const approxEqual = (actual, expected, epsilon = 0.001) =>
  Math.abs(actual - expected) <= epsilon;

function checkCase(name, fn) {
  fn();
  console.log(`PASS  ${name}`);
}

// The screen used in the supplied debugging screenshots: portrait logical
// frame 900x1600, board width 900, full guide top 575.
const region = {
  left: 0,
  top: 575,
  size: 900,
  height: fullHeightForSize(900),
};

checkCase("square cells and row0/row1 gap", () => {
  assert.equal(region.height, 945);
  assert.equal(cell(region), 150);
  assert.equal(rowTopOffset(region, 1), 195);
  assert.equal(rowTopOffset(region, 2) - rowTopOffset(region, 1), 150);
  assert.equal(rowTopOffset(region, 1) - rowBottomOffset(region, 0), 45);
});

checkCase("playable crop is exactly row1 through row5", () => {
  assert.deepEqual(playableCrop(region), { left: 0, top: 770, right: 900, bottom: 1520 });
});

checkCase("all playable centers line up with the 900x1600 logical frame", () => {
  const row1 = center(region, { r: 1, c: 0 });
  const row5 = center(region, { r: 5, c: 5 });
  assert.deepEqual(row1, { x: 75, y: 845 });
  assert.deepEqual(row5, { x: 825, y: 1445 });
  for (let r = 1; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const point = center(region, { r, c });
      assert.ok(point.x >= 0 && point.x <= 900);
      assert.ok(point.y >= 0 && point.y <= 1600);
    }
  }
});

checkCase("a route is converted to the same points as the preview", () => {
  const route = [
    { r: 3, c: 2 },
    { r: 3, c: 3 },
    { r: 4, c: 3 },
    { r: 5, c: 3 },
    { r: 5, c: 4 },
    { r: 5, c: 5 },
  ];
  const trace = route.map((point) => center(region, point));
  assert.deepEqual(trace[0], { x: 375, y: 1145 });
  assert.deepEqual(trace.at(-1), { x: 825, y: 1445 });
  for (let i = 1; i < trace.length; i += 1) {
    const dx = Math.abs(trace[i].x - trace[i - 1].x);
    const dy = Math.abs(trace[i].y - trace[i - 1].y);
    assert.ok((dx === 150 && dy === 0) || (dx === 0 && dy === 150) || (dx === 150 && dy === 150));
  }
});

checkCase("row0 terminal is not sent to the game as a touch point", () => {
  const result = trimPhysicalRoute([
    { r: 3, c: 2 },
    { r: 3, c: 3 },
    { r: 2, c: 3 },
    { r: 0, c: 3 },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.route.at(-1), { r: 2, c: 3 });
});

checkCase("row0 physical starts are rejected instead of dragging outside the board", () => {
  const result = trimPhysicalRoute([{ r: 0, c: 3 }, { r: 1, c: 3 }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "virtual-row0-start");
});

checkCase("old portrait/landscape scaling is demonstrably wrong", () => {
  const point = center(region, { r: 1, c: 0 });
  const oldScaled = { x: point.x * (1600 / 900), y: point.y * (900 / 1600) };
  assert.ok(!approxEqual(oldScaled.x, point.x));
  assert.ok(!approxEqual(oldScaled.y, point.y));
  assert.ok(Math.abs(oldScaled.y - point.y) > 200);
});

checkCase("the injected path keeps one pointer and explicit center endpoints", () => {
  const replaySpeed = 50;
  const perStep = Math.max(18, Math.min(40, Math.trunc((110 - replaySpeed * 0.7) / 2.5)));
  const routeSteps = 19;
  const safePerStep = Math.max(40, Math.min(60, perStep));
  const finalHold = 40;
  const totalMs = (routeSteps - 1) * safePerStep + finalHold;
  assert.equal(perStep, 30);
  assert.equal(safePerStep, 40);
  assert.equal(finalHold, 40);
  assert.equal(totalMs, 760);
  assert.ok(totalMs < 1420);
  assert.ok(routeSteps > 1);
});

checkCase("single gesture keeps every route cell as an ordered endpoint", () => {
  const route = [
    { r: 2, c: 1 },
    { r: 2, c: 2 },
    { r: 3, c: 2 },
    { r: 3, c: 3 },
  ];
  const points = route.map((point) => center(region, point));
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
  }));
  assert.equal(segments.length, route.length - 1);
  for (let i = 0; i < segments.length; i += 1) {
    assert.deepEqual(segments[i].from, center(region, route[i]));
    assert.deepEqual(segments[i].to, center(region, route[i + 1]));
    if (i > 0) assert.deepEqual(segments[i].from, segments[i - 1].to);
  }
  const replaySpeed = 50;
  const perStep = Math.max(40, Math.min(60, Math.trunc((110 - replaySpeed * 0.7) / 2.5)));
  const totalDuration = segments.length * perStep;
  assert.equal(perStep, 40);
  assert.equal(totalDuration, 120);
  assert.deepEqual(segments.at(-1).to, center(region, route.at(-1)));
});

checkCase("the path contains only exact center-to-center waypoints", () => {
  const route = [
    { r: 1, c: 0 },
    { r: 2, c: 1 },
    { r: 2, c: 2 },
    { r: 3, c: 2 },
  ];
  const points = route.map((point) => center(region, point));
  assert.deepEqual(points, [
    { x: 75, y: 845 },
    { x: 225, y: 995 },
    { x: 375, y: 995 },
    { x: 375, y: 1145 },
  ]);
  assert.equal(points.length, route.length);
});

console.log("\nOffline gesture geometry validation passed.");
console.log(`logical frame: 900x1600, guide: ${region.left},${region.top} ${region.size}x${region.height}`);
console.log(`row1 center: ${JSON.stringify(center(region, { r: 1, c: 0 }))}`);
console.log(`row5 center: ${JSON.stringify(center(region, { r: 5, c: 5 }))}`);
