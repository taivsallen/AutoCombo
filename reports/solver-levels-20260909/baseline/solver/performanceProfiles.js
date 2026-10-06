const freezeProfile = (profile) => Object.freeze({ ...profile });

// Each level is a complete search policy. Beam width and node count are only
// ceilings; the remaining fields decide how that budget is spent.
export const PERFORMANCE_PROFILES = Object.freeze([
  freezeProfile({
    level: 1,
    label: "極速",
    beamWidth: 440,
    maxNodes: 50000,
    evalWorkers: 1,
    humanPlanner: false,
    reversePlanner: false,
    beamEarlyScale: 0.28,
    beamMiddleScale: 0.52,
    stagnationBeamRounds: 4,
    diversityBeamThreshold: 0.22,
    visitedFrontierCap: 4,
    visitedFamilyCap: 2,
    cheapEvalScale: 1.45,
    cheapEvalConstraintScale: 1.8,
    stagnationEvalBoost1: 1.12,
    stagnationEvalBoost2: 1.06,
    reverseTargetLimit: 0,
    specialTargetLimit: 2,
    specialTargetVariants: 3,
    rectGuideRefreshStride: 4,
    comboPostSolveSteps: 1,
    specialPostSolveSteps: 0,
  }),
  freezeProfile({
    level: 2,
    label: "輕量",
    beamWidth: 550,
    maxNodes: 90000,
    evalWorkers: 1,
    humanPlanner: false,
    reversePlanner: true,
    beamEarlyScale: 0.34,
    beamMiddleScale: 0.62,
    stagnationBeamRounds: 3,
    diversityBeamThreshold: 0.28,
    visitedFrontierCap: 6,
    visitedFamilyCap: 2,
    cheapEvalScale: 1.65,
    cheapEvalConstraintScale: 2.05,
    stagnationEvalBoost1: 1.18,
    stagnationEvalBoost2: 1.08,
    reverseTargetLimit: 3,
    specialTargetLimit: 3,
    specialTargetVariants: 4,
    rectGuideRefreshStride: 3,
    comboPostSolveSteps: 1,
    specialPostSolveSteps: 0,
  }),
  freezeProfile({
    level: 3,
    label: "平衡",
    beamWidth: 800,
    maxNodes: 145000,
    evalWorkers: 2,
    humanPlanner: true,
    reversePlanner: true,
    beamEarlyScale: 0.4,
    beamMiddleScale: 0.7,
    stagnationBeamRounds: 2,
    diversityBeamThreshold: 0.35,
    visitedFrontierCap: 8,
    visitedFamilyCap: 3,
    cheapEvalScale: 2,
    cheapEvalConstraintScale: 2.5,
    stagnationEvalBoost1: 1.28,
    stagnationEvalBoost2: 1.12,
    reverseTargetLimit: 6,
    specialTargetLimit: 4,
    specialTargetVariants: 6,
    rectGuideRefreshStride: 2,
    comboPostSolveSteps: 2,
    specialPostSolveSteps: 0,
  }),
  freezeProfile({
    level: 4,
    label: "高精",
    beamWidth: 1200,
    maxNodes: 240000,
    evalWorkers: 3,
    humanPlanner: true,
    reversePlanner: true,
    beamEarlyScale: 0.48,
    beamMiddleScale: 0.8,
    stagnationBeamRounds: 2,
    diversityBeamThreshold: 0.42,
    visitedFrontierCap: 10,
    visitedFamilyCap: 4,
    cheapEvalScale: 2.35,
    cheapEvalConstraintScale: 2.9,
    stagnationEvalBoost1: 1.34,
    stagnationEvalBoost2: 1.16,
    reverseTargetLimit: 8,
    specialTargetLimit: 6,
    specialTargetVariants: 8,
    rectGuideRefreshStride: 2,
    comboPostSolveSteps: 3,
    specialPostSolveSteps: 1,
  }),
  freezeProfile({
    level: 5,
    label: "極限",
    beamWidth: 2000,
    maxNodes: 400000,
    evalWorkers: 4,
    humanPlanner: true,
    reversePlanner: true,
    beamEarlyScale: 0.56,
    beamMiddleScale: 0.88,
    stagnationBeamRounds: 1,
    diversityBeamThreshold: 0.5,
    visitedFrontierCap: 12,
    visitedFamilyCap: 5,
    cheapEvalScale: 2.8,
    cheapEvalConstraintScale: 3.4,
    stagnationEvalBoost1: 1.42,
    stagnationEvalBoost2: 1.2,
    reverseTargetLimit: 8,
    specialTargetLimit: 6,
    specialTargetVariants: 8,
    rectGuideRefreshStride: 1,
    comboPostSolveSteps: 4,
    specialPostSolveSteps: 2,
  }),
]);

export const getPerformanceProfile = (level = 3) => {
  const normalized = Math.max(1, Math.min(5, Math.floor(Number(level) || 3)));
  return PERFORMANCE_PROFILES[normalized - 1];
};

export const inferPerformanceLevel = (beamWidth, maxNodes) => {
  let best = PERFORMANCE_PROFILES[2];
  let bestDistance = Infinity;
  for (const profile of PERFORMANCE_PROFILES) {
    const distance =
      Math.abs((Number(beamWidth) || 0) - profile.beamWidth) +
      Math.abs((Number(maxNodes) || 0) - profile.maxNodes) / 1000;
    if (distance < bestDistance) {
      best = profile;
      bestDistance = distance;
    }
  }
  return best.level;
};

export const applyPerformanceProfile = (config, level) => ({
  ...config,
  ...getPerformanceProfile(level),
  performanceLevel: getPerformanceProfile(level).level,
});
