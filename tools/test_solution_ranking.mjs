import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSolutionRank,
  getRequirementDoneTuple,
  getRequirementGuideTuple,
} from "../src/solver/solutionRanking.js";

const FIRE = 1;
const WATER = 0;
const orderedRequirements = [
  { orb: FIRE, size: 5, count: 1, match: "exact" },
  { orb: WATER, size: 3, count: 2, match: "exact" },
];
const evaluation = (fireGroups = {}, waterGroups = {}) => ({
  initialComboSizeCountsByOrb: {
    [FIRE]: fireGroups,
    [WATER]: waterGroups,
  },
});
const rank = (ev, overrides = {}, requirements = orderedRequirements) =>
  buildSolutionRank({
    legal: true,
    requirementDone: getRequirementDoneTuple(ev, requirements),
    specialRank: 0,
    initialExact: false,
    totalCombos: 0,
    steps: 10,
    ...overrides,
  });
const compare = (left, right) => {
  assert.equal(left.length, right.length);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
};

test("one fire group outranks two water groups because fire is first", () => {
  const fire = rank(evaluation({ 5: 1 }));
  const water = rank(evaluation({}, { 3: 2 }), {
    specialRank: 7,
    initialExact: true,
    totalCombos: 10,
    steps: 1,
  });
  assert.deepEqual(fire.slice(0, 3), [1, 1, 0]);
  assert.deepEqual(water.slice(0, 3), [1, 0, 1]);
  assert.equal(compare(fire, water), 1);
});

test("reordering requirements changes the preferred incomplete solution", () => {
  const requirements = [...orderedRequirements].reverse();
  assert.equal(compare(
    rank(evaluation({ 5: 1 }), {}, requirements),
    rank(evaluation({}, { 3: 2 }), {}, requirements)
  ), -1);
});

test("partial progress on an unmet first requirement cannot beat a completed second one", () => {
  const requirements = [
    { orb: FIRE, size: 5, count: 3, match: "exact" },
    { orb: WATER, size: 3, count: 1, match: "exact" },
  ];
  const waterComplete = evaluation({}, { 3: 1 });
  const firePartial = evaluation({ 5: 1 });
  assert.deepEqual(getRequirementDoneTuple(waterComplete, requirements), [0, 1]);
  assert.deepEqual(getRequirementDoneTuple(firePartial, requirements), [0, 0]);
  assert.equal(compare(
    [
      ...rank(waterComplete, {}, requirements),
      ...getRequirementGuideTuple(waterComplete, requirements),
    ],
    [
      ...rank(firePartial, {}, requirements),
      ...getRequirementGuideTuple(firePartial, requirements),
    ]
  ), 1);
});

test("fully satisfied requirements outrank any partial result", () => {
  const complete = rank(evaluation({ 5: 1 }, { 3: 2 }));
  const partial = rank(evaluation({ 5: 1 }), {
    specialRank: 7,
    initialExact: true,
    totalCombos: 20,
    steps: 1,
  });
  assert.equal(compare(complete, partial), 1);
});

test("legal paths outrank illegal paths regardless of results", () => {
  const legal = rank(evaluation());
  const illegal = rank(evaluation({ 5: 1 }, { 3: 2 }), {
    legal: false,
    specialRank: 7,
    initialExact: true,
    totalCombos: 20,
    steps: 1,
  });
  assert.equal(compare(legal, illegal), 1);
});

test("shields and exact initial target come before total combo", () => {
  const ev = evaluation({ 5: 1 }, { 3: 2 });
  assert.equal(compare(
    rank(ev, { specialRank: 1, totalCombos: 3, steps: 20 }),
    rank(ev, { specialRank: 0, initialExact: true, totalCombos: 10, steps: 1 })
  ), 1);
  assert.equal(compare(
    rank(ev, { initialExact: true, totalCombos: 3, steps: 20 }),
    rank(ev, { initialExact: false, totalCombos: 10, steps: 1 })
  ), 1);
});

test("missing the initial target does not prioritize target distance over total combo", () => {
  const target = 7;
  const ev = evaluation();
  const near = { ...ev, initialCombos: 6, combos: 6 };
  const far = { ...ev, initialCombos: 3, combos: 8 };
  assert.equal(compare(
    rank(far, { initialExact: far.initialCombos === target, totalCombos: far.combos }),
    rank(near, { initialExact: near.initialCombos === target, totalCombos: near.combos })
  ), 1);
});

test("higher combo wins before fewer steps when requirement outcomes are equal", () => {
  const ev = evaluation({ 5: 1 }, { 3: 2 });
  assert.equal(compare(
    rank(ev, { totalCombos: 8, steps: 20 }),
    rank(ev, { totalCombos: 6, steps: 10 })
  ), 1);
});

test("a group uses fewer steps only after higher-priority outcomes are equal", () => {
  const ev = { ...evaluation({ 5: 1 }, { 3: 2 }), initialCombos: 7, combos: 8 };
  assert.equal(compare(
    rank(ev, { totalCombos: ev.combos, steps: 9 }),
    rank(ev, { totalCombos: ev.combos, steps: 12 })
  ), 1);
  assert.equal(compare(
    rank(ev, { totalCombos: ev.combos, steps: 12 }),
    rank(evaluation({}, { 3: 2 }), { totalCombos: ev.combos, steps: 9 })
  ), 1);
});

test("six connected runes form one size-six group, never two size-three groups", () => {
  const requirements = [{ orb: FIRE, size: 3, count: 2, match: "exact" }];
  assert.deepEqual(getRequirementDoneTuple(evaluation({ 6: 1 }), requirements), [0]);
  assert.deepEqual(getRequirementGuideTuple(evaluation({ 6: 1 }), requirements), [-2]);
  assert.deepEqual(getRequirementDoneTuple(evaluation({ 3: 2 }), requirements), [1]);
});

test("atLeast compares group count and still requires the exact size bucket", () => {
  const exact = [{ orb: FIRE, size: 3, count: 2, match: "exact" }];
  const atLeast = [{ ...exact[0], match: "atLeast" }];
  assert.deepEqual(getRequirementDoneTuple(evaluation({ 3: 3 }), exact), [0]);
  assert.deepEqual(getRequirementGuideTuple(evaluation({ 3: 3 }), exact), [-1]);
  assert.deepEqual(getRequirementDoneTuple(evaluation({ 3: 3 }), atLeast), [1]);
  assert.deepEqual(getRequirementDoneTuple(evaluation({ 4: 3 }), atLeast), [0]);
});

test("empty requirements and absent histograms have defined results", () => {
  assert.deepEqual(getRequirementDoneTuple(null), []);
  assert.deepEqual(getRequirementGuideTuple(null), []);
  assert.deepEqual(getRequirementDoneTuple(null, orderedRequirements), [0, 0]);
  assert.deepEqual(getRequirementGuideTuple(null, orderedRequirements), [-1, -2]);
  assert.deepEqual(buildSolutionRank({ steps: 4 }), [1, 0, 0, 0, -4]);
});
