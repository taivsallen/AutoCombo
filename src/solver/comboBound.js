const ORB_COUNT = 6;
const orbOf = (cell) => cell % 10;
const markOf = (cell, place) => Math.floor(cell / place) % 10;

function normalizedMinClear(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.floor(number))) : 3;
}

/**
 * Inventory relaxation for the five playable rows, with no random refill.
 * Each cleared group consumes at least its type's minClear beads. At most one
 * row0 event changes one existing bead's type, without changing its marks.
 * Geometry, route reachability, START/END and shield requirements are relaxed.
 * Consequently this is an upper bound, never a proof that it can be reached.
 */
export function estimateComboUpperBound(board, {
  useRow0 = true,
  ruleProfile = null,
  phase = "total",
} = {}) {
  if (phase !== "initial" && phase !== "total") {
    throw new TypeError("phase must be initial or total");
  }
  if (!Array.isArray(board) || board.length !== 6 || board.some((row) =>
    !Array.isArray(row) || row.length !== 6 || row.some((cell) =>
      !Number.isInteger(cell) || (cell >= 0 && orbOf(cell) >= ORB_COUNT)))) {
    throw new TypeError("board must contain six rows of six encoded orb integers");
  }

  // Accept either the editable rule profile or the App's runtime rule context.
  const profile = ruleProfile?.profile ?? ruleProfile;
  const minClearByOrb = Array.from({ length: ORB_COUNT }, (_, orb) =>
    normalizedMinClear(ruleProfile?.minClearByOrb?.[orb] ?? profile?.orbRules?.[orb]?.minClear));
  const counts = Array(ORB_COUNT).fill(0);
  for (let row = 1; row < 6; row++) {
    for (const cell of board[row]) {
      if (cell < 0) continue;
      const noClear = markOf(cell, 1000);
      if (noClear === 1 || (phase === "initial" && noClear === 2)) continue;
      counts[orbOf(cell)]++;
    }
  }
  const boundFor = (stock) => stock.reduce((sum, count, orb) =>
    sum + Math.floor(count / minClearByOrb[orb]), 0);
  const baseUpperBound = boundFor(counts);
  let upperBound = baseUpperBound;
  let relaxedBestRecolor = null;
  // Source N1/N2 marks do not prevent copying TYPE. X1 prevents any row0 touch.
  const row0SourceTypes = useRow0 ? [...new Set(board[0]
    .filter((cell) => cell >= 0 && markOf(cell, 10) !== 1)
    .map(orbOf))].sort((a, b) => a - b) : [];
  for (const toType of row0SourceTypes) {
    for (let fromType = 0; fromType < ORB_COUNT; fromType++) {
      if (!counts[fromType] || fromType === toType) continue;
      const changed = counts.slice();
      changed[fromType]--;
      changed[toType]++;
      const possible = boundFor(changed);
      if (possible > upperBound) {
        upperBound = possible;
        relaxedBestRecolor = { fromType, toType };
      }
    }
  }
  return {
    upperBound,
    phase,
    optimalityProven: false,
    reachabilityProven: false,
    label: "庫存消除上界（非可達證明）",
    boundType: "inventory_relaxation",
    metadata: {
      playableCapacity: 30,
      eligibleOrbCount: counts.reduce((sum, count) => sum + count, 0),
      countsByOrb: counts,
      minClearByOrb,
      baseUpperBound,
      row0SourceTypes,
      maxRow0Recolors: row0SourceTypes.length ? 1 : 0,
      relaxedBestRecolor,
      excludesN1: true,
      excludesN2: phase === "initial",
      assumesNoRandomRefill: true,
      relaxedConstraints: ["geometry", "path", "START/END", "shields", "ordered requirements", "N2 unlock timing"],
    },
  };
}
