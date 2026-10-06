const ORB_IDS = [0, 1, 2, 3, 4, 5];
const SPECIAL_ORB_ANY = -1;

const STEP_BUCKETS = [
  { id: "steps-20", label: "步數 20 以內", maxSteps: 20 },
  { id: "steps-50", label: "步數 50 以內", maxSteps: 50 },
  { id: "steps-80", label: "步數 80 以內", maxSteps: 80 },
  { id: "steps-80-plus", label: "步數 80 以上（上限 120）", maxSteps: 120 },
];

const PERFORMANCE_LEVELS = [1, 2, 3, 4, 5];
const SPECIAL_TYPES = ["cross", "l", "t"];
const CLEAR_MODES = ["line", "connected"];

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeRuleProfile = (ruleVariant, requirementVariant) => {
  const orbRules = ORB_IDS.map(() => ({ minClear: 3, clearMode: "line" }));
  if (ruleVariant) orbRules[ruleVariant.orb] = { ...ruleVariant.rule };
  const requirements = (requirementVariant || []).map((requirement) => ({
    ...requirement,
    size: Math.max(
      Number(requirement.size) || 1,
      Number(orbRules[requirement.orb]?.minClear) || 3
    ),
  }));
  return {
    orbRules,
    requirements: clone(requirements),
  };
};

const makeSpecialVariants = () => {
  const variants = [
    { id: "none", label: "無解盾", type: "none" },
  ];

  for (let clearCount = 3; clearCount <= 30; clearCount++) {
    variants.push({
      id: `clear-${clearCount}`,
      label: `首消 ${clearCount} 粒盾`,
      type: "clearCount",
      clearCount,
    });
  }

  for (let mask = 1; mask < 1 << ORB_IDS.length; mask++) {
    const equalOrbs = ORB_IDS.filter((orb) => mask & (1 << orb));
    variants.push({
      id: `equal-${equalOrbs.join("")}`,
      label: `連擊相等盾 ${equalOrbs.join("/")}`,
      type: "equalFirst",
      equalOrbs,
    });
  }

  for (const type of SPECIAL_TYPES) {
    for (let count = 1; count <= 3; count++) {
      for (const orb of [SPECIAL_ORB_ANY, ...ORB_IDS]) {
        variants.push({
          id: `${type}-${count}-${orb}`,
          label: `${type} ${count} 組`,
          type,
          count,
          orb,
        });
      }
    }
  }

  for (let rectM = 3; rectM <= 5; rectM++) {
    for (let rectN = 3; rectN <= 5; rectN++) {
      for (const rectOrb of [SPECIAL_ORB_ANY, ...ORB_IDS]) {
        variants.push({
          id: `rect-${rectM}x${rectN}-${rectOrb}`,
          label: `靈罩 ${rectM}x${rectN}`,
          type: "rect",
          rectM,
          rectN,
          rectOrb,
        });
      }
    }
  }

  return variants;
};

const makeRuleVariants = () => {
  const variants = [];
  for (const orb of ORB_IDS) {
    for (let minClear = 1; minClear <= 5; minClear++) {
      for (const clearMode of CLEAR_MODES) {
        variants.push({
          id: `rule-${orb}-${minClear}-${clearMode}`,
          orb,
          rule: { minClear, clearMode },
        });
      }
    }
  }
  return variants;
};

const makeRequirementVariants = () => {
  const variants = [];
  for (let index = 0; index < 256; index++) {
    if (index % 4 === 0) {
      variants.push(null);
      continue;
    }

    const firstOrb = index % ORB_IDS.length;
    const secondOrb = (firstOrb + 1 + Math.floor(index / 6)) % ORB_IDS.length;
    const firstSize = 1 + (Math.floor(index / 6) % 5);
    const secondSize = 1 + (Math.floor(index / 30) % 5);
    const first = {
      orb: firstOrb,
      size: firstSize,
      count: 1,
      match: index % 2 === 0 ? "exact" : "atLeast",
    };

    variants.push(
      index % 3 === 0
        ? [first, {
            orb: secondOrb,
            size: secondSize,
            count: 1,
            match: index % 2 === 0 ? "atLeast" : "exact",
          }]
        : [first]
    );
  }
  return variants;
};

const specialFamilyName = (special) => {
  if (!special || special.type === "none") return "無解盾";
  if (special.type === "clearCount") return "首消n粒盾";
  if (special.type === "equalFirst") return "連擊相等盾";
  if (special.type === "rect") return "靈罩";
  return `${special.type}盾`;
};

const specialFamilyKey = (special) =>
  !special || special.type === "none" ? "none" : String(special.type);

const pickDistinctSpecial = (variants, candidateIndex, usedFamilies) => {
  const start = ((candidateIndex % variants.length) + variants.length) % variants.length;
  for (let offset = 0; offset < variants.length; offset += 1) {
    const candidate = variants[(start + offset) % variants.length];
    const family = specialFamilyKey(candidate);
    if (family === "none" || !usedFamilies.has(family)) {
      usedFamilies.add(family);
      return candidate;
    }
  }
  return { type: "none" };
};

export const ONLINE_TRAINING_PLAN_VERSION = 1;
export const ONLINE_TRAINING_PLAN_SIZE = 256;

export const createOnlineTrainingSchedule = ({ row0Expanded = true } = {}) => {
  const specialVariants = makeSpecialVariants();
  const ruleVariants = makeRuleVariants();
  const requirementVariants = makeRequirementVariants();

  return Array.from({ length: ONLINE_TRAINING_PLAN_SIZE }, (_, index) => {
    const stepBucket = STEP_BUCKETS[index % STEP_BUCKETS.length];
    const usedSpecialFamilies = new Set();
    const special = pickDistinctSpecial(
      specialVariants,
      index * 97,
      usedSpecialFamilies
    );
    const secondarySpecial =
      index % 4 === 0
        ? pickDistinctSpecial(
            specialVariants,
            index * 53 + 11,
            usedSpecialFamilies
          )
        : { type: "none" };
    const tertiarySpecial =
      index % 9 === 0
        ? pickDistinctSpecial(
            specialVariants,
            index * 71 + 23,
            usedSpecialFamilies
          )
        : { type: "none" };
    const ruleVariant = ruleVariants[(index * 37) % ruleVariants.length];
    const requirementVariant = requirementVariants[index];
    const target = (index * 7) % 10 + 1;
    const priority = Math.floor(index / 4) % 2 === 0 ? "combo" : "steps";
    const skyfall = Math.floor(index / 2) % 2 === 0;
    const diagonal = index % 2 === 0;
    const performanceLevel = (index * 3) % PERFORMANCE_LEVELS.length + 1;
    const specialPriorities = [special, secondarySpecial, tertiarySpecial];
    const specialFamily = [special, secondarySpecial, tertiarySpecial]
      .filter((item) => item?.type && item.type !== "none")
      .map(specialFamilyName)
      .join(" + ") || "無解盾";

    return {
      id: `coverage-${index + 1}`,
      label: `覆蓋 ${index + 1}/${ONLINE_TRAINING_PLAN_SIZE}：${specialFamily} / Combo ${target} / Lv${performanceLevel}`,
      target,
      priority,
      skyfall,
      diagonal,
      row0: !!row0Expanded,
      mode: "vertical",
      performanceLevel,
      maxSteps: stepBucket.maxSteps,
      stepBucket: stepBucket.id,
      stepLabel: stepBucket.label,
      hardStepLimitEnabled: true,
      hardStepLimit: stepBucket.maxSteps,
      specialPriorities: clone(specialPriorities),
      specialFamily,
      ruleProfile: makeRuleProfile(ruleVariant, requirementVariant),
      ruleVariant: ruleVariant.id,
      requirementVariant: requirementVariant
        ? requirementVariant.map((req) => ({ ...req }))
        : [],
      coverageTags: [
        `diagonal:${diagonal ? "on" : "off"}`,
        `skyfall:${skyfall ? "on" : "off"}`,
        `priority:${priority}`,
        `step:${stepBucket.id}`,
        `target:${target}`,
        `performance:${performanceLevel}`,
        `special:${specialFamily}`,
        `rule:${ruleVariant.id}`,
      ],
    };
  });
};

export const summarizeOnlineTrainingSchedule = (schedule) => {
  const list = Array.isArray(schedule) ? schedule : [];
  const countValues = (key) =>
    new Set(list.map((item) => String(item?.[key] ?? ""))).size;
  return {
    planVersion: ONLINE_TRAINING_PLAN_VERSION,
    conditions: list.length,
    diagonalValues: countValues("diagonal"),
    skyfallValues: countValues("skyfall"),
    priorityValues: countValues("priority"),
    stepBuckets: new Set(list.map((item) => item?.stepBucket)).size,
    targets: new Set(list.map((item) => item?.target)).size,
    performanceLevels: new Set(list.map((item) => item?.performanceLevel)).size,
    specialFamilies: new Set(list.map((item) => item?.specialFamily)).size,
    ruleVariants: new Set(list.map((item) => item?.ruleVariant)).size,
    requirementVariants: new Set(
      list.map((item) => JSON.stringify(item?.requirementVariant || []))
    ).size,
  };
};
