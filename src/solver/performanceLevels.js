// Request budgets include search, path refinement, and Web delivery.
// They are ceilings: exhausted frontiers and completed repairs return early.
export const PERFORMANCE_PRESETS = Object.freeze([
  { level: 1, label: '極速', timeBudgetMs: 160, beamWidth: 64, maxNodes: 50000,
    repairReserveMs: 32, finalReserveMs: 18, repairMaxAttempts: 128 },
  { level: 2, label: '輕量', timeBudgetMs: 400, beamWidth: 64, maxNodes: 90000,
    repairReserveMs: 64, finalReserveMs: 20, repairMaxAttempts: 256 },
  { level: 3, label: '平衡', timeBudgetMs: 800, beamWidth: 64, maxNodes: 145000,
    repairReserveMs: 120, finalReserveMs: 24, repairMaxAttempts: 512 },
  { level: 4, label: '高精', timeBudgetMs: 1600, beamWidth: 192, maxNodes: 240000,
    repairReserveMs: 220, finalReserveMs: 32, repairMaxAttempts: 768 },
  { level: 5, label: '極限', timeBudgetMs: 3200, beamWidth: 192, maxNodes: 400000,
    repairReserveMs: 400, finalReserveMs: 40, repairMaxAttempts: 1024 },
].map(Object.freeze));

export const getPerformancePreset = (level) =>
  PERFORMANCE_PRESETS[Math.max(1, Math.min(5, Math.round(Number(level) || 1))) - 1];

export const getPerformanceSettings = (level) => {
  const { level: _level, label: _label, ...settings } = getPerformancePreset(level);
  return settings;
};

export const getPerformanceLevelFromConfig = (beamWidth, maxNodes, timeBudgetMs) => {
  // The request budget is authoritative; width/node fallbacks support older configs.
  if (Number.isFinite(Number(timeBudgetMs)) && Number(timeBudgetMs) > 0) {
    return PERFORMANCE_PRESETS.reduce((best, preset) =>
      Math.abs(preset.timeBudgetMs - timeBudgetMs) < Math.abs(best.timeBudgetMs - timeBudgetMs)
        ? preset : best).level;
  }
  return PERFORMANCE_PRESETS.reduce((best, preset) => {
    const distance = (p) => Math.abs((Number(beamWidth) || 0) - p.beamWidth) +
      Math.abs((Number(maxNodes) || 0) - p.maxNodes) / 1000;
    return distance(preset) < distance(best) ? preset : best;
  }).level;
};
