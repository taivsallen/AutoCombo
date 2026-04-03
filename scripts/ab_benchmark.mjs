import fs from "fs";
import path from "path";
import vm from "vm";
import { performance } from "perf_hooks";
import { spawnSync } from "child_process";

const CWD = process.cwd();

const DEFAULTS = {
  a: "benchmark.js",
  b: "temp_tuner.mjs",
  suite: "fixed_test_suite.json",
  boards: 400,
  target: 8,
  mode: "horizontal",
  priority: "combo",
  skyfall: true,
  diagonal: true,
  autoRow0Expanded: false,
  initTargetCombo: -1,
  warmup: 8,
  config: {
    beamWidth: 440,
    maxSteps: 30,
    maxNodes: 50000,
    stepPenalty: 0,
    potentialWeight: 10,
    clearedWeight: 300,
  },
  special: [],
  output: "",
};

const parseBoolean = (v, fallback) => {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
};

const parseNumber = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseLooseJson = (raw) => {
  if (raw == null) return raw;
  const src = String(raw).trim();
  if (!src) return src;

  // 1) strict JSON
  try {
    return JSON.parse(src);
  } catch {
    // continue
  }

  // 2) common PowerShell/native-argv degraded forms:
  //    [{type:clearCount,clearCount:12}] / [{type:"x"}] / {'k':'v'}
  //    - quote bare keys
  //    - quote bare word values (except true/false/null/number)
  //    - normalize single quotes to double quotes
  let normalized = src;

  // remove trailing commas in object/array
  normalized = normalized.replace(/,\s*([}\]])/g, "$1");
  // convert single-quoted strings
  normalized = normalized.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, s) => `"${s.replace(/"/g, '\\"')}"`);
  // quote bare keys
  normalized = normalized.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  // quote bare word values
  normalized = normalized.replace(
    /:\s*([A-Za-z_][A-Za-z0-9_]*)\s*([,}\]])/g,
    (m, v, tail) => {
      const low = String(v).toLowerCase();
      if (["true", "false", "null"].includes(low)) return `:${low}${tail}`;
      if (/^-?\d+(\.\d+)?$/.test(v)) return `:${v}${tail}`;
      return `:"${v}"${tail}`;
    }
  );

  return JSON.parse(normalized);
};

const parseJSONOrThrow = (text, label) => {
  try {
    return parseLooseJson(text);
  } catch (err) {
    throw new Error(
      `${label} JSON 解析失敗: ${err?.message || err}\n原始內容: ${String(text)}`
    );
  }
};

const parseArgs = (argv) => {
  const opts = JSON.parse(JSON.stringify(DEFAULTS));

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1];

    switch (key) {
      case "a":
      case "b":
      case "suite":
      case "mode":
      case "priority":
      case "output":
        opts[key] = value;
        i++;
        break;
      case "boards":
      case "target":
      case "warmup":
      case "initTargetCombo":
        opts[key] = parseNumber(value, opts[key]);
        i++;
        break;
      case "skyfall":
      case "diagonal":
      case "autoRow0Expanded":
        opts[key] = parseBoolean(value, opts[key]);
        i++;
        break;
      case "config":
        opts.config = parseJSONOrThrow(value, "--config");
        i++;
        break;
      case "special":
        opts.special = parseJSONOrThrow(value, "--special");
        i++;
        break;
      default:
        break;
    }
  }

  if (!opts.a || !opts.b) {
    throw new Error("請提供 --a 與 --b（solver 檔案或 git 來源）。");
  }

  return opts;
};

const runGitShow = (ref, filePath) => {
  const proc = spawnSync("git", ["show", `${ref}:${filePath}`], {
    cwd: CWD,
    encoding: "utf8",
  });
  if (proc.status !== 0) {
    throw new Error(
      `git show 失敗 (${ref}:${filePath}): ${proc.stderr || proc.stdout || "unknown error"}`
    );
  }
  return proc.stdout;
};

const readSpecSource = (spec) => {
  // 支援格式: git:<ref>:<path>
  const m = /^git:([^:]+):(.+)$/.exec(spec);
  if (m) {
    const ref = m[1];
    const filePath = m[2].replace(/\\/g, "/");
    const code = runGitShow(ref, filePath);
    return {
      code,
      label: `${ref}:${filePath}`,
    };
  }

  const abs = path.isAbsolute(spec) ? spec : path.resolve(CWD, spec);
  if (!fs.existsSync(abs)) {
    throw new Error(`找不到 solver 檔案: ${abs}`);
  }
  return {
    code: fs.readFileSync(abs, "utf8"),
    label: abs,
  };
};

const stripImportsExports = (src) => {
  let out = src.replace(/^\uFEFF/, "");
  out = out.replace(/^\s*import\s+[^;]+;\s*$/gm, "");
  out = out.replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, "");
  out = out.replace(/^\s*export\s+default\s+/gm, "");
  return out;
};

const truncateAutoRun = (src) => {
  // 針對 benchmark / tuner 類腳本，切掉底部直接執行區。
  const markers = [
    "\nconst NUM_TESTS",
    "\nconst TARGET_COMBO",
    "\nconsole.log(`\\n🚀",
    "\nconsole.log(`\n🚀",
  ];
  let cut = src.length;
  for (const marker of markers) {
    const idx = src.indexOf(marker);
    if (idx >= 0) cut = Math.min(cut, idx);
  }
  return src.slice(0, cut);
};

const buildVMContext = () => ({
  performance,
  console: {
    log: () => {},
    warn: () => {},
    error: () => {},
    table: () => {},
    info: () => {},
  },
  Math,
  Date,
  JSON,
  Number,
  String,
  Boolean,
  BigInt,
  Array,
  Object,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Promise,
  requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  // solverCore 的圖片 import 佔位
  wImg: null,
  fImg: null,
  pImg: null,
  lImg: null,
  dImg: null,
  hImg: null,
  x1Img: null,
  x2Img: null,
  n1Img: null,
  n2Img: null,
  logoImg: null,
});

const loadBeamSolveFromSpec = (spec) => {
  const { code, label } = readSpecSource(spec);
  let source = stripImportsExports(code);
  source = truncateAutoRun(source);
  source += `\n;globalThis.__AB_BEAMSOLVE__ = (typeof beamSolve === "function" ? beamSolve : null);\n`;

  const sandbox = buildVMContext();
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {
    filename: label,
    timeout: 45000,
    displayErrors: true,
  });

  if (typeof sandbox.__AB_BEAMSOLVE__ !== "function") {
    throw new Error(`在 ${label} 找不到可用的 beamSolve 函式。`);
  }

  return {
    label,
    fn: sandbox.__AB_BEAMSOLVE__,
  };
};

const loadBoardSuite = (suitePath, maxBoards) => {
  const abs = path.isAbsolute(suitePath)
    ? suitePath
    : path.resolve(CWD, suitePath);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`盤面檔格式錯誤（需為陣列）: ${abs}`);
  }

  const boards = raw
    .map((item) => (Array.isArray(item?.board) ? item.board : item))
    .filter(Array.isArray)
    .slice(0, Math.max(1, Number(maxBoards) || 1))
    .map((b) => b.map((row) => row.slice()));

  if (!boards.length) {
    throw new Error(`盤面資料為空: ${abs}`);
  }
  return { abs, boards };
};

const getPathSteps = (pathLike) =>
  Array.isArray(pathLike) && pathLike.length > 0
    ? Math.max(0, pathLike.length - 1)
    : 0;

const normalizeSpecialList = (specialLike) => {
  if (!Array.isArray(specialLike)) return [];
  return specialLike.filter((sp) => sp && sp.type && sp.type !== "none");
};

const normalizeSelectedOrbs = (selLike) => {
  if (!Array.isArray(selLike)) return [];
  const set = new Set();
  for (const v of selLike) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 5) set.add(n);
  }
  return [...set];
};

const getSingleSpecialMatchedValue = (sol, sp) => {
  if (!sp || sp.type === "none") return 0;

  if (sp.type === "clearCount") {
    return Number(sol?.initialClearedCount || 0);
  }

  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedOrbs(sp.equalOrbs);
    if (!selected.length) return 0;
    const counts = sol?.initialComboCountsByOrb;
    if (!counts) return 0;

    const vals = selected.map((orb) => Number(counts?.[orb] || 0));
    const first = vals[0] || 0;
    if (first <= 0) return 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== first) return 0;
    }
    return first;
  }

  if (sp.type === "rect") {
    const m = Number(sp.rectM) || 3;
    const n = Number(sp.rectN) || 3;
    const rectKey = `${m}x${n}`;
    const group = sol?.initialPatternCounts?.rect?.[rectKey];
    if (!group) return 0;
    const orb = sp.rectOrb;
    if (orb == null || Number(orb) === -1) return Number(group.total || 0);
    return Number(group?.byOrb?.[Number(orb)] || 0);
  }

  const group = sol?.initialPatternCounts?.[sp.type];
  if (!group) return 0;
  const orb = sp.orb;
  if (orb == null || Number(orb) === -1) return Number(group.total || 0);
  return Number(group?.byOrb?.[Number(orb)] || 0);
};

const isSpecialSatisfied = (sol, specialList) => {
  const specials = normalizeSpecialList(specialList);
  if (!specials.length) return true;

  for (const sp of specials) {
    if (sp.type === "clearCount") {
      const want = Number(sp.clearCount || sp.count || 0);
      if (Number(sol?.initialClearedCount || 0) !== want) return false;
      continue;
    }

    const got = getSingleSpecialMatchedValue(sol, sp);
    if (sp.type === "equalFirst") {
      if (got <= 0) return false;
      continue;
    }
    if (sp.type === "rect") {
      if (got < 1) return false;
      continue;
    }

    const want = Number(sp.count || 1);
    if (got < want) return false;
  }

  return true;
};

const collectCandidates = (result, priority) => {
  const out = [];
  if (result && Array.isArray(result.path) && result.path.length) out.push(result);

  if (priority === "steps") {
    if (Array.isArray(result?.topSteps)) out.push(...result.topSteps);
    if (!out.length && Array.isArray(result?.topCombos)) out.push(...result.topCombos);
  } else {
    if (Array.isArray(result?.topCombos)) out.push(...result.topCombos);
    if (!out.length && Array.isArray(result?.topSteps)) out.push(...result.topSteps);
  }

  const dedup = [];
  const seen = new Set();
  for (const s of out) {
    if (!s) continue;
    const k = JSON.stringify(s.path || []) + `|${s.combos || 0}|${s.initialCombos || 0}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(s);
  }
  return dedup;
};

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
};

const runVariant = async (name, solverFn, boards, opts) => {
  const times = [];
  const stepsArr = [];
  const combosArr = [];
  let nodesTotal = 0;
  let top1Hits = 0;
  let top10Hits = 0;
  let top1SpecialHits = 0;
  let top10SpecialHits = 0;
  let errors = 0;

  for (const board of boards) {
    const input = board.map((row) => row.slice());
    const t0 = performance.now();
    let res = null;

    try {
      res = await Promise.resolve(
        solverFn(
          input,
          opts.config,
          opts.target,
          opts.mode,
          opts.priority,
          opts.skyfall,
          opts.diagonal,
          opts.special,
          opts.initTargetCombo,
          opts.autoRow0Expanded,
          null
        )
      );
    } catch (err) {
      errors++;
      continue;
    }

    const t1 = performance.now();
    times.push(t1 - t0);

    const candidates = collectCandidates(res, opts.priority);
    const top1 = candidates[0] || res || null;
    const top10 = candidates.slice(0, 10);

    const objectiveHit = (sol) =>
      !!sol &&
      Number(sol?.combos || 0) >= opts.target &&
      isSpecialSatisfied(sol, opts.special);

    const top1Hit = objectiveHit(top1);
    const top10Hit = top10.some(objectiveHit);
    const top1Special = !!top1 && isSpecialSatisfied(top1, opts.special);
    const top10Special = top10.some((s) => isSpecialSatisfied(s, opts.special));

    if (top1Hit) top1Hits++;
    if (top10Hit) top10Hits++;
    if (top1Special) top1SpecialHits++;
    if (top10Special) top10SpecialHits++;

    if (top1) {
      stepsArr.push(getPathSteps(top1.path));
      combosArr.push(Number(top1?.combos || 0));
    }
    nodesTotal += Number(res?.nodesExpanded || 0);
  }

  const n = Math.max(1, boards.length - errors);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

  return {
    name,
    cases: boards.length,
    errors,
    avgMs: avg(times),
    p95Ms: percentile(times, 0.95),
    avgStepsTop1: avg(stepsArr),
    avgCombosTop1: avg(combosArr),
    avgNodes: nodesTotal / n,
    top1HitRate: (top1Hits / n) * 100,
    top10HitRate: (top10Hits / n) * 100,
    top1SpecialRate: (top1SpecialHits / n) * 100,
    top10SpecialRate: (top10SpecialHits / n) * 100,
  };
};

const formatMetricRow = (m) => ({
  Variant: m.name,
  Cases: m.cases,
  Errors: m.errors,
  "Top1 Hit%": m.top1HitRate.toFixed(2),
  "Top10 Hit%": m.top10HitRate.toFixed(2),
  "Top1 Special%": m.top1SpecialRate.toFixed(2),
  "Top10 Special%": m.top10SpecialRate.toFixed(2),
  "Avg Steps(top1)": m.avgStepsTop1.toFixed(2),
  "Avg Combos(top1)": m.avgCombosTop1.toFixed(3),
  "Avg Time(ms)": m.avgMs.toFixed(2),
  "P95 Time(ms)": m.p95Ms.toFixed(2),
  "Avg Nodes": Math.round(m.avgNodes),
});

const buildDeltaRow = (a, b) => ({
  Variant: "Delta(B-A)",
  Cases: b.cases - a.cases,
  Errors: b.errors - a.errors,
  "Top1 Hit%": (b.top1HitRate - a.top1HitRate).toFixed(2),
  "Top10 Hit%": (b.top10HitRate - a.top10HitRate).toFixed(2),
  "Top1 Special%": (b.top1SpecialRate - a.top1SpecialRate).toFixed(2),
  "Top10 Special%": (b.top10SpecialRate - a.top10SpecialRate).toFixed(2),
  "Avg Steps(top1)": (b.avgStepsTop1 - a.avgStepsTop1).toFixed(2),
  "Avg Combos(top1)": (b.avgCombosTop1 - a.avgCombosTop1).toFixed(3),
  "Avg Time(ms)": (b.avgMs - a.avgMs).toFixed(2),
  "P95 Time(ms)": (b.p95Ms - a.p95Ms).toFixed(2),
  "Avg Nodes": Math.round(b.avgNodes - a.avgNodes),
});

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  const { boards, abs: suiteAbs } = loadBoardSuite(opts.suite, opts.boards);
  const solverA = loadBeamSolveFromSpec(opts.a);
  const solverB = loadBeamSolveFromSpec(opts.b);

  console.log("=== A/B Benchmark ===");
  console.log(`A: ${solverA.label}`);
  console.log(`B: ${solverB.label}`);
  console.log(`Suite: ${suiteAbs}`);
  console.log(`Boards: ${boards.length}`);
  console.log(
    `Target=${opts.target}, Mode=${opts.mode}, Priority=${opts.priority}, Skyfall=${opts.skyfall}, Diagonal=${opts.diagonal}`
  );
  console.log(`Specials: ${JSON.stringify(opts.special)}`);
  console.log(`Config: ${JSON.stringify(opts.config)}`);

  const warmupCount = Math.max(0, Math.min(boards.length, Number(opts.warmup) || 0));
  if (warmupCount > 0) {
    const warmupBoards = boards.slice(0, warmupCount);
    await runVariant("warmup-a", solverA.fn, warmupBoards, opts);
    await runVariant("warmup-b", solverB.fn, warmupBoards, opts);
  }

  const resultA = await runVariant("A", solverA.fn, boards, opts);
  const resultB = await runVariant("B", solverB.fn, boards, opts);

  console.table([
    formatMetricRow(resultA),
    formatMetricRow(resultB),
    buildDeltaRow(resultA, resultB),
  ]);

  const out = {
    timestamp: new Date().toISOString(),
    options: opts,
    solverA: solverA.label,
    solverB: solverB.label,
    resultA,
    resultB,
    delta: {
      top1Hit: resultB.top1HitRate - resultA.top1HitRate,
      top10Hit: resultB.top10HitRate - resultA.top10HitRate,
      top1Special: resultB.top1SpecialRate - resultA.top1SpecialRate,
      top10Special: resultB.top10SpecialRate - resultA.top10SpecialRate,
      avgStepsTop1: resultB.avgStepsTop1 - resultA.avgStepsTop1,
      avgCombosTop1: resultB.avgCombosTop1 - resultA.avgCombosTop1,
      avgMs: resultB.avgMs - resultA.avgMs,
      p95Ms: resultB.p95Ms - resultA.p95Ms,
      avgNodes: resultB.avgNodes - resultA.avgNodes,
    },
  };

  if (opts.output) {
    const outAbs = path.isAbsolute(opts.output)
      ? opts.output
      : path.resolve(CWD, opts.output);
    fs.writeFileSync(outAbs, JSON.stringify(out, null, 2), "utf8");
    console.log(`已輸出報告: ${outAbs}`);
  }
};

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
