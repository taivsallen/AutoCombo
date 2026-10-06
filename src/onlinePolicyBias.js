const DB_NAME = "comboauto-online-policy-bias-v3";
const DB_VERSION = 1;
const STORE_NAME = "state-action";
const MAX_ENTRIES = 100000;
const ACTION_COUNT = 8;
const DEFAULT_WEIGHT = 18;

const actionIndexByDelta = new Map([
  ["0,1", 0],
  ["0,-1", 1],
  ["1,0", 2],
  ["-1,0", 3],
  ["1,1", 4],
  ["1,-1", 5],
  ["-1,1", 6],
  ["-1,-1", 7],
]);

const finiteOrb = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return -1;
  const orb = number % 10;
  return orb >= 0 && orb < 6 ? orb : -1;
};

const cloneBoard = (board) =>
  Array.isArray(board)
    ? board.map((row) => (Array.isArray(row) ? row.slice() : []))
    : [];

const canonicalStateParts = (state) => {
  const labels = new Map();
  let nextLabel = 0;
  const labelOrb = (value) => {
    const orb = finiteOrb(value);
    if (orb < 0) return "_";
    if (!labels.has(orb)) labels.set(orb, nextLabel++);
    return String(labels.get(orb));
  };

  const board = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 6 }, (_, col) => {
      const value = state?.board?.[row]?.[col];
      return Number(value) < 0 ? "_" : labelOrb(value);
    }).join("")
  ).join("/");

  return {
    board,
    held: labelOrb(state?.held),
  };
};

const ruleSignature = (profile) => {
  const orbRules = Array.isArray(profile?.orbRules)
    ? profile.orbRules.map((rule) => [
        Number(rule?.minClear) || 3,
        rule?.clearMode === "connected" ? "c" : "l",
      ])
    : [];
  const requirements = Array.isArray(profile?.requirements)
    ? profile.requirements.map((req) => [
        Number(req?.orb) || 0,
        Number(req?.size) || 3,
        Number(req?.count) || 1,
        req?.match === "atLeast" ? "a" : "e",
      ])
    : [];
  return JSON.stringify([orbRules, requirements]);
};

const specialSignature = (specialPriorities) => {
  const slots = Array.isArray(specialPriorities)
    ? specialPriorities.slice(0, 3)
    : [];
  return JSON.stringify(
    [0, 1, 2].map((index) => {
      const special = slots[index] || { type: "none" };
      return {
        type: special.type || "none",
        count: Number(special.count) || 0,
        orb: Number.isFinite(Number(special.orb)) ? Number(special.orb) : -1,
        clearCount: Number(special.clearCount) || 0,
        equalOrbs: Array.isArray(special.equalOrbs)
          ? special.equalOrbs.map(Number).sort((a, b) => a - b)
          : [],
        rectM: Number(special.rectM) || 0,
        rectN: Number(special.rectN) || 0,
        rectOrb: Number.isFinite(Number(special.rectOrb))
          ? Number(special.rectOrb)
          : -1,
      };
    })
  );
};

const makeStateKey = (state, context = {}) => {
  const parts = canonicalStateParts(state);
  const hole = state?.hole
    ? `${Number(state.hole.r) || 0},${Number(state.hole.c) || 0}`
    : "-";
  return [
    parts.board,
    parts.held,
    Number(state?.r) || 0,
    Number(state?.c) || 0,
    hole,
    Number(context.target) || 0,
    String(context.mode || "combo"),
    String(context.priority || "combo"),
    Number(context.performanceLevel) || 0,
    String(context.stepBucket || "steps-0"),
    context.hardStepLimitEnabled ? 1 : 0,
    Number(context.hardStepLimit) || 0,
    context.skyfall ? 1 : 0,
    context.diagonal ? 1 : 0,
    context.row0 ? 1 : 0,
    specialSignature(context.specialPriorities),
    ruleSignature(context.ruleProfile),
  ].join("|");
};

const createEntry = (key) => ({
  key,
  counts: new Array(ACTION_COUNT).fill(0),
  total: 0,
  updatedAt: Date.now(),
});

const serializeEntry = (entry) => ({
  key: entry.key,
  counts: entry.counts.slice(0, ACTION_COUNT),
  total: Number(entry.total) || 0,
  updatedAt: Number(entry.updatedAt) || Date.now(),
});

const deserializeEntry = (value) => {
  if (!value || typeof value.key !== "string") return null;
  const counts = Array.from({ length: ACTION_COUNT }, (_, index) =>
    Math.max(0, Number(value.counts?.[index]) || 0)
  );
  return {
    key: value.key,
    counts,
    total: Math.max(0, Number(value.total) || counts.reduce((a, b) => a + b, 0)),
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
};

const canUseIndexedDb = () =>
  typeof indexedDB !== "undefined" && typeof IDBKeyRange !== "undefined";

const openDatabase = () => {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
};

const readAll = (db) =>
  new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });

const writeEntries = (db, entries) =>
  new Promise((resolve, reject) => {
    if (!db || entries.length === 0) {
      resolve();
      return;
    }
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const entry of entries) store.put(serializeEntry(entry));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB write failed"));
  });

const replaceEntries = (db, entries) =>
  new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    for (const entry of entries) store.put(serializeEntry(entry));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB replace failed"));
  });

const createOnlinePolicyBias = () => {
  const entries = new Map();
  const dirtyKeys = new Set();
  let databasePromise = null;
  let loadPromise = null;
  let flushTimer = null;
  let persistenceQueue = Promise.resolve();
  let loaded = false;
  let updateCount = 0;
  let transitionCount = 0;

  const ensureDatabase = () => {
    if (!databasePromise) {
      databasePromise = openDatabase().catch((error) => {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[online-bias] IndexedDB unavailable; using memory only", error);
        }
        return null;
      });
    }
    return databasePromise;
  };

  const ensureLoaded = () => {
    if (!loadPromise) {
      loadPromise = (async () => {
        const db = await ensureDatabase();
        const persisted = await readAll(db);
        for (const value of persisted) {
          const entry = deserializeEntry(value);
          if (entry) entries.set(entry.key, entry);
        }
        loaded = true;
        return getStats();
      })().catch((error) => {
        loaded = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[online-bias] failed to restore cache", error);
        }
        return getStats();
      });
    }
    return loadPromise;
  };

  const scheduleFlush = () => {
    if (flushTimer || typeof setTimeout === "undefined") return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush().catch((error) => {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[online-bias] deferred flush failed", error);
        }
      });
    }, 250);
  };

  const enqueuePersistence = (operation) => {
    const next = persistenceQueue.then(operation, operation);
    persistenceQueue = next.catch(() => undefined);
    return next;
  };

  const flush = async () => {
    if (dirtyKeys.size === 0) return { written: 0 };
    const keys = Array.from(dirtyKeys);
    const dirtyEntries = keys
      .map((key) => entries.get(key))
      .filter(Boolean);
    await enqueuePersistence(async () => {
      const db = await ensureDatabase();
      await writeEntries(db, dirtyEntries);
      for (const entry of dirtyEntries) {
        if (entries.get(entry.key) === entry) dirtyKeys.delete(entry.key);
      }
    });
    return { written: dirtyEntries.length };
  };

  const snapshot = () => ({
    entries: Array.from(entries.values(), serializeEntry),
    updateCount,
    transitionCount,
  });

  const restore = async (savedSnapshot) => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    entries.clear();
    dirtyKeys.clear();
    for (const value of savedSnapshot?.entries || []) {
      const entry = deserializeEntry(value);
      if (entry) entries.set(entry.key, entry);
    }
    updateCount = Math.max(0, Number(savedSnapshot?.updateCount) || 0);
    transitionCount = Math.max(0, Number(savedSnapshot?.transitionCount) || 0);
    const restoredEntries = Array.from(entries.values(), serializeEntry);
    await enqueuePersistence(async () => {
      const db = await ensureDatabase();
      await replaceEntries(db, restoredEntries);
    });
    return getStats();
  };

  const getActionBias = (state, context, actionIndex) => {
    if (!loaded || !Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= ACTION_COUNT) {
      return 0;
    }
    const key = makeStateKey(state, context);
    const entry = entries.get(key);
    if (!entry || entry.total <= 0) return 0;

    const count = entry.counts[actionIndex] || 0;
    const priorProbability = 1 / ACTION_COUNT;
    const probability = (count + 1) / (entry.total + ACTION_COUNT);
    const confidence = Math.min(1, Math.sqrt(entry.total) / 3);
    const weight = Math.max(0, Number(context.onlineBiasWeight) || DEFAULT_WEIGHT);
    const rawBias = Math.log(Math.max(1e-6, probability) / priorProbability);
    return Math.max(-weight * 1.5, Math.min(weight * 1.5, rawBias * weight * confidence));
  };

  const recordRoute = ({ board, path, context = {} } = {}) => {
    if (!Array.isArray(board) || !Array.isArray(path) || path.length < 2) {
      return { transitions: 0, entries: entries.size };
    }

    const state = {
      board: cloneBoard(board),
      held: -1,
      hole: null,
      r: Number(path[0]?.r),
      c: Number(path[0]?.c),
    };
    if (!Number.isInteger(state.r) || !Number.isInteger(state.c)) {
      return { transitions: 0, entries: entries.size };
    }

    if (state.r === 0) {
      state.held = state.board[0]?.[state.c] ?? -1;
    } else {
      state.held = state.board[state.r]?.[state.c] ?? -1;
      if (state.board[state.r]) state.board[state.r][state.c] = -1;
      state.hole = { r: state.r, c: state.c };
    }

    let transitions = 0;
    for (let index = 0; index < path.length - 1; index++) {
      const next = path[index + 1];
      const nr = Number(next?.r);
      const nc = Number(next?.c);
      if (!Number.isInteger(nr) || !Number.isInteger(nc)) break;

      const actionIndex = actionIndexByDelta.get(`${nr - state.r},${nc - state.c}`);
      if (actionIndex == null) break;

      const key = makeStateKey(state, context);
      let entry = entries.get(key);
      if (!entry) {
        entry = createEntry(key);
        entries.set(key, entry);
      }
      entry.counts[actionIndex] += 1;
      entry.total += 1;
      entry.updatedAt = Date.now();
      dirtyKeys.add(key);
      updateCount += 1;
      transitionCount += 1;
      transitions += 1;

      if (state.r === 0 && nr > 0) {
        if (state.board[nr]) state.board[nr][nc] = -1;
        state.hole = { r: nr, c: nc };
      } else if (nr === 0) {
        break;
      } else if (state.hole && state.board[nr]) {
        const moved = state.board[nr][nc];
        state.board[state.hole.r][state.hole.c] = moved;
        state.board[nr][nc] = -1;
        state.hole = { r: nr, c: nc };
      }
      state.r = nr;
      state.c = nc;
    }

    while (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest == null) break;
      entries.delete(oldest);
      dirtyKeys.delete(oldest);
    }
    scheduleFlush();
    return { transitions, entries: entries.size, pending: dirtyKeys.size };
  };

  const getStats = () => ({
    loaded,
    entries: entries.size,
    updates: updateCount,
    transitions: transitionCount,
    pending: dirtyKeys.size,
    persistent: canUseIndexedDb(),
  });

  return {
    ensureLoaded,
    flush,
    snapshot,
    restore,
    getActionBias,
    getStats,
    recordRoute,
  };
};

export const onlinePolicyBias = createOnlinePolicyBias();
