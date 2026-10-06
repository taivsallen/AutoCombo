// Requirements are normalized by the caller. `size` selects the exact size
// histogram bucket; `match` applies to the number of groups in that bucket.
const getRequirementDistance = (ev, requirement) => {
  const got = Number(
    ev?.initialComboSizeCountsByOrb?.[requirement.orb]?.[
      String(requirement.size)
    ] || 0
  );
  return requirement.match === "atLeast"
    ? Math.max(0, requirement.count - got)
    : Math.abs(requirement.count - got);
};

// Compare every completion flag before any partial-progress heuristic.
export const getRequirementDoneTuple = (ev, requirements = []) =>
  requirements.map((requirement) =>
    getRequirementDistance(ev, requirement) === 0 ? 1 : 0
  );

// Search guidance only: append after the complete business rank, never between
// requirement completion flags or before shields, target combo, and total combo.
export const getRequirementGuideTuple = (ev, requirements = []) =>
  requirements.map((requirement) =>
    -getRequirementDistance(ev, requirement)
  );

// Higher values win lexicographically. A shorter path wins only after all
// higher-priority outcomes, including total combo, are equal.
export const buildSolutionRank = ({
  legal = true,
  requirementDone = [],
  specialRank = 0,
  initialExact = false,
  totalCombos = 0,
  steps = 0,
} = {}) => [
  legal ? 1 : 0,
  ...requirementDone,
  specialRank,
  initialExact ? 1 : 0,
  totalCombos,
  -steps,
];
