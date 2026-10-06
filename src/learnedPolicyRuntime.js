export const LEARNED_POLICY_SCHEMA = "comboauto.teacher.policy-value-target.v1";
export const LEARNED_POLICY_INPUT_DIM = 397;
export const LEARNED_POLICY_ACTIONS = Object.freeze([
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]);

const SPECIAL_TYPE_NAMES = [
  "none",
  "cross",
  "l",
  "t",
  "rect",
  "clearCount",
  "equalFirst",
  "same",
  "unknown",
];

const DEFAULT_MODEL_URL = `${import.meta.env?.BASE_URL || "/"}policy_value_target_expanded_stratified_balanced.onnx`;
const FALLBACK_MODEL_URL = `${import.meta.env?.BASE_URL || "/"}policy_value_target.onnx`;

const resolveDevModelUrl = () => {
  if (!import.meta.env?.DEV || typeof window === "undefined") {
    return DEFAULT_MODEL_URL;
  }
  const requested = new URLSearchParams(window.location.search).get(
    "policyModel"
  );
  if (!requested || !/^[A-Za-z0-9._-]+\.onnx$/.test(requested)) {
    return DEFAULT_MODEL_URL;
  }
  return `${import.meta.env?.BASE_URL || "/"}${requested}`;
};
let ortModulePromise = null;

const loadOrtModule = async () => {
  if (!ortModulePromise) ortModulePromise = import("onnxruntime-web");
  return ortModulePromise;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const orbOf = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return -1;
  const orb = number % 10;
  return orb >= 0 && orb < 6 ? orb : -1;
};

const pushOneHot = (out, index, size) => {
  for (let i = 0; i < size; i++) out.push(i === index ? 1 : 0);
};

const encodeRules = (sample) => {
  const out = new Array(72).fill(0);
  const profile = sample?.ruleProfile || sample?.ruleRuntimeCtx?.profile || {};
  const orbRules = Array.isArray(profile.orbRules) ? profile.orbRules : [];

  for (let orb = 0; orb < 6; orb++) {
    const rule = orbRules[orb] || {};
    out[orb] = clamp(Number(rule.minClear || 3) / 5, 0, 1);
    out[6 + orb] = rule.clearMode === "connected" ? 1 : 0;
  }

  const requirements = Array.isArray(sample?.requirements)
    ? sample.requirements
    : Array.isArray(profile.requirements)
      ? profile.requirements
      : [];

  for (const requirement of requirements) {
    const orb = Math.floor(Number(requirement?.orb));
    const size = Math.floor(Number(requirement?.size));
    if (orb < 0 || orb >= 6 || size < 1 || size > 5) continue;
    const base = 12 + orb * 10 + (size - 1) * 2;
    out[base] = clamp(Number(requirement?.count || 0) / 3, 0, 1);
    out[base + 1] = requirement?.match === "atLeast" ? 1 : 0;
  }

  return out;
};

const encodeSpecials = (sample) => {
  const out = new Array(54).fill(0);
  const specials = Array.isArray(sample?.specialPriorities)
    ? sample.specialPriorities
    : Array.isArray(sample?.specials)
      ? sample.specials
      : [];

  for (let slot = 0; slot < 3; slot++) {
    const special = specials[slot] || {};
    const base = slot * 18;
    const type = String(special.type || "none");
    const typeIndex = SPECIAL_TYPE_NAMES.indexOf(type);
    out[base + (typeIndex >= 0 ? typeIndex : 8)] = 1;

    const orb = Number(special.orb ?? special.rectOrb ?? -1);
    const orbIndex = Number.isInteger(orb) && orb >= 0 && orb < 6 ? orb : 6;
    out[base + 9 + orbIndex] = 1;

    const p1 = Number(
      special.rectM ?? special.clearCount ?? special.count ?? 0
    );
    const p2 = Number(
      special.rectN ?? (Array.isArray(special.equalOrbs) ? special.equalOrbs.length : 0)
    );
    out[base + 16] = clamp((Number.isFinite(p1) ? p1 : 0) / 30, 0, 1);
    out[base + 17] = clamp((Number.isFinite(p2) ? p2 : 0) / 6, 0, 1);
  }

  return out;
};

export const encodeLearnedState = ({
  state,
  target = 0,
  mode = "combo",
  skyfall = false,
  diagonal = false,
  row0 = false,
  stepsLeft = 0,
  stepsUsed = 0,
  ruleProfile = null,
  specialPriorities = [],
}) => {
  const out = [];
  const board = Array.isArray(state?.board) ? state.board : [];

  for (let r = 0; r < 6; r++) {
    const row = Array.isArray(board[r]) ? board[r] : [];
    for (let c = 0; c < 6; c++) {
      const orb = orbOf(row[c]);
      pushOneHot(out, orb >= 0 ? orb : 6, 7);
    }
  }

  const held = orbOf(state?.held);
  pushOneHot(out, held >= 0 ? held : -1, 6);

  const cursor = [Number(state?.r), Number(state?.c)];
  const hole = state?.hole ? [Number(state.hole.r), Number(state.hole.c)] : [-1, -1];
  for (const point of [cursor, hole]) {
    const valid = point.length === 2 && point.every(Number.isFinite);
    out.push(valid ? clamp(point[0] / 5, -1, 1) : -0.2);
    out.push(valid ? clamp(point[1] / 5, -1, 1) : -0.2);
  }

  out.push(clamp(Number(stepsLeft) / 30, 0, 4));
  out.push(clamp(Number(stepsUsed) / 30, 0, 4));
  out.push(clamp(Number(target) / 20, 0, 2));
  const normalizedMode = String(mode || "combo").toLowerCase();
  out.push(normalizedMode === "combo" ? 1 : 0);
  out.push(normalizedMode === "vertical" ? 1 : 0);
  out.push(normalizedMode === "horizontal" ? 1 : 0);
  out.push(skyfall ? 1 : 0, diagonal ? 1 : 0, row0 ? 1 : 0);
  out.push(...encodeRules({ ruleProfile }));
  out.push(...encodeSpecials({ specialPriorities }));

  if (out.length !== LEARNED_POLICY_INPUT_DIM) {
    throw new Error(
      `learned policy feature size mismatch: ${out.length} != ${LEARNED_POLICY_INPUT_DIM}`
    );
  }
  return Float32Array.from(out);
};

const outputByName = (outputs, name, index) =>
  outputs?.[name] || outputs?.[Object.keys(outputs || {})[index]] || null;

const toRows = (tensor, width) => {
  if (!tensor?.data) return [];
  const data = Array.from(tensor.data);
  const rows = [];
  for (let offset = 0; offset + width <= data.length; offset += width) {
    rows.push(data.slice(offset, offset + width));
  }
  return rows;
};

const normalizeActionIndex = (dr, dc) =>
  LEARNED_POLICY_ACTIONS.findIndex(([ar, ac]) => ar === dr && ac === dc);

export const createLearnedPolicyRuntime = ({
  modelUrl = DEFAULT_MODEL_URL,
  fallbackModelUrl = FALLBACK_MODEL_URL,
  enabled = true,
  maxBatchSize = 96,
} = {}) => {
  let sessionPromise = null;
  let activeModelUrl = modelUrl;
  let disabledReason = enabled ? "" : "disabled by config";
  const stats = {
    inferences: 0,
    states: 0,
    failures: 0,
    fallbackStates: 0,
  };

  const createSession = async (requestedModelUrl) => {
    if (typeof fetch === "function") {
      const probe = await fetch(requestedModelUrl, {
        method: "HEAD",
        cache: "no-store",
      });
      if (probe.status === 404 || (probe.status >= 400 && probe.status !== 405)) {
        throw new Error(`model unavailable (${probe.status})`);
      }
    }

    const ort = await loadOrtModule();
    try {
      return await ort.InferenceSession.create(requestedModelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    } catch (firstError) {
      try {
        return await ort.InferenceSession.create(requestedModelUrl);
      } catch (secondError) {
        throw secondError?.message ? secondError : firstError;
      }
    }
  };

  const ensureSession = async () => {
    if (!enabled || disabledReason) return null;
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const candidates = [modelUrl];
        if (fallbackModelUrl && fallbackModelUrl !== modelUrl) {
          candidates.push(fallbackModelUrl);
        }
        let lastError = null;

        for (const candidateUrl of candidates) {
          try {
            const session = await createSession(candidateUrl);
            activeModelUrl = candidateUrl;
            disabledReason = "";
            return session;
          } catch (error) {
            lastError = error;
            stats.failures++;
          }
        }

        disabledReason = lastError?.message || "model load failed";
        return null;
      })();
    }
    return sessionPromise;
  };

  const predictBatch = async (states, context = {}) => {
    if (!Array.isArray(states) || states.length === 0) return [];
    const session = await ensureSession();
    if (!session) {
      stats.fallbackStates += states.length;
      return null;
    }

    const batchLimit = Math.max(
      1,
      Number(context.maxBatchSize) || maxBatchSize
    );
    const selected = states.slice(0, batchLimit);
    const features = new Float32Array(selected.length * LEARNED_POLICY_INPUT_DIM);
    const { forState, maxBatchSize: _ignoredBatchSize, ...baseContext } = context;
    for (let i = 0; i < selected.length; i++) {
      const stateContext =
        typeof forState === "function" ? forState(selected[i], i) : {};
      const row = encodeLearnedState({
        state: selected[i],
        ...baseContext,
        ...stateContext,
      });
      features.set(row, i * LEARNED_POLICY_INPUT_DIM);
    }

    try {
      const ort = await loadOrtModule();
      const inputName = session.inputNames?.[0] || "state_features";
      const input = new ort.Tensor("float32", features, [
        selected.length,
        LEARNED_POLICY_INPUT_DIM,
      ]);
      const outputs = await session.run({ [inputName]: input });
      const policyTensor = outputByName(outputs, "policy_logits", 0);
      const valueTensor = outputByName(outputs, "value_vector", 1);
      const boardTensor = outputByName(outputs, "target_board_logits", 2);
      const clearTensor = outputByName(outputs, "target_clear_logits", 3);
      const policy = toRows(policyTensor, 8);
      const value = toRows(valueTensor, 4);
      const targetBoard = toRows(boardTensor, 180);
      const targetClear = toRows(clearTensor, 30);

      stats.inferences++;
      stats.states += selected.length;
      return selected.map((_, index) => ({
        policy: policy[index] || [],
        value: value[index] || [],
        targetBoard: targetBoard[index] || [],
        targetClear: targetClear[index] || [],
      }));
    } catch (error) {
      stats.failures++;
      disabledReason = error?.message || "model inference failed";
      stats.fallbackStates += states.length;
      return null;
    }
  };

  return {
    requestedModelUrl: modelUrl,
    fallbackModelUrl,
    get modelUrl() {
      return activeModelUrl;
    },
    stats,
    get disabledReason() {
      return disabledReason;
    },
    ensureSession,
    predictBatch,
    actionIndex: normalizeActionIndex,
  };
};

export const learnedPolicyRuntime = createLearnedPolicyRuntime({
  modelUrl: resolveDevModelUrl(),
});
