import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from "react-dom";
import { toCanvas } from "html-to-image";
import ImportCropModal from "./ImportCropModal";
import { convertTemplateBoardTo2D } from "./activeSkillTemplateData";
import ActiveSkillTemplateModal from "./ActiveSkillTemplateModal";
import GIF from "gif.js.optimized";
import gifWorkerUrl from "gif.js.optimized/dist/gif.worker.js?url";
import gifsicle from "gifsicle-wasm-browser";
import { Sparkles, FileDown, Wrench, Play, Pause, Square, Zap, RefreshCw, Database, Activity, Target, BrainCircuit, Settings2, Sliders, Layers, Microscope, Binary, Timer, Unlink, AlignJustify, AlignCenterVertical, Footprints, Trophy, Edit3, Check, X, Palette, Clock, Hourglass, Ruler, CloudLightning, MoveUpRight, Move, Lightbulb, MessageSquare, Send, ImagePlus } from 'lucide-react';
import {
  LANGUAGE_MENU_TEXT,
  LANGUAGE_OPTIONS,
  applyLanguageToDocument,
  detectLanguageByIp,
  getBrowserFallbackLanguage,
  getPathLanguage,
  getStoredLanguage,
  setStoredLanguage,
  syncLanguagePath,
  translateText,
} from "./i18n";

import wImg from './assets/w.png';
import fImg from './assets/f.png';
import pImg from './assets/p.png';
import lImg from './assets/l.png';
import dImg from './assets/d.png';
import hImg from './assets/h.png';
import padWImg from './assets/pad_w.png';
import padFImg from './assets/pad_f.png';
import padPImg from './assets/pad_p.png';
import padLImg from './assets/pad_l.png';
import padDImg from './assets/pad_d.png';
import padHImg from './assets/pad_h.png';
import x1Img from './assets/x1.png';
import x2Img from './assets/x2.png';
import n1Img from './assets/n1.png';
import n2Img from './assets/n2.png';
import logoImg from './assets/logo.png';
import boxPImg from "./assets/box_p.png";
import boxWImg from "./assets/box_w.png";
import boxDImg from "./assets/box_d.png";
import boxFImg from "./assets/box_f.png";
import boxLImg from "./assets/box_l.png";

const ROW0_BOX_IMG_MAP = {
  WATER: boxWImg,
  FIRE: boxFImg,
  EARTH: boxPImg,
  LIGHT: boxLImg,
  DARK: boxDImg,
  // HEART 銝神 ???芸?銝＊蝷?
};

const ORB_TYPES = {
  WATER: { id: 0, img: wImg },
  FIRE: { id: 1, img: fImg },
  EARTH: { id: 2, img: pImg },
  LIGHT: { id: 3, img: lImg },
  DARK: { id: 4, img: dImg },
  HEART: { id: 5, img: hImg },
};

const ORB_IDS = [0, 1, 2, 3, 4, 5];
const ORB_LABELS = ["W", "F", "P", "L", "D", "H"];
const ORB_ICON_IMGS = [wImg, fImg, pImg, lImg, dImg, hImg];
const RECOGNITION_ORB_TEMPLATES = [
  { id: ORB_TYPES.WATER.id, img: padWImg, key: "pad_water" },
  { id: ORB_TYPES.FIRE.id, img: padFImg, key: "pad_fire" },
  { id: ORB_TYPES.EARTH.id, img: padPImg, key: "pad_earth" },
  { id: ORB_TYPES.LIGHT.id, img: padLImg, key: "pad_light" },
  { id: ORB_TYPES.DARK.id, img: padDImg, key: "pad_dark" },
  { id: ORB_TYPES.HEART.id, img: padHImg, key: "pad_heart" },
];
const RULE_CLEAR_MODE_LINE = "line";
const RULE_CLEAR_MODE_CONNECTED = "connected";
const RULE_CLEAR_MODES = [
  { value: RULE_CLEAR_MODE_LINE, label: "直橫消" },
  { value: RULE_CLEAR_MODE_CONNECTED, label: "相連消" },
];
const RULE_SIZE_OPTIONS = [
  { id: 1, text: "一" },
  { id: 2, text: "二" },
  { id: 3, text: "三" },
  { id: 4, text: "四" },
  { id: 5, text: "五" }
];

const renderOrbIcon = (orb, className = "h-4 w-4") => {
  const src = ORB_ICON_IMGS[orb];
  if (!src) return null;
  return <img src={src} alt={ORB_LABELS[orb] || ""} className={`${className} object-contain`} />;
};

const clampIntRange = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

const normalizeOrbRule = (ruleLike) => ({
  minClear: clampIntRange(ruleLike?.minClear, 1, 5, 3),
  clearMode:
    ruleLike?.clearMode === RULE_CLEAR_MODE_CONNECTED
      ? RULE_CLEAR_MODE_CONNECTED
      : RULE_CLEAR_MODE_LINE,
});

const makeDefaultRuleProfile = () => ({
  orbRules: ORB_IDS.map(() => normalizeOrbRule(null)),
  requirements: [],
});

const normalizeRuleRequirement = (reqLike) => {
  const orb = clampIntRange(reqLike?.orb, 0, 5, 0);
  const size = clampIntRange(reqLike?.size, 1, 5, 3);
  const count = Math.max(1, clampIntRange(reqLike?.count, 1, 999, 1));
  return {
    orb,
    size,
    count,
    match: reqLike?.match === "atLeast" ? "atLeast" : "exact",
  };
};

const normalizeRuleProfile = (profileLike) => {
  const orbRulesSrc = Array.isArray(profileLike?.orbRules)
    ? profileLike.orbRules
    : [];
  const reqSrc = Array.isArray(profileLike?.requirements)
    ? profileLike.requirements
    : [];

  return {
    orbRules: ORB_IDS.map((orb) => normalizeOrbRule(orbRulesSrc[orb])),
    requirements: reqSrc.map(normalizeRuleRequirement),
  };
};

const buildRuleRuntimeContext = (profileLike) => {
  const profile = normalizeRuleProfile(profileLike);
  return {
    profile,
    minClearByOrb: ORB_IDS.map(
      (orb) => profile.orbRules[orb]?.minClear || 3
    ),
    clearModeByOrb: ORB_IDS.map(
      (orb) => profile.orbRules[orb]?.clearMode || RULE_CLEAR_MODE_LINE
    ),
  };
};

const getRuleRuntimeContext = (ruleProfileLike) => {
  if (
    ruleProfileLike &&
    ruleProfileLike.profile &&
    Array.isArray(ruleProfileLike.minClearByOrb) &&
    Array.isArray(ruleProfileLike.clearModeByOrb)
  ) {
    return ruleProfileLike;
  }
  return buildRuleRuntimeContext(ruleProfileLike);
};

const orbOf = (v) => (v < 0 ? -1 : v % 10);                    // 0~5
const xMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 10) % 10); // 0/1/2
const qMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 100) % 10); // 0/1/2
const nMarkOf = (v) => (v < 0 ? 0 : Math.floor(v / 1000) % 10); // 0/1/2

const withMarks = (orbId, xMark = 0, qMark = 0, nMark = 0) =>
  orbId + xMark * 10 + qMark * 100 + nMark * 1000;

const setXMark = (cellVal, xMark) =>
  withMarks(orbOf(cellVal), xMark, qMarkOf(cellVal), nMarkOf(cellVal));

const setQMark = (cellVal, qMark) =>
  withMarks(orbOf(cellVal), xMarkOf(cellVal), qMark, nMarkOf(cellVal));

const setNMark = (cellVal, nMark) =>
  withMarks(orbOf(cellVal), xMarkOf(cellVal), qMarkOf(cellVal), nMark);
  
const NO_CLEAR_MARK = {
  NONE: 0,
  N1: 1, // 擐 + 天降 ?賭??賣?
  N2: 2, // 擐銝瘨?天降?舀?
};

const getOrbForMatchPhase = (cellVal, phase) => {
  if (cellVal < 0) return -1;

  const n = nMarkOf(cellVal);

  // 擐嚗1 / n2 ?賢??其??臬?????
  if (phase === "initial") {
    if (n === 1 || n === 2) return -1;
  }

  // 天降嚗??n1 銝瘨?n2 ?臭誑瘨?
  if (phase === "skyfall") {
    if (n === 1) return -1;
  }

  return orbOf(cellVal);
};

const stripN2FromBoard = (b) =>
  b.map((row) =>
    row.map((cell) => (nMarkOf(cell) === 2 ? setNMark(cell, 0) : cell))
  );

const TOTAL_ROWS = 6;
const COLS = 6;
const PLAY_ROWS_START = 1; // 0 ?舀摮?
const PLAY_ROWS = TOTAL_ROWS - PLAY_ROWS_START; // 5

const PLAY_COLS = COLS;

const makeGhostSlot = () => ({
  active: false,
  orbId: -1,

  fromX: 0,
  fromY: 0,
  toX: 0,
  toY: 0,

  x: 0,
  y: 0,
  startAt: 0,
  duration: 120,

  alpha: 1,
  scale: 1,
  onDone: null,
});

// 摰儔蝘餃??孵?
const DIRS_4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIRS_8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const BFS_DRS = [0, 0, 1, -1];
const BFS_DCS = [1, -1, 0, 0];

const EVAL_WORKER_SCRIPT_VERSION = "eval-worker-v5";
const EVAL_PARALLEL_SHARED = {
  scriptURL: null,
  scriptVersion: "",
  workerPool: [],
  nextRequestId: 1,
  boardBufferPool: [],
  taskArrayPool: [],
  transferListPool: [],
  packedMovePool: [],
  moveMetaPool: [],
  moveMetaArrayPool: [],
  parallelJobPool: [],
  parallelJobArrayPool: [],
  parallelResultArrayPool: [],
};

const EVAL_BOARD_CELL_COUNT = TOTAL_ROWS * COLS;
const EVAL_BOARD_BUFFER_BYTES = EVAL_BOARD_CELL_COUNT * Int16Array.BYTES_PER_ELEMENT;
const EVAL_POOL_MAX = {
  boardBuffer: 4096,
  taskArray: 256,
  transferList: 256,
  packedMove: 8192,
  moveMeta: 8192,
  moveMetaArray: 256,
  parallelJob: 8192,
  parallelJobArray: 256,
  parallelResultArray: 256,
};

const acquireArrayFromPool = (pool) => {
  if (Array.isArray(pool) && pool.length > 0) {
    const arr = pool.pop();
    arr.length = 0;
    return arr;
  }
  return [];
};

const releaseArrayToPool = (pool, arr, maxSize = 128) => {
  if (!Array.isArray(pool) || !Array.isArray(arr)) return;
  arr.length = 0;
  if (pool.length < maxSize) pool.push(arr);
};

const acquireBoardTransferBuffer = () =>
  EVAL_PARALLEL_SHARED.boardBufferPool.pop() ||
  new ArrayBuffer(EVAL_BOARD_BUFFER_BYTES);

const recycleBoardTransferBuffer = (buffer) => {
  if (!(buffer instanceof ArrayBuffer)) return;
  if (buffer.byteLength !== EVAL_BOARD_BUFFER_BYTES) return;
  if (EVAL_PARALLEL_SHARED.boardBufferPool.length < EVAL_POOL_MAX.boardBuffer) {
    EVAL_PARALLEL_SHARED.boardBufferPool.push(buffer);
  }
};

const STATE_DESC = {
  0: "刷符石（不附加狀態）",
  1: "X1：路徑不可碰",
  2: "X2：路徑不可碰，但最後一格可",
  3: "START：指定起點",
  4: "END：指定終點",
  5: "N1：首批與疊珠都不可消",
  6: "N2：首批不可消，但疊珠可消",
};

const DEFAULT_CONFIG = {
  beamWidth: 440,    
  maxSteps: 30,      
  hardStepLimitEnabled: false,
  hardStepLimit: 80,
  maxNodes: 50000,  
  evalWorkers: 1,
  humanPlanner: true,
  reversePlanner: true,
  reverseMaxSteps: 60,
  searchSeed: 0,
  deferMoveMaterialization: true,
  cheapLocalGuidance: true,
  cheapLegacyReserve: 0.25,
  cheapEvalScale: 2,
  cheapEvalConstraintScale: 2.5,
  stepPenalty: 0,  
  potentialWeight: 10, 
  clearedWeight: 300,
  replaySpeed: 250, 
};

const PERFORMANCE_PRESETS = [
  { level: 1, beamWidth: 350, maxNodes: 50000, label: "極速" },
  { level: 2, beamWidth: 550, maxNodes: 90000, label: "輕量" },
  { level: 3, beamWidth: 800, maxNodes: 145000, label: "平衡" },
  { level: 4, beamWidth: 1200, maxNodes: 240000, label: "高精" },
  { level: 5, beamWidth: 2000, maxNodes: 400000, label: "極限" },
];

const getPerformanceLevelFromConfig = (beamWidth, maxNodes) => {
  let bestLevel = 3;
  let bestDist = Infinity;

  for (const p of PERFORMANCE_PRESETS) {
    const dist =
      Math.abs((beamWidth || 0) - p.beamWidth) +
      Math.abs((maxNodes || 0) - p.maxNodes) / 1000;

    if (dist < bestDist) {
      bestDist = dist;
      bestLevel = p.level;
    }
  }

  return bestLevel;
};

function topKByScore(items, K, getScore) {
  if (K <= 0) return [];
  const heap = []; // min-heap: [score, item]

  const swap = (i, j) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      swap(p, i);
      i = p;
    }
  };
  const down = (i) => {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
  };

  for (const it of items) {
    const s = getScore(it);
    if (heap.length < K) {
      heap.push([s, it]);
      up(heap.length - 1);
    } else if (s > heap[0][0]) {
      heap[0] = [s, it];
      down(0);
    }
  }

  heap.sort((a, b) => b[0] - a[0]); // ?勗之?啣?
  return heap.map(x => x[1]);
}

const FEEDBACK_ENDPOINT = "https://formsubmit.co/gxu30726@gmail.com";
const FEEDBACK_IFRAME_NAME = "autocombo-feedback-submit-frame";
const FEEDBACK_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const FEEDBACK_COUNTRY_NAMES_ZH = {
  TW: "台灣",
  CN: "中國",
  HK: "香港",
  MO: "澳門",
  JP: "日本",
  US: "美國",
};

const uniqueParts = (parts) => {
  const seen = new Set();
  return parts.filter((part) => {
    const value = String(part || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const feedbackCountryName = (countryCode, fallback) => {
  const code = String(countryCode || "").trim().toUpperCase();
  return FEEDBACK_COUNTRY_NAMES_ZH[code] || String(fallback || "").trim();
};

const feedbackLocationFromIpApi = (data) => ({
  ip: data?.ip,
  area: uniqueParts([
    feedbackCountryName(data?.country_code, data?.country_name),
    data?.region,
    data?.city,
  ]).join(" "),
});

const feedbackLocationFromIpWho = (data) => ({
  ip: data?.ip,
  area: uniqueParts([
    feedbackCountryName(data?.country_code, data?.country),
    data?.region,
    data?.city,
  ]).join(" "),
});

const fetchFeedbackJson = async (url, timeoutMs = 2500) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
};

const getFeedbackClientLine = async () => {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return "#(未知 IP) 未知地區";
  }

  const endpoints = [
    { url: "https://ipapi.co/json/", format: feedbackLocationFromIpApi },
    { url: "https://ipwho.is/", format: feedbackLocationFromIpWho },
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await fetchFeedbackJson(endpoint.url);
      const result = endpoint.format(data);
      if (result.ip || result.area) {
        return `#(${result.ip || "未知 IP"}) ${result.area || "未知地區"}`;
      }
    } catch {
      // Try the next provider.
    }
  }

  return "#(未知 IP) 未知地區";
};

const bytesToReadableSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const makeClipboardImageName = (type, index) => {
  const ext = String(type || "").split("/")[1] || "png";
  return `clipboard-image-${Date.now()}-${index + 1}.${ext.replace("jpeg", "jpg")}`;
};

const withFeedbackFileInputFiles = (input, files) => {
  if (!input || typeof DataTransfer === "undefined") return false;

  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
  return true;
};

const App = () => {

const [language, setLanguage] = useState(
  () => getPathLanguage() || getStoredLanguage() || getBrowserFallbackLanguage()
);
const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
const [languageMenuPosition, setLanguageMenuPosition] = useState({ left: 16, top: 48 });
const languageButtonRef = useRef(null);
const [feedbackOpen, setFeedbackOpen] = useState(false);
const [feedbackMessage, setFeedbackMessage] = useState("");
const [feedbackEmail, setFeedbackEmail] = useState("");
const [feedbackFiles, setFeedbackFiles] = useState([]);
const [feedbackStatus, setFeedbackStatus] = useState("");
const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
const feedbackFormRef = useRef(null);
const feedbackFileRef = useRef(null);
const feedbackClientRef = useRef(null);
const feedbackPageRef = useRef(null);
const feedbackLanguageRef = useRef(null);
const feedbackTimeRef = useRef(null);
const feedbackBrowserRef = useRef(null);
const feedbackIframePendingRef = useRef(false);
const feedbackPreviewItems = React.useMemo(() => {
  const canCreatePreview =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function";

  return feedbackFiles.map((file, index) => ({
    file,
    index,
    url: canCreatePreview ? URL.createObjectURL(file) : "",
  }));
}, [feedbackFiles]);

useEffect(() => {
  return () => {
    feedbackPreviewItems.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
  };
}, [feedbackPreviewItems]);

const updateLanguageMenuPosition = useCallback(() => {
  if (typeof window === "undefined") return;

  const rect = languageButtonRef.current?.getBoundingClientRect?.();
  if (!rect) return;

  const menuW = 144;
  const gap = 8;
  const edge = 8;
  const left = Math.max(edge, Math.min(rect.left, window.innerWidth - menuW - edge));
  const top = Math.max(edge, rect.bottom + gap);

  setLanguageMenuPosition({ left, top });
}, []);

useEffect(() => {
  let cancelled = false;

  if (getPathLanguage() || getStoredLanguage()) return () => {};

  detectLanguageByIp().then((detected) => {
    if (!cancelled && !getPathLanguage() && !getStoredLanguage()) {
      syncLanguagePath(detected);
      setLanguage(detected);
    }
  });

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  applyLanguageToDocument(language);
}, [language]);

useEffect(() => {
  const syncFromPath = () => {
    const pathLanguage = getPathLanguage();
    if (pathLanguage) {
      setLanguage(pathLanguage);
      applyLanguageToDocument(pathLanguage);
    }
  };

  window.addEventListener("popstate", syncFromPath);

  return () => {
    window.removeEventListener("popstate", syncFromPath);
  };
}, []);

useLayoutEffect(() => {
  if (!languageMenuOpen) return undefined;

  updateLanguageMenuPosition();

  window.addEventListener("resize", updateLanguageMenuPosition);
  window.addEventListener("scroll", updateLanguageMenuPosition, true);

  return () => {
    window.removeEventListener("resize", updateLanguageMenuPosition);
    window.removeEventListener("scroll", updateLanguageMenuPosition, true);
  };
}, [languageMenuOpen, updateLanguageMenuPosition]);

useEffect(() => {
  if (!languageMenuOpen) return undefined;

  const closeOnOutsideClick = (event) => {
    if (!event.target?.closest?.("[data-language-menu]")) {
      setLanguageMenuOpen(false);
    }
  };

  const closeOnEscape = (event) => {
    if (event.key === "Escape") {
      setLanguageMenuOpen(false);
    }
  };

  document.addEventListener("pointerdown", closeOnOutsideClick);
  document.addEventListener("keydown", closeOnEscape);

  return () => {
    document.removeEventListener("pointerdown", closeOnOutsideClick);
    document.removeEventListener("keydown", closeOnEscape);
  };
}, [languageMenuOpen]);

const handleLanguageChange = useCallback((nextLanguage) => {
  setStoredLanguage(nextLanguage);
  syncLanguagePath(nextLanguage);
  setLanguage(nextLanguage);
  applyLanguageToDocument(nextLanguage);
  if (typeof window !== "undefined") {
    window.requestAnimationFrame?.(() => {
      applyLanguageToDocument(nextLanguage);
    });
  }
  setLanguageMenuOpen(false);
}, []);

const openFeedbackModal = useCallback(() => {
  setFeedbackStatus("");
  setFeedbackOpen(true);
}, []);

const closeFeedbackModal = useCallback(() => {
  if (feedbackSubmitting) return;
  setFeedbackOpen(false);
}, [feedbackSubmitting]);

const syncFeedbackFiles = useCallback((files, { writeInput = true } = {}) => {
  const nextFiles = files.filter((file) => file?.type?.startsWith("image/"));

  if (writeInput && !withFeedbackFileInputFiles(feedbackFileRef.current, nextFiles)) {
    setFeedbackStatus("目前瀏覽器無法同步剪貼簿圖片，請改用選擇圖片。");
    return false;
  }

  setFeedbackFiles(nextFiles);
  return true;
}, []);

const handleFeedbackFileChange = useCallback((event) => {
  const selectedFiles = Array.from(event.target.files || []);
  const imageFiles = selectedFiles.filter((file) => file?.type?.startsWith("image/"));

  if (imageFiles.length !== selectedFiles.length) {
    setFeedbackStatus("附件只能選擇圖片檔。");
    if (imageFiles.length === 0 || !withFeedbackFileInputFiles(event.target, imageFiles)) {
      event.target.value = "";
      setFeedbackFiles([]);
      return;
    }
    setFeedbackFiles(imageFiles);
    return;
  }

  syncFeedbackFiles(imageFiles, { writeInput: false });
}, [syncFeedbackFiles]);

const handleFeedbackPaste = useCallback((event) => {
  const pastedImages = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      return new File([file], makeClipboardImageName(file.type, index), { type: file.type });
    })
    .filter(Boolean);

  if (!pastedImages.length) return;

  event.preventDefault();
  const mergedFiles = [...feedbackFiles, ...pastedImages];
  const totalFileSize = mergedFiles.reduce((sum, file) => sum + file.size, 0);

  if (totalFileSize > FEEDBACK_MAX_UPLOAD_BYTES) {
    setFeedbackStatus("圖片總大小不能超過 20MB。");
    return;
  }

  if (syncFeedbackFiles(mergedFiles)) {
    setFeedbackStatus(`已加入 ${pastedImages.length} 張貼上的圖片。`);
  }
}, [feedbackFiles, syncFeedbackFiles]);

const removeFeedbackFile = useCallback((removeIndex) => {
  syncFeedbackFiles(feedbackFiles.filter((_, index) => index !== removeIndex));
}, [feedbackFiles, syncFeedbackFiles]);

const handleFeedbackIframeLoad = useCallback(() => {
  if (!feedbackIframePendingRef.current) return;

  feedbackIframePendingRef.current = false;
  setFeedbackSubmitting(false);
  setFeedbackStatus("已送出。");
  setFeedbackMessage("");
  setFeedbackEmail("");
  setFeedbackFiles([]);
  if (feedbackFileRef.current) {
    feedbackFileRef.current.value = "";
  }
}, []);

const handleFeedbackSubmit = useCallback(async (event) => {
  event.preventDefault();

  if (!feedbackFormRef.current) {
    setFeedbackStatus("表單尚未準備完成，請稍後再試。");
    return;
  }

  const message = feedbackMessage.trim();
  const totalFileSize = feedbackFiles.reduce((sum, file) => sum + file.size, 0);

  if (!message && feedbackFiles.length === 0) {
    setFeedbackStatus("請先輸入文字或選擇圖片。");
    return;
  }

  if (totalFileSize > FEEDBACK_MAX_UPLOAD_BYTES) {
    setFeedbackStatus("圖片總大小不能超過 20MB。");
    return;
  }

  if (feedbackFiles.some((file) => !file.type.startsWith("image/"))) {
    setFeedbackStatus("附件只能選擇圖片檔。");
    return;
  }

  setFeedbackSubmitting(true);
  setFeedbackStatus("正在取得使用者 IP 與地區...");

  const clientLine = await getFeedbackClientLine();
  const now = new Date().toLocaleString("zh-TW", { hour12: false });

  if (feedbackClientRef.current) feedbackClientRef.current.value = clientLine;
  if (feedbackPageRef.current) feedbackPageRef.current.value = window.location.href;
  if (feedbackLanguageRef.current) feedbackLanguageRef.current.value = language;
  if (feedbackTimeRef.current) feedbackTimeRef.current.value = now;
  if (feedbackBrowserRef.current) feedbackBrowserRef.current.value = navigator.userAgent;

  setFeedbackStatus("正在送出...");
  feedbackIframePendingRef.current = true;
  window.HTMLFormElement.prototype.submit.call(feedbackFormRef.current);
}, [feedbackFiles, feedbackMessage, language]);

const ghostIdRef = useRef(0);

const [hiddenBCell, setHiddenBCell] = useState(null);
// { r, c }嚗???梯???B ??

const [ghostArrived, setGhostArrived] = useState(null);
// { showAt: { r, c }, orbId }嚗host ?唬?敺?閬 A 憿舐內?芷???

const isHiddenBCell = useCallback((r, c) => {
  return !!hiddenBCell && hiddenBCell.r === r && hiddenBCell.c === c;
}, [hiddenBCell]);

const getVisualOrbId = useCallback((r, c, orb) => {
  if (
    ghostArrived &&
    ghostArrived.showAt.r === r &&
    ghostArrived.showAt.c === c
  ) {

    return ghostArrived.orbId;
  }

  if (isHiddenBCell(r, c)) {
    return -1;
  }

  return orbOf(orb);
}, [ghostArrived, isHiddenBCell]);

const ghostMatrixRef = useRef(
  Array.from({ length: PLAY_ROWS }, () =>
    Array.from({ length: PLAY_COLS }, () => makeGhostSlot())
  )
);

const ghostRafRef = useRef(0);
const [ghostVersion, setGhostVersion] = useState(0);

const [solveProgress, setSolveProgress] = useState({
  current: 0,
  max: 1,
  elapsedSec: 0,
});
const [devBenchRunning, setDevBenchRunning] = useState(false);
const [devBenchOutput, setDevBenchOutput] = useState("");

const solveProgressRawRef = useRef({
  current: 0,
  max: 1,
});

const solveStartTimeRef = useRef(0);
const solveProgressTimerRef = useRef(null);

const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);

const [showTopBar, setShowTopBar] = useState(true);
const lastScrollYRef = useRef(0);

useEffect(() => {
  const onScroll = () => {
    const y = window.scrollY || 0;

    // ???瘞賊?憿舐內
    if (y <= 20) {
      setShowTopBar(true);
      lastScrollYRef.current = y;
      return;
    }

    // 敺銝嚗韏?
    if (y > lastScrollYRef.current) {
      setShowTopBar(false);
    }
    // 敺銝嚗＊蝷?
    else if (y < lastScrollYRef.current) {
      setShowTopBar(true);
    }

    lastScrollYRef.current = y;
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);

const SPECIAL_ORB_ANY = -1;

const EQUAL_FIRST_ORBS = [
  ORB_TYPES.WATER.id,
  ORB_TYPES.FIRE.id,
  ORB_TYPES.EARTH.id,
  ORB_TYPES.LIGHT.id,
  ORB_TYPES.DARK.id,
  ORB_TYPES.HEART.id,
];

const RECT_M_OPTIONS = [3, 4, 5];
const RECT_N_OPTIONS = [3, 4, 5];

const makeDefaultPriority = () => ({
  type: "none",
  count: 1,
  orb: SPECIAL_ORB_ANY,
  clearCount: 3,

  // ????貊???
  equalOrbs: [],

  // 矩形
  rectM: 3,
  rectN: 3,
  rectOrb: SPECIAL_ORB_ANY,
});

const [specialPriorities, setSpecialPriorities] = useState([
  makeDefaultPriority(),
  makeDefaultPriority(),
  makeDefaultPriority(),
]);

const [ruleProfile, setRuleProfile] = useState(() =>
  makeDefaultRuleProfile()
);

const [specialPriorityExpanded, setSpecialPriorityExpanded] = useState([
  false,
  false,
  false,
]);

const updateSpecialPriorityAt = (idx, patch) => {
  setSpecialPriorities((prev) =>
    prev.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp))
  );
  setNeedsSolve(true);
  clearSolutionPools();
};

const toggleSpecialPriorityExpanded = (idx) => {
  setSpecialPriorityExpanded((prev) => {
    const shouldOpen = !prev[idx];
    return prev.map((_, i) => i === idx && shouldOpen);
  });
};

const markRuleProfileDirty = () => {
  setNeedsSolve(true);
  clearSolutionPools();
};

const updateRuleOrbSetting = (orb, patch) => {
  setRuleProfile((prev) => {
    const next = normalizeRuleProfile(prev);
    next.orbRules[orb] = normalizeOrbRule({
      ...next.orbRules[orb],
      ...patch,
    });
    return next;
  });
  markRuleProfileDirty();
};

const addRuleRequirement = (orb, size) => {
  setRuleProfile((prev) => {
    const next = normalizeRuleProfile(prev);
    const incoming = normalizeRuleRequirement({
      orb,
      size,
      count: 1,
      match: "exact",
    });

    const existingIdx = next.requirements.findIndex(
      (req) =>
        req.orb === incoming.orb &&
        req.size === incoming.size &&
        req.match === incoming.match
    );

    if (existingIdx >= 0) {
      const stockByOrb = countBoardOrbStock(originalBoard);
      const maxCount = getRequirementMaxCountAtIndex(
        next,
        stockByOrb,
        existingIdx
      );
      if (maxCount > 0) {
        next.requirements[existingIdx].count = Math.min(
          maxCount,
          next.requirements[existingIdx].count + 1
        );
      }
      return next;
    }

    next.requirements.push(incoming);
    return next;
  });
  markRuleProfileDirty();
};

const removeRuleRequirement = (idx) => {
  setRuleProfile((prev) => {
    const next = normalizeRuleProfile(prev);
    next.requirements = next.requirements.filter((_, i) => i !== idx);
    return next;
  });
  markRuleProfileDirty();
};

const updateRuleRequirementAt = (idx, patch) => {
  setRuleProfile((prev) => {
    const next = normalizeRuleProfile(prev);
    if (!next.requirements[idx]) return next;
    next.requirements[idx] = normalizeRuleRequirement({
      ...next.requirements[idx],
      ...patch,
    });

    const maxCount = getRequirementMaxCountAtIndex(
      next,
      ruleValidation.stockByOrb,
      idx
    );
    if (maxCount <= 0) {
      next.requirements[idx].count = 1;
    } else if (next.requirements[idx].count > maxCount) {
      next.requirements[idx].count = maxCount;
    }
    return next;
  });
  markRuleProfileDirty();
};

useEffect(() => {
  setClearCountText(
    specialPriorities.map((sp) => String(sp.clearCount ?? 3))
  );
}, [specialPriorities]);

const [clearCountText, setClearCountText] = useState(["3", "3", "3"]);

const diagAssistRef = useRef(null);
const DIAG_WINDOW_MS = 70;

const manualStartFromRow0Ref = useRef(false);

const moveFlushRAFRef = useRef(0);
const pointerLastClientRef = useRef({ x: 0, y: 0 });

const pendingBoardRef = useRef(null);
const pendingPathRef = useRef(null);
const pendingCurrentStepRef = useRef(-1);
const pendingStepsRef = useRef(0);

const [manualLocked, setManualLocked] = useState(false);
const [showMoveEnded, setShowMoveEnded] = useState(false);
const moveEndedTimerRef = useRef(0);
	
const isDraggingRef = useRef(false);
const pathRef = useRef([]);
const boardRef = useRef([]);
const floatingRAFRef = useRef(0);
const floatingPointRef = useRef({ x: 0, y: 0 });
const timerRAFRef = useRef(0);
const dragStartTimeRef = useRef(0);
const manualEndCalledRef = useRef(false);

// ?其?閮?銝?甈～?啜??澆?摨扳?嚗??銴?蝞?
const lastPosRef = useRef({ r: -1, c: -1 });

const handleManualEndRef = useRef(null);

const [isManual, setIsManual] = useState(false); // 璅∪???
const [isDragging, setIsDragging] = useState(false); // ?臬甇??
const [timeLeft, setTimeLeft] = useState(10); // ?拚???
const [maxTime, setMaxTime] = useState(10); // 雿輻?身摰?蝮賣???
const [manualActive, setManualActive] = useState(false); // 頧??臬撌脤?憪?
	
  const [stableCellSize, setStableCellSize] = useState(64);
  const exportTokenRef = useRef({ id: 0, cancelled: false });
  const [gifStage, setGifStage] = useState("capture"); // "capture" | "render"
  const [selectedMark, setSelectedMark] = useState(0); // 0=?瑞泵?? 1=X1, 2=X2, 3=Q1, 4=Q2
  const [selectedBrush, setSelectedBrush] = useState(0);
  
  const editorDraggingRef = useRef(false);
const editorLastPaintRef = useRef({ r: -1, c: -1 });

const editorScrollLockRef = useRef({
  locked: false,
  scrollY: 0,
  prevBodyOverflow: "",
  prevBodyPosition: "",
  prevBodyTop: "",
  prevBodyWidth: "",
  prevHtmlOverflow: "",
});

const lockPageScrollForEditorPaint = useCallback(() => {
  const st = editorScrollLockRef.current;
  if (st.locked) return;

  st.locked = true;
  st.scrollY = window.scrollY || window.pageYOffset || 0;

  st.prevBodyOverflow = document.body.style.overflow;
  st.prevBodyPosition = document.body.style.position;
  st.prevBodyTop = document.body.style.top;
  st.prevBodyWidth = document.body.style.width;
  st.prevHtmlOverflow = document.documentElement.style.overflow;

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${st.scrollY}px`;
  document.body.style.width = "100%";
}, []);

const unlockPageScrollForEditorPaint = useCallback(() => {
  const st = editorScrollLockRef.current;
  if (!st.locked) return;

  document.documentElement.style.overflow = st.prevHtmlOverflow;
  document.body.style.overflow = st.prevBodyOverflow;
  document.body.style.position = st.prevBodyPosition;
  document.body.style.top = st.prevBodyTop;
  document.body.style.width = st.prevBodyWidth;

  window.scrollTo(0, st.scrollY || 0);
  st.locked = false;
}, []);

const applyEditAtCell = useCallback((r, c) => {
  setEditingBoard((prev) => {
    const next = prev.map((row) => [...row]);
    const cur = next[r][c];

    const o = orbOf(cur);
    const xm = xMarkOf(cur);
    const qm = qMarkOf(cur);
    const nm = nMarkOf(cur);

    // 0 = ?瑞泵??
    if (selectedMark === 0) {
      next[r][c] = withMarks(selectedBrush, xm, qm, nm);
      return next;
    }

    // X1 / X2
    if (selectedMark === 1 || selectedMark === 2) {
      if (isManual && selectedMark === 1) return prev; // ??璅∪?銝策 X1
      const want = selectedMark;
      const nx = xm === want ? 0 : want;
      const nq = nx !== 0 ? 0 : qm; // ??X ?? Q
      next[r][c] = withMarks(o, nx, nq, nm);
      return next;
    }

    // N1 / N2
    if (selectedMark === 5 || selectedMark === 6) {
      if (isManual && selectedMark === 6) return prev; // ??璅∪?銝策 N2
      const wantN = selectedMark === 5 ? 1 : 2;
      const targetOrb = orbOf(cur);
      if (targetOrb < 0) return prev;

      const shouldClear = nm === wantN;

      for (let rr = 0; rr < TOTAL_ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          const v = next[rr][cc];
          if (orbOf(v) !== targetOrb) continue;

          next[rr][cc] = withMarks(
            orbOf(v),
            xMarkOf(v),
            qMarkOf(v),
            shouldClear ? 0 : wantN
          );
        }
      }
      return next;
    }

    // Q1 / Q2
    if (selectedMark === 3 || selectedMark === 4) {
      if (isManual) return prev; // ??璅∪?銝策 Q
      const wantQ = selectedMark === 3 ? 1 : 2;

      if (wantQ === 1 && xm !== 0) return prev;
      if (wantQ === 2 && xm === 1) return prev;

      if (qm === wantQ) {
        next[r][c] = withMarks(o, xm, 0, nm);
        return next;
      }

      // row0 銝?閮勗??? START / END 銵?
      if (r === 0) {
        for (let cc = 0; cc < COLS; cc++) {
          const v = next[0][cc];
          if (wantQ === 1 && qMarkOf(v) === 2) return prev;
          if (wantQ === 2 && qMarkOf(v) === 1) return prev;
        }
      }

      // ?函?臭?
      for (let rr = 0; rr < TOTAL_ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          const v = next[rr][cc];
          if (qMarkOf(v) === wantQ) {
            next[rr][cc] = withMarks(
              orbOf(v),
              xMarkOf(v),
              0,
              nMarkOf(v)
            );
          }
        }
      }

      next[r][c] = withMarks(o, xm, wantQ, nm);
      return next;
    }

    return next;
  });
}, [selectedMark, selectedBrush, isManual]);

const startEditorPaint = useCallback((r, c) => {
	if (
    selectedMark === 0 &&
    r === 0 &&
    selectedBrush === ORB_TYPES.HEART.id
  ) return;

  editorDraggingRef.current = true;
  editorLastPaintRef.current = { r: r, c: c };

  lockPageScrollForEditorPaint();
  applyEditAtCell(r, c);
}, [applyEditAtCell, lockPageScrollForEditorPaint, selectedBrush, selectedMark]);

const moveEditorPaint = useCallback((r, c) => {
  if (!editorDraggingRef.current) return;

  const last = editorLastPaintRef.current;
  if (last.r === r && last.c === c) return;

	if (
    selectedMark === 0 &&
    r === 0 &&
    selectedBrush === ORB_TYPES.HEART.id
  ) return;

  editorLastPaintRef.current = { r, c };
  applyEditAtCell(r, c);
}, [applyEditAtCell, selectedBrush, selectedMark]);

const endEditorPaint = useCallback(() => {
  editorDraggingRef.current = false;
  editorLastPaintRef.current = { r: -1, c: -1 };

  unlockPageScrollForEditorPaint();
}, [unlockPageScrollForEditorPaint]);
  
  const baseBoardRef = useRef([]);
  const [holePos, setHolePos] = useState(null);
  const rafRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const gifBlobRef = useRef(null);
  
  const [importBusy, setImportBusy] = useState(false);
  const [showImportCrop, setShowImportCrop] = useState(false);
  const [importImgUrl, setImportImgUrl] = useState("");
  const importFileRef = useRef(null);
  const autoSolveImportedRef = useRef(false);
  const pendingAutoSolveImportRef = useRef(false);
  const [autoSolveImportVersion, setAutoSolveImportVersion] = useState(0);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const boardSourceRef = useRef({
    stream: null,
    video: null,
  });
  const [boardSourceName, setBoardSourceName] = useState("");
  const [boardSourceBusy, setBoardSourceBusy] = useState(false);
  
  const [exportingGif, setExportingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState({ cur: 0, total: 0, pct: 0 });
  const [gifReady, setGifReady] = useState({ url: "", name: "" });
  
  const solverCache = useRef(new Map());
  const solveConfigHashCacheRef = useRef({
    solverConfigFingerprint: "",
    target: null,
    initTargetCombo: null,
    mode: "",
    priority: "",
    skyfall: false,
    diagonal: false,
    specialPrioritiesRef: null,
    autoRow0Expanded: false,
    normalizedRuleProfileRef: null,
    value: "",
  });
  const solveResetKeyCacheRef = useRef({
    boardKey: "",
    diagonal: false,
    skyfall: false,
    autoRow0Expanded: false,
    hardStepLimitEnabled: false,
    hardStepLimit: 80,
    normalizedRuleProfileRef: null,
    value: "",
  });
  const debounceTimer = useRef(null);
  const replayAnimRef = useRef({ raf: 0, step: 0, t0: 0, from: null, to: null, b: null, held: null });
  useEffect(() => {
	  return () => {
		if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  };
	}, []);
  useEffect(() => {
    return () => {
      for (const slot of EVAL_PARALLEL_SHARED.workerPool) {
        if (!slot) continue;
        if (slot.pending instanceof Map) {
          for (const [, p] of slot.pending) {
            p.reject(new Error("eval worker pool shutdown"));
          }
          slot.pending.clear();
        }
        if (slot.worker) {
          try {
            slot.worker.terminate();
          } catch (_e) {
            // noop
          }
        }
      }
      EVAL_PARALLEL_SHARED.workerPool = [];

      if (EVAL_PARALLEL_SHARED.scriptURL) {
        try {
          URL.revokeObjectURL(EVAL_PARALLEL_SHARED.scriptURL);
        } catch (_e) {
          // noop
        }
      }

      EVAL_PARALLEL_SHARED.scriptURL = null;
      EVAL_PARALLEL_SHARED.scriptVersion = "";
      EVAL_PARALLEL_SHARED.nextRequestId = 1;
      EVAL_PARALLEL_SHARED.boardBufferPool.length = 0;
      EVAL_PARALLEL_SHARED.taskArrayPool.length = 0;
      EVAL_PARALLEL_SHARED.transferListPool.length = 0;
      EVAL_PARALLEL_SHARED.packedMovePool.length = 0;
      EVAL_PARALLEL_SHARED.moveMetaPool.length = 0;
      EVAL_PARALLEL_SHARED.moveMetaArrayPool.length = 0;
      EVAL_PARALLEL_SHARED.parallelJobPool.length = 0;
      EVAL_PARALLEL_SHARED.parallelJobArrayPool.length = 0;
      EVAL_PARALLEL_SHARED.parallelResultArrayPool.length = 0;
    };
  }, []);
  
  const cellRectsRef = useRef([]);     

  const measureCells = useCallback(() => {
	  const root = boardInnerRef.current;
	  if (!root) return;

	  const rects = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));

	  for (let r = 0; r < TOTAL_ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
		  const el = root.querySelector(`[data-cell="${r}-${c}"]`);
		  if (!el) continue;
		  rects[r][c] = el.getBoundingClientRect();
		}
	  }
	  cellRectsRef.current = rects;

	  // ??蝞?甈?cellSize嚗 row1 col0 ?蝛抬?
	  const r10 = rects?.[1]?.[0];
	  if (r10) setStableCellSize(r10.width);
	}, []);
	
  const [overlay, setOverlay] = useState({ d: "", start: null, tip: null });
  useEffect(() => {
	  measureCells();
	  window.addEventListener('resize', measureCells);
	  window.addEventListener('scroll', measureCells, { passive: true, capture: true });
	  return () => {
		window.removeEventListener('resize', measureCells);
		window.removeEventListener('scroll', measureCells, { capture: true });
	  };
	}, [measureCells]);
	
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
	  const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
	  window.addEventListener('resize', onResize);
	  return () => window.removeEventListener('resize', onResize);
	}, []);
  const overlayRef = useRef(null);
  const gifRef = useRef(null);
  const boardWrapRef = useRef(null);
  const [floating, setFloating] = useState(null);
  const [replayBoard, setReplayBoard] = useState(null);
  const boardInnerRef = useRef(null);
  const [needsSolve, setNeedsSolve] = useState(true);

  const [board, setBoard] = useState([]);
  const [originalBoard, setOriginalBoard] = useState([]);
  const [solving, setSolving] = useState(false);
  const [path, setPath] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [stats, setStats] = useState({ 
    combos: 0, 
    skyfallCombos: 0,
    steps: 0, 
    clearedOrbs: 0, 
    theoreticalMax: 0, 
    verticalCombos: 0, 
    horizontalCombos: 0
  });
  const GIF_FOOTER_H = 24;
  const FLY_SPEED = 50;
  const [isReplaying, setIsReplaying] = useState(false);
  
  const [showConfig, setShowConfig] = useState(false);
  const [settingsTab, setSettingsTab] = useState("search");

  const solverMode = "vertical";
  const [priorityMode, setPriorityMode] = useState('steps'); 
  useEffect(() => {
  setConfig((prev) => {
    const forced =
      priorityMode === "steps"
        ? 80
        : 240;

    if (prev.maxSteps === forced) return prev;

    return {
      ...prev,
      maxSteps: forced,
    };
  });
}, [priorityMode]);
  
  const [skyfallEnabled, setSkyfallEnabled] = useState(true);
  const [diagonalEnabled, setDiagonalEnabled] = useState(true); 
  
  const [showEditor, setShowEditor] = useState(false);
  const [editingBoard, setEditingBoard] = useState([]);
  
  const [autoRow0Expanded, setAutoRow0Expanded] = useState(true);

useLayoutEffect(() => {
  measureCells();

  const id = requestAnimationFrame(() => {
    measureCells();
  });

  return () => cancelAnimationFrame(id);
}, [autoRow0Expanded, measureCells]);

const extremeTargetRef = useRef(1);
const [extremeTargetCombo, setExtremeTargetComboState] = useState(1);

const setExtremeTargetCombo = useCallback((val) => {
  extremeTargetRef.current = val;
  setExtremeTargetComboState(val);
}, []);

const [initTargetCombo, setInitTargetCombo] = useState(1);

useEffect(() => {
  const maxCombo = stats.theoreticalMax || 1;
  setInitTargetCombo(maxCombo);
}, [stats.theoreticalMax]);

const targetCombos = extremeTargetCombo;

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [performanceLevel, setPerformanceLevel] = useState(() =>
  getPerformanceLevelFromConfig(
    config.beamWidth,
    config.maxNodes
  )
);
  
  const [gifCaptureMode, setGifCaptureMode] = useState(false);
  
  const applyPerformanceLevel = useCallback((level) => {
  const lv = Math.max(1, Math.min(5, Number(level) || 3));
  const preset =
    PERFORMANCE_PRESETS.find((p) => p.level === lv) || PERFORMANCE_PRESETS[2];

  setPerformanceLevel(lv);
  setConfig((prev) => ({
    ...prev,
    beamWidth: preset.beamWidth,
    maxNodes: preset.maxNodes,
  }));
  setNeedsSolve(true);
}, []);

const updateParam = (key, val) =>
  setConfig((prev) => ({
    ...prev,
    [key]:
      key === "replaySpeed"
        ? Math.round(parseFloat(val))
        : parseFloat(val),
  }));
  
  useEffect(() => {
  setPerformanceLevel(
    getPerformanceLevelFromConfig(config.beamWidth, config.maxNodes)
  );
}, [config.beamWidth, config.maxNodes]);
  
  const renderBoard = replayBoard ?? board;
  const manualHiddenCell =
  isManual && isDragging && floating && path.length > 0
    ? path[path.length - 1]
    : null;
  const replayDone = (!isReplaying && !isPaused && currentStep >= 0);

  const templateCacheRef = useRef({ db: [], ready: false });

  useEffect(() => {
	  let cancelled = false;

	  const prepare = async () => {
		// 1) ?箸???type 撱箔???Image ?拐辣
		const types = [...Object.values(ORB_TYPES), ...RECOGNITION_ORB_TEMPLATES];
		for (const t of types) {
		  if (!t.imgEl) {
			const im = new Image();
			im.crossOrigin = "anonymous"; // ?砍 assets 銝?砌?敶梢嚗???靽
			im.src = t.img;
			t.imgEl = im;
		  }
		}

		// 2) 撱箸芋??DB
		await Promise.all(types.map(t => ensureImageLoaded(t.imgEl)));
		const built = await buildTemplateDB(types);

		if (!cancelled) {
		  templateCacheRef.current = { ...built, ready: true };
		  console.log("[detect] template DB ready:", built.db.map(x => x.id));
		}
	  };

  prepare().catch(err => {
    console.error("[detect] template init failed:", err);
  });

  return () => { cancelled = true; };
}, []);

  const solverConfig = React.useMemo(() => {
	  const { replaySpeed, ...rest } = config; // ???播放?漲
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    if (params?.get("solverBaseline") === "1") {
      return {
        ...rest,
        deferMoveMaterialization: false,
        cheapLocalGuidance: false,
        cheapLegacyReserve: 0,
        cheapEvalScale: 3.8,
        cheapEvalConstraintScale: 4.6,
      };
    }
	  return rest;
	}, [config]);
	
const orbForTheoreticalMax = (cellVal) => {
  if (cellVal < 0) return -1;

  // n1 瘞賊?銝瘨?銝??脩?隢???
  if (nMarkOf(cellVal) === 1) return -1;

  // n2 ?臬擐敺??歹??隞乩?蝞??
  return orbOf(cellVal);
};

const countBoardOrbStock = (boardLike) => {
  const src = Array.isArray(boardLike) ? boardLike : [];
  const counts = Array(6).fill(0);
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    const row = src[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < COLS; c++) {
      const orb = orbForTheoreticalMax(row[c]);
      if (orb >= 0 && orb < 6) counts[orb]++;
    }
  }
  return counts;
};

const getRuleAllocatedByOrb = (profileLike) => {
  const profile = normalizeRuleProfile(profileLike);
  const used = Array(6).fill(0);
  for (const req of profile.requirements) {
    if (req.orb < 0 || req.orb > 5) continue;
    used[req.orb] += req.size * req.count;
  }
  return used;
};

const getRequirementMaxCountAtIndex = (profileLike, stockByOrb, idx) => {
  const profile = normalizeRuleProfile(profileLike);
  const req = profile.requirements[idx];
  if (!req) return 0;

  const usedByOthers = Array(6).fill(0);
  for (let i = 0; i < profile.requirements.length; i++) {
    if (i === idx) continue;
    const r = profile.requirements[i];
    if (!r || r.orb < 0 || r.orb > 5) continue;
    usedByOthers[r.orb] += r.size * r.count;
  }

  const stock = Number(stockByOrb?.[req.orb] || 0);
  const remain = Math.max(0, stock - usedByOthers[req.orb]);
  return Math.max(0, Math.floor(remain / Math.max(1, req.size)));
};

const buildRuleValidation = (profileLike, stockByOrb) => {
  const profile = normalizeRuleProfile(profileLike);
  const errors = [];
  const warnings = [];
  const stock = Array.isArray(stockByOrb) ? stockByOrb : Array(6).fill(0);
  const used = getRuleAllocatedByOrb(profile);
  const remaining = Array(6)
    .fill(0)
    .map((_, orb) => Number(stock[orb] || 0) - Number(used[orb] || 0));

  for (let orb = 0; orb < 6; orb++) {
    if (remaining[orb] < 0) {
      errors.push(
        `${ORB_LABELS[orb]} 珠需求超出庫存：版面 ${stock[orb]}、已分配 ${used[orb]}`
      );
    }
  }

  profile.requirements.forEach((req, idx) => {
    const orbRule = profile.orbRules[req.orb] || normalizeOrbRule(null);
    if (req.size < orbRule.minClear) {
      errors.push(
        `需求 #${idx + 1}（${ORB_LABELS[req.orb]} ${req.size} 消）低於該珠最低消除 ${orbRule.minClear}`
      );
    }

    const maxCount = getRequirementMaxCountAtIndex(profile, stock, idx);
    if (req.count > maxCount) {
      errors.push(
        `需求 #${idx + 1}（${ORB_LABELS[req.orb]} ${req.size} 消）最多可設 ${maxCount} 組`
      );
    }
  });

  const addOptions = [];
  for (let orb = 0; orb < 6; orb++) {
    const orbRule = profile.orbRules[orb] || normalizeOrbRule(null);
    const remain = Math.max(0, remaining[orb] || 0);
    for (let size = orbRule.minClear; size <= 5; size++) {
      const maxCount = Math.floor(remain / Math.max(1, size));
      if (maxCount <= 0) continue;
      addOptions.push({
        orb,
        size,
        maxCount,
        key: `${orb}-${size}`,
      });
    }
  }

  if (!addOptions.length) {
    warnings.push("目前沒有可新增的需求選項，已達盤面可分配上限。");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stockByOrb: stock,
    usedByOrb: used,
    remainingByOrb: remaining,
    addOptions,
    normalizedProfile: profile,
  };
};

const ruleValidation = React.useMemo(
  () => buildRuleValidation(ruleProfile, countBoardOrbStock(originalBoard)),
  [ruleProfile, originalBoard]
);

const refreshTarget = useCallback((
  newBoard,
  row0Expanded = autoRow0Expanded,
  profileLike = ruleProfile
) => {
  const counts = Array(6).fill(0);
  const normalizedProfile = normalizeRuleProfile(profileLike);

  const computeTheoretical = (baseCounts, bonusOrb = -1) => {
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      const need = Math.max(1, normalizedProfile.orbRules[i]?.minClear || 3);
      const stock = baseCounts[i] + (i === bonusOrb ? 1 : 0);
      sum += Math.floor(stock / need);
    }
    return sum;
  };

  // ?蝞蜓??row1~5
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const o = orbForTheoreticalMax(newBoard[r][c]);
      if (o !== -1) counts[o]++;
    }
  }

  const base = computeTheoretical(counts);

  let best = base;

  if (!isManual && row0Expanded) {
    for (let c = 0; c < COLS; c++) {
      const t = orbForTheoreticalMax(newBoard[0][c]);
      if (t === -1) continue;

      const s = computeTheoretical(counts, t);

      if (s > best) best = s;
    }
  }

  setStats((prev) => ({ ...prev, theoreticalMax: best }));
  setExtremeTargetCombo(best);
  setInitTargetCombo((prev) => Math.min(prev, Math.max(1, best)));
}, [autoRow0Expanded, isManual, ruleProfile, setExtremeTargetCombo]);

  const initBoard = useCallback((random = true, providedBoard = null) => {
	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  replayAnimRef.current.raf = 0;

	  setReplayBoard(null);
	  setFloating(null);
	  setHolePos(null);
	  setIsReplaying(false);
	  setIsPaused(false);
	  setCurrentStep(-1);
	  let newBoard = [];
	  if (providedBoard) {
		newBoard = providedBoard;
	  } else if (random) {
		for (let r = 0; r < TOTAL_ROWS; r++) {
		  let row = [];
		  for (let c = 0; c < COLS; c++) {

			let orb;

			if (r === 0) {
			  // ? row0 蝳迫敹?
			  const pool = [0, 1, 2, 3, 4]; 
			  orb = pool[Math.floor(Math.random() * pool.length)];
			} else {
			  orb = Math.floor(Math.random() * 6);
			}

			row.push(withMarks(orb, 0, 0, 0));
		  }
		  newBoard.push(row);
		}
	  } else {
		// ???箏??歹?銋絞銝??mark=0
		newBoard = [
		  [0,2,3,4,2,1],
		  [2,0,0,2,4,1],
		  [0,5,2,5,0,1],
		  [2,1,2,5,1,2],
		  [5,4,1,0,3,1],
		  [1,1,4,3,5,0],
		].map(row => row.map(v => withMarks(v, 0, 0, 0)));
	  }

	  baseBoardRef.current = newBoard.map(r => [...r]);
	  setBoard(newBoard.map(r => [...r]));
	  setOriginalBoard(newBoard.map(r => [...r]));

	  setPath([]);
	  setCurrentStep(-1);
	  setIsReplaying(false);

	  refreshTarget(newBoard);
	  solverCache.current.clear();
	}, [refreshTarget]);

  useEffect(() => {
		initBoard(false);
	  }, [initBoard]);

  useEffect(() => {
	  if (!showEditor) return;
	  const prev = document.body.style.overflow;
	  document.body.style.overflow = 'hidden';
	  return () => {
		document.body.style.overflow = prev;
	  };
	}, [showEditor]);

useEffect(() => {
  if (originalBoard.length === 0) return;
  if (showEditor) return;
  setNeedsSolve(true);
}, [initTargetCombo, solverConfig, originalBoard, solverMode, priorityMode, skyfallEnabled, diagonalEnabled, showEditor, ruleProfile]);

useEffect(() => {
  if (!Array.isArray(originalBoard) || originalBoard.length === 0) return;
  refreshTarget(originalBoard, autoRow0Expanded, ruleProfile);
}, [originalBoard, autoRow0Expanded, ruleProfile, refreshTarget]);
  
  useEffect(() => {
	  return () => {
		setGifReady(prev => {
		  if (prev.url) URL.revokeObjectURL(prev.url);
		  return prev;
		});
	  };
	}, []);

///////////


const getAxisFromNeighbor = (baseR, baseC, r, c) => {
  const dr = r - baseR;
  const dc = c - baseC;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return null;
  if (dr === 0) return { axis: 'h', sr: 0, sc: Math.sign(dc) };
  if (dc === 0) return { axis: 'v', sr: Math.sign(dr), sc: 0 };
  return null;
};

/////////////////
// 蝚砌??嚗?頧?Manual嚗?蝞?
/////////////////
// ?寞活?瑟??銝剔?璉/頝臬?閬死嚗??銝甇仿閫貊?葡??
const flushManualVisual = useCallback(() => {
  moveFlushRAFRef.current = 0;

  if (pendingBoardRef.current) {
    setBoard(pendingBoardRef.current);
  }

  if (pendingPathRef.current) {
    setPath(pendingPathRef.current);
    setCurrentStep(
      typeof pendingCurrentStepRef.current === "number"
        ? pendingCurrentStepRef.current
        : -1
    );
  }

  setStats((prev) => ({
    ...prev,
    steps:
      typeof pendingStepsRef.current === "number"
        ? pendingStepsRef.current
        : prev.steps,
  }));
}, []);

// ??????RAF ?蔥?瑟嚗????? setState??
const scheduleManualVisualFlush = useCallback(() => {
  if (moveFlushRAFRef.current) return;
  moveFlushRAFRef.current = requestAnimationFrame(flushManualVisual);
}, [flushManualVisual]);

// 撠?曌?閫豢摨扳?頧璉?澆漣璅?
const getCellFromClientPoint = useCallback(
  (clientX, clientY) => {
    const wrap = boardInnerRef.current;
    if (!wrap) return null;

    const rect = wrap.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top - 20;

    const cellSize = stableCellSize || 0;
    if (!cellSize) return null;

    const c = Math.floor(localX / cellSize);
    const rRaw = Math.floor(localY / cellSize);

    if (c < 0 || c >= COLS) return null;
    if (rRaw < 0 || rRaw >= TOTAL_ROWS + 1) return null;

    const r = Math.min(TOTAL_ROWS - 1, rRaw);
    return { r, c };
  },
  [stableCellSize]
);

// ?????潔葉敹???摨扳?嚗策頝臬?/ghost ?梁嚗?
const getCellCenterPx = useCallback((r, c) => {
	  const root = boardInnerRef.current;
	  const cell = root?.querySelector(`[data-cell="${r}-${c}"]`);
	  if (!root || !cell) return { x: 0, y: 0 };

	  const rootRect = root.getBoundingClientRect();
	  const cellRect = cell.getBoundingClientRect();
	  const x = (cellRect.left + cellRect.right) / 2 - rootRect.left;
	  const y = (cellRect.top + cellRect.bottom) / 2 - rootRect.top;

	  return { x, y };
	}, []);

const bumpGhostRender = useCallback(() => {
  setGhostVersion((v) => (v + 1) % 1000000);
}, []);

// 清除???ghost ??蒂?迫?餈游???
const clearAllGhosts = useCallback(() => {
  const mat = ghostMatrixRef.current;

  for (let r = 0; r < mat.length; r++) {
    for (let c = 0; c < mat[r].length; c++) {
      const g = mat[r][c];
      g.active = false;
      g.orbId = -1;
      g.onDone = null;
      g.x = 0;
      g.y = 0;
      g.fromX = 0;
      g.fromY = 0;
      g.toX = 0;
      g.toY = 0;
      g.alpha = 1;
    }
  }

  if (ghostRafRef.current) {
    cancelAnimationFrame(ghostRafRef.current);
    ghostRafRef.current = 0;
  }

  setGhostArrived(null);
  setHiddenBCell(null);

  bumpGhostRender();
}, [bumpGhostRender]);

const wakeGhostAtCell = useCallback(
  (cellR, cellC, orbId, fromPt, toPt, duration = 120, onDone = null) => {
    if (cellR < 0 || cellR >= PLAY_ROWS || cellC < 0 || cellC >= PLAY_COLS) return;
    if (orbId == null || orbId < 0) return;

    const slot = ghostMatrixRef.current[cellR][cellC];
    const now = performance.now();

    slot.active = true;
    slot.orbId = orbId;

    slot.fromX = fromPt.x;
    slot.fromY = fromPt.y;
    slot.toX = toPt.x;
    slot.toY = toPt.y;

    slot.x = fromPt.x;
    slot.y = fromPt.y;
    slot.startAt = now;
    slot.duration = duration;

    slot.alpha = 1;
    slot.scale = 1;
    slot.onDone = onDone;

    bumpGhostRender();
  },
  [bumpGhostRender]
);

const stepGhosts = useCallback((ts) => {
  const mat = ghostMatrixRef.current;
  let anyActive = false;
  let changed = false;

  for (let r = 0; r < PLAY_ROWS; r++) {
    for (let c = 0; c < PLAY_COLS; c++) {
      const g = mat[r][c];
      if (!g.active) continue;

      const t = Math.min(1, (ts - g.startAt) / Math.max(1, g.duration));
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

      const nx = g.fromX + (g.toX - g.fromX) * ease;
      const ny = g.fromY + (g.toY - g.fromY) * ease;

      if (nx !== g.x || ny !== g.y) {
        g.x = nx;
        g.y = ny;
        changed = true;
      }

      g.alpha = 1;

      if (t >= 1) {
  const done = g.onDone;

  g.active = false;
  g.orbId = -1;
  g.onDone = null;
  changed = true;

  if (typeof done === "function") {
    done();
  }
} else {
  anyActive = true;
}
    }
  }

  if (changed) bumpGhostRender();

  if (anyActive) {
    ghostRafRef.current = requestAnimationFrame(stepGhosts);
  } else {
    ghostRafRef.current = 0;
  }
}, [bumpGhostRender]);

const ensureGhostLoop = useCallback(() => {
  if (ghostRafRef.current) return;
  ghostRafRef.current = requestAnimationFrame(stepGhosts);
}, [stepGhosts]);

// ?Ｙ???鈭斗???ghost ?嚗/B ??蝵株?????
const spawnManualGhostWithPt = useCallback(
  (orbId, fromPt, toPt, slotR, slotC, toR, toC) => {
    if (orbId == null || orbId < 0) return;
    if (slotR < PLAY_ROWS_START || slotR >= TOTAL_ROWS || slotC < 0 || slotC >= COLS) return;

    if (
      !Number.isFinite(fromPt?.x) ||
      !Number.isFinite(fromPt?.y) ||
      !Number.isFinite(toPt?.x) ||
      !Number.isFinite(toPt?.y)
    ) {
      return;
    }

    ghostIdRef.current++;
    const myId = ghostIdRef.current;

    wakeGhostAtCell(
      slotR - PLAY_ROWS_START,
      slotC,
      orbId,
      fromPt,
      toPt,
      FLY_SPEED,
      () => {
        if (myId !== ghostIdRef.current) return;

        setGhostArrived({
          showAt: { r: toR, c: toC },
          orbId,
        });

        setHiddenBCell(null);
      }
    );

    ensureGhostLoop();
  },
  [wakeGhostAtCell, ensureGhostLoop]
);

useEffect(() => {
  return () => {
    if (ghostRafRef.current) cancelAnimationFrame(ghostRafRef.current);
  };
}, []);

const spawnSwapGhost = useCallback((boardNow, fromR, fromC, toR, toC) => {
  // row0 銝?5x6 ghost matrix
  if (fromR <= 0 || toR <= 0) return;

  const pushedOrb = boardNow?.[toR]?.[toC];
  if (pushedOrb == null || pushedOrb === -1) return;

  const fromPt = getCellCenterPx(toR, toC); // ghost 韏琿?嚗
  const toPt = getCellCenterPx(fromR, fromC); // ghost 蝯?嚗

  wakeGhostAtCell(
    toR - 1, // ????5x6 playable matrix
    toC,
    orbOf(pushedOrb),
    fromPt,
    toPt,
    FLY_SPEED
  );

  ensureGhostLoop();
}, [getCellCenterPx, wakeGhostAtCell, ensureGhostLoop]);

// ?岫??頧虜璅宏?唳?摰嚗???row0 閬?? 璅???host ??path ?湔??
const tryMoveToCell = useCallback(
  (r, c) => {
    if (!isDraggingRef.current || manualLocked) return false;
    if (r < 0 || c < 0 || r >= TOTAL_ROWS || c >= COLS) return false;

    const currentPath = pathRef.current;
    const last = currentPath[currentPath.length - 1];
    if (!last) return false;

    if (last.r === r && last.c === c) return false;

    const dr = Math.abs(last.r - r);
    const dc = Math.abs(last.c - c);

    const isOrthogonal = dr + dc === 1;
    const isDiagonal = dr === 1 && dc === 1;

    const allowDiagonal = isManual || diagonalEnabled;

    if (allowDiagonal) {
      if (!isOrthogonal && !isDiagonal) return false;
    } else {
      if (!isOrthogonal) return false;
    }

    const currentBoard = boardRef.current;
    if (currentBoard?.[r]?.[c] === undefined) return false;

    const targetOrb = currentBoard[r][c];
    const xMark = xMarkOf(targetOrb);

    if (xMark === 1) return false;

    const lastIsRow0 = last.r === 0;
    const nextIsRow0 = r === 0;
    const startedFromRow0 = manualStartFromRow0Ref.current;

    // case A: 敺?row0 韏瑟?嚗??銝?? row0
    if (startedFromRow0 && !lastIsRow0 && nextIsRow0) {
      handleManualEndRef.current?.();
      return false;
    }

    // case D: row0 -> row0 銝?閮?
    if (lastIsRow0 && nextIsRow0) {
      return false;
    }

    // ???path
    const newPath = [...currentPath, { r, c }];
    pathRef.current = newPath;
    pendingPathRef.current = newPath;
    pendingCurrentStepRef.current = newPath.length - 1;
    pendingStepsRef.current = newPath.length - 1;
    lastPosRef.current = { r, c };

    // 瘥?甇仿?憪?嚗???甈∪雿???銝阡???B ??
    setGhostArrived(null);
	setHiddenBCell({ r: last.r, c: last.c });

    // case B: row0 -> row1~5
    if (lastIsRow0 && !nextIsRow0) {
      const pushedOrbId = orbOf(currentBoard[r][c]);
const fromPt = getCellCenterPx(r, c);
const toPt = getCellCenterPx(last.r, last.c);

spawnManualGhostWithPt(
  pushedOrbId,
  fromPt,
  toPt,
  r, c,
  last.r, last.c
);

      const nextBoard = clone2D(currentBoard);
      nextBoard[r][c] = currentBoard[last.r][last.c];

      boardRef.current = nextBoard;
      pendingBoardRef.current = nextBoard;

      scheduleManualVisualFlush();
      return true;
    }

    // case C: row1~5 -> row0
    if (!lastIsRow0 && nextIsRow0) {
      const pushedOrbId = orbOf(currentBoard[last.r][last.c]);
const fromPt = getCellCenterPx(last.r, last.c);
const toPt = getCellCenterPx(r, c);

spawnManualGhostWithPt(
  pushedOrbId,
  fromPt,
  toPt,
  last.r, last.c,
  r, c
);

      const nextBoard = clone2D(currentBoard);
      nextBoard[last.r][last.c] = currentBoard[r][c];

      boardRef.current = nextBoard;
      pendingBoardRef.current = nextBoard;

      scheduleManualVisualFlush();
      handleManualEndRef.current?.();
      return true;
    }

    // case E: row1~5 銋?甇?虜鈭斗?
    const pushedOrbId = orbOf(currentBoard[r][c]);
const fromPt = getCellCenterPx(r, c);
const toPt = getCellCenterPx(last.r, last.c);

spawnManualGhostWithPt(
  pushedOrbId,
  fromPt,
  toPt,
  r, c,             // slot ? B
  last.r, last.c    // 憿舐內??A
);

    const nextBoard = clone2D(currentBoard);
    const temp = nextBoard[last.r][last.c];
    nextBoard[last.r][last.c] = nextBoard[r][c];
    nextBoard[r][c] = temp;

    boardRef.current = nextBoard;
    pendingBoardRef.current = nextBoard;

    scheduleManualVisualFlush();

    if (xMark === 2) {
      handleManualEndRef.current?.();
    }

    return true;
  },
  [
    manualLocked,
    scheduleManualVisualFlush,
    diagonalEnabled,
    isManual,
    spawnManualGhostWithPt,
  ]
);

// ?函?斜轉璅∪?銝??拍?剜??甈⊥迤鈭方撓?亙???甈⊥?????
const tryResolveDiagonalAssist = useCallback((hitR, hitC) => {
  const currentPath = pathRef.current;
  const last = currentPath[currentPath.length - 1];
  if (!last) return false;

  const info = getAxisFromNeighbor(last.r, last.c, hitR, hitC);
  if (!info) return false;

  const now = performance.now();
  const pending = diagAssistRef.current;

  // 瘝??嚗?摮絲靘?
  if (
    !pending ||
    pending.baseR !== last.r ||
    pending.baseC !== last.c ||
    now - pending.ts > DIAG_WINDOW_MS
  ) {
    diagAssistRef.current = {
      baseR: last.r,
      baseC: last.c,
      hitR,
      hitC,
      axis: info.axis,
      sr: info.sr,
      sc: info.sc,
      ts: now,
    };
    return true; // ????隞塚?雿?銝?move
  }

  // 頠訾???=> ?岫??斜轉
  if (pending.axis !== info.axis) {
    const diagR = last.r + (pending.sr || info.sr);
    const diagC = last.c + (pending.sc || info.sc);

    diagAssistRef.current = null;
    return tryMoveToCell(diagR, diagC);
  }

  // ?遘嚗?銝???嗡??祉宏???嗅??湔?
  const ok = tryMoveToCell(pending.hitR, pending.hitC);
  diagAssistRef.current = {
    baseR: last.r,
    baseC: last.c,
    hitR,
    hitC,
    axis: info.axis,
    sr: info.sr,
    sc: info.sc,
    ts: now,
  };
  return ok;
}, [tryMoveToCell]);


// 憿舐內 Move Ended ?桃蔗銝血???啣?閫?????
const triggerMoveEndedOverlay = useCallback(
  (duration = 800) => {
    if (moveEndedTimerRef.current) {
      clearTimeout(moveEndedTimerRef.current);
      moveEndedTimerRef.current = 0;
    }

    setManualLocked(true);
    setShowMoveEnded(true);

    moveEndedTimerRef.current = window.setTimeout(() => {
      setShowMoveEnded(false);
      setTimeLeft(maxTime);
      setManualLocked(false);
      moveEndedTimerRef.current = 0;
    }, duration);
  },
  [maxTime]
);

useEffect(() => {
  boardRef.current = board;
}, [board]);

useEffect(() => {
  pathRef.current = path;
}, [path]);

const flushFloatingPosition = useCallback(() => {
  floatingRAFRef.current = 0;
  const { x, y } = floatingPointRef.current;
  setFloating((prev) => (prev ? { ...prev, x, y, visible: true } : prev));
}, []);

const scheduleFloatingUpdate = useCallback(
  (x, y) => {
    floatingPointRef.current = { x, y };
    if (floatingRAFRef.current) return;
    floatingRAFRef.current = requestAnimationFrame(flushFloatingPosition);
  },
  [flushFloatingPosition]
);

// ?迫???閮??具?
const stopManualTimer = useCallback(() => {
  if (timerRAFRef.current) {
    cancelAnimationFrame(timerRAFRef.current);
    timerRAFRef.current = 0;
  }
}, []);

// ?????嚗???芸?蝯?????
const startManualTimer = useCallback(() => {
  stopManualTimer();
  dragStartTimeRef.current = performance.now();
  manualEndCalledRef.current = false;

  const tick = (now) => {
    if (!isDraggingRef.current) {
      timerRAFRef.current = 0;
      return;
    }

    const elapsed = (now - dragStartTimeRef.current) / 1000;
    const remain = Math.max(0, maxTime - elapsed);

    setTimeLeft(remain);

    if (remain <= 0) {
      if (!manualEndCalledRef.current) {
        manualEndCalledRef.current = true;
        handleManualEndRef.current?.();
      }
      timerRAFRef.current = 0;
      return;
    }

    timerRAFRef.current = requestAnimationFrame(tick);
  };

  timerRAFRef.current = requestAnimationFrame(tick);
}, [maxTime, stopManualTimer]);

const getBoardLocalPos = (clientX, clientY) => {
  const rect = boardWrapRef.current?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
};

const clearMarksForManual = (board) => {
  return board.map((row) =>
    row.map((cell) => {
      const orb = orbOf(cell);
      const xm = xMarkOf(cell);
      const nm = nMarkOf(cell);

      const nextX = xm === 1 ? 0 : xm;   // X1 皜?嚗2 靽?
      const nextQ = 0;                   // Start / End 皜?
      const nextN = nm === 2 ? 0 : nm;   // ??皜?N2嚗???N1

      return withMarks(orb, nextX, nextQ, nextN);
    })
  );
};

// ????/?芸?璅∪?嚗?閮剜?頧?蝔?摮???
const handleToggleMode = (manual) => {
  if (typeof stopToBase === "function") stopToBase(true);

  stopManualTimer();
  isDraggingRef.current = false;
  manualEndCalledRef.current = false;
  pointerLastClientRef.current = null;
  manualStartFromRow0Ref.current = false;

  if (floatingRAFRef.current) {
    cancelAnimationFrame(floatingRAFRef.current);
    floatingRAFRef.current = 0;
  }

  if (moveFlushRAFRef.current) {
    cancelAnimationFrame(moveFlushRAFRef.current);
    moveFlushRAFRef.current = 0;
  }

  if (moveEndedTimerRef.current) {
    clearTimeout(moveEndedTimerRef.current);
    moveEndedTimerRef.current = 0;
  }

  pendingBoardRef.current = null;
  pendingPathRef.current = null;
  pendingCurrentStepRef.current = -1;
  pendingStepsRef.current = 0;

  setShowMoveEnded(false);
  setManualLocked(false);
  setFloating(null);

  setIsManual(manual);

  if (manual) {
    setBoard((prev) => clearMarksForManual(prev));
    setEditingBoard((prev) => clearMarksForManual(prev));
    setPath([]);
    pathRef.current = [];
    lastPosRef.current = { r: -1, c: -1 };
    setCurrentStep(-1);
    setTimeLeft(maxTime);
  } else {
    setPath([]);
    pathRef.current = [];
    setCurrentStep(-1);
  }
};

// ??韏瑟?嚗遣蝡絲暺筑????憪?path ?絞閮?
const handleManualStart = (r, c, e) => {
  if (!isManual || manualLocked || solving || isReplaying) return;
  if (!originalBoard || originalBoard.length === 0) return;

  // ??瘥活??????????啣??
  const restoredBoard = clearMarksForManual(clone2D(originalBoard));
  boardRef.current = restoredBoard;
  setBoard(restoredBoard);

  const currentBoard = restoredBoard;
  const startOrb = currentBoard?.[r]?.[c];
  if (startOrb === undefined) return;

  // 韏瑟?銝??X1 / X2
  if (xMarkOf(startOrb) !== 0) return;

  baseBoardRef.current = clone2D(currentBoard);
  manualStartFromRow0Ref.current = (r === 0);

  isDraggingRef.current = true;
  setIsDragging(true);
  setManualActive(true);
  setTimeLeft(maxTime);

  const startPath = [{ r, c }];
  pathRef.current = startPath;
  setPath(startPath);

  lastPosRef.current = { r, c };
  setCurrentStep(0);

  pendingBoardRef.current = currentBoard;
  pendingPathRef.current = startPath;
  pendingCurrentStepRef.current = 0;
  pendingStepsRef.current = 0;

  setStats((prev) => ({
    ...prev,
    combos: 0,
    skyfallCombos: 0,
    steps: 0,
    clearedOrbs: 0,
    horizontalCombos: 0,
    verticalCombos: 0,
  }));

  let clientX;
  let clientY;

  if (e?.touches?.[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (
    typeof e?.clientX === "number" &&
    typeof e?.clientY === "number"
  ) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    const p = getCellCenterPx(r, c);
    clientX = p.x;
    clientY = p.y;
  }

  pointerLastClientRef.current = { x: clientX, y: clientY };

  const { x, y } = getBoardLocalPos(clientX, clientY);

  setFloating({
    orbId: orbOf(currentBoard[r][c]),
    x,
    y,
    visible: true,
  });

  startManualTimer();
};

// ??蝘餃?嚗???hit cell??頧??抵?餈賣鋆郊??
const handleManualMove = (r, c, e) => {
  if (!isManual || manualLocked || !isDraggingRef.current) return;

  let clientX;
  let clientY;

  if (e?.touches?.[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (
    typeof e?.clientX === "number" &&
    typeof e?.clientY === "number"
  ) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    return;
  }

  const { x, y } = getBoardLocalPos(clientX, clientY);
  scheduleFloatingUpdate(x, y);

  pointerLastClientRef.current = { x: clientX, y: clientY };

  // ?湔???璅?典銝??
  const hitCell = getCellFromClientPoint(clientX, clientY);

  // ??祕??雿蔭
  if (hitCell && isDraggingRef.current) {
  const last = pathRef.current[pathRef.current.length - 1];
  const allowDiagonal = isManual || diagonalEnabled;

  if (last) {
    const dr = Math.abs(hitCell.r - last.r);
    const dc = Math.abs(hitCell.c - last.c);

    // ?芣????迂?湔斜轉??嚗??斜轉頛
    if (!allowDiagonal && dr + dc === 1) {
      const consumed = tryResolveDiagonalAssist(hitCell.r, hitCell.c);
      if (consumed) return;
    } else {
      diagAssistRef.current = null;
    }
  }

  const ok = tryMoveToCell(hitCell.r, hitCell.c);
  if (!ok) {
    chaseToTargetCell(hitCell.r, hitCell.c);
  }
  return;
}

  // 敺?嚗鈭辣?祈澈?葆 r,c嚗停?典?
  if (
    typeof r === "number" &&
    typeof c === "number" &&
    r >= 0 &&
    c >= 0 &&
    r < TOTAL_ROWS &&
    c < COLS &&
    isDraggingRef.current
  ) {
    const ok = tryMoveToCell(r, c);
    if (!ok) {
      chaseToTargetCell(r, c);
    }
  }
};

// ???嗅偏嚗?扎??????怨?瘚?????
const handleManualEnd = useCallback(() => {
  if (!isDraggingRef.current || manualLocked) return;

  isDraggingRef.current = false;
  pointerLastClientRef.current = null;

  setIsDragging(false);
  setManualActive(false);
  setFloating(null);
  clearAllGhosts();

  stopManualTimer();

  if (floatingRAFRef.current) {
    cancelAnimationFrame(floatingRAFRef.current);
    floatingRAFRef.current = 0;
  }

  if (moveFlushRAFRef.current) {
    cancelAnimationFrame(moveFlushRAFRef.current);
    moveFlushRAFRef.current = 0;
  }

  if (pendingBoardRef.current) {
    boardRef.current = pendingBoardRef.current;
    setBoard(pendingBoardRef.current);
  }

  if (pendingPathRef.current) {
    pathRef.current = pendingPathRef.current;
    setPath(pendingPathRef.current);
    setCurrentStep(pendingCurrentStepRef.current);
  }

  const finalBoard = boardRef.current;
const result = evaluateBoard(finalBoard, skyfallEnabled, null, ruleProfile);

  setStats((prev) => ({
    ...prev,
    steps:
      typeof pendingStepsRef.current === "number"
        ? pendingStepsRef.current
        : prev.steps,
    combos: result.initialCombos,
    skyfallCombos: result.skyfallCombos,
    clearedOrbs: result.clearedCount,
    horizontalCombos: result.horizontalCombos,
    verticalCombos: result.verticalCombos,
  }));

  triggerMoveEndedOverlay(800);
}, [manualLocked, skyfallEnabled, stopManualTimer, triggerMoveEndedOverlay]);

useEffect(() => {
  handleManualEndRef.current = handleManualEnd;
}, [handleManualEnd]);

useEffect(() => {
  return () => {
    stopManualTimer();

    if (floatingRAFRef.current) {
      cancelAnimationFrame(floatingRAFRef.current);
      floatingRAFRef.current = 0;
    }

    if (moveFlushRAFRef.current) {
      cancelAnimationFrame(moveFlushRAFRef.current);
      moveFlushRAFRef.current = 0;
    }

    if (moveEndedTimerRef.current) {
      clearTimeout(moveEndedTimerRef.current);
      moveEndedTimerRef.current = 0;
    }

    pointerLastClientRef.current = null;
    pendingBoardRef.current = null;
    pendingPathRef.current = null;
  };
}, [stopManualTimer]);

// ?交?璅歲?潘?瘝踵??剜?蕭頞?格??潘??郊? tryMoveToCell??
const chaseToTargetCell = useCallback(
  (targetR, targetC) => {
    if (!isDraggingRef.current || manualLocked) return false;
    if (targetR < 0 || targetC < 0 || targetR >= TOTAL_ROWS || targetC >= COLS) return false;

    let moved = false;
    let guard = 0;

    while (guard++ < 24) {
      const currentPath = pathRef.current;
      const last = currentPath[currentPath.length - 1];
      if (!last) break;
      if (last.r === targetR && last.c === targetC) break;

      const dr = targetR - last.r;
      const dc = targetC - last.c;

      let stepR = last.r;
      let stepC = last.c;

      const allowDiagonal = isManual || diagonalEnabled;

if (allowDiagonal) {
  stepR += dr === 0 ? 0 : dr > 0 ? 1 : -1;
  stepC += dc === 0 ? 0 : dc > 0 ? 1 : -1;
} else {
  if (Math.abs(dr) >= Math.abs(dc)) {
    stepR += dr > 0 ? 1 : -1;
  } else {
    stepC += dc > 0 ? 1 : -1;
  }
}

      const ok = tryMoveToCell(stepR, stepC);
      if (!ok) break;

      moved = true;
      if (!isDraggingRef.current) break;
    }

    return moved;
  },
  [manualLocked, diagonalEnabled, isManual, tryMoveToCell]
);

////////////
 
  const onImportClick = () => {
	  console.log("import click", { importBusy, ref: importFileRef.current });
	  if (importBusy || exportingGif || solving || isReplaying || isPaused) return;
	  importFileRef.current?.click();
	};
	
  const onImportFileChange = (e) => {
	  const f = e.target.files?.[0];
	  e.target.value = ""; // 霈?瑼?
	  if (!f) return;

    autoSolveImportedRef.current = false;
	  if (importImgUrl) URL.revokeObjectURL(importImgUrl);
	  const url = URL.createObjectURL(f);
	  setImportImgUrl(url);
	  setShowImportCrop(true);
	};

  const resetAdvanced = () => {
    setConfig(prev => ({ ...prev, beamWidth: DEFAULT_CONFIG.beamWidth, maxNodes: DEFAULT_CONFIG.maxNodes, humanPlanner: DEFAULT_CONFIG.humanPlanner, reversePlanner: DEFAULT_CONFIG.reversePlanner, reverseMaxSteps: DEFAULT_CONFIG.reverseMaxSteps, searchSeed: DEFAULT_CONFIG.searchSeed, deferMoveMaterialization: DEFAULT_CONFIG.deferMoveMaterialization, cheapLocalGuidance: DEFAULT_CONFIG.cheapLocalGuidance, cheapLegacyReserve: DEFAULT_CONFIG.cheapLegacyReserve, cheapEvalScale: DEFAULT_CONFIG.cheapEvalScale, cheapEvalConstraintScale: DEFAULT_CONFIG.cheapEvalConstraintScale, stepPenalty: DEFAULT_CONFIG.stepPenalty, potentialWeight: DEFAULT_CONFIG.potentialWeight, clearedWeight: DEFAULT_CONFIG.clearedWeight}));
    solverCache.current.clear();
  };

  const handleOpenEditor = () => {
	  if (isManual) {
		setEditingBoard(clearMarksForManual(board));
	  } else {
		setEditingBoard(board.map((row) => [...row]));
	  }

	  setShowEditor(true);
	};

  const handleApplyCustomBoard = () => {
	  const finalBoard = isManual
		? clearMarksForManual(editingBoard)
		: editingBoard.map((row) => [...row]);

	  setBoard(finalBoard.map((row) => [...row]));
	  setEditingBoard(finalBoard.map((row) => [...row]));
	  baseBoardRef.current = finalBoard.map((row) => [...row]);
	  setOriginalBoard(finalBoard.map((row) => [...row]));
		boardRef.current = finalBoard.map((row) => [...row]);

	  refreshTarget(finalBoard);
	  setShowEditor(false);
	};

  const swapBoard = (tempBoard, r1, c1, r2, c2) => {
  const nextBoard = tempBoard.map(row => [...row]);
  if (r1 === 0 || r2 === 0) return nextBoard; // ??Row0 瘞賊?銝?
  const val = nextBoard[r1][c1];
  nextBoard[r1][c1] = nextBoard[r2][c2];
  nextBoard[r2][c2] = val;
  return nextBoard;
};

  const dragStep = (board, heldOrb, nr, nc) => {
  const nextBoard = board.map(row => [...row]);
  const temp = nextBoard[nr][nc];
  nextBoard[nr][nc] = heldOrb;
  const nextHeld = temp;
  return { nextBoard, nextHeld };
};

/////////////////

const clone2D = (b) => {
  const len = b.length;
  const copy = new Array(len);
  for (let i = 0; i < len; i++) copy[i] = b[i].slice();
  return copy;
};
const boardWithHeldFilled = (b, hole, held) => {
  if (!hole) return b;
  const next = clone2D(b);
  next[hole.r][hole.c] = held;
  return next;
};
const holeStepInPlace = (b, hole, toRC) => {
  const moved = b[toRC.r][toRC.c];
  b[hole.r][hole.c] = moved;
  b[toRC.r][toRC.c] = -1;
  return toRC; // new hole
};
const compactnessScore = (b, phase = "initial") => {
  let minR = 99, maxR = -1;
  let minC = 99, maxC = -1;
  let cnt = 0;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = getOrbForMatchPhase(b[r][c], phase);
      if (v === -1) continue;

      cnt++;

      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }

  if (cnt <= 1) return 0;

  const area = (maxR - minR + 1) * (maxC - minC + 1);

  return -area * 30;
};
const edgePotentialScore = (b, phase = "initial") => {
  let p = 0;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {

      const v = getOrbForMatchPhase(b[r][c], phase);
      if (v === -1) continue;

      const isEdge =
        r === PLAY_ROWS_START ||
        r === TOTAL_ROWS - 1 ||
        c === 0 ||
        c === COLS - 1;

      if (!isEdge) continue;

      if (c + 1 < COLS && getOrbForMatchPhase(b[r][c + 1], phase) === v) p += 2;

      if (r + 1 < TOTAL_ROWS && getOrbForMatchPhase(b[r + 1][c], phase) === v) p += 2;
    }
  }

  return p;
};
const regionOf = (r, c) => {

  const vr =
    r <= PLAY_ROWS_START + 1 ? 0 :
    r <= PLAY_ROWS_START + 3 ? 1 :
    2;

  const vc =
    c <= 1 ? 0 :
    c <= 3 ? 1 :
    2;

  return vr * 3 + vc;
};
const applyGravity = (b, toClear1D) => {
  const next = clone2D(b);
  for (let c = 0; c < COLS; c++) {
    let writeRow = TOTAL_ROWS - 1;
    for (let r = TOTAL_ROWS - 1; r >= 1; r--) {
      // ?雁霈?? r * COLS + c
      if (!toClear1D[r * COLS + c]) {
        next[writeRow][c] = b[r][c];
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 1; r--) next[r][c] = -1;
  }
  return next;
};
const potentialScore = (b, mode, phase = "initial") => {
  let p = 0;
  const hWeight = mode === "horizontal" ? 3 : 0.5;
  const vWeight = mode === "vertical" ? 3 : 0.5;

  // 瘞游像
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    let a = getOrbForMatchPhase(b[r][0], phase);
    let d = getOrbForMatchPhase(b[r][1], phase);

    for (let c = 0; c < COLS - 2; c++) {
      const e = getOrbForMatchPhase(b[r][c + 2], phase);

      if (a !== -1) {
        if (
          (a === d && a !== e) ||
          (d === e && a !== d) ||
          (a === e && a !== d)
        ) {
          p += hWeight;
        }
      }

      a = d;
      d = e;
    }
  }

  // ?
  for (let c = 0; c < COLS; c++) {
    let a = getOrbForMatchPhase(b[PLAY_ROWS_START][c], phase);
    let d =
      PLAY_ROWS_START + 1 < TOTAL_ROWS
        ? getOrbForMatchPhase(b[PLAY_ROWS_START + 1][c], phase)
        : -1;

    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; r++) {
      const e = getOrbForMatchPhase(b[r + 2][c], phase);

      if (a !== -1) {
        if (
          (a === d && a !== e) ||
          (d === e && a !== d) ||
          (a === e && a !== d)
        ) {
          p += vWeight;
        }
      }

      a = d;
      d = e;
    }
  }

  return p;
};
const SHAPE_KIND = {
  CROSS: "cross",
  L: "l",
  T: "t",
};

const getCheapRectGuideScoreBySpecial = (board, sp, phase = "initial") => {
  if (!sp || sp.type !== "rect") return 0;

  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  const RECT_ORBS =
    wantOrb !== SPECIAL_ORB_ANY && wantOrb !== -1
      ? [wantOrb]
      : [
          ORB_TYPES.WATER.id,
          ORB_TYPES.FIRE.id,
          ORB_TYPES.EARTH.id,
          ORB_TYPES.LIGHT.id,
          ORB_TYPES.DARK.id,
          ORB_TYPES.HEART.id,
        ];

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      for (const orb of RECT_ORBS) {
        let inside = 0;
        let near = 0;

        for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const v = getOrbForMatchPhase(board[r][c], phase);
            if (v !== orb) continue;

            const inRect =
              r >= r0 && r < r0 + m &&
              c >= c0 && c < c0 + n;

            if (inRect) {
              inside++;
              continue;
            }

            const nearRect =
              r >= r0 - 1 && r <= r0 + m &&
              c >= c0 - 1 && c <= c0 + n;

            if (nearRect) near++;
          }
        }

        const score = inside * 1000 + near * 80;
        if (score > best) best = score;
      }
    }
  }

  return best;
};

const normalizeCells = (cells) => {
  let minR = Infinity;
  let minC = Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
  }
  const arr = cells
    .map(([r, c]) => `${r - minR},${c - minC}`)
    .sort();
  return arr.join("|");
};

const transformCells8 = (cells) => {
  return [
    cells.map(([r, c]) => [r, c]),
    cells.map(([r, c]) => [r, -c]),
    cells.map(([r, c]) => [-r, c]),
    cells.map(([r, c]) => [-r, -c]),

    cells.map(([r, c]) => [c, r]),
    cells.map(([r, c]) => [c, -r]),
    cells.map(([r, c]) => [-c, r]),
    cells.map(([r, c]) => [-c, -r]),
  ];
};

const canonicalShapeKey = (cells) => {
  let best = null;
  for (const t of transformCells8(cells)) {
    const key = normalizeCells(t);
    if (best === null || key < best) best = key;
  }
  return best;
};

/////////////////
// 蝚砌??嚗楝敺圾蝞?Beam/閰?嚗??孵????/////////////////
// 撠?芸?閮剖?璅?取消?航?蝞??”嚗?瞈?none嚗?// 璅???芸?頛詨嚗???蒂?蕪 none嚗?
const normalizeSpecialPriorityList = (specialPriority) => {
  if (Array.isArray(specialPriority)) {
    return specialPriority.filter((sp) => sp && sp.type && sp.type !== "none");
  }
  if (specialPriority && specialPriority.type && specialPriority.type !== "none") {
    return [specialPriority];
  }
  return [];
};

// 皜???瘨???貊?蝔殷??駁?銝虫???瘜?蝔柴?
const normalizeSelectedEqualOrbs = (arr) => {
  if (!Array.isArray(arr)) return [];
  const set = new Set();
  for (const v of arr) {
    const n = Number(v);
    if (EQUAL_FIRST_ORBS.includes(n)) set.add(n);
  }
  return [...set];
};

const getRectMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "rect") return 0;

  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const key = `${m}x${n}`;
  const group = ev.initialPatternCounts?.rect?.[key];

  if (!group) return 0;

  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  // 瘝?摰惇?扳?嚗?遙雿惇??
  if (wantOrb === SPECIAL_ORB_ANY || wantOrb === -1) {
    return group.total || 0;
  }

  // ??摰惇?扳?嚗?亙?閰脣惇??
  return group.byOrb?.[wantOrb] || 0;
};

const getEqualFirstMatchedValueBySpecial = (ev, sp) => {
  if (!sp || sp.type !== "equalFirst") return 0;

  const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
  if (selected.length === 0) return 0;

  const counts = ev.initialComboCountsByOrb;
  if (!counts) return 0;

  const vals = selected.map((orb) => counts[orb] || 0);
  const first = vals[0] || 0;
  if (first <= 0) return 0;

  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== first) return 0;
  }
  return first;
};

// 求解?桐??孵??祉?Ｙ????詨潦?
const getSingleSpecialMatchedValue = (ev, sp) => {
  if (!sp || sp.type === "none") return 0;

  if (sp.type === "clearCount") {
    return ev.initialClearedCount || 0;
  }

  if (sp.type === "equalFirst") {
    return getEqualFirstMatchedValueBySpecial(ev, sp);
  }

  if (sp.type === "rect") {
    return getRectMatchedValueBySpecial(ev, sp);
  }

  const group = ev.initialPatternCounts?.[sp.type];
  if (!group) return 0;

  if (sp.orb === SPECIAL_ORB_ANY) return group.total || 0;
  return group.byOrb?.[sp.orb] || 0;
};

// ?斗?桐??孵??阡?璅?
const isSingleSpecialSatisfied = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return true;

  if (sp.type === "clearCount") {
    return (ev.initialClearedCount || 0) === (sp.clearCount || 0);
  }

  if (sp.type === "equalFirst") {
    return getEqualFirstMatchedValueBySpecial(ev, sp) > 0;
  }

  if (sp.type === "rect") {
    return getRectMatchedValueBySpecial(ev, sp) >= 1;
  }

  if (sp.type === "cross" || sp.type === "l" || sp.type === "t") {
    const got = getSingleSpecialMatchedValue(ev, sp);
    return got >= (sp.count || 1);
  }

  return getSingleSpecialMatchedValue(ev, sp) >= (sp.count || 1);
};

// ?斗?渡??孵??血?券?璅?
const isAllSpecialSatisfied = (ev, specialPriorities = [], extraCtx = {}) => {
  const list = normalizeSpecialPriorityList(specialPriorities);
  return list.every((sp) => isSingleSpecialSatisfied(ev, sp, extraCtx));
};

// ?Ｙ??桐?特優先 progress嚗one/guide嚗?潭?摨?
const getSingleSpecialProgress = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return { done: 1, guide: 0 };

  if (sp.type === "rect") {
    return {
      done: isSingleSpecialSatisfied(ev, sp, extraCtx) ? 1 : 0,
      guide: extraCtx?.rectGuide || 0,
    };
  }

  if (sp.type === "clearCount") {
    const got = ev.initialClearedCount || 0;
    const want = sp.clearCount || 0;
    const diff = Math.abs(got - want);
    return {
      done: got === want ? 1 : 0,
      guide: 100000 - diff * 1000 - Math.max(0, got - want) * 10,
    };
  }

  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
    if (selected.length === 0) return { done: 0, guide: 0 };

    const counts = ev.initialComboCountsByOrb;
    if (!counts) return { done: 0, guide: 0 };

    const vals = selected.map((orb) => counts[orb] || 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const diff = maxV - minV;

    return {
      done: minV > 0 && diff === 0 ? 1 : 0,
      guide: minV * 1000 - diff * 300,
    };
  }

  const got = getSingleSpecialMatchedValue(ev, sp);
  const want = sp.count || 1;

  return {
    done: got >= want ? 1 : 0,
    guide: Math.min(got, want) * 1000 - Math.max(0, want - got) * 200,
  };
};

// 撠?芸???????箏?? tuple嚗? Beam ??瘥???// ???孵??摨?tuple嚗? Beam ?舐?亦摮摨?頛?
const getSpecialPriorityTuple = (ev, specialPriorities = [], extraCtx = {}) => {
  const slots = Array.isArray(specialPriorities)
    ? specialPriorities.slice(0, 3)
    : specialPriorities
    ? [specialPriorities]
    : [];

  while (slots.length < 3) slots.push({ type: "none" });

  const p1 =
    slots[0] && slots[0].type !== "none"
      ? getSingleSpecialProgress(ev, slots[0], extraCtx)
      : { done: 0, guide: 0 };

  const p2 =
    slots[1] && slots[1].type !== "none"
      ? getSingleSpecialProgress(ev, slots[1], extraCtx)
      : { done: 0, guide: 0 };

  const p3 =
    slots[2] && slots[2].type !== "none"
      ? getSingleSpecialProgress(ev, slots[2], extraCtx)
      : { done: 0, guide: 0 };

  const mask = (p1.done ? 4 : 0) | (p2.done ? 2 : 0) | (p3.done ? 1 : 0);

  // 雿?摰???嚗?
  // 111 > 110 > 101 > 011 > 100 > 010 > 001 > 000
  const SPECIAL_COMBO_SCORE = {
    7: 7, // 銝+鈭?銝?
    6: 6, // 銝+鈭?
    5: 5, // 銝+銝?
    3: 4, // 鈭?銝?
    4: 3, // 銝
    2: 2, // 鈭?
    1: 1, // 銝?
    0: 0, // ??
  };

  return [
    SPECIAL_COMBO_SCORE[mask] || 0,
    p1.done,
    p2.done,
    p3.done,
    p1.guide,
    p2.guide,
    p3.guide,
  ];
};

const lexTupleCompareDesc = (a, b) => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
};

const lexTupleBetter = (a, b) => lexTupleCompareDesc(a, b) < 0;

const getRectGuideScoreBySpecial = (board, sp, phase = "initial") => {
  if (!sp || sp.type !== "rect") return 0;

  const m = Number(sp.rectM) || 3;
  const n = Number(sp.rectN) || 3;
  const wantOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

  const RECT_ORBS = [
    ORB_TYPES.WATER.id,
    ORB_TYPES.FIRE.id,
    ORB_TYPES.EARTH.id,
    ORB_TYPES.LIGHT.id,
    ORB_TYPES.DARK.id,
    ORB_TYPES.HEART.id,
  ];

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      // ??摰惇?扳?嚗??惇??
      if (wantOrb !== SPECIAL_ORB_ANY && wantOrb !== -1) {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, wantOrb, phase);
        if (s > best) best = s;
        continue;
      }

      // 瘝?摰惇?扳?嚗????券撅祆?
      for (const orb of RECT_ORBS) {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, orb, phase);
        if (s > best) best = s;
      }
    }
  }

  return best;
};

const getRectGuideScoreFromSpecialList = (board, specialPriorities = [], phase = "initial") => {
  const list = normalizeSpecialPriorityList(specialPriorities);
  let best = 0;

  for (const sp of list) {
    if (sp.type !== "rect") continue;
    const s = getRectGuideScoreBySpecial(board, sp, phase);
    if (s > best) best = s;
  }

  return best;
};

const toggleEqualOrbAt = (idx, orbId) => {
  setSpecialPriorities((prev) =>
    prev.map((sp, i) => {
      if (i !== idx) return sp;
      const current = normalizeSelectedEqualOrbs(sp.equalOrbs);
      const has = current.includes(orbId);
      return {
        ...sp,
        equalOrbs: has
          ? current.filter((x) => x !== orbId)
          : [...current, orbId],
      };
    })
  );
  setNeedsSolve(true);
};

const SHAPE_TEMPLATES = {
  [SHAPE_KIND.CROSS]: [
    [0, 1],
    [1, 0], [1, 1], [1, 2],
    [2, 1],
  ],
  [SHAPE_KIND.L]: [
    [0, 0],
    [1, 0],
    [2, 0], [2, 1], [2, 2],
  ],
  [SHAPE_KIND.T]: [
    [0, 0], [0, 1], [0, 2],
            [1, 1],
            [2, 1],
  ],
};

const RECT_GUIDE_PATTERNS = {
  cross: [
    [0, 1],
    [1, 0], [1, 1], [1, 2],
    [2, 1],
  ],
  l: [
    [0, 0],
    [1, 0],
    [2, 0], [2, 1], [2, 2],
  ],
  t: [
    [0, 0], [0, 1], [0, 2],
            [1, 1],
            [2, 1],
  ],
  block2x2: [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
  ],
  rect2x3: [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
  ],
  rect3x2: [
    [0, 0], [0, 1],
    [1, 0], [1, 1],
    [2, 0], [2, 1],
  ],
  lineH3: [
    [0, 0], [0, 1], [0, 2],
  ],
  lineV3: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
};

const matchSubPatternAt = (
  board,
  r0,
  c0,
  winR,
  winC,
  pattern,
  orb,
  phase = "initial"
) => {
  for (const [dr, dc] of pattern) {
    const r = r0 + winR + dr;
    const c = c0 + winC + dc;

    if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
      return false;
    }

    if (winR + dr < 0 || winR + dr >= 999) return false;
    if (winC + dc < 0 || winC + dc >= 999) return false;

    const v = getOrbForMatchPhase(board[r][c], phase);
    if (v !== orb) return false;
  }

  return true;
};

const matchSubPatternInWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  startR,
  startC,
  pattern,
  orb,
  phase = "initial"
) => {
  for (const [dr, dc] of pattern) {
    const wr = startR + dr;
    const wc = startC + dc;

    if (wr < 0 || wr >= m || wc < 0 || wc >= n) return false;

    const r = baseR + wr;
    const c = baseC + wc;
    const v = getOrbForMatchPhase(board[r][c], phase);
    if (v !== orb) return false;
  }
  return true;
};

const countWindowOrb = (board, baseR, baseC, m, n, orb, phase = "initial") => {
  let cnt = 0;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      const v = getOrbForMatchPhase(board[baseR + r][baseC + c], phase);
      if (v === orb) cnt++;
    }
  }
  return cnt;
};

const countBoundaryOrb = (board, baseR, baseC, m, n, orb, phase = "initial") => {
  let cnt = 0;

  for (let r = baseR; r < baseR + m; r++) {
    if (baseC - 1 >= 0) {
      const v = getOrbForMatchPhase(board[r][baseC - 1], phase);
      if (v === orb) cnt++;
    }
    if (baseC + n < COLS) {
      const v = getOrbForMatchPhase(board[r][baseC + n], phase);
      if (v === orb) cnt++;
    }
  }

  for (let c = baseC; c < baseC + n; c++) {
    if (baseR - 1 >= PLAY_ROWS_START) {
      const v = getOrbForMatchPhase(board[baseR - 1][c], phase);
      if (v === orb) cnt++;
    }
    if (baseR + m < TOTAL_ROWS) {
      const v = getOrbForMatchPhase(board[baseR + m][c], phase);
      if (v === orb) cnt++;
    }
  }

  return cnt;
};

const countPatternHitsInWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  orb,
  phase = "initial"
) => {
  let cross = 0;
  let t = 0;
  let l = 0;
  let block2x2 = 0;
  let rect2x3 = 0;
  let rect3x2 = 0;
  let lineH3 = 0;
  let lineV3 = 0;

  for (let sr = 0; sr < m; sr++) {
    for (let sc = 0; sc < n; sc++) {
      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.cross, orb, phase
        )
      ) cross++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.t, orb, phase
        )
      ) t++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.l, orb, phase
        )
      ) l++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.block2x2, orb, phase
        )
      ) block2x2++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.rect2x3, orb, phase
        )
      ) rect2x3++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.rect3x2, orb, phase
        )
      ) rect3x2++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.lineH3, orb, phase
        )
      ) lineH3++;

      if (
        matchSubPatternInWindow(
          board, baseR, baseC, m, n, sr, sc,
          RECT_GUIDE_PATTERNS.lineV3, orb, phase
        )
      ) lineV3++;
    }
  }

  return { cross, t, l, block2x2, rect2x3, rect3x2, lineH3, lineV3 };
};

const scoreRectGuideWindow = (
  board,
  baseR,
  baseC,
  m,
  n,
  orb,
  phase = "initial"
) => {
  const insideCount = countWindowOrb(board, baseR, baseC, m, n, orb, phase);
  const boundaryCount = countBoundaryOrb(board, baseR, baseC, m, n, orb, phase);
  const hits = countPatternHitsInWindow(board, baseR, baseC, m, n, orb, phase);

  let score = 0;

  score += insideCount * 100;
  score -= boundaryCount * 25;

  if (m === 3 && n === 3) {
    score += hits.cross * 2200;
    score += hits.t * 1700;
    score += hits.l * 1500;
    score += hits.block2x2 * 900;
    score += (hits.lineH3 + hits.lineV3) * 700;
    score += (hits.rect2x3 + hits.rect3x2) * 1200;
  } else {
    score += hits.cross * 1200;
    score += hits.t * 900;
    score += hits.l * 800;
    score += hits.block2x2 * 650;
    score += (hits.rect2x3 + hits.rect3x2) * 1000;
    score += (hits.lineH3 + hits.lineV3) * 500;
  }

  return score;
};

const getRectPatternGuideScore = (board, specialPriority, phase = "initial") => {
  const activeSpecial = getActiveSpecialPriority(specialPriority);
  if (!activeSpecial || activeSpecial.type !== "rect") return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const wantOrb = activeSpecial.rectOrb ?? SPECIAL_ORB_ANY;

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      if (wantOrb === SPECIAL_ORB_ANY) {
        for (const orb of [
          ORB_TYPES.WATER.id,
          ORB_TYPES.FIRE.id,
          ORB_TYPES.EARTH.id,
          ORB_TYPES.LIGHT.id,
          ORB_TYPES.DARK.id,
          ORB_TYPES.HEART.id,
        ]) {
          const s = scoreRectGuideWindow(board, r0, c0, m, n, orb, phase);
          if (s > best) best = s;
        }
      } else {
        const s = scoreRectGuideWindow(board, r0, c0, m, n, wantOrb, phase);
        if (s > best) best = s;
      }
    }
  }

  return best;
};

const SHAPE_CANONICAL = Object.fromEntries(
  Object.entries(SHAPE_TEMPLATES).map(([k, cells]) => [k, canonicalShapeKey(cells)])
);

const detectExact5Shape = (cells) => {
  if (!cells || cells.length !== 5) return null;
  const key = canonicalShapeKey(cells);
  for (const [kind, canon] of Object.entries(SHAPE_CANONICAL)) {
    if (key === canon) return kind;
  }
  return null;
};

const makePatternCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8),
});

const makeRectCounter = () => ({
  total: 0,
  byOrb: new Int16Array(8),
});

const makeRectCounts = () => {
  const out = {};
  for (const m of RECT_M_OPTIONS) {
    for (const n of RECT_N_OPTIONS) {
      out[`${m}x${n}`] = makeRectCounter();
    }
  }
  return out;
};

const makePatternCounts = () => ({
  cross: makePatternCounter(),
  l: makePatternCounter(),
  t: makePatternCounter(),
  rect: makeRectCounts(),
});

const makeComboCountsByOrb = () => new Int16Array(8);
const makeComboSizeCountsByOrb = () =>
  Array.from({ length: 6 }, () => Object.create(null));

const isPureRectGroup = (cells, expectedRows, expectedCols) => {
  if (!cells || cells.length !== expectedRows * expectedCols) return false;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;

  const set = new Set();

  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    set.add(`${r},${c}`);
  }

  const h = maxR - minR + 1;
  const w = maxC - minC + 1;
  if (h !== expectedRows || w !== expectedCols) return false;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!set.has(`${r},${c}`)) return false;
    }
  }

  return true;
};

const getRectMatchedValue = (ev, special) => {
  const activeSpecial = getActiveSpecialPriority(special);
  if (!activeSpecial) return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const key = `${m}x${n}`;
  const group = ev.initialPatternCounts?.rect?.[key];
  if (!group) return 0;

  if (activeSpecial.rectOrb === SPECIAL_ORB_ANY) return group.total || 0;
  return group.byOrb?.[activeSpecial.rectOrb] || 0;
};

const getRectPotentialScore = (board, special, phase = "initial") => {
  const activeSpecial = getActiveSpecialPriority(special);
  if (!activeSpecial || activeSpecial.type !== "rect") return 0;

  const m = Number(activeSpecial.rectM) || 3;
  const n = Number(activeSpecial.rectN) || 3;
  const wantOrb = activeSpecial.rectOrb ?? SPECIAL_ORB_ANY;

  let best = 0;

  for (let r0 = PLAY_ROWS_START; r0 + m <= TOTAL_ROWS; r0++) {
    for (let c0 = 0; c0 + n <= COLS; c0++) {
      const counts = new Int16Array(8);

      for (let r = r0; r < r0 + m; r++) {
        for (let c = c0; c < c0 + n; c++) {
          const v = getOrbForMatchPhase(board[r][c], phase);
          if (v >= 0 && v < counts.length) counts[v]++;
        }
      }

      let orb = wantOrb;
      let insideCount = 0;

      if (wantOrb === SPECIAL_ORB_ANY) {
        for (let k = 0; k < counts.length; k++) {
          if (counts[k] > insideCount) {
            insideCount = counts[k];
            orb = k;
          }
        }
      } else {
        insideCount = counts[wantOrb] || 0;
      }

      if (orb < 0) continue;

      let boundarySameCount = 0;

      for (let r = r0; r < r0 + m; r++) {
        if (c0 - 1 >= 0) {
          const v = getOrbForMatchPhase(board[r][c0 - 1], phase);
          if (v === orb) boundarySameCount++;
        }
        if (c0 + n < COLS) {
          const v = getOrbForMatchPhase(board[r][c0 + n], phase);
          if (v === orb) boundarySameCount++;
        }
      }

      for (let c = c0; c < c0 + n; c++) {
        if (r0 - 1 >= PLAY_ROWS_START) {
          const v = getOrbForMatchPhase(board[r0 - 1][c], phase);
          if (v === orb) boundarySameCount++;
        }
        if (r0 + m < TOTAL_ROWS) {
          const v = getOrbForMatchPhase(board[r0 + m][c], phase);
          if (v === orb) boundarySameCount++;
        }
      }

      const score = insideCount * 100 - boundarySameCount * 25;
      if (score > best) best = score;
    }
  }

  return best;
};

const getEqualFirstMatchedValue = (ev, special) => {
  const activeSpecial = getActiveSpecialPriority(special);
  const selected = normalizeSelectedEqualOrbs(activeSpecial?.equalOrbs);
  if (selected.length === 0) return 0;

  const counts = ev.initialComboCountsByOrb;
  if (!counts) return 0;

  const vals = selected.map((orb) => counts[orb] || 0);
  const first = vals[0] || 0;

  if (first <= 0) return 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== first) return 0;
  }
  return first;
};

const hasInitialN2Clear = (board, toClear1D) => {
  if (!toClear1D) return false;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (toClear1D[idx] && nMarkOf(board[r][c]) === 2) {
        return true;
      }
    }
  }
  return false;
};
const getInitialMatchCheck = (
  board,
  ruleProfileLike = null,
  collectGroups = false
) => {
  const initial = findMatches(
    board,
    "initial",
    ruleProfileLike,
    collectGroups
  );
  return {
    initial,
    violatesN2: hasInitialN2Clear(board, initial?.toClearMap),
  };
};
const getVanillaInitialClearMap = (board) => {
  const totalCells = TOTAL_ROWS * COLS;
  const toClear1D = new Uint8Array(totalCells);

  // 瘞游像
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS - 2; ) {
      const v0 = orbOf(board[r][c]);
      if (v0 === -1) {
        c++;
        continue;
      }

      const v1 = orbOf(board[r][c + 1]);
      const v2 = orbOf(board[r][c + 2]);
      if (v0 !== v1 || v0 !== v2) {
        c++;
        continue;
      }

      let k = c + 3;
      while (k < COLS && orbOf(board[r][k]) === v0) k++;

      for (let x = c; x < k; x++) {
        toClear1D[r * COLS + x] = 1;
      }
      c = k;
    }
  }

  // ?
  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS - 2; ) {
      const v0 = orbOf(board[r][c]);
      if (v0 === -1) {
        r++;
        continue;
      }

      const v1 = orbOf(board[r + 1][c]);
      const v2 = orbOf(board[r + 2][c]);
      if (v0 !== v1 || v0 !== v2) {
        r++;
        continue;
      }

      let k = r + 3;
      while (k < TOTAL_ROWS && orbOf(board[k][c]) === v0) k++;

      for (let y = r; y < k; y++) {
        toClear1D[y * COLS + c] = 1;
      }
      r = k;
    }
  }

  return toClear1D;
};
const hasN2InVanillaInitialPattern = (board) => {
  const toClear1D = getVanillaInitialClearMap(board);

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (toClear1D[idx] && nMarkOf(board[r][c]) === 2) {
        return true;
      }
    }
  }

  return false;
};
const createFindMatchesScratch = (totalCells) => ({
  totalCells,
  isH: new Uint8Array(totalCells),
  isV: new Uint8Array(totalCells),
  connVisited: new Uint8Array(totalCells),
  bfsQ: new Int16Array(totalCells),
  visited: new Uint8Array(totalCells),
  qR: new Int8Array(totalCells),
  qC: new Int8Array(totalCells),
  component: [],
  groupCells: [],
  groupCellPool: Array.from({ length: totalCells }, () => [0, 0]),
  shapeCells: [],
  shapeCellPool: Array.from({ length: 5 }, () => [0, 0]),
});

const getFindMatchesScratch = (totalCells) => {
  let scratch = getFindMatchesScratch._cache;
  if (!scratch || scratch.totalCells !== totalCells) {
    scratch = createFindMatchesScratch(totalCells);
    getFindMatchesScratch._cache = scratch;
  }

  scratch.isH.fill(0);
  scratch.isV.fill(0);
  scratch.connVisited.fill(0);
  scratch.visited.fill(0);
  return scratch;
};

const findMatches = (
  tempBoard,
  phase = "initial",
  ruleProfileLike = null,
  collectGroups = false
) => {
  let combos = 0,
    clearedCount = 0,
    vC = 0,
    hC = 0;

  const ruleCtx = getRuleRuntimeContext(ruleProfileLike);
  const minClearByOrb = ruleCtx.minClearByOrb;
  const clearModeByOrb = ruleCtx.clearModeByOrb;

  const totalCells = TOTAL_ROWS * COLS;
  const scratch = getFindMatchesScratch(totalCells);
  const isH = scratch.isH;
  const isV = scratch.isV;
  const toClear1D = new Uint8Array(totalCells);
  const patternCounts = makePatternCounts();
  const comboCountsByOrb = makeComboCountsByOrb();
  const comboSizeCountsByOrb = makeComboSizeCountsByOrb();
  const comboGroups = [];

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; ) {
      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb === -1) {
        c++;
        continue;
      }

      let k = c + 1;
      while (k < COLS && getOrbForMatchPhase(tempBoard[r][k], phase) === orb) k++;

      if (
        clearModeByOrb[orb] === RULE_CLEAR_MODE_LINE &&
        k - c >= minClearByOrb[orb]
      ) {
        for (let x = c; x < k; x++) {
          const idx = r * COLS + x;
          toClear1D[idx] = 1;
          isH[idx] = 1;
        }
      }
      c = k;
    }
  }

  for (let c = 0; c < COLS; c++) {
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; ) {
      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb === -1) {
        r++;
        continue;
      }

      let k = r + 1;
      while (k < TOTAL_ROWS && getOrbForMatchPhase(tempBoard[k][c], phase) === orb) {
        k++;
      }

      if (
        clearModeByOrb[orb] === RULE_CLEAR_MODE_LINE &&
        k - r >= minClearByOrb[orb]
      ) {
        for (let y = r; y < k; y++) {
          const idx = y * COLS + c;
          toClear1D[idx] = 1;
          isV[idx] = 1;
        }
      }
      r = k;
    }
  }

  const connVisited = scratch.connVisited;
  const bfsQ = scratch.bfsQ;
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx0 = r * COLS + c;
      if (connVisited[idx0]) continue;

      const orb = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (orb < 0 || clearModeByOrb[orb] !== RULE_CLEAR_MODE_CONNECTED) {
        connVisited[idx0] = 1;
        continue;
      }

      let head = 0;
      let tail = 0;
      bfsQ[tail++] = idx0;
      connVisited[idx0] = 1;
      const component = scratch.component;
      component.length = 0;
      let hasHAdj = false;
      let hasVAdj = false;

      while (head < tail) {
        const idx = bfsQ[head++];
        component.push(idx);
        const cr = Math.floor(idx / COLS);
        const cc = idx % COLS;

        for (let i = 0; i < 4; i++) {
          const nr = cr + BFS_DRS[i];
          const nc = cc + BFS_DCS[i];
          if (nr < PLAY_ROWS_START || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) {
            continue;
          }

          const nidx = nr * COLS + nc;
          const norb = getOrbForMatchPhase(tempBoard[nr][nc], phase);
          if (norb !== orb) continue;

          if (BFS_DRS[i] === 0) hasHAdj = true;
          if (BFS_DCS[i] === 0) hasVAdj = true;

          if (!connVisited[nidx]) {
            connVisited[nidx] = 1;
            bfsQ[tail++] = nidx;
          }
        }
      }

      if (component.length >= minClearByOrb[orb]) {
        for (const idx of component) {
          toClear1D[idx] = 1;
          if (hasHAdj) isH[idx] = 1;
          if (hasVAdj) isV[idx] = 1;
        }
      }
    }
  }

  const visited = scratch.visited;
  const qR = scratch.qR;
  const qC = scratch.qC;

  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx0 = r * COLS + c;
      if (!toClear1D[idx0] || visited[idx0]) continue;

      combos++;
      const type = getOrbForMatchPhase(tempBoard[r][c], phase);
      if (type >= 0 && type < comboCountsByOrb.length) {
        comboCountsByOrb[type]++;
      }

      let hasHM = false;
      let hasVM = false;

      let head = 0;
      let tail = 0;
      qR[tail] = r;
      qC[tail] = c;
      tail++;
      visited[idx0] = 1;

      let groupSize = 0;
      let minR = Infinity;
      let maxR = -Infinity;
      let minC = Infinity;
      let maxC = -Infinity;
      const shapeCells = scratch.shapeCells;
      const groupCells = scratch.groupCells;
      const shapeCellPool = scratch.shapeCellPool;
      const groupCellPool = scratch.groupCellPool;
      shapeCells.length = 0;
      groupCells.length = 0;
      let shapeWrite = 0;
      let groupWrite = 0;

      while (head < tail) {
        const cr = qR[head];
        const cc = qC[head];
        head++;

        clearedCount++;
        groupSize++;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        let groupCell = groupCellPool[groupWrite];
        if (!groupCell) {
          groupCell = [0, 0];
          groupCellPool[groupWrite] = groupCell;
        }
        groupCell[0] = cr;
        groupCell[1] = cc;
        groupCells.push(groupCell);
        groupWrite++;

        if (shapeWrite < 5) {
          let shapeCell = shapeCellPool[shapeWrite];
          if (!shapeCell) {
            shapeCell = [0, 0];
            shapeCellPool[shapeWrite] = shapeCell;
          }
          shapeCell[0] = cr;
          shapeCell[1] = cc;
          shapeCells.push(shapeCell);
          shapeWrite++;
        }

        const idx = cr * COLS + cc;
        if (isH[idx]) hasHM = true;
        if (isV[idx]) hasVM = true;

        for (let i = 0; i < 4; i++) {
          const nr = cr + BFS_DRS[i];
          const nc = cc + BFS_DCS[i];
          if (nr >= PLAY_ROWS_START && nr < TOTAL_ROWS && nc >= 0 && nc < COLS) {
            const nidx = nr * COLS + nc;
            if (
              toClear1D[nidx] &&
              !visited[nidx] &&
              getOrbForMatchPhase(tempBoard[nr][nc], phase) === type
            ) {
              visited[nidx] = 1;
              qR[tail] = nr;
              qC[tail] = nc;
              tail++;
            }
          }
        }
      }

      if (hasHM) hC++;
      if (hasVM) vC++;

      if (type >= 0 && type < 6) {
        const sizeKey = String(groupSize);
        comboSizeCountsByOrb[type][sizeKey] =
          (comboSizeCountsByOrb[type][sizeKey] || 0) + 1;
      }

      let exactShape = null;
      if (groupSize === 5) {
        const shape = detectExact5Shape(shapeCells);
        exactShape = shape;
        if (shape === SHAPE_KIND.CROSS) {
          patternCounts.cross.total++;
          patternCounts.cross.byOrb[type]++;
        } else if (shape === SHAPE_KIND.L) {
          patternCounts.l.total++;
          patternCounts.l.byOrb[type]++;
        } else if (shape === SHAPE_KIND.T) {
          patternCounts.t.total++;
          patternCounts.t.byOrb[type]++;
        }
      }

      for (const m of RECT_M_OPTIONS) {
        for (const n of RECT_N_OPTIONS) {
          if (isPureRectGroup(groupCells, m, n)) {
            const key = `${m}x${n}`;
            patternCounts.rect[key].total++;
            patternCounts.rect[key].byOrb[type]++;
          }
        }
      }

      if (collectGroups) {
        const cellIds = new Array(groupCells.length);
        for (let i = 0; i < groupCells.length; i++) {
          const cell = groupCells[i];
          cellIds[i] = cell[0] * COLS + cell[1];
        }
        cellIds.sort((a, b) => a - b);
        const relKey = cellIds
          .map((id) => {
            const r = Math.floor(id / COLS);
            const c = id % COLS;
            return `${r - minR},${c - minC}`;
          })
          .sort()
          .join("|");

        comboGroups.push({
          orb: type,
          size: groupSize,
          cellIds,
          cellMask: cellIds.join("."),
          relKey,
          minR,
          maxR,
          minC,
          maxC,
          centerR2: minR + maxR,
          centerC2: minC + maxC,
          hasH: hasHM,
          hasV: hasVM,
          shape: exactShape,
        });
      }
    }
  }

  return {
    combos,
    clearedCount,
    vC,
    hC,
    toClearMap: toClear1D,
    patternCounts,
    comboCountsByOrb,
    comboSizeCountsByOrb,
    groups: comboGroups,
  };
};

const specialPriorityTupleToScore = (tuple = []) => {
  if (!Array.isArray(tuple) || tuple.length === 0) return 0;

  let score = 0;
  let weight = 1e15;

  for (let i = 0; i < tuple.length; i++) {
    const v = Number(tuple[i] || 0);
    score += v * weight;
    weight /= 1000;
  }

  return score;
};
const unlockN2Board = (b) => {
  const next = clone2D(b);
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (nMarkOf(next[r][c]) === 2) {
        next[r][c] = setNMark(next[r][c], 0);
      }
    }
  }
  return next;
};
const combinedPotentialScore = (b, mode) => {

  const potInitial = potentialScore(b, mode, "initial");

  const unlocked = unlockN2Board(b);

  const potSkyfall = potentialScore(unlocked, mode, "skyfall");

  const edgePot = edgePotentialScore(b, "initial");

  const compact = compactnessScore(b, "initial");

  return (
    potInitial * 0.6 +
    potSkyfall * 0.2 +
    edgePot * 0.15 +
    compact * 0.05
  );
};
const evaluateBoard = (
  tempBoard,
  skyfall,
  initialResult = null,
  ruleProfileLike = null
) => {
  const ruleCtx = getRuleRuntimeContext(ruleProfileLike);
  const result =
    initialResult ?? findMatches(tempBoard, "initial", ruleCtx);

  const initialCombos = result.combos;
  const initialH = result.hC;
  const initialV = result.vC;
  const initialCleared = result.clearedCount;
  const initialPatternCounts = result.patternCounts;
  const initialComboCountsByOrb = result.comboCountsByOrb;
  const initialComboSizeCountsByOrb = result.comboSizeCountsByOrb;

  if (!skyfall) {
    return {
      combos: initialCombos,
      initialCombos,
      skyfallCombos: 0,
      clearedCount: initialCleared,
      initialClearedCount: initialCleared,
      verticalCombos: initialV,
      horizontalCombos: initialH,

      // ??multi-special helper 銝餉??????
      initialPatternCounts,
      initialComboCountsByOrb,
      initialComboSizeCountsByOrb,

      // 靽? alias嚗??蝔??嗡??唳???甈?
      patternCounts: initialPatternCounts,
      comboCountsByOrb: initialComboCountsByOrb,
      comboSizeCountsByOrb: initialComboSizeCountsByOrb,
    };
  }

  let currentBoard = clone2D(tempBoard);
  let totalCombos = initialCombos;
  let totalV = initialV;
  let totalH = initialH;
  let totalCleared = initialCleared;
  let loopResult = result;
  let firstCascade = true;

  while (loopResult.combos > 0) {
    currentBoard = applyGravity(currentBoard, loopResult.toClearMap);

    if (firstCascade) {
      currentBoard = unlockN2Board(currentBoard);
      firstCascade = false;
    }

    loopResult = findMatches(currentBoard, "skyfall", ruleCtx);

    if (loopResult.combos > 0) {
      totalCombos += loopResult.combos;
      totalV += loopResult.vC;
      totalH += loopResult.hC;
      totalCleared += loopResult.clearedCount;
    }
  }

  return {
    combos: totalCombos,
    initialCombos,
    skyfallCombos: totalCombos - initialCombos,
    clearedCount: totalCleared,
    initialClearedCount: initialCleared,
    verticalCombos: totalV,
    horizontalCombos: totalH,

    // ??multi-special helper 銝餉????文?敶Ｚ?閮?
    initialPatternCounts,
    initialComboCountsByOrb,
    initialComboSizeCountsByOrb,

    // 靽? alias
    patternCounts: initialPatternCounts,
    comboCountsByOrb: initialComboCountsByOrb,
    comboSizeCountsByOrb: initialComboSizeCountsByOrb,
  };
};
const getBoardKey = (b) => {
  // 兩個 32-bit hash 組成固定長度字串 key，避免 BigInt toString 開銷
  let h1 = 2166136261 >>> 0; // FNV-ish
  let h2 = 16777619 >>> 0;

  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = b[r];
    for (let c = 0; c < COLS; c++) {
      const x = (row[c] + 11) ^ ((r + 1) * 131) ^ ((c + 1) * 257);

      h1 ^= x & 0xff;
      h1 = Math.imul(h1, 16777619) >>> 0;

      h2 += x | 0;
      h2 = (h2 ^ (h2 >>> 16)) >>> 0;
      h2 = Math.imul(h2, 2246822507) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
      h2 = Math.imul(h2, 3266489909) >>> 0;
      h2 = (h2 ^ (h2 >>> 16)) >>> 0;
    }
    h1 ^= 0x9e;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= 0x85ebca6b;
    h2 = Math.imul(h2, 2246822507) >>> 0;
  }

  return (
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0")
  );
};
const calcScore = (
  ev,
  pot,
  pathLen,
  cfg,
  target,
  mode,
  priority,
  specialPriorities,
  violatesN2 = false,
  extraCtx = {}
) => {
  const major = mode === "vertical" ? ev.verticalCombos : ev.horizontalCombos;
  const normalizedSpecials = normalizeSpecialPriorityList(specialPriorities);
  const hasSpecial = normalizedSpecials.length > 0;

  const over = Math.max(0, ev.combos - target);
  const overPenalty = over * over * 600000;
  const effectiveStepPenalty =
    priority === "steps" ? cfg.stepPenalty * 4 : cfg.stepPenalty;
  const clearedW = priority === "combo" ? 1000 : 200;
  const illegalPenalty = violatesN2 ? 2200000 : 0;

  // =========================
  // ?∠?芸?嚗??????
  // =========================
  if (!hasSpecial) {
    if (ev.combos >= target) {
      const stepCost = pathLen * effectiveStepPenalty;
      return (
        5200000 -
        stepCost -
        overPenalty +
        ev.clearedCount * clearedW -
        illegalPenalty
      );
    }

    const miss = target - ev.combos;
    const missPenalty = -(miss * miss * 320000);
    const nearBonus =
      (target - miss) * 50000 +
      (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);

    const t = Math.max(0, 1 - miss / Math.max(1, target));
    const majorBonus = major * (1200000 * t * t);
    const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
    const stepSoft = pathLen * 35;
    const clearedBonus = ev.clearedCount * clearedW;

    return (
      missPenalty +
      nearBonus +
      majorBonus +
      pot * potWeight +
      clearedBonus -
      stepSoft -
      illegalPenalty
    );
  }

  // =========================
  // ??芸?嚗??multi-special
  // =========================
  const specialTuple = getSpecialPriorityTuple(ev, normalizedSpecials, extraCtx);
  const specialScore = specialPriorityTupleToScore(specialTuple);

  if (ev.combos >= target) {
    const stepCost = pathLen * effectiveStepPenalty;
    return (
      specialScore +
      5200000 -
      stepCost -
      overPenalty +
      ev.clearedCount * clearedW -
      illegalPenalty
    );
  }

  const miss = target - ev.combos;
  const missPenalty = -(miss * miss * 320000);
  const nearBonus =
    (target - miss) * 50000 +
    (miss <= 4 ? (5 - miss) * (miss <= 2 ? 260000 : 120000) : 0);

  const t = Math.max(0, 1 - miss / Math.max(1, target));
  const majorBonus = major * (1200000 * t * t);
  const potWeight = cfg.potentialWeight * (0.08 + 0.92 * t * t);
  const stepSoft = pathLen * 35;
  const clearedBonus = ev.clearedCount * clearedW;

  return (
    specialScore +
    missPenalty +
    nearBonus +
    majorBonus +
    pot * potWeight +
    clearedBonus -
    stepSoft -
    illegalPenalty
  );
};

const sumSpecialDoneFromTuple = (tuple = []) => {
  let s = 0;
  for (let i = 0; i < tuple.length; i += 2) s += Number(tuple[i] || 0);
  return s;
};

const sumSpecialGuideFromTuple = (tuple = []) => {
  let s = 0;
  for (let i = 1; i < tuple.length; i += 2) s += Number(tuple[i] || 0);
  return s;
};

const yieldToBrowser = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const compileSpecialPriorityList = (specialPriority) => {
  const raw = normalizeSpecialPriorityList(specialPriority);

  return raw.map((sp) => {
    const type = sp.type;

    if (type === "rect") {
      const m = Number(sp.rectM) || 3;
      const n = Number(sp.rectN) || 3;
      const rectOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

      return {
        ...sp,
        type,
        m,
        n,
        rectKey: `${m}x${n}`,
        rectOrb,
      };
    }

    if (type === "equalFirst") {
      return {
        ...sp,
        type,
        selectedOrbs: normalizeSelectedEqualOrbs(sp.equalOrbs),
      };
    }

    if (type === "clearCount") {
      return {
        ...sp,
        type,
        clearCountValue: Number(sp.clearCount) || 0,
      };
    }

    return {
      ...sp,
      type,
      countValue: Number(sp.count) || 1,
      orbValue: sp.orb ?? SPECIAL_ORB_ANY,
    };
  });
};

const getSingleSpecialMatchedValueCompiled = (ev, sp) => {
  if (!sp || sp.type === "none") return 0;

  switch (sp.type) {
    case "clearCount":
      return ev.initialClearedCount || 0;

    case "equalFirst": {
      const selected = sp.selectedOrbs || [];
      if (selected.length === 0) return 0;

      const counts = ev.initialComboCountsByOrb;
      if (!counts) return 0;

      const vals = selected.map((orb) => counts[orb] || 0);
      const first = vals[0] || 0;
      if (first <= 0) return 0;

      for (let i = 1; i < vals.length; i++) {
        if (vals[i] !== first) return 0;
      }
      return first;
    }

    case "rect": {
      const group = ev.initialPatternCounts?.rect?.[sp.rectKey];
      if (!group) return 0;

      if (sp.rectOrb === SPECIAL_ORB_ANY || sp.rectOrb === -1) {
        return group.total || 0;
      }
      return group.byOrb?.[sp.rectOrb] || 0;
    }

    default: {
      const group = ev.initialPatternCounts?.[sp.type];
      if (!group) return 0;

      if (sp.orbValue === SPECIAL_ORB_ANY) return group.total || 0;
      return group.byOrb?.[sp.orbValue] || 0;
    }
  }
};

const isSingleSpecialSatisfiedCompiled = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return true;

  const initCleared = Number(
    extraCtx?.initialClearedCount ??
      ev?.initialClearedCount ??
      ev?.initClearedCount ??
      ev?.initialCleared ??
      0
  );

  const wantClearCount = Number(
    sp?.clearCountValue ??
      sp?.clearCount ??
      sp?.countValue ??
      sp?.count ??
      0
  );

  switch (sp.type) {
    case "clearCount":
      return initCleared === wantClearCount;

    case "equalFirst":
      return getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) > 0;

    case "rect":
      return getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) >= 1;

    default:
      return (
        getSingleSpecialMatchedValueCompiled(ev, sp, extraCtx) >=
        Number(sp?.countValue ?? sp?.count ?? 1)
      );
  }
};

const isAllSpecialSatisfiedCompiled = (ev, compiledSpecials = [], extraCtx = {}) => {
  for (let i = 0; i < compiledSpecials.length; i++) {
    if (!isSingleSpecialSatisfiedCompiled(ev, compiledSpecials[i], extraCtx)) {
      return false;
    }
  }
  return true;
};

const getSingleSpecialProgressCompiled = (ev, sp, extraCtx = {}) => {
  if (!sp || sp.type === "none") return { done: 1, guide: 0 };

  const getInitCleared = () =>
    Number(
      extraCtx?.initialClearedCount ??
        ev?.initialClearedCount ??
        ev?.initClearedCount ??
        ev?.initialCleared ??
        0
    );

  const getInitComboCountsByOrb = () =>
    extraCtx?.initialComboCountsByOrb ??
    ev?.initialComboCountsByOrb ??
    ev?.initComboCountsByOrb ??
    null;

  const getClearCountWant = () =>
    Number(
      sp?.clearCountValue ??
        sp?.clearCount ??
        sp?.countValue ??
        sp?.count ??
        0
    );

  const getSelectedOrbs = () =>
    sp?.selectedOrbs ??
    sp?.equalOrbs ??
    [];

  switch (sp.type) {
    case "rect":
      return {
        done: isSingleSpecialSatisfiedCompiled(ev, sp, extraCtx) ? 1 : 0,
        guide: extraCtx?.rectGuide || 0,
      };

    case "clearCount": {
      const got = getInitCleared();
      const want = getClearCountWant();
      const diff = Math.abs(got - want);

      return {
        done: got === want ? 1 : 0,
        guide: 100000 - diff * 1000 - Math.max(0, got - want) * 10,
      };
    }

    case "equalFirst": {
      const selected = getSelectedOrbs();
      if (!selected || selected.length === 0) return { done: 0, guide: 0 };

      const counts = getInitComboCountsByOrb();
      if (!counts) return { done: 0, guide: 0 };

      const vals = selected.map((orb) => Number(counts[orb] || 0));
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const diff = maxV - minV;

      return {
        done: minV > 0 && diff === 0 ? 1 : 0,
        guide: minV * 1000 - diff * 300,
      };
    }

    default: {
      const got = getSingleSpecialMatchedValueCompiled(ev, sp);
      const want = Number(sp?.countValue ?? sp?.count ?? 1);

      return {
        done: got >= want ? 1 : 0,
        guide: Math.min(got, want) * 1000 - Math.max(0, want - got) * 200,
      };
    }
  }
};

const getSpecialPriorityTupleCompiled = (ev, compiledSpecials = [], extraCtx = {}) => {
  const tuple = new Array(compiledSpecials.length * 2);
  let k = 0;

  for (let i = 0; i < compiledSpecials.length; i++) {
    const p = getSingleSpecialProgressCompiled(ev, compiledSpecials[i], extraCtx);
    tuple[k++] = p.done;
    tuple[k++] = p.guide;
  }

  return tuple;
};

const getCheapRectGuideScoreFromCompiledSpecialList = (
  board,
  compiledSpecials = [],
  phase = "initial"
) => {
  let best = 0;

  for (let i = 0; i < compiledSpecials.length; i++) {
    const sp = compiledSpecials[i];
    if (sp.type !== "rect") continue;

    const s = getCheapRectGuideScoreBySpecial(board, sp, phase);
    if (s > best) best = s;
  }

  return best;
};

// ?詨?頝臬?閫??嚗eam Search嚗???combo/步數/?孵???豢??豢?雿唾楝敺?// Beam 銝餅?蝔?展開?????摨??豢?雿唾楝敺?
const beamSolve = async (
  originalBoard,
  cfg,
  target,
  mode,
  priority,
  skyfall,
  diagonal,
  specialPriority,
  initTargetCombo,
  autoRow0Expanded,
  ruleProfile,
  onProgress = null
) => {
  const useRow0 = !!autoRow0Expanded;

  const compiledSpecials = compileSpecialPriorityList(specialPriority);
  const hasSpecial = compiledSpecials.length > 0;
  const hasRectSpecial = compiledSpecials.some((sp) => sp.type === "rect");

  const hasInitClearCountSpecial = compiledSpecials.some(
    (sp) =>
      sp &&
      (sp.type === "clearCount" ||
        sp.type === "initClearCount" ||
        sp.type === "firstClearCount")
  );

  const hasInitEqualSpecial = compiledSpecials.some(
    (sp) =>
      sp &&
      (sp.type === "same" ||
        sp.type === "equal" ||
        sp.type === "sameSize" ||
        sp.type === "initEqual" ||
        sp.type === "firstEqual")
  );

  const hasInitSensitiveSpecial =
    hasInitClearCountSpecial || hasInitEqualSpecial;

  const ruleRuntimeCtx = getRuleRuntimeContext(ruleProfile);
  const normalizedRuleProfile = ruleRuntimeCtx.profile;
  const compiledRuleRequirements = normalizedRuleProfile.requirements.map(
    (req) => ({
      orb: clampIntRange(req.orb, 0, 5, 0),
      size: clampIntRange(req.size, 1, 5, 3),
      count: Math.max(1, clampIntRange(req.count, 1, 999, 1)),
      match: req.match === "atLeast" ? "atLeast" : "exact",
    })
  );
  const hasRuleRequirements = compiledRuleRequirements.length > 0;
  const EMPTY_REQUIREMENT_TUPLE = [];

  const getRuleRequirementTuple = (ev) => {
    if (!hasRuleRequirements) return EMPTY_REQUIREMENT_TUPLE;

    let allDone = 1;
    let totalDone = 0;
    let totalMissing = 0;
    const tuple = [];
    const countsByOrb = ev?.initialComboSizeCountsByOrb;

    for (const req of compiledRuleRequirements) {
      const got = Number(countsByOrb?.[req.orb]?.[String(req.size)] || 0);
      const distance =
        req.match === "atLeast"
          ? Math.max(0, req.count - got)
          : Math.abs(req.count - got);
      const done = distance === 0 ? 1 : 0;

      if (!done) allDone = 0;
      totalDone += Math.min(got, req.count);
      totalMissing += distance;
      tuple.push(done, -distance, Math.min(got, req.count));
    }

    return [allDone, totalDone, -totalMissing, ...tuple];
  };

  const isRuleRequirementSatisfied = (ev) => {
    if (!hasRuleRequirements) return true;
    const countsByOrb = ev?.initialComboSizeCountsByOrb;
    for (const req of compiledRuleRequirements) {
      const got = Number(countsByOrb?.[req.orb]?.[String(req.size)] || 0);
      if (req.match === "atLeast") {
        if (got < req.count) return false;
      } else if (got !== req.count) {
        return false;
      }
    }
    return true;
  };

  const dirsPlay = diagonal ? DIRS_8 : DIRS_4;
  const maxNodesEffective = cfg.maxNodes;
  const baseBeamWidth = Math.max(32, Number(cfg.beamWidth) || 32);
  const requestedEvalWorkers = Math.max(1, Number(cfg.evalWorkers) || 1);
  const maxHwWorkers =
    typeof navigator !== "undefined" && Number(navigator.hardwareConcurrency) > 0
      ? Number(navigator.hardwareConcurrency)
      : 1;
  const evalWorkerCount = Math.min(requestedEvalWorkers, maxHwWorkers);
  const enableParallelEval =
    evalWorkerCount > 1 && typeof Worker !== "undefined";
  const hasMarkedBoardCells = originalBoard.some((row) =>
    row.some(
      (cell) =>
        xMarkOf(cell) !== 0 || qMarkOf(cell) !== 0 || nMarkOf(cell) !== 0
    )
  );
  const hasNonStandardMinClear = ruleRuntimeCtx.minClearByOrb.some(
    (minClear) => minClear !== 3
  );
  const REVERSE_PLAN_ENABLED =
    cfg.reversePlanner !== false &&
    !useRow0 &&
    !hasMarkedBoardCells &&
    !hasSpecial &&
    !hasRuleRequirements &&
    !hasNonStandardMinClear;
  const REVERSE_MAX_STEPS = Math.max(
    1,
    Math.min(60, Math.floor(Number(cfg.reverseMaxSteps) || 60))
  );
  const configuredMaxSteps = Math.max(
    1,
    Math.floor(Number(cfg.maxSteps) || 1)
  );
  const hardStepLimitEnabled = cfg.hardStepLimitEnabled === true;
  const hardStepLimit = Math.max(
    1,
    Math.min(250, Math.floor(Number(cfg.hardStepLimit) || 1))
  );
  const solverMaxSteps = hardStepLimitEnabled
    ? Math.min(configuredMaxSteps, hardStepLimit)
    : configuredMaxSteps;
  const REVERSE_TARGET_LIMIT = REVERSE_PLAN_ENABLED ? 10 : 0;
  const DEFER_MOVE_MATERIALIZATION =
    cfg.deferMoveMaterialization !== false;
  const CHEAP_EVAL_SCALE = Math.max(
    1,
    Number(cfg.cheapEvalScale) || 3.8
  );
  const CHEAP_EVAL_CONSTRAINT_SCALE = Math.max(
    1,
    Number(cfg.cheapEvalConstraintScale) || 4.6
  );
  const CHEAP_LOCAL_GUIDANCE =
    cfg.cheapLocalGuidance === true && priority !== "steps";
  const rawCheapLegacyReserve = Number(cfg.cheapLegacyReserve);
  const CHEAP_LEGACY_RESERVE = Math.max(
    0,
    Math.min(
      0.6,
      Number.isFinite(rawCheapLegacyReserve) ? rawCheapLegacyReserve : 0.25
    )
  );
  const SHOULD_YIELD_TO_BROWSER = cfg.browserYield !== false;
  const boardSeed = Number.parseInt(getBoardKey(originalBoard).slice(0, 8), 16);
  let searchRandomState =
    ((Number(cfg.searchSeed) >>> 0) ^ (boardSeed >>> 0) ^ 0x9e3779b9) >>> 0;
  if (searchRandomState === 0) searchRandomState = 0x6d2b79f5;
  const searchRandom = () => {
    searchRandomState ^= searchRandomState << 13;
    searchRandomState ^= searchRandomState >>> 17;
    searchRandomState ^= searchRandomState << 5;
    return (searchRandomState >>> 0) / 4294967296;
  };

  const IS_STEP_MODE = priority === "steps";
  const IS_COMBO_MODE = priority !== "steps";

  const getCheapTerminalMovePotential = (state, nr, nc) => {
    if (!state?.board) return 0;

    const destVal = state.board[nr]?.[nc];
    if (!Number.isFinite(destVal) || destVal < 0) return 0;

    const holeR = state.hole?.r ?? -1;
    const holeC = state.hole?.c ?? -1;
    const enteringFromRow0 = state.r === 0;
    const virtualCell = (r, c) => {
      if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
        return -1;
      }
      if (r === nr && c === nc) return state.held;
      if (!enteringFromRow0 && r === holeR && c === holeC) return destVal;
      return state.board[r][c];
    };
    const scoreCell = (r, c) => {
      if (r < PLAY_ROWS_START || r >= TOTAL_ROWS || c < 0 || c >= COLS) {
        return 0;
      }
      const orb = getOrbForMatchPhase(virtualCell(r, c), "initial");
      if (orb < 0) return 0;

      let score = 0;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        let run = 1;
        for (const sign of [-1, 1]) {
          let rr = r + dr * sign;
          let cc = c + dc * sign;
          while (
            rr >= PLAY_ROWS_START &&
            rr < TOTAL_ROWS &&
            cc >= 0 &&
            cc < COLS &&
            getOrbForMatchPhase(virtualCell(rr, cc), "initial") === orb
          ) {
            run++;
            rr += dr * sign;
            cc += dc * sign;
          }
        }
        if (run >= 3) score += 360 + (run - 3) * 90;
        else if (run === 2) score += 55;
      }
      return score;
    };

    let score = scoreCell(nr, nc);
    if (!enteringFromRow0 && (holeR !== nr || holeC !== nc)) {
      score += scoreCell(holeR, holeC);
    }
    return score;
  };

  // Progressive beam schedule: early fast -> middle balanced -> late wider.
  const beamSchedule = (() => {
    const w3 = baseBeamWidth;
    const w2 = Math.max(48, Math.min(w3, Math.round(w3 * 0.7)));
    const w1 = Math.max(32, Math.min(w2, Math.round(w3 * 0.4), 200));
    return [w1, w2, w3];
  })();

  const getAdaptiveBeamWidth = (step, maxSteps, stagnantRounds, diversityRatio) => {
    const p = maxSteps <= 1 ? 1 : step / Math.max(1, maxSteps - 1);
    let tier = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;

    if (stagnantRounds >= 2) tier = Math.min(2, tier + 1);
    if (diversityRatio < 0.35) tier = Math.min(2, tier + 1);

    return beamSchedule[tier];
  };

  const getNodeDirectionSignature = (node, maxEdges = 6) => {
    if (!node) return "none";
    const parts = [];
    let cur = node;
    let cnt = 0;

    while (cur && cur.parent && cnt < maxEdges) {
      const dr = cur.r - cur.parent.r;
      const dc = cur.c - cur.parent.c;
      parts.push(`${dr},${dc}`);
      cur = cur.parent;
      cnt++;
    }

    return parts.reverse().join("|") || "none";
  };

  const getMoveCheapScore = (state, nr, nc, nextLocked, step) => {
    let s = 0;
    const ev = state?.ev || {};

    s += (ev.initialCombos || 0) * 120;
    s += (ev.combos || 0) * 80;
    s += (ev.clearedCount || 0) * 8;
    s -= (ev.initialComboDistance || 0) * 70;
    s -= nextLocked ? 220 : 0;
    if (q2Pos) {
      const d = Math.abs(nr - q2Pos.r) + Math.abs(nc - q2Pos.c);
      s -= d * 16;
    }

    if (HUMAN_PLAN_ENABLED && state?.humanPlan) {
      s += getHumanCheapMoveBias(
        state.humanPlan,
        makeHumanMoveCtx(state.r, state.c, nr, nc, "cheap")
      );
    }

    // Small step bias: earlier layers keep slightly broader exploration.
    s -= step * 0.15;

    return s;
  };

  const getGuidedMoveCheapScore = (
    state,
    nr,
    nc,
    nextLocked,
    step
  ) =>
    getMoveCheapScore(state, nr, nc, nextLocked, step) +
    (CHEAP_LOCAL_GUIDANCE
      ? getCheapTerminalMovePotential(state, nr, nc)
      : 0);

  const pickCheapTopMoves = (moves, limit, perSigCap = 2) => {
    if (!Array.isArray(moves) || moves.length === 0) return [];
    const sorted = [...moves].sort((a, b) => b.cheapScore - a.cheapScore);
    const out = [];
    const sigCount = new Map();

    for (let i = 0; i < sorted.length && out.length < limit; i++) {
      const mv = sorted[i];
      const sig = mv.cheapSig || "none";
      const used = sigCount.get(sig) || 0;
      if (used >= perSigCap) continue;
      sigCount.set(sig, used + 1);
      out.push(mv);
    }

    // Exploration tail: keep a tiny random slice if room remains.
    if (out.length < limit && sorted.length > out.length) {
      for (let i = 0; i < sorted.length && out.length < limit; i++) {
        const mv = sorted[i];
        if (out.includes(mv)) continue;
        if (searchRandom() < 0.03) out.push(mv);
      }
    }

    return out;
  };

  const depthMilestones = (() => {
    const maxSteps = solverMaxSteps;
    const d1 = Math.max(1, Math.min(maxSteps, Math.ceil(maxSteps * 0.35)));
    const d2 = Math.max(d1, Math.min(maxSteps, Math.ceil(maxSteps * 0.7)));

    return Array.from(new Set([d1, d2, maxSteps])).sort((a, b) => a - b);
  })();

  const getDepthPhaseIndex = (step) => {
    for (let i = 0; i < depthMilestones.length; i++) {
      if (step < depthMilestones[i]) return i;
    }
    return depthMilestones.length - 1;
  };

  const getDepthPhaseBeamScale = (phaseIdx) => {
    if (depthMilestones.length <= 1) return 1;
    if (phaseIdx <= 0) return 0.55;
    if (phaseIdx === 1 && depthMilestones.length >= 3) return 0.78;
    return 1;
  };

  const getCheapEvalBudget = (
    moveCount,
    beamWidth,
    stagnantRounds,
    specialDriven
  ) => {
    if (moveCount <= 0) return 0;

    let budget = Math.max(
      beamWidth + 48,
      Math.floor(
        beamWidth *
          (priority === "steps"
            ? specialDriven
              ? 4.6
              : 3.8
            : specialDriven
              ? CHEAP_EVAL_CONSTRAINT_SCALE
              : CHEAP_EVAL_SCALE)
      )
    );

    if (stagnantRounds >= 2) budget = Math.floor(budget * 1.35);
    if (stagnantRounds >= 4) budget = Math.floor(budget * 1.2);

    return Math.max(beamWidth, Math.min(moveCount, budget));
  };

  const getStateFamilySignature = (st) =>
    st?.familySig || st?.cheapSig || getNodeDirectionSignature(st?.node);

  const getDiversityRatio = (states) => {
    if (!Array.isArray(states) || states.length === 0) return 1;
    const uniq = new Set();
    for (const st of states) uniq.add(getStateFamilySignature(st));
    return uniq.size / states.length;
  };

  const SEARCH_PROFILE = IS_STEP_MODE
    ? {
        initComboBonus: 320000,
        initClearedBonus: 125000,
        initAllEqualBonus: 2000000,
        initExactBonus: 1800000,
        initTargetPenalty: 780000,
        freeMajorBonus: hasInitSensitiveSpecial ? 150000 : 0,
        hvDiffPenalty: hasInitSensitiveSpecial ? 18000 : 0,
        extraPotentialWeight: 0.05,
        extraStepPenalty: 9000,
        bestStepSlack: 0,
        comboVisitedPrefixLen: 0,
        stepsVisitedSlack: 0,
        comboExploreRegionSkipProb: cfg.beamWidth >= 300 ? 0.82 : 0.74,
        comboMaxTier: 8,
        comboQuotaW: [3.2, 2.3, 1.7, 1.15, 0.8, 0.55, 0.36, 0.24, 0.15],
        stepMaxTier: 8,
      }
    : {
        initComboBonus: 170000,
        initClearedBonus: 70000,
        initAllEqualBonus: 1300000,
        initExactBonus: 900000,
        initTargetPenalty: 260000,
        freeMajorBonus: hasInitSensitiveSpecial ? 90000 : 0,
        hvDiffPenalty: hasInitSensitiveSpecial ? 10000 : 0,
        extraPotentialWeight: 0.3,
        extraStepPenalty: 2200,
        bestStepSlack: 2,
        comboVisitedPrefixLen: hasInitSensitiveSpecial ? 7 : 6,
        stepsVisitedSlack: 2,
        comboExploreRegionSkipProb: cfg.beamWidth >= 300 ? 0.6 : 0.5,
        comboMaxTier: 10,
        comboQuotaW: [2.5, 2.0, 1.6, 1.25, 1.0, 0.8, 0.65, 0.5, 0.38, 0.28, 0.18],
        stepMaxTier: 8,
      };

  const makeNode = (parent, r, c) => ({
    parent,
    r,
    c,
    len: parent ? parent.len + 1 : 1,
  });

  const buildPath = (node) => {
    const out = [];
    for (let cur = node; cur; cur = cur.parent) out.push({ r: cur.r, c: cur.c });
    out.reverse();
    return out;
  };

  const pickCheapPortfolioMoves = (moves, limit) => {
    if (!CHEAP_LOCAL_GUIDANCE || CHEAP_LEGACY_RESERVE <= 0) {
      return pickCheapTopMoves(moves, limit, 2);
    }

    const guidedLimit = Math.max(
      1,
      Math.min(limit, Math.round(limit * (1 - CHEAP_LEGACY_RESERVE)))
    );
    const out = pickCheapTopMoves(moves, guidedLimit, 2);
    const picked = new Set(out);
    const legacySorted = [...moves].sort(
      (a, b) => b.legacyCheapScore - a.legacyCheapScore
    );

    for (const mv of legacySorted) {
      if (out.length >= limit) break;
      if (picked.has(mv)) continue;
      out.push(mv);
      picked.add(mv);
    }

    if (out.length < limit) {
      const guidedSorted = [...moves].sort(
        (a, b) => b.cheapScore - a.cheapScore
      );
      for (const mv of guidedSorted) {
        if (out.length >= limit) break;
        if (picked.has(mv)) continue;
        out.push(mv);
        picked.add(mv);
      }
    }

    return out;
  };

  const stepsOf = (node) => Math.max(0, (node?.len || 0) - 1);

  const toNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  const toIntNonNegative = (v, d = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.max(0, Math.floor(n));
  };

  const STEP_COMBO_SLACK = toIntNonNegative(
    cfg.stepComboSlack ?? cfg.stepSlack,
    1
  );
  const COMBO_STEP_SLACK = toIntNonNegative(
    cfg.comboStepSlack ?? cfg.comboSlack,
    1
  );

  const HUMAN_PLAN_ENABLED = cfg.humanPlanner !== false;
  const HUMAN_TOTAL_PLAY_CELLS = Math.max(
    1,
    (TOTAL_ROWS - PLAY_ROWS_START) * COLS
  );
  const HUMAN_MAX_LOCKED_GROUPS = Math.max(
    1,
    Math.min(12, Math.max(Number(target) || 1, Number(initTargetCombo) || 1))
  );
  const HUMAN_GROUP_MATCH_MIN_SCORE = 90;
  const HUMAN_RECOVERY_GRACE_STEPS = 2;

  const humanCellId = (r, c) => r * COLS + c;

  const humanCellIdsInclude = (ids, id) => {
    if (!Array.isArray(ids)) return false;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === id) return true;
    }
    return false;
  };

  const countHumanCellOverlap = (aIds, bIds) => {
    if (!Array.isArray(aIds) || !Array.isArray(bIds)) return 0;
    let i = 0;
    let j = 0;
    let count = 0;

    while (i < aIds.length && j < bIds.length) {
      const a = aIds[i];
      const b = bIds[j];
      if (a === b) {
        count++;
        i++;
        j++;
      } else if (a < b) {
        i++;
      } else {
        j++;
      }
    }

    return count;
  };

  const normalizeHumanGroup = (rawGroup, id = "", lockedAtStep = 0) => {
    if (
      rawGroup &&
      Array.isArray(rawGroup.cellIds) &&
      rawGroup.cellIds.length >= 3 &&
      typeof rawGroup.cellMask === "string" &&
      typeof rawGroup.relKey === "string"
    ) {
      return {
        id,
        orb: clampIntRange(rawGroup.orb, 0, 7, 0),
        size: rawGroup.size || rawGroup.cellIds.length,
        cellIds: rawGroup.cellIds,
        cellMask: rawGroup.cellMask,
        relKey: rawGroup.relKey,
        minR: rawGroup.minR,
        maxR: rawGroup.maxR,
        minC: rawGroup.minC,
        maxC: rawGroup.maxC,
        centerR2: rawGroup.centerR2,
        centerC2: rawGroup.centerC2,
        hasH: !!rawGroup.hasH,
        hasV: !!rawGroup.hasV,
        shape: rawGroup.shape || null,
        lockedAtStep,
        missingAge: 0,
        carryAge: 0,
      };
    }

    if (!rawGroup || !Array.isArray(rawGroup.cells)) return null;

    const cells = [];
    for (const cell of rawGroup.cells) {
      if (!Array.isArray(cell) || cell.length < 2) continue;
      const r = Number(cell[0]);
      const c = Number(cell[1]);
      if (
        !Number.isInteger(r) ||
        !Number.isInteger(c) ||
        r < PLAY_ROWS_START ||
        r >= TOTAL_ROWS ||
        c < 0 ||
        c >= COLS
      ) {
        continue;
      }
      cells.push([r, c]);
    }

    if (cells.length < 3) return null;

    cells.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    for (const [r, c] of cells) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }

    const cellIds = cells.map(([r, c]) => humanCellId(r, c)).sort((a, b) => a - b);
    const relKey = cells
      .map(([r, c]) => `${r - minR},${c - minC}`)
      .sort()
      .join("|");
    const cellMask = cellIds.join(".");
    const orb = clampIntRange(rawGroup.orb, 0, 7, 0);

    return {
      id,
      orb,
      size: cells.length,
      cells,
      cellIds,
      cellMask,
      relKey,
      minR,
      maxR,
      minC,
      maxC,
      centerR2: minR + maxR,
      centerC2: minC + maxC,
      hasH: !!rawGroup.hasH,
      hasV: !!rawGroup.hasV,
      shape: rawGroup.shape || null,
      lockedAtStep,
      missingAge: 0,
      carryAge: 0,
    };
  };

  const scoreHumanGroupBuild = (group) => {
    if (!group) return -Infinity;

    const width = group.maxC - group.minC + 1;
    const height = group.maxR - group.minR + 1;
    const area = width * height;
    let score = 0;

    score += group.size === 3 ? 130 : Math.min(group.size, 8) * 20;
    score -= Math.max(0, group.size - 3) * 8;
    score -= Math.max(0, area - group.size) * 12;
    score += (group.maxR - PLAY_ROWS_START) * 13;
    score += group.maxR === TOTAL_ROWS - 1 ? 18 : 0;
    score += group.minC === 0 || group.maxC === COLS - 1 ? 10 : 0;

    if (mode === "vertical") {
      score += group.hasV ? 30 : 0;
      score += height * 3;
    } else if (mode === "horizontal") {
      score += group.hasH ? 30 : 0;
      score += width * 3;
    } else {
      score += group.hasH || group.hasV ? 18 : 0;
    }

    if (group.shape) score += 16;
    return score;
  };

  const getInitialHumanGroups = (initial) => {
    if (!HUMAN_PLAN_ENABLED || !Array.isArray(initial?.groups)) return [];

    const groups = [];
    for (let i = 0; i < initial.groups.length; i++) {
      const group = normalizeHumanGroup(initial.groups[i], "", 0);
      if (!group) continue;
      group.buildScore = scoreHumanGroupBuild(group);
      groups.push(group);
    }

    groups.sort((a, b) => b.buildScore - a.buildScore);
    return groups;
  };

  const scoreHumanGroupMatch = (locked, candidate) => {
    if (!locked || !candidate || locked.orb !== candidate.orb) return -Infinity;

    const overlap = countHumanCellOverlap(locked.cellIds, candidate.cellIds);
    const sameShape = locked.relKey === candidate.relKey;
    const sameCells = locked.cellMask === candidate.cellMask;
    const sizeDiff = Math.abs((locked.size || 0) - (candidate.size || 0));
    const dist2 =
      Math.abs((locked.centerR2 || 0) - (candidate.centerR2 || 0)) +
      Math.abs((locked.centerC2 || 0) - (candidate.centerC2 || 0));

    let score = overlap * 58;
    if (sameShape) score += 150;
    if (sameCells) score += 120;
    if (locked.shape && locked.shape === candidate.shape) score += 24;
    if (overlap >= Math.min(3, locked.size || 0, candidate.size || 0)) {
      score += 56;
    }
    score -= sizeDiff * 18;
    score -= dist2 * 10;

    return score;
  };

  const makeHumanGroupId = (group, steps) =>
    `${steps}:${group.orb}:${group.relKey}:${group.cellMask}`;

  const matchHumanLockedGroups = (previousGroups, currentGroups, steps) => {
    const usedCurrent = new Set();
    const nextGroups = [];
    const metrics = {
      preserved: 0,
      moved: 0,
      damaged: 0,
      dropped: 0,
    };

    for (const locked of previousGroups || []) {
      if (!locked) continue;

      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < currentGroups.length; i++) {
        if (usedCurrent.has(i)) continue;
        const score = scoreHumanGroupMatch(locked, currentGroups[i]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0 && bestScore >= HUMAN_GROUP_MATCH_MIN_SCORE) {
        const matched = currentGroups[bestIdx];
        const moved = matched.cellMask !== locked.cellMask;
        usedCurrent.add(bestIdx);
        nextGroups.push({
          ...matched,
          id: locked.id || makeHumanGroupId(matched, steps),
          lockedAtStep: locked.lockedAtStep ?? steps,
          missingAge: 0,
          carryAge: moved ? Math.min(99, (locked.carryAge || 0) + 1) : 0,
          matchScore: bestScore,
        });
        metrics.preserved++;
        if (moved) metrics.moved++;
        continue;
      }

      const missingAge = Math.min(99, (locked.missingAge || 0) + 1);
      metrics.damaged++;

      if (missingAge <= HUMAN_RECOVERY_GRACE_STEPS) {
        nextGroups.push({
          ...locked,
          missingAge,
          carryAge: Math.min(99, (locked.carryAge || 0) + 1),
        });
      } else {
        metrics.dropped++;
      }
    }

    return { groups: nextGroups, usedCurrent, metrics };
  };

  const humanGroupOverlapsAny = (group, groups) => {
    for (const other of groups || []) {
      if (!other || other.missingAge > 0) continue;
      if (countHumanCellOverlap(group.cellIds, other.cellIds) > 0) return true;
    }
    return false;
  };

  const pickNewHumanGroups = (
    currentGroups,
    usedCurrent,
    lockedGroups,
    steps,
    limit
  ) => {
    if (limit <= 0) return [];

    const out = [];
    const existing = lockedGroups || [];

    for (let i = 0; i < currentGroups.length && out.length < limit; i++) {
      if (usedCurrent.has(i)) continue;
      const group = currentGroups[i];
      if (!group || group.size < 3) continue;
      if (humanGroupOverlapsAny(group, existing)) continue;
      if (humanGroupOverlapsAny(group, out)) continue;

      out.push({
        ...group,
        id: makeHumanGroupId(group, steps),
        lockedAtStep: steps,
        missingAge: 0,
        carryAge: 0,
      });
    }

    return out;
  };

  const collectHumanProtectedCellIds = (groups) => {
    const set = new Set();
    for (const group of groups || []) {
      if (!group || group.missingAge > 0) continue;
      for (const id of group.cellIds || []) set.add(id);
    }
    return [...set].sort((a, b) => a - b);
  };

  const makeHumanMoveCtx = (fromR, fromC, toR, toC, kind = "move") => ({
    fromR,
    fromC,
    toR,
    toC,
    fromId:
      Number.isInteger(fromR) && Number.isInteger(fromC)
        ? humanCellId(fromR, fromC)
        : -1,
    toId:
      Number.isInteger(toR) && Number.isInteger(toC)
        ? humanCellId(toR, toC)
        : -1,
    kind,
  });

  const countHumanProtectedMoveTouches = (plan, moveCtx) => {
    if (!plan || !moveCtx || !Array.isArray(plan.protectedCellIds)) return 0;
    const seen = new Set();
    if (moveCtx.fromId >= 0) seen.add(moveCtx.fromId);
    if (moveCtx.toId >= 0) seen.add(moveCtx.toId);

    let touches = 0;
    for (const id of seen) {
      if (humanCellIdsInclude(plan.protectedCellIds, id)) touches++;
    }
    return touches;
  };

  const buildHumanPlanSignature = (lockedGroups, protectedCellIds) => {
    const groupPart = (lockedGroups || [])
      .map(
        (group) =>
          `${group.orb}:${group.relKey}:${group.cellMask}:${group.missingAge || 0}`
      )
      .sort()
      .join(";");
    return `${protectedCellIds.join(".")}|${groupPart}`;
  };

  const advanceHumanPlan = (parentPlan, initial, moveCtx, steps) => {
    const currentGroups = getInitialHumanGroups(initial);
    const previousGroups = Array.isArray(parentPlan?.lockedGroups)
      ? parentPlan.lockedGroups
      : [];
    const matched = matchHumanLockedGroups(previousGroups, currentGroups, steps);
    const presentBeforeAdd = matched.groups.filter(
      (group) => group && group.missingAge <= 0
    ).length;
    const addLimit = Math.max(
      0,
      Math.min(
        previousGroups.length === 0 ? 2 : 1,
        HUMAN_MAX_LOCKED_GROUPS - presentBeforeAdd
      )
    );
    const newGroups = pickNewHumanGroups(
      currentGroups,
      matched.usedCurrent,
      matched.groups,
      steps,
      addLimit
    );
    let lockedGroups = [...matched.groups, ...newGroups];

    lockedGroups.sort((a, b) => {
      const am = a.missingAge || 0;
      const bm = b.missingAge || 0;
      if (am !== bm) return am - bm;
      const al = a.lockedAtStep ?? 0;
      const bl = b.lockedAtStep ?? 0;
      if (al !== bl) return al - bl;
      return (b.buildScore || 0) - (a.buildScore || 0);
    });

    if (lockedGroups.length > HUMAN_MAX_LOCKED_GROUPS) {
      lockedGroups = lockedGroups.slice(0, HUMAN_MAX_LOCKED_GROUPS);
    }

    const protectedCellIds = collectHumanProtectedCellIds(lockedGroups);
    const presentCount = lockedGroups.filter(
      (group) => group && group.missingAge <= 0
    ).length;
    const missingCount = lockedGroups.length - presentCount;
    const protectedTouches = countHumanProtectedMoveTouches(parentPlan, moveCtx);
    const toProtected =
      moveCtx?.toId >= 0 &&
      humanCellIdsInclude(parentPlan?.protectedCellIds, moveCtx.toId);
    const activeCells = Math.max(
      0,
      HUMAN_TOTAL_PLAY_CELLS - protectedCellIds.length
    );

    let scoreBias = 0;
    scoreBias += presentCount * 115000;
    scoreBias += newGroups.length * 165000;
    scoreBias += matched.metrics.preserved * 46000;
    scoreBias += matched.metrics.moved * 42000;
    scoreBias += Math.min(18, protectedCellIds.length) * 8500;
    scoreBias -= missingCount * 170000;
    scoreBias -= matched.metrics.damaged * 210000;
    scoreBias -= matched.metrics.dropped * 340000;

    if (protectedTouches > 0) {
      const brokeGroup = matched.metrics.damaged > 0 || missingCount > 0;
      scoreBias -= protectedTouches * (brokeGroup ? 230000 : 52000);
      if (!brokeGroup && matched.metrics.moved > 0) scoreBias += 76000;
    } else if (presentCount > 0 && moveCtx) {
      scoreBias += Math.min(72000, presentCount * 13000);
    }

    if (toProtected) scoreBias -= 42000;

    const rankTuple = [
      presentCount,
      -missingCount,
      newGroups.length,
      matched.metrics.preserved,
      matched.metrics.moved,
      -protectedTouches,
      protectedCellIds.length,
      -activeCells,
      Math.floor(scoreBias / 1000),
    ];
    const sig = buildHumanPlanSignature(lockedGroups, protectedCellIds);

    return {
      lockedGroups,
      protectedCellIds,
      presentCount,
      missingCount,
      activeCells,
      protectedTouches,
      scoreBias,
      rankTuple,
      searchSig: sig || "empty",
      familySig: `${presentCount}:${missingCount}:${protectedCellIds.join(".")}`,
    };
  };

  const applyHumanPlanToEvalResult = (
    res,
    parentHumanPlan,
    moveCtx,
    steps
  ) => {
    if (!res) return null;
    if (!HUMAN_PLAN_ENABLED) return { ...res, humanPlan: null };

    const humanPlan = advanceHumanPlan(
      parentHumanPlan,
      res.extraCtx?.initial,
      moveCtx,
      steps
    );
    const ev = {
      ...res.ev,
      humanLockedGroups: humanPlan.presentCount,
      humanProtectedCells: humanPlan.protectedCellIds.length,
      humanPlanScore: humanPlan.scoreBias,
    };

    return {
      ...res,
      ev,
      score: res.score + humanPlan.scoreBias,
      visitedTuple: res.visitedTuple,
      finalRankTuple: res.finalRankTuple,
      humanPlan,
    };
  };

  const getHumanCheapMoveBias = (plan, moveCtx) => {
    if (!HUMAN_PLAN_ENABLED || !plan || !moveCtx) return 0;
    const touches = countHumanProtectedMoveTouches(plan, moveCtx);
    if (touches > 0) return -190 * touches;
    if ((plan.presentCount || 0) <= 0) return 0;
    return Math.min(90, (plan.presentCount || 0) * 18);
  };

  const cloneBoardOrbsOnly = (boardLike) => {
    const out = clone2D(boardLike);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const orb = orbOf(out[r][c]);
        out[r][c] = orb >= 0 ? orb : -1;
      }
    }
    return out;
  };

  const getReverseOrbStock = () => {
    const counts = Array(6).fill(0);
    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const orb = orbOf(originalBoard[r]?.[c]);
        if (orb >= 0 && orb < counts.length) counts[orb]++;
      }
    }
    return counts;
  };

  const getReverseFillPositions = (variant = 0) => {
    const rows = [];
    for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) rows.push(r);
    if (variant % 2 === 1) rows.reverse();

    const cols = [];
    for (let c = 0; c < COLS; c++) cols.push(c);
    if (variant % 3 === 1) cols.reverse();
    if (variant % 3 === 2 && cols.length > 0) {
      const first = cols.shift();
      cols.push(first);
    }

    const positions = [];
    for (const r of rows) {
      for (const c of cols) positions.push([r, c]);
    }
    return positions;
  };

  const getReverseGroupSlots = (orientation, variant = 0) => {
    const slots = [];

    if (orientation === "vertical") {
      const cols = [];
      for (let c = 0; c < COLS; c++) cols.push(c);
      if (variant % 2 === 1) cols.reverse();

      for (const c of cols) {
        for (let r = TOTAL_ROWS - 3; r >= PLAY_ROWS_START; r -= 3) {
          slots.push([
            [r, c],
            [r + 1, c],
            [r + 2, c],
          ]);
        }
      }
      return slots;
    }

    if (orientation === "horizontal") {
      const rows = [];
      for (let r = TOTAL_ROWS - 1; r >= PLAY_ROWS_START; r--) rows.push(r);
      if (variant % 2 === 1) rows.reverse();

      for (const r of rows) {
        for (let c = 0; c <= COLS - 3; c += 3) {
          slots.push([
            [r, c],
            [r, c + 1],
            [r, c + 2],
          ]);
        }
      }
      return slots;
    }

    const first =
      variant % 2 === 0
        ? getReverseGroupSlots("horizontal", variant)
        : getReverseGroupSlots("vertical", variant);
    const second =
      variant % 2 === 0
        ? getReverseGroupSlots("vertical", variant + 1)
        : getReverseGroupSlots("horizontal", variant + 1);
    return [...first, ...second];
  };

  const getReverseNeighborPenalty = (board, cells, orb) => {
    let penalty = 0;
    const own = new Set(cells.map(([r, c]) => `${r},${c}`));

    for (const [r, c] of cells) {
      for (let i = 0; i < 4; i++) {
        const nr = r + BFS_DRS[i];
        const nc = c + BFS_DCS[i];
        if (
          nr < PLAY_ROWS_START ||
          nr >= TOTAL_ROWS ||
          nc < 0 ||
          nc >= COLS ||
          own.has(`${nr},${nc}`)
        ) {
          continue;
        }
        if (orbOf(board[nr][nc]) === orb) penalty++;
      }
    }

    return penalty;
  };

  const pickReverseGroupOrb = (board, counts, cells, orbOrder) => {
    let bestOrb = -1;
    let bestScore = -Infinity;

    for (const orb of orbOrder) {
      if ((counts[orb] || 0) < 3) continue;
      const neighborPenalty = getReverseNeighborPenalty(board, cells, orb);
      const score = counts[orb] * 12 - neighborPenalty * 18;
      if (score > bestScore) {
        bestScore = score;
        bestOrb = orb;
      }
    }

    return bestOrb;
  };

  const placeReverseGroups = (board, counts, slots, orbOrder, maxGroups) => {
    let placed = 0;

    for (const cells of slots) {
      if (placed >= maxGroups) break;
      let open = true;
      for (const [r, c] of cells) {
        if (board[r][c] !== -1) {
          open = false;
          break;
        }
      }
      if (!open) continue;

      const orb = pickReverseGroupOrb(board, counts, cells, orbOrder);
      if (orb < 0) continue;

      for (const [r, c] of cells) board[r][c] = orb;
      counts[orb] -= 3;
      placed++;
    }

    return placed;
  };

  const scoreReverseRemainderOrb = (board, r, c, orb, counts) => {
    let score = counts[orb] || 0;

    if (c >= 2 && orbOf(board[r][c - 1]) === orb && orbOf(board[r][c - 2]) === orb) {
      score -= 80;
    }
    if (
      r >= PLAY_ROWS_START + 2 &&
      orbOf(board[r - 1][c]) === orb &&
      orbOf(board[r - 2][c]) === orb
    ) {
      score -= 80;
    }
    if (c >= 1 && orbOf(board[r][c - 1]) === orb) score -= 8;
    if (r >= PLAY_ROWS_START + 1 && orbOf(board[r - 1][c]) === orb) score -= 8;

    return score;
  };

  const fillReverseRemainders = (board, counts, positions) => {
    for (const [r, c] of positions) {
      if (board[r][c] !== -1) continue;

      let bestOrb = -1;
      let bestScore = -Infinity;
      for (let orb = 0; orb < counts.length; orb++) {
        if ((counts[orb] || 0) <= 0) continue;
        const score = scoreReverseRemainderOrb(board, r, c, orb, counts);
        if (score > bestScore) {
          bestScore = score;
          bestOrb = orb;
        }
      }

      if (bestOrb < 0) break;
      board[r][c] = bestOrb;
      counts[bestOrb]--;
    }
  };

  const makeReverseTargetPlanFromBoard = (targetBoard, variantKey) => {
    const { initial, violatesN2 } = getInitialMatchCheck(
      targetBoard,
      ruleRuntimeCtx,
      false
    );
    const evRaw = evaluateBoard(targetBoard, skyfall, initial, ruleRuntimeCtx);
    const initInfo = extractInitialInfo(initial, evRaw);
    const ev = {
      ...evRaw,
      initialCombos: toNum(
        evRaw?.initialCombos ?? evRaw?.initCombos ?? initInfo.combos,
        initInfo.combos
      ),
      initialClearedCount: toNum(
        evRaw?.initialClearedCount ??
          evRaw?.initClearedCount ??
          evRaw?.initialCleared ??
          initInfo.cleared,
        initInfo.cleared
      ),
      initialMatchSizes: initInfo.matchSizes,
      initialComboSizes: initInfo.matchSizes,
      initialAllEqual: initInfo.allEqual,
      initialDistinctSizeCount: initInfo.distinctSizeCount,
    };
    ev.ruleRequirementTuple = getRuleRequirementTuple(ev);

    const extraCtx = {
      initial,
      initialCombos: ev.initialCombos,
      initialClearedCount: ev.initialClearedCount,
      initialMatchSizes: ev.initialMatchSizes,
      initialComboSizes: ev.initialComboSizes,
      initialAllEqual: ev.initialAllEqual,
      initialDistinctSizeCount: ev.initialDistinctSizeCount,
    };
    const specialTuple = hasSpecial
      ? getSpecialPriorityTupleCompiled(ev, compiledSpecials, extraCtx)
      : EMPTY_SPECIAL_TUPLE;
    const initComboInfo = getInitialComboInfo(ev);
    const solved = !violatesN2 && isSolvedGoal(ev, extraCtx);
    const comboGap = Math.max(0, target - (ev.combos || 0));
    const clearMap = initial?.toClearMap || null;
    const targetCells = [];
    const targetWeights = new Uint8Array(TOTAL_ROWS * COLS);

    for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const orb = orbOf(targetBoard[r][c]);
        targetCells.push({ r, c, orb, idx });
        targetWeights[idx] = clearMap?.[idx] ? 3 : 1;
      }
    }

    let quality = 0;
    quality += solved ? 6000000 : 0;
    quality += (ev.initialCombos || 0) * 900000;
    quality += (ev.combos || 0) * 340000;
    quality += (ev.initialClearedCount || 0) * 18000;
    quality -= comboGap * comboGap * 720000;
    quality -= initComboInfo.distance * 360000;
    quality += specialPriorityTupleToScore(specialTuple) / 1e9;
    if (violatesN2) quality -= 3000000;

    return {
      board: targetBoard,
      key: `${variantKey}:${getBoardKey(targetBoard)}`,
      ev,
      extraCtx,
      specialTuple,
      solved,
      violatesN2,
      quality,
      targetCells,
      targetWeights,
    };
  };

  const buildReverseTargetPlans = () => {
    if (!REVERSE_PLAN_ENABLED || REVERSE_TARGET_LIMIT <= 0) return [];

    const stock = getReverseOrbStock();
    const maxPossibleGroups = stock.reduce((sum, count) => sum + Math.floor(count / 3), 0);
    if (maxPossibleGroups <= 0) return [];
    const desiredGroups = Math.max(
      1,
      Math.min(maxPossibleGroups, Math.max(Number(target) || 1, Number(initTargetCombo) || 1))
    );
    const baseOrbOrder = stock
      .map((count, orb) => ({ orb, count }))
      .sort((a, b) => b.count - a.count)
      .map((x) => x.orb);
    const orientations =
      mode === "vertical"
        ? ["vertical", "mixed", "horizontal"]
        : mode === "horizontal"
        ? ["horizontal", "mixed", "vertical"]
        : ["mixed", "horizontal", "vertical"];
    const plans = [];
    const seen = new Set();

    for (let v = 0; v < 6; v++) {
      const orbOrder = [
        ...baseOrbOrder.slice(v % Math.max(1, baseOrbOrder.length)),
        ...baseOrbOrder.slice(0, v % Math.max(1, baseOrbOrder.length)),
      ];

      for (const orientation of orientations) {
        const board = cloneBoardOrbsOnly(originalBoard);
        for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
          for (let c = 0; c < COLS; c++) board[r][c] = -1;
        }

        const counts = stock.slice();
        const slots = getReverseGroupSlots(orientation, v);
        const groupLimit = Math.min(maxPossibleGroups, desiredGroups + (v % 3));
        placeReverseGroups(board, counts, slots, orbOrder, groupLimit);
        fillReverseRemainders(board, counts, getReverseFillPositions(v));

        const key = getBoardKey(board);
        if (seen.has(key)) continue;
        seen.add(key);

        const plan = makeReverseTargetPlanFromBoard(board, `${orientation}:${v}`);
        plans.push(plan);
      }
    }

    plans.sort((a, b) => b.quality - a.quality);
    return plans.slice(0, REVERSE_TARGET_LIMIT);
  };

  const scoreReverseTargetAlignment = (evalBoard, steps) => {
    if (
      !REVERSE_PLAN_ENABLED ||
      !evalBoard ||
      !Array.isArray(reverseTargetPlans) ||
      reverseTargetPlans.length === 0 ||
      steps > REVERSE_MAX_STEPS
    ) {
      return {
        enabled: false,
        exact: false,
        distance: 0,
        scoreBias: 0,
        rankTuple: EMPTY_REQUIREMENT_TUPLE,
      };
    }

    let best = null;

    for (const plan of reverseTargetPlans) {
      let distance = 0;
      let weightedDistance = 0;
      let matched = 0;
      let weightedMatched = 0;

      for (const cell of plan.targetCells) {
        const actual = orbOf(evalBoard[cell.r][cell.c]);
        const weight = plan.targetWeights[cell.idx] || 1;
        if (actual === cell.orb) {
          matched++;
          weightedMatched += weight;
        } else {
          distance++;
          weightedDistance += weight;
        }
      }

      const exact = distance === 0;
      let scoreBias = 0;
      scoreBias += weightedMatched * 11500;
      scoreBias -= weightedDistance * 24000;
      scoreBias += Math.floor(plan.quality / 90);
      scoreBias -= steps * 3400;
      if (distance <= 6) scoreBias += (7 - distance) * 85000;
      if (exact) scoreBias += 2600000;
      if (plan.solved) scoreBias += 240000;

      const candidate = {
        enabled: true,
        plan,
        exact,
        distance,
        weightedDistance,
        matched,
        weightedMatched,
        scoreBias,
        rankTuple: [
          exact ? 1 : 0,
          -weightedDistance,
          -distance,
          plan.solved ? 1 : 0,
          plan.ev?.initialCombos || 0,
          plan.ev?.combos || 0,
          Math.floor(scoreBias / 1000),
        ],
      };

      if (
        !best ||
        candidate.scoreBias > best.scoreBias ||
        (candidate.scoreBias === best.scoreBias &&
          candidate.weightedDistance < best.weightedDistance)
      ) {
        best = candidate;
      }
    }

    return (
      best || {
        enabled: false,
        exact: false,
        distance: 0,
        scoreBias: 0,
        rankTuple: EMPTY_REQUIREMENT_TUPLE,
      }
    );
  };

  // ??蝯曹???擐? target 鞈?
  // 銝???cap / 銝???0 ?孵??????
  // ?芰?頝嚗istance = |initialCombos - target|
  const getInitialComboInfo = (evLike, targetLike = initTargetCombo) => {
    const targetNum = Number(targetLike);
    const initialCombos = toNum(
      evLike?.initialCombos ?? evLike?.initCombos ?? evLike?.combos,
      0
    );

    if (!Number.isFinite(targetNum) || targetNum < 0) {
      return {
        enabled: false,
        target: null,
        initialCombos,
        distance: 0,
        exact: false,
      };
    }

    const distance = Math.abs(initialCombos - targetNum);

    return {
      enabled: true,
      target: targetNum,
      initialCombos,
      distance,
      exact: initialCombos === targetNum,
    };
  };

  const hitsInitTargetComboExactly = (ev) =>
    getInitialComboInfo(ev).exact;

  const getInitComboDistance = (ev) =>
    getInitialComboInfo(ev).distance;

  const stepConstraint = (cellVal) => {
    const m = xMarkOf(cellVal);
    if (m === 1) return { ok: false, locked: false };
    if (m === 2) return { ok: true, locked: true };
    return { ok: true, locked: false };
  };

  const extractInitialMatchSizes = (initial, ev = null) => {
    if (Array.isArray(initial?.matchSizes)) {
      return initial.matchSizes.map((x) => toNum(x, 0)).filter((x) => x > 0);
    }

    if (Array.isArray(initial?.comboSizes)) {
      return initial.comboSizes.map((x) => toNum(x, 0)).filter((x) => x > 0);
    }

    if (Array.isArray(initial?.groups)) {
      const arr = [];
      for (const g of initial.groups) {
        const sz = toNum(
          g?.size ?? g?.count ?? g?.len ?? g?.cells?.length ?? g?.orbs?.length,
          0
        );
        if (sz > 0) arr.push(sz);
      }
      if (arr.length) return arr;
    }

    if (Array.isArray(initial?.matches)) {
      const arr = [];
      for (const g of initial.matches) {
        const sz = toNum(
          g?.size ?? g?.count ?? g?.len ?? g?.cells?.length ?? g?.orbs?.length,
          0
        );
        if (sz > 0) arr.push(sz);
      }
      if (arr.length) return arr;
    }

    if (Array.isArray(ev?.initialMatchSizes)) {
      return ev.initialMatchSizes.map((x) => toNum(x, 0)).filter((x) => x > 0);
    }

    if (Array.isArray(ev?.initialComboSizes)) {
      return ev.initialComboSizes.map((x) => toNum(x, 0)).filter((x) => x > 0);
    }

    return [];
  };

  const extractInitialInfo = (initial, ev = null) => {
    const matchSizes = extractInitialMatchSizes(initial, ev);
    const combosFromSizes = matchSizes.length;

    const combos = toNum(
      initial?.combos ??
        initial?.comboCount ??
        ev?.initialCombos ??
        ev?.initCombos ??
        (combosFromSizes > 0 ? combosFromSizes : 0),
      0
    );

    const cleared = toNum(
      initial?.clearedCount ??
        initial?.clearCount ??
        initial?.totalCleared ??
        ev?.initialClearedCount ??
        ev?.initClearedCount ??
        ev?.initialCleared ??
        (matchSizes.length ? matchSizes.reduce((a, b) => a + b, 0) : 0),
      0
    );

    const distinctSizeCount = new Set(matchSizes).size;
    const allEqual =
      matchSizes.length > 0 &&
      matchSizes.every((x) => x === matchSizes[0]);

    return {
      combos,
      cleared,
      matchSizes,
      distinctSizeCount,
      allEqual,
      signature: `${combos}:${cleared}:${matchSizes.join(",")}`,
    };
  };

  const buildVisitedInitPart = (initInfo) =>
    `${initInfo.combos}|${initInfo.cleared}|${initInfo.matchSizes.join(".")}`;

  const getModeMajor = (ev) =>
    mode === "vertical"
      ? ev?.verticalCombos || 0
      : ev?.horizontalCombos || 0;

  const getFreeMajor = (ev) =>
    Math.max(ev?.verticalCombos || 0, ev?.horizontalCombos || 0);

  const getAdaptiveMajor = (ev) =>
    hasInitSensitiveSpecial ? getFreeMajor(ev) : getModeMajor(ev);

  const getInitShieldScoreBias = (initInfo, steps) => {
    let bias = 0;

    if (hasInitClearCountSpecial) {
      for (const sp of compiledSpecials) {
        if (
          !sp ||
          !(
            sp.type === "clearCount" ||
            sp.type === "initClearCount" ||
            sp.type === "firstClearCount"
          )
        ) {
          continue;
        }

        const want = toNum(sp.count ?? sp.clearCount, 0);
        if (want > 0) {
          const got = initInfo.cleared;
          const diff = Math.abs(got - want);

          bias += 4000000 - diff * 500000;

          if (got === want) bias += 4500000;
          else if (got < want) bias += got * 180000;
          else bias -= (got - want) * 220000;
        }
      }
    }

    if (hasInitEqualSpecial) {
      if (initInfo.matchSizes.length === 0) {
        bias -= 1200000;
      } else {
        if (initInfo.allEqual) bias += 5200000;
        bias += initInfo.combos * 260000;
        bias -= Math.max(0, initInfo.distinctSizeCount - 1) * 1100000;

        const sizes = initInfo.matchSizes;
        let spread = 0;
        if (sizes.length > 1) {
          const mn = Math.min(...sizes);
          const mx = Math.max(...sizes);
          spread = mx - mn;
        }
        bias -= spread * 260000;
      }
    }

    if (hasInitSensitiveSpecial) {
      bias += initInfo.combos * 220000;
      bias += initInfo.cleared * 90000;
      bias -= steps * 2500;
    }

    return bias;
  };

  const buildNoSpecialRankTuple = (
    ev,
    score,
    steps,
    violatesN2,
    initExact,
    initDistance = getInitComboDistance(ev),
    anchors = null
  ) => {
    const legal = violatesN2 ? 0 : 1;
    const initEq = ev.initialAllEqual ? 1 : 0;
    const initCombos = ev.initialCombos || 0;
    const initCleared = ev.initialClearedCount || 0;
    const combos = ev.combos || 0;
    const cleared = ev.clearedCount || 0;
    const requirementTuple = Array.isArray(ev?.ruleRequirementTuple)
      ? ev.ruleRequirementTuple
      : EMPTY_REQUIREMENT_TUPLE;
    const adaptiveMajor = getAdaptiveMajor(ev);
    const bestStepsAnchor = Number.isFinite(Number(anchors?.bestSteps))
      ? Number(anchors.bestSteps)
      : steps;
    const bestCombosAnchor = Number.isFinite(Number(anchors?.bestCombos))
      ? Number(anchors.bestCombos)
      : combos;

    if (IS_STEP_MODE) {
      const inStepBand = steps <= bestStepsAnchor + STEP_COMBO_SLACK;
      if (inStepBand) {
        return [
          legal,
          ...requirementTuple,
          initExact ? 1 : 0,
          -initDistance,
          initEq,
          initCombos,
          initCleared,
          combos,
          -steps,
          cleared,
          adaptiveMajor,
          Math.floor(score),
        ];
      }

      return [
        legal,
        ...requirementTuple,
        initExact ? 1 : 0,
        -initDistance,
        initEq,
        initCombos,
        initCleared,
        -steps,
        combos,
        adaptiveMajor,
        cleared,
        Math.floor(score),
      ];
    }

    const inComboBand = combos >= bestCombosAnchor - COMBO_STEP_SLACK;
    if (inComboBand) {
      return [
        legal,
        ...requirementTuple,
        initExact ? 1 : 0,
        -initDistance,
        initEq,
        initCombos,
        initCleared,
        -steps,
        combos,
        adaptiveMajor,
        cleared,
        Math.floor(score),
      ];
    }

    return [
      legal,
      ...requirementTuple,
      initExact ? 1 : 0,
      -initDistance,
      initEq,
      initCombos,
      initCleared,
      combos,
      -steps,
      adaptiveMajor,
      cleared,
      Math.floor(score),
    ];
  };

  const softDominatesPrefix = (a, b, prefixLen) => {
    if (!a || !b || a.length !== b.length) return false;
    const len = Math.max(1, Math.min(prefixLen, a.length));
    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) return false;
    }
    return true;
  };

  const dominatesVec = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return false;
    }
    return true;
  };

  let q1Pos = null;
  let q2Pos = null;

  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (!useRow0 && r === 0) continue;
    for (let c = 0; c < COLS; c++) {
      const q = qMarkOf(originalBoard[r][c]);
      if (q === 1) q1Pos = { r, c };
      if (q === 2) q2Pos = { r, c };
    }
  }

  const isAtQ2 = (r, c) => q2Pos && r === q2Pos.r && c === q2Pos.c;
  const shouldAcceptEnd = (node) =>
    !q2Pos || (node?.r === q2Pos.r && node?.c === q2Pos.c);

  const isSolvedGoal = (ev, extraCtx = {}) => {
    if (!isRuleRequirementSatisfied(ev)) return false;
    if (!hasSpecial) return ev.combos >= target;
    return (
      ev.combos >= target &&
      isAllSpecialSatisfiedCompiled(ev, compiledSpecials, extraCtx)
    );
  };

  const reverseTargetPlans = buildReverseTargetPlans();
  const hasReverseTargets = reverseTargetPlans.length > 0;

  let bestGlobal = {
    combos: -1,
    skyfallCombos: 0,
    clearedCount: -1,
    initialCombos: 0,
    initialClearedCount: 0,
    initialMatchSizes: [],
    node: null,
    score: -Infinity,
    specialTuple: EMPTY_SPECIAL_TUPLE,
    verticalCombos: 0,
    horizontalCombos: 0,
    rectGuide: 0,
    violatesN2: false,
    initialComboDistance: Infinity,
  };

  let bestReachedSteps = Infinity;
  let topStepCandidates = [];
  let topComboCandidates = [];
  const pendingTopStepCandidates = [];
  const pendingTopComboCandidates = [];
  let beam = [];
  let nodesExpanded = 0;
  const visitedBest = new Map();
  const visitedDominanceFrontier = new Map();
  const VISITED_FRONTIER_CAP = hasSpecial ? 8 : 6;
  const VISITED_FAMILY_CAP = 3;
  let stagnantRounds = 0;
  let lastBestScore = -Infinity;
  let diversityRatio = 1;
  const nowMs = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let adaptiveYieldStride = enableParallelEval ? 4 : 2;
  let lastYieldStep = -1;
  let lastYieldAt = nowMs();
  let lastStepAt = lastYieldAt;

  const getNoSpecialAnchors = (fallbackSteps = 0, fallbackCombos = 0) => ({
    bestSteps: bestGlobal.node ? stepsOf(bestGlobal.node) : fallbackSteps,
    bestCombos: bestGlobal.node ? bestGlobal.combos || 0 : fallbackCombos,
  });

  let lastProgressReport = -1;
  let lastProgressReportAt = 0;
  const progressNodeBatch = enableParallelEval ? 384 : 256;
  const progressMinIntervalMs = enableParallelEval ? 48 : 24;
  const reportProgress = (force = false) => {
    if (!onProgress) return;

    const current = Math.min(nodesExpanded, maxNodesEffective);
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const byNodeDelta = current - lastProgressReport >= progressNodeBatch;
    const byTimeDelta = now - lastProgressReportAt >= progressMinIntervalMs;
    const shouldEmit =
      force ||
      lastProgressReport < 0 ||
      current >= maxNodesEffective ||
      (byNodeDelta && byTimeDelta);

    if (!shouldEmit) return;

    lastProgressReport = current;
    lastProgressReportAt = now;
    onProgress({
      current,
      max: Math.max(1, maxNodesEffective),
    });
  };

  const flushPendingPools = () => {
    topStepCandidates = flushPendingSolutions(
      topStepCandidates,
      pendingTopStepCandidates,
      "steps",
      specialPriority,
      initTargetCombo,
      ruleProfile,
      10
    );

    topComboCandidates = flushPendingSolutions(
      topComboCandidates,
      pendingTopComboCandidates,
      "combo",
      specialPriority,
      initTargetCombo,
      ruleProfile,
      10
    );
  };

  const packCandidateFromEval = ({
    ev,
    node,
    score,
    extraCtx,
    specialTuple,
  }) => ({
    ...ev,
    path: node ? buildPath(node) : [],
    score,
    rectGuide: extraCtx.rectGuide || 0,
    specialTuple,
  });

  const pushTopCandidate = (
    ev,
    node,
    score,
    violatesN2,
    extraCtx = {},
    specialTuple = EMPTY_SPECIAL_TUPLE
  ) => {
    if (!node) return;
    const steps = stepsOf(node);
    if (steps <= 0) return;
    if (!shouldAcceptEnd(node)) return;

    const sol = {
      ...packCandidateFromEval({
        ev,
        node,
        score,
        extraCtx,
        specialTuple,
      }),
      violatesN2: !!violatesN2,
    };

    if (priority === "steps") {
      pendingTopStepCandidates.push(sol);
      if (pendingTopStepCandidates.length >= 32) {
        topStepCandidates = flushPendingSolutions(
          topStepCandidates,
          pendingTopStepCandidates,
          "steps",
          specialPriority,
          initTargetCombo,
          ruleProfile,
          10
        );
      }
    } else {
      pendingTopComboCandidates.push(sol);
      if (pendingTopComboCandidates.length >= 32) {
        topComboCandidates = flushPendingSolutions(
          topComboCandidates,
          pendingTopComboCandidates,
          "combo",
          specialPriority,
          initTargetCombo,
          ruleProfile,
          10
        );
      }
    }
  };

  const considerBest = (
    ev,
    score,
    node,
    violatesN2,
    extraCtx = {},
    specialTuple = EMPTY_SPECIAL_TUPLE
  ) => {
    if (!shouldAcceptEnd(node)) return;

    const curSteps = stepsOf(node);
    const curInitExact = hitsInitTargetComboExactly(ev);
    const curInitDistance = getInitComboDistance(ev);

    if (!hasSpecial) {
      const anchors = getNoSpecialAnchors(curSteps, ev.combos || 0);
      const curTuple = buildNoSpecialRankTuple(
        ev,
        score,
        curSteps,
        violatesN2,
        curInitExact,
        curInitDistance,
        anchors
      );

      const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;
      const bestInitExact =
        bestGlobal.node && hitsInitTargetComboExactly(bestGlobal);
      const bestInitDistance = bestGlobal.node
        ? getInitComboDistance(bestGlobal)
        : Infinity;

      const bestTuple = bestGlobal.node
        ? buildNoSpecialRankTuple(
            bestGlobal,
            bestGlobal.score,
            bestSteps,
            bestGlobal.violatesN2,
            bestInitExact,
            bestInitDistance,
            anchors
          )
        : null;

      let better = false;
      if (!bestTuple) better = true;
      else if (lexTupleBetter(curTuple, bestTuple)) better = true;

      if (better) {
        bestGlobal = {
          ...ev,
          node,
          score,
          specialTuple,
          rectGuide: extraCtx.rectGuide || 0,
          violatesN2: !!violatesN2,
        };
      }

      const solved = isSolvedGoal(ev, extraCtx);
      if (!violatesN2 && solved && curSteps > 0) {
        if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
      }
      return;
    }

    const curTuple = [
      violatesN2 ? 0 : 1,
      ...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE),
      ...specialTuple,
      curInitExact ? 1 : 0,
      -curInitDistance,
      ev.initialAllEqual ? 1 : 0,
      ev.initialCombos || 0,
      ev.initialClearedCount || 0,
      ev.combos || 0,
      ev.clearedCount || 0,
      -curSteps,
      Math.floor(score),
    ];

    const bestSteps = bestGlobal.node ? stepsOf(bestGlobal.node) : Infinity;
    const bestInitDistance = bestGlobal.node
      ? getInitComboDistance(bestGlobal)
      : Infinity;
    const bestTuple = bestGlobal.node
      ? [
          bestGlobal.violatesN2 ? 0 : 1,
          ...(bestGlobal.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE),
          ...(bestGlobal.specialTuple || EMPTY_SPECIAL_TUPLE),
          hitsInitTargetComboExactly(bestGlobal) ? 1 : 0,
          -bestInitDistance,
          bestGlobal.initialAllEqual ? 1 : 0,
          bestGlobal.initialCombos || 0,
          bestGlobal.initialClearedCount || 0,
          bestGlobal.combos || 0,
          bestGlobal.clearedCount || 0,
          -bestSteps,
          Math.floor(bestGlobal.score),
        ]
      : null;

    let better = false;
    if (!bestTuple) better = true;
    else if (lexTupleBetter(curTuple, bestTuple)) better = true;

    if (better) {
      bestGlobal = {
        ...ev,
        node,
        score,
        specialTuple,
        rectGuide: extraCtx.rectGuide || 0,
        violatesN2: !!violatesN2,
      };
    }

    const solved = isSolvedGoal(ev, extraCtx);
    if (!violatesN2 && solved && curSteps > 0) {
      if (curSteps < bestReachedSteps) bestReachedSteps = curSteps;
    }
  };

  const betterThanVisited = (
    key,
    ev,
    score,
    steps,
    specialTuple,
    violatesN2,
    initExact,
    visitedTuple
  ) => {
    const dominanceTuple = hasSpecial
      ? [
          ...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE),
          ev.combos || 0,
          ...(specialTuple || EMPTY_SPECIAL_TUPLE),
          Math.floor(score),
        ]
      : [
          ...(ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE),
          ev.combos || 0,
          Math.floor(score),
        ];

    const frontier = visitedDominanceFrontier.get(key) || [];
    for (const prevDom of frontier) {
      if (dominatesVec(prevDom, dominanceTuple)) return false;
    }

    const reducedFrontier = [];
    for (const prevDom of frontier) {
      if (!dominatesVec(dominanceTuple, prevDom)) {
        reducedFrontier.push(prevDom);
      }
    }
    reducedFrontier.push(dominanceTuple);
    reducedFrontier.sort((a, b) => lexTupleCompareDesc(a, b));
    if (reducedFrontier.length > VISITED_FRONTIER_CAP) {
      reducedFrontier.length = VISITED_FRONTIER_CAP;
    }
    visitedDominanceFrontier.set(key, reducedFrontier);

    const prev = visitedBest.get(key);

    if (hasSpecial) {
      if (!prev) {
        visitedBest.set(key, visitedTuple);
        return true;
      }

      const cmp = lexTupleCompareDesc(prev, visitedTuple);
      if (cmp <= 0) return false;

      visitedBest.set(key, visitedTuple);
      return true;
    }

    const curVec = buildNoSpecialRankTuple(
      ev,
      score,
      steps,
      violatesN2,
      initExact,
      getInitComboDistance(ev),
      getNoSpecialAnchors(steps, ev.combos || 0)
    );

    if (!prev) {
      visitedBest.set(key, curVec);
      return true;
    }

    if (IS_STEP_MODE) {
      if (dominatesVec(prev, curVec)) return false;
    } else {
      const prefixLen = SEARCH_PROFILE.comboVisitedPrefixLen;
      if (
        prefixLen > 0 &&
        softDominatesPrefix(prev, curVec, prefixLen)
      ) {
        const prevStepsMetric = prev[prev.length - 2] || 0;
        const curStepsMetric = curVec[curVec.length - 2] || 0;

        if (prevStepsMetric >= curStepsMetric - SEARCH_PROFILE.stepsVisitedSlack) {
          return false;
        }
      }
    }

    let shouldUpdate = false;
    for (let i = 0; i < curVec.length; i++) {
      if (curVec[i] > prev[i]) {
        shouldUpdate = true;
        break;
      }
      if (curVec[i] < prev[i]) break;
    }

    if (shouldUpdate || !Array.isArray(prev) || prev.length !== curVec.length) {
      visitedBest.set(key, curVec);
    }

    return true;
  };

  const computeEvalPrimitives = (evalBoard) => {
    const { initial, violatesN2 } = getInitialMatchCheck(
      evalBoard,
      ruleRuntimeCtx,
      HUMAN_PLAN_ENABLED
    );
    const evRaw = evaluateBoard(evalBoard, skyfall, initial, ruleRuntimeCtx);
    const pot = combinedPotentialScore(evalBoard, mode);
    return { initial, violatesN2, evRaw, pot };
  };

  const buildEvalStateFromPrimitives = (
    evalBoard,
    node,
    steps,
    scoreBias = 0,
    parentExtraCtx = null,
    primitives = null
  ) => {
    const source = primitives || computeEvalPrimitives(evalBoard);
    const initial = source.initial;
    const violatesN2 = !!source.violatesN2;
    const evRaw = source.evRaw || {};
    const pot = Number(source.pot || 0);

    const initInfo = extractInitialInfo(initial, evRaw);

    const ev = {
      ...evRaw,
      initialCombos: toNum(
        evRaw?.initialCombos ?? evRaw?.initCombos ?? initInfo.combos,
        initInfo.combos
      ),
      initialClearedCount: toNum(
        evRaw?.initialClearedCount ??
          evRaw?.initClearedCount ??
          evRaw?.initialCleared ??
          initInfo.cleared,
        initInfo.cleared
      ),
      initialMatchSizes: initInfo.matchSizes,
      initialComboSizes: initInfo.matchSizes,
      initialAllEqual: initInfo.allEqual,
      initialDistinctSizeCount: initInfo.distinctSizeCount,
    };

    const initComboInfo = getInitialComboInfo(ev);

    ev.initialComboDistance = initComboInfo.distance;
    ev.initTargetCombo = initComboInfo.target;
    ev.initialComboExact = initComboInfo.exact;

    let rectGuide = 0;
    if (hasRectSpecial) {
      const prevRectGuide = parentExtraCtx?.rectGuide;
      const needRefreshRectGuide = shouldRefreshRectGuide(
        steps,
        prevRectGuide,
        hasRectSpecial
      );
      rectGuide = needRefreshRectGuide
        ? getCheapRectGuideScoreFromCompiledSpecialList(
            evalBoard,
            compiledSpecials,
            "initial"
          )
        : Number(prevRectGuide || 0);
    }

    const extraCtx = {
      rectGuide,
      initial,
      initialCombos: ev.initialCombos,
      initialClearedCount: ev.initialClearedCount,
      initialMatchSizes: ev.initialMatchSizes,
      initialComboSizes: ev.initialComboSizes,
      initialAllEqual: ev.initialAllEqual,
      initialDistinctSizeCount: ev.initialDistinctSizeCount,
      initSignature: initInfo.signature,
      initialComboDistance: initComboInfo.distance,
      initialComboExact: initComboInfo.exact,
      initTargetCombo: initComboInfo.target,
    };

    const reverseGuide = scoreReverseTargetAlignment(evalBoard, steps);
    if (reverseGuide.enabled) {
      ev.reverseTargetDistance = reverseGuide.distance;
      ev.reverseTargetWeightedDistance = reverseGuide.weightedDistance;
      ev.reverseTargetExact = !!reverseGuide.exact;
      ev.reverseTargetCombos = reverseGuide.plan?.ev?.combos || 0;
      ev.reverseTargetInitialCombos =
        reverseGuide.plan?.ev?.initialCombos || 0;
      extraCtx.reverseGuide = reverseGuide;
    }

    const specialTuple = hasSpecial
      ? getSpecialPriorityTupleCompiled(ev, compiledSpecials, extraCtx)
      : EMPTY_SPECIAL_TUPLE;
    const requirementTuple = getRuleRequirementTuple(ev);
    ev.ruleRequirementTuple = requirementTuple;

    const rawScore = calcScore(
      ev,
      pot,
      steps,
      cfg,
      target,
      mode,
      priority,
      specialPriority,
      violatesN2,
      extraCtx
    );

    let score = rawScore + scoreBias;

    score += ev.initialCombos * SEARCH_PROFILE.initComboBonus;
    score += ev.initialClearedCount * SEARCH_PROFILE.initClearedBonus;
    if (ev.initialAllEqual) score += SEARCH_PROFILE.initAllEqualBonus;

    if (initComboInfo.enabled) {
      score -= initComboInfo.distance * SEARCH_PROFILE.initTargetPenalty;
      if (initComboInfo.exact) {
        score += SEARCH_PROFILE.initExactBonus;
      }
    }

    score += getInitShieldScoreBias(
      {
        combos: ev.initialCombos,
        cleared: ev.initialClearedCount,
        matchSizes: ev.initialMatchSizes,
        distinctSizeCount: ev.initialDistinctSizeCount,
        allEqual: ev.initialAllEqual,
      },
      steps
    );

    if (reverseGuide.enabled) {
      score += reverseGuide.scoreBias;
    }

    if (hasInitSensitiveSpecial) {
      score += getFreeMajor(ev) * SEARCH_PROFILE.freeMajorBonus;
      score -=
        Math.abs((ev.verticalCombos || 0) - (ev.horizontalCombos || 0)) *
        SEARCH_PROFILE.hvDiffPenalty;
    }

    if (!hasSpecial) {
      if (IS_COMBO_MODE) {
        score += Math.floor((pot || 0) * SEARCH_PROFILE.extraPotentialWeight);
        score -= steps * SEARCH_PROFILE.extraStepPenalty;
      } else {
        score -= steps * SEARCH_PROFILE.extraStepPenalty;
        score += getAdaptiveMajor(ev) * 30000;
      }
    }

    const initExact = initComboInfo.exact;
    const initDistance = initComboInfo.distance;

    const baseVisitedTuple = hasSpecial
      ? [
          violatesN2 ? 0 : 1,
          ...requirementTuple,
          ...specialTuple,
          initExact ? 1 : 0,
          -initDistance,
          ev.initialAllEqual ? 1 : 0,
          ev.initialCombos || 0,
          ev.initialClearedCount || 0,
          ev.combos || 0,
          ev.clearedCount || 0,
          -steps,
          Math.floor(score),
        ]
      : buildNoSpecialRankTuple(
          ev,
          score,
          steps,
          violatesN2,
          initExact,
          initDistance,
          getNoSpecialAnchors(steps, ev.combos || 0)
        );

    const baseFinalRankTuple = hasSpecial
      ? [
          violatesN2 ? 0 : 1,
          ...requirementTuple,
          ...specialTuple,
          initExact ? 1 : 0,
          -initDistance,
          ev.initialAllEqual ? 1 : 0,
          ev.initialCombos || 0,
          ev.initialClearedCount || 0,
          ev.combos || 0,
          ev.clearedCount || 0,
          -steps,
          Math.floor(score),
        ]
      : buildNoSpecialRankTuple(
          ev,
          score,
          steps,
          violatesN2,
          initExact,
          initDistance,
          getNoSpecialAnchors(steps, ev.combos || 0)
        );
    const visitedTuple = baseVisitedTuple;
    const finalRankTuple = baseFinalRankTuple;

    return {
      ev,
      score,
      violatesN2,
      pot,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      initExact,
      initInfo,
    };
  };

  const evalState = (
    evalBoard,
    node,
    steps,
    scoreBias = 0,
    parentExtraCtx = null
  ) =>
    buildEvalStateFromPrimitives(
      evalBoard,
      node,
      steps,
      scoreBias,
      parentExtraCtx,
      null
    );

  const evalPrimitiveCache = new Map();
  const EVAL_PRIMITIVE_CACHE_CAP = 120000;
  const getEvalPrimitiveCacheKey = (boardKey, hole, held) =>
    `${boardKey}|${hole ? `${hole.r},${hole.c}` : "none"}|${held}|g:${
      HUMAN_PLAN_ENABLED ? 1 : 0
    }`;

  const getCachedEvalPrimitives = (cacheKey) => {
    if (!cacheKey) return null;
    const hit = evalPrimitiveCache.get(cacheKey);
    if (!hit) return null;
    // touch for simple LRU behavior
    evalPrimitiveCache.delete(cacheKey);
    evalPrimitiveCache.set(cacheKey, hit);
    return hit;
  };

  const putCachedEvalPrimitives = (cacheKey, primitives) => {
    if (!cacheKey || !primitives) return;
    if (evalPrimitiveCache.size >= EVAL_PRIMITIVE_CACHE_CAP) {
      const oldest = evalPrimitiveCache.keys().next().value;
      if (oldest !== undefined) evalPrimitiveCache.delete(oldest);
    }
    evalPrimitiveCache.set(cacheKey, primitives);
  };

  let parallelEvalFailed = false;
  const acquirePackedMove = () =>
    EVAL_PARALLEL_SHARED.packedMovePool.pop() || {
      index: -1,
      boardBuffer: null,
      holeR: -1,
      holeC: -1,
      held: -1,
    };

  const releasePackedMove = (packed) => {
    if (!packed) return;
    packed.index = -1;
    packed.boardBuffer = null;
    packed.holeR = -1;
    packed.holeC = -1;
    packed.held = -1;
    if (EVAL_PARALLEL_SHARED.packedMovePool.length < EVAL_POOL_MAX.packedMove) {
      EVAL_PARALLEL_SHARED.packedMovePool.push(packed);
    }
  };

  const acquireMoveMeta = () =>
    EVAL_PARALLEL_SHARED.moveMetaPool.pop() || {
      mv: null,
      idx: -1,
      boardKey: "",
      primitiveCacheKey: "",
      primitives: null,
    };

  const releaseMoveMeta = (meta) => {
    if (!meta) return;
    meta.mv = null;
    meta.idx = -1;
    meta.boardKey = "";
    meta.primitiveCacheKey = "";
    meta.primitives = null;
    if (EVAL_PARALLEL_SHARED.moveMetaPool.length < EVAL_POOL_MAX.moveMeta) {
      EVAL_PARALLEL_SHARED.moveMetaPool.push(meta);
    }
  };

  const acquireParallelJob = () =>
    EVAL_PARALLEL_SHARED.parallelJobPool.pop() || {
      index: -1,
      nextBoard: null,
      hole: null,
      held: -1,
    };

  const releaseParallelJob = (job) => {
    if (!job) return;
    job.index = -1;
    job.nextBoard = null;
    job.hole = null;
    job.held = -1;
    if (EVAL_PARALLEL_SHARED.parallelJobPool.length < EVAL_POOL_MAX.parallelJob) {
      EVAL_PARALLEL_SHARED.parallelJobPool.push(job);
    }
  };

  const buildEvalWorkerScript = () => {
    const fn = (name, value) => `const ${name} = ${value.toString()};`;
    return `
const TOTAL_ROWS = ${TOTAL_ROWS};
const COLS = ${COLS};
const PLAY_ROWS_START = ${PLAY_ROWS_START};
const BFS_DRS = ${JSON.stringify(BFS_DRS)};
const BFS_DCS = ${JSON.stringify(BFS_DCS)};
const ORB_IDS = ${JSON.stringify(ORB_IDS)};
const RULE_CLEAR_MODE_LINE = ${JSON.stringify(RULE_CLEAR_MODE_LINE)};
const RULE_CLEAR_MODE_CONNECTED = ${JSON.stringify(RULE_CLEAR_MODE_CONNECTED)};
const RECT_M_OPTIONS = ${JSON.stringify(RECT_M_OPTIONS)};
const RECT_N_OPTIONS = ${JSON.stringify(RECT_N_OPTIONS)};
const SHAPE_KIND = ${JSON.stringify(SHAPE_KIND)};
const SHAPE_TEMPLATES = ${JSON.stringify(SHAPE_TEMPLATES)};
${fn("clampIntRange", clampIntRange)}
${fn("normalizeOrbRule", normalizeOrbRule)}
${fn("normalizeRuleRequirement", normalizeRuleRequirement)}
${fn("normalizeRuleProfile", normalizeRuleProfile)}
${fn("buildRuleRuntimeContext", buildRuleRuntimeContext)}
${fn("getRuleRuntimeContext", getRuleRuntimeContext)}
${fn("orbOf", orbOf)}
${fn("xMarkOf", xMarkOf)}
${fn("qMarkOf", qMarkOf)}
${fn("nMarkOf", nMarkOf)}
${fn("withMarks", withMarks)}
${fn("setNMark", setNMark)}
${fn("getOrbForMatchPhase", getOrbForMatchPhase)}
${fn("clone2D", clone2D)}
${fn("boardWithHeldFilled", boardWithHeldFilled)}
${fn("compactnessScore", compactnessScore)}
${fn("edgePotentialScore", edgePotentialScore)}
${fn("applyGravity", applyGravity)}
${fn("potentialScore", potentialScore)}
${fn("normalizeCells", normalizeCells)}
${fn("transformCells8", transformCells8)}
${fn("canonicalShapeKey", canonicalShapeKey)}
${fn("makePatternCounter", makePatternCounter)}
${fn("makeRectCounter", makeRectCounter)}
${fn("makeRectCounts", makeRectCounts)}
${fn("makePatternCounts", makePatternCounts)}
${fn("makeComboCountsByOrb", makeComboCountsByOrb)}
${fn("makeComboSizeCountsByOrb", makeComboSizeCountsByOrb)}
${fn("isPureRectGroup", isPureRectGroup)}
${fn("createFindMatchesScratch", createFindMatchesScratch)}
${fn("getFindMatchesScratch", getFindMatchesScratch)}
${fn("detectExact5Shape", detectExact5Shape)}
${fn("findMatches", findMatches)}
${fn("hasInitialN2Clear", hasInitialN2Clear)}
${fn("getInitialMatchCheck", getInitialMatchCheck)}
${fn("unlockN2Board", unlockN2Board)}
${fn("evaluateBoard", evaluateBoard)}
${fn("combinedPotentialScore", combinedPotentialScore)}
const SHAPE_CANONICAL = Object.fromEntries(
  Object.entries(SHAPE_TEMPLATES).map(([k, cells]) => [k, canonicalShapeKey(cells)])
);
const WORKER_BOARD = Array.from({ length: TOTAL_ROWS }, () =>
  Array(COLS).fill(-1)
);
const boardFromBuffer = (buf) => {
  const flat = new Int16Array(buf);
  let p = 0;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = WORKER_BOARD[r];
    for (let c = 0; c < COLS; c++) row[c] = flat[p++];
  }
  return WORKER_BOARD;
};
const RESULT_ITEM_POOL = [];
const RESULT_PRIMITIVE_POOL = [];
const acquireResultPrimitive = () =>
  RESULT_PRIMITIVE_POOL.pop() || {
    initial: null,
    violatesN2: false,
    evRaw: null,
    pot: 0,
  };
const releaseResultPrimitive = (obj) => {
  if (!obj) return;
  obj.initial = null;
  obj.violatesN2 = false;
  obj.evRaw = null;
  obj.pot = 0;
  if (RESULT_PRIMITIVE_POOL.length < 8192) RESULT_PRIMITIVE_POOL.push(obj);
};
const acquireResultItem = () =>
  RESULT_ITEM_POOL.pop() || {
    index: -1,
    primitives: null,
  };
const releaseResultItem = (obj) => {
  if (!obj) return;
  if (obj.primitives) releaseResultPrimitive(obj.primitives);
  obj.index = -1;
  obj.primitives = null;
  if (RESULT_ITEM_POOL.length < 8192) RESULT_ITEM_POOL.push(obj);
};
self.onmessage = (e) => {
  const { type, payload, requestId } = e.data || {};
  if (type !== "evalBatch") return;
  let out = null;
  try {
    const { moves, mode, skyfall, ruleRuntimeCtx, collectGroups } = payload || {};
    const moveCount = Array.isArray(moves) ? moves.length : 0;
    out = new Array(moveCount);
    const returnedBuffers = new Array(moveCount);
    for (let i = 0; i < moveCount; i++) {
      const mv = moves[i];
      const nextBoard = boardFromBuffer(mv.boardBuffer);
      const hole = mv.holeR >= 0 && mv.holeC >= 0 ? { r: mv.holeR, c: mv.holeC } : null;
      const evalBoard = boardWithHeldFilled(nextBoard, hole, mv.held);
      const { initial, violatesN2 } = getInitialMatchCheck(
        evalBoard,
        ruleRuntimeCtx,
        !!collectGroups
      );
      const evRaw = evaluateBoard(evalBoard, skyfall, initial, ruleRuntimeCtx);
      const pot = combinedPotentialScore(evalBoard, mode);
      const item = acquireResultItem();
      const primitives = acquireResultPrimitive();
      primitives.initial = initial;
      primitives.violatesN2 = violatesN2;
      primitives.evRaw = evRaw;
      primitives.pot = pot;
      item.index = mv.index;
      item.primitives = primitives;
      out[i] = item;
      returnedBuffers[i] = mv.boardBuffer;
    }
    self.postMessage(
      {
        type: "evalBatchDone",
        requestId,
        payload: { out, returnedBuffers },
      },
      returnedBuffers
    );
  } catch (err) {
    const rawMoves = Array.isArray(payload?.moves) ? payload.moves : [];
    const returnedBuffers = [];
    for (let i = 0; i < rawMoves.length; i++) {
      const buf = rawMoves[i]?.boardBuffer;
      if (buf) returnedBuffers.push(buf);
    }
    self.postMessage(
      {
        type: "evalBatchError",
        requestId,
        payload: {
          message: err?.message || String(err),
          stack: err?.stack || "",
          returnedBuffers,
        },
      },
      returnedBuffers
    );
  } finally {
    if (Array.isArray(out)) {
      for (let i = 0; i < out.length; i++) {
        releaseResultItem(out[i]);
      }
    }
  }
};
`;
  };

  const terminateEvalWorkerPool = (revokeScript = false) => {
    for (const slot of EVAL_PARALLEL_SHARED.workerPool) {
      if (!slot) continue;
      if (slot.pending instanceof Map) {
        for (const [, p] of slot.pending) {
          p.reject(new Error("eval worker pool reset"));
        }
        slot.pending.clear();
      }
      if (slot.worker) {
        try {
          slot.worker.terminate();
        } catch (_e) {
          // noop
        }
      }
    }
    EVAL_PARALLEL_SHARED.workerPool = [];

    if (revokeScript && EVAL_PARALLEL_SHARED.scriptURL) {
      try {
        URL.revokeObjectURL(EVAL_PARALLEL_SHARED.scriptURL);
      } catch (_e) {
        // noop
      }
      EVAL_PARALLEL_SHARED.scriptURL = null;
      EVAL_PARALLEL_SHARED.scriptVersion = "";
    }
  };

  const ensureEvalWorkerScriptURL = () => {
    if (
      EVAL_PARALLEL_SHARED.scriptURL &&
      EVAL_PARALLEL_SHARED.scriptVersion !== EVAL_WORKER_SCRIPT_VERSION
    ) {
      terminateEvalWorkerPool(true);
    }

    if (!EVAL_PARALLEL_SHARED.scriptURL) {
      const src = buildEvalWorkerScript();
      EVAL_PARALLEL_SHARED.scriptURL = URL.createObjectURL(
        new Blob([src], { type: "text/javascript" })
      );
      EVAL_PARALLEL_SHARED.scriptVersion = EVAL_WORKER_SCRIPT_VERSION;
    }
    return EVAL_PARALLEL_SHARED.scriptURL;
  };

  const boardToTransferBuffer = (board) => {
    const buffer = acquireBoardTransferBuffer();
    const flat = new Int16Array(buffer);
    let idx = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      const row = board[r];
      for (let c = 0; c < COLS; c++) flat[idx++] = row[c];
    }
    return buffer;
  };

  const ensureEvalWorkerPool = (workerN) => {
    if (parallelEvalFailed) return false;

    const workerURL = ensureEvalWorkerScriptURL();

    try {
      for (let i = 0; i < workerN; i++) {
        const existingSlot = EVAL_PARALLEL_SHARED.workerPool[i];
        if (existingSlot?.worker && !existingSlot.broken) continue;

        if (existingSlot?.worker) {
          try {
            existingSlot.worker.terminate();
          } catch (_e) {
            // noop
          }
        }

        const worker = new Worker(workerURL);
        const slot = {
          worker,
          pending: new Map(),
          broken: false,
        };

        worker.onmessage = (evt) => {
          const { type, payload, requestId } = evt.data || {};
          const p = slot.pending.get(requestId);
          if (!p) return;

          slot.pending.delete(requestId);

          const returnedBuffers = payload?.returnedBuffers;
          if (Array.isArray(returnedBuffers)) {
            for (let i = 0; i < returnedBuffers.length; i++) {
              recycleBoardTransferBuffer(returnedBuffers[i]);
            }
          }

          if (type === "evalBatchDone") {
            p.resolve(Array.isArray(payload?.out) ? payload.out : []);
            return;
          }

          if (type === "evalBatchError") {
            p.reject(new Error(payload?.message || "evalBatchError"));
            return;
          }

          p.reject(new Error(`unexpected worker message: ${type || "unknown"}`));
        };

        worker.onerror = (err) => {
          slot.broken = true;
          for (const [, p] of slot.pending) {
            p.reject(err?.error || new Error(err?.message || "worker error"));
          }
          slot.pending.clear();
        };

        EVAL_PARALLEL_SHARED.workerPool[i] = slot;
      }
      return true;
    } catch (_err) {
      parallelEvalFailed = true;
      terminateEvalWorkerPool(false);
      return false;
    }
  };

  const dispatchEvalChunkToWorker = (slot, chunk) =>
    new Promise((resolve, reject) => {
      if (!slot || slot.broken) {
        reject(new Error("worker unavailable"));
        return;
      }

      const requestId = EVAL_PARALLEL_SHARED.nextRequestId++;
      slot.pending.set(requestId, { resolve, reject });

      const packedMoves = acquireArrayFromPool(EVAL_PARALLEL_SHARED.taskArrayPool);
      const transferList = acquireArrayFromPool(
        EVAL_PARALLEL_SHARED.transferListPool
      );

      for (let i = 0; i < chunk.length; i++) {
        const mv = chunk[i];
        const packed = acquirePackedMove();
        const boardBuffer = boardToTransferBuffer(mv.nextBoard);
        transferList.push(boardBuffer);
        packed.index = mv.index;
        packed.boardBuffer = boardBuffer;
        packed.holeR = mv.hole?.r ?? -1;
        packed.holeC = mv.hole?.c ?? -1;
        packed.held = mv.held;
        packedMoves.push(packed);
      }

      try {
        slot.worker.postMessage(
          {
            type: "evalBatch",
            requestId,
            payload: {
              moves: packedMoves,
               mode,
               skyfall,
               ruleRuntimeCtx,
               collectGroups: HUMAN_PLAN_ENABLED,
             },
          },
          transferList
        );
      } catch (err) {
        slot.pending.delete(requestId);
        for (let i = 0; i < transferList.length; i++) {
          recycleBoardTransferBuffer(transferList[i]);
        }
        reject(err);
      } finally {
        for (let i = 0; i < packedMoves.length; i++) {
          releasePackedMove(packedMoves[i]);
        }
        releaseArrayToPool(
          EVAL_PARALLEL_SHARED.taskArrayPool,
          packedMoves,
          EVAL_POOL_MAX.taskArray
        );
        releaseArrayToPool(
          EVAL_PARALLEL_SHARED.transferListPool,
          transferList,
          EVAL_POOL_MAX.transferList
        );
      }
    });

  const runParallelPrimitiveEval = async (jobs, resultSize) => {
    if (!enableParallelEval || parallelEvalFailed) return null;
    if (!Array.isArray(jobs) || jobs.length === 0) return [];

    const workerN = Math.max(1, Math.min(evalWorkerCount, jobs.length));
    if (workerN <= 1) return null;
    if (!ensureEvalWorkerPool(evalWorkerCount)) return null;

    const chunks = [];
    const chunkSize = Math.ceil(jobs.length / workerN);
    for (let i = 0; i < workerN; i++) {
      const chunk = acquireArrayFromPool(EVAL_PARALLEL_SHARED.parallelJobArrayPool);
      const start = i * chunkSize;
      const end = Math.min(jobs.length, start + chunkSize);
      for (let j = start; j < end; j++) chunk.push(jobs[j]);
      if (chunk.length > 0) chunks.push(chunk);
      else {
        releaseArrayToPool(
          EVAL_PARALLEL_SHARED.parallelJobArrayPool,
          chunk,
          EVAL_POOL_MAX.parallelJobArray
        );
      }
    }

    const byIndex = acquireArrayFromPool(EVAL_PARALLEL_SHARED.parallelResultArrayPool);
    byIndex.length = resultSize;
    for (let i = 0; i < resultSize; i++) byIndex[i] = null;

    try {
      const chunkResults = await Promise.all(
        chunks.map((chunk, i) =>
          dispatchEvalChunkToWorker(EVAL_PARALLEL_SHARED.workerPool[i], chunk)
        )
      );
      for (const resultList of chunkResults) {
        if (!Array.isArray(resultList)) continue;
        for (const item of resultList) {
          if (!item || !Number.isInteger(item.index)) continue;
          if (item.index < 0 || item.index >= resultSize) continue;
          byIndex[item.index] = item.primitives || null;
        }
      }
      return byIndex;
    } catch (_err) {
      parallelEvalFailed = true;
      terminateEvalWorkerPool(false);
      releaseArrayToPool(
        EVAL_PARALLEL_SHARED.parallelResultArrayPool,
        byIndex,
        EVAL_POOL_MAX.parallelResultArray
      );
      return null;
    } finally {
      for (const chunk of chunks) {
        releaseArrayToPool(
          EVAL_PARALLEL_SHARED.parallelJobArrayPool,
          chunk,
          EVAL_POOL_MAX.parallelJobArray
        );
      }
    }
  };

  const tryPushState = ({
    nextBoard,
    held,
    hole,
    r,
    c,
    node,
    locked,
    scoreBias = 0,
    outCandidates,
    parentExtraCtx = null,
    parentHumanPlan = null,
    moveCtx = null,
    familySig = null,
    precomputedBoardKey = null,
    precomputedPrimitives = null,
  }) => {
    const steps = stepsOf(node);
    if (steps > solverMaxSteps) return;

    const boardKey = precomputedBoardKey || getBoardKey(nextBoard);
    const primitiveCacheKey = getEvalPrimitiveCacheKey(boardKey, hole, held);
    let primitives = precomputedPrimitives || getCachedEvalPrimitives(primitiveCacheKey);
    let evalBoard = null;
    const needEvalBoardForRectGuide =
      hasRectSpecial &&
      shouldRefreshRectGuide(steps, parentExtraCtx?.rectGuide, hasRectSpecial);
    const needEvalBoardForReverseGuide =
      hasReverseTargets && steps <= REVERSE_MAX_STEPS;

    if (!primitives) {
      evalBoard = boardWithHeldFilled(nextBoard, hole, held);
      primitives = computeEvalPrimitives(evalBoard);
      putCachedEvalPrimitives(primitiveCacheKey, primitives);
    }

    if (!evalBoard && (needEvalBoardForRectGuide || needEvalBoardForReverseGuide)) {
      evalBoard = boardWithHeldFilled(nextBoard, hole, held);
    }

    const rawRes = buildEvalStateFromPrimitives(
      evalBoard,
      node,
      steps,
      scoreBias,
      parentExtraCtx,
      primitives
    );
    if (!rawRes) return;

    const res = applyHumanPlanToEvalResult(
      rawRes,
      parentHumanPlan,
      moveCtx,
      steps
    );

    const {
      ev,
      score,
      violatesN2,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      initExact,
    } = res;

    const holeKey = hole ? `${hole.r},${hole.c}` : "none";
    const key = `${boardKey}|${holeKey}|${held}|${r},${c}|l:${
      locked ? 1 : 0
    }`;
    const resolvedFamilySig =
      `${familySig || `${getNodeDirectionSignature(node)}|${boardKey}`}|h:${
        res.humanPlan?.familySig || "0"
      }`;

    if (
      !betterThanVisited(
        key,
        ev,
        score,
        steps,
        specialTuple,
        violatesN2,
        initExact,
        visitedTuple
      )
    ) {
      return;
    }

    pushTopCandidate(ev, node, score, violatesN2, extraCtx, specialTuple);
    considerBest(ev, score, node, violatesN2, extraCtx, specialTuple);

    const solved = isSolvedGoal(ev, extraCtx) && !violatesN2;
    if (solved && shouldAcceptEnd(node)) return "solved";

    outCandidates.push({
      board: nextBoard,
      held,
      hole,
      r,
      c,
      node,
      locked,
      score,
      ev,
      violatesN2,
      extraCtx,
      specialTuple,
      visitedTuple,
      finalRankTuple,
      humanPlan: res.humanPlan,
      familySig: resolvedFamilySig,
      _poolRankCached: [],
    });

    return "keep";
  };

  const pushInitState = (r, c, heldFromRow0) => {
    if (!useRow0 && heldFromRow0) return;
    if (q1Pos && (r !== q1Pos.r || c !== q1Pos.c)) return;

    const boardCopy = clone2D(originalBoard);
    let held, hole;

    if (heldFromRow0) {
      held = originalBoard[0][c];
      hole = null;
    } else {
      held = originalBoard[r][c];
      hole = { r, c };
      boardCopy[r][c] = -1;
    }

    const heldMark = xMarkOf(held);
    if (heldMark === 1) return;

    const node = makeNode(null, r, c);
    const locked = heldMark === 2;

    tryPushState({
      nextBoard: boardCopy,
      held,
      hole,
      r,
      c,
      node,
      locked,
      scoreBias: hasSpecial ? -2500000 : 0,
      outCandidates: beam,
      parentExtraCtx: null,
    });
  };

  if (useRow0) {
    for (let c = 0; c < COLS; c++) pushInitState(0, c, true);
  }
  for (let r = PLAY_ROWS_START; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) pushInitState(r, c, false);
  }

  reportProgress(true);

  const sortCandidatesLexicographic = (candidates) => {
    for (const st of candidates) {
      if (!st.finalRankTuple) {
        const steps = stepsOf(st.node);
        const initExact = hitsInitTargetComboExactly(st.ev);
        const initDistance = getInitComboDistance(st.ev);

        st.finalRankTuple = [
          st.violatesN2 ? 0 : 1,
          ...(st.ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE),
          ...(st.specialTuple || EMPTY_SPECIAL_TUPLE),
          initExact ? 1 : 0,
          -initDistance,
          st.ev.initialAllEqual ? 1 : 0,
          st.ev.initialCombos || 0,
          st.ev.initialClearedCount || 0,
          st.ev.combos || 0,
          st.ev.clearedCount || 0,
          -steps,
          Math.floor(st.score),
        ];
      }
    }

    candidates.sort((a, b) =>
      lexTupleCompareDesc(a.finalRankTuple, b.finalRankTuple)
    );
  };

  const sortCandidatesNoSpecialCombo = (candidates) => {
    const minSteps = candidates.reduce(
      (mn, st) => Math.min(mn, stepsOf(st.node)),
      Infinity
    );
    const maxCombos = candidates.reduce(
      (mx, st) => Math.max(mx, st?.ev?.combos || 0),
      -Infinity
    );
    const anchors = getNoSpecialAnchors(
      Number.isFinite(minSteps) ? minSteps : 0,
      Number.isFinite(maxCombos) ? maxCombos : 0
    );

    candidates.sort((a, b) => {
      const aInit = hitsInitTargetComboExactly(a.ev) ? 1 : 0;
      const bInit = hitsInitTargetComboExactly(b.ev) ? 1 : 0;
      const aDist = getInitComboDistance(a.ev);
      const bDist = getInitComboDistance(b.ev);

      const aSteps = stepsOf(a.node);
      const bSteps = stepsOf(b.node);

      const ta = buildNoSpecialRankTuple(
        a.ev,
        a.score,
        aSteps,
        a.violatesN2,
        aInit,
        aDist,
        anchors
      );
      const tb = buildNoSpecialRankTuple(
        b.ev,
        b.score,
        bSteps,
        b.violatesN2,
        bInit,
        bDist,
        anchors
      );

      return lexTupleCompareDesc(ta, tb);
    });
  };

  const getMissTier = (st) => {
    if (!hasSpecial) return Math.max(0, target - (st.ev.combos || 0));
    if (isSolvedGoal(st.ev, st.extraCtx)) return 0;
    return Math.max(1, target - (st.ev.combos || 0));
  };

  const buildQuota = (counts, remain, quotaW) => {
    let sumW = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) sumW += quotaW[i];
    }

    const quota = new Array(counts.length).fill(0);
    if (sumW <= 0) return quota;

    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 0) {
        quota[i] = Math.max(1, Math.floor((remain * quotaW[i]) / sumW));
      }
    }
    return quota;
  };

  const buildFamilyFreqMap = (items) => {
    const freq = new Map();
    for (const st of items) {
      const sig = getStateFamilySignature(st);
      freq.set(sig, (freq.get(sig) || 0) + 1);
    }
    return freq;
  };

  const takeWithFamilyCap = (out, picked, familyUsed, st, cap) => {
    if (!st || picked.has(st)) return false;
    const sig = getStateFamilySignature(st);
    const used = familyUsed.get(sig) || 0;
    if (used >= cap) return false;
    familyUsed.set(sig, used + 1);
    out.push(st);
    picked.add(st);
    return true;
  };

  const pickBeamLexicographicDiverse = (
    candidates,
    beamWidth,
    mode,
    specialPriorities,
    initTargetCombo
  ) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    sortCandidatesLexicographic(candidates);
    const familyFreq = buildFamilyFreqMap(candidates);
    const out = [];
    const picked = new Set();
    const familyUsed = new Map();
    const familyCap = VISITED_FAMILY_CAP;

    const eliteN = Math.min(candidates.length, Math.max(6, (beamWidth / 3) | 0));
    for (let i = 0; i < eliteN && out.length < beamWidth; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }

    if (out.length >= beamWidth) return out.slice(0, beamWidth);

    const buckets = new Map();

    for (let i = eliteN; i < candidates.length; i++) {
      const st = candidates[i];
      const doneCount = sumSpecialDoneFromTuple(
        st.specialTuple || EMPTY_SPECIAL_TUPLE
      );
      const rectGuideTier = Math.floor(Number(st.extraCtx?.rectGuide || 0) / 1000);
      const initComboTier = st.ev.initialCombos || 0;
      const initClearTier = st.ev.initialClearedCount || 0;
      const comboTier = st.ev.combos || 0;
      const clearTier = st.ev.clearedCount || 0;
      const initDistTier = Math.min(12, getInitComboDistance(st.ev));
      const requirementTier = (
        st.ev?.ruleRequirementTuple || EMPTY_REQUIREMENT_TUPLE
      )
        .slice(0, 6)
        .join(",");

      const key = [
        st.violatesN2 ? 0 : 1,
        requirementTier,
        doneCount,
        initDistTier,
        st.ev.initialAllEqual ? 1 : 0,
        initComboTier,
        initClearTier,
        comboTier,
        clearTier,
        rectGuideTier,
      ].join("|");

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(st);
    }

    for (const arr of buckets.values()) {
      precomputeCandidateRanks(
        arr,
        mode,
        specialPriorities,
        initTargetCombo,
        ruleProfile
      );
      arr.sort((a, b) => {
        const t = lexCompareDesc(a._poolRankCached, b._poolRankCached);
        if (t !== 0) return t;

        const af = familyFreq.get(getStateFamilySignature(a)) || 1;
        const bf = familyFreq.get(getStateFamilySignature(b)) || 1;
        if (af !== bf) return af - bf;

        const ad = getInitComboDistance(a.ev);
        const bd = getInitComboDistance(b.ev);
        if (ad !== bd) return ad - bd;

        if ((a.ev.initialAllEqual ? 1 : 0) !== (b.ev.initialAllEqual ? 1 : 0)) {
          return (b.ev.initialAllEqual ? 1 : 0) - (a.ev.initialAllEqual ? 1 : 0);
        }

        if ((a.ev.initialCombos || 0) !== (b.ev.initialCombos || 0)) {
          return (b.ev.initialCombos || 0) - (a.ev.initialCombos || 0);
        }

        if (
          (a.ev.initialClearedCount || 0) !== (b.ev.initialClearedCount || 0)
        ) {
          return (
            (b.ev.initialClearedCount || 0) - (a.ev.initialClearedCount || 0)
          );
        }

        return b.score - a.score;
      });
    }

    const pool = [];
    const bucketKeys = Array.from(buckets.keys());
    const bucketCursor = new Map();
    for (const k of bucketKeys) bucketCursor.set(k, 0);
    let idx = 0;

    while (bucketKeys.length > 0) {
      const pickIdx = idx % bucketKeys.length;
      const k = bucketKeys[pickIdx];
      const arr = buckets.get(k);
      const cur = bucketCursor.get(k) || 0;

      if (arr && cur < arr.length) {
        pool.push(arr[cur]);
        bucketCursor.set(k, cur + 1);
        idx++;
      } else {
        buckets.delete(k);
        bucketCursor.delete(k);
        bucketKeys.splice(pickIdx, 1);
      }
    }

    for (const st of pool) {
      if (out.length >= beamWidth) break;
      takeWithFamilyCap(out, picked, familyUsed, st, familyCap);
    }

    for (const st of candidates) {
      if (out.length >= beamWidth) break;
      if (!picked.has(st)) {
        out.push(st);
        picked.add(st);
      }
    }

    return out.slice(0, beamWidth);
  };

  const pickBeamCombo = (candidates, beamWidth, explore) => {
    if (hasSpecial) sortCandidatesLexicographic(candidates);
    else sortCandidatesNoSpecialCombo(candidates);

    const BW = beamWidth;
    const familyFreq = buildFamilyFreqMap(candidates);
    const out = [];
    const picked = new Set();
    const familyUsed = new Map();
    const familyCap = VISITED_FAMILY_CAP;
    const eliteN = Math.min(
      candidates.length,
      Math.max(6, ((BW * 0.28) | 0))
    );

    for (let i = 0; i < eliteN && out.length < BW; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }

    if (out.length < Math.min(eliteN, BW)) {
      for (let i = 0; i < eliteN && out.length < BW; i++) {
        if (picked.has(candidates[i])) continue;
        out.push(candidates[i]);
        picked.add(candidates[i]);
      }
    }

    if (out.length >= BW) return out;

    const maxTier = SEARCH_PROFILE.comboMaxTier;
    const quotaW = SEARCH_PROFILE.comboQuotaW;
    const counts = new Array(maxTier + 1).fill(0);

    for (let i = eliteN; i < candidates.length; i++) {
      const miss = Math.min(maxTier, getMissTier(candidates[i]));
      if (miss <= maxTier) counts[miss]++;
    }

    const quota = buildQuota(counts, BW - out.length, quotaW);
    const took = new Array(maxTier + 1).fill(0);
    const usedPos = new Set();
    const usedRegion = new Set();

    for (const st of out) {
      usedPos.add((st.r << 8) | st.c);
      if (explore) usedRegion.add(regionOf(st.r, st.c));
    }

    const regionSkipProb = SEARCH_PROFILE.comboExploreRegionSkipProb;

    for (let pass = 0; pass < 4 && out.length < BW; pass++) {
      for (let i = eliteN; i < candidates.length && out.length < BW; i++) {
        const st = candidates[i];
        const miss = Math.min(maxTier, getMissTier(st));
        if (miss > maxTier) continue;
        if (pass < 2 && took[miss] >= quota[miss]) continue;

        const pc = (st.r << 8) | st.c;
        const rg = regionOf(st.r, st.c);

        if (pass === 0) {
          if (usedPos.has(pc)) continue;
          if (explore && usedRegion.has(rg) && searchRandom() < regionSkipProb) {
            continue;
          }
        } else if (pass === 1) {
          if (usedPos.has(pc)) continue;
        } else if (pass === 2) {
          if (
            explore &&
            usedRegion.has(rg) &&
            searchRandom() < regionSkipProb * 0.6
          ) {
            continue;
          }
        }

        if (!takeWithFamilyCap(out, picked, familyUsed, st, familyCap)) continue;

        usedPos.add(pc);
        if (explore) usedRegion.add(rg);
        if (miss <= maxTier) took[miss]++;
      }
    }

    if (out.length < BW) {
      for (const st of candidates) {
        if (out.length >= BW) break;
        if (picked.has(st)) continue;

        const sig = getStateFamilySignature(st);
        const rarity = familyFreq.get(sig) || 1;
        if (rarity > 1 && searchRandom() < 0.08) continue;

        out.push(st);
        picked.add(st);
      }
    }

    return out.slice(0, BW);
  };

  const pickBeamStepsNoSpecial = (candidates, beamWidth) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const BW = beamWidth;
    sortCandidatesNoSpecialCombo(candidates);
    const minSteps = candidates.reduce(
      (mn, st) => Math.min(mn, stepsOf(st.node)),
      Infinity
    );
    const maxCombos = candidates.reduce(
      (mx, st) => Math.max(mx, st?.ev?.combos || 0),
      -Infinity
    );
    const modeAnchors = getNoSpecialAnchors(
      Number.isFinite(minSteps) ? minSteps : 0,
      Number.isFinite(maxCombos) ? maxCombos : 0
    );
    const familyFreq = buildFamilyFreqMap(candidates);
    const familyUsed = new Map();
    const picked = new Set();
    const familyCap = VISITED_FAMILY_CAP;

    const eliteN = Math.min(candidates.length, Math.max(10, (BW / 3) | 0));
    const out = [];
    for (let i = 0; i < eliteN && out.length < BW; i++) {
      takeWithFamilyCap(out, picked, familyUsed, candidates[i], familyCap);
    }

    if (out.length < Math.min(BW, eliteN)) {
      for (let i = 0; i < eliteN && out.length < BW; i++) {
        const st = candidates[i];
        if (picked.has(st)) continue;
        out.push(st);
        picked.add(st);
      }
    }

    if (out.length >= BW) return out.slice(0, BW);

    const buckets = new Map();

    for (let i = eliteN; i < candidates.length; i++) {
      const st = candidates[i];
      const legal = st.violatesN2 ? 0 : 1;
      const initCombos = st.ev.initialCombos || 0;
      const initCleared = st.ev.initialClearedCount || 0;
      const combos = st.ev.combos || 0;
      const cleared = st.ev.clearedCount || 0;
      const initExact = hitsInitTargetComboExactly(st.ev) ? 1 : 0;
      const initEq = st.ev.initialAllEqual ? 1 : 0;
      const initDist = getInitComboDistance(st.ev);
      const miss = Math.min(
        SEARCH_PROFILE.stepMaxTier,
        Math.max(0, target - combos)
      );
      const adaptiveMajor = getAdaptiveMajor(st.ev);
      const steps = stepsOf(st.node);

      const key = hasInitSensitiveSpecial
        ? [
            legal,
            initExact,
            initDist,
            initEq,
            initCombos,
            initCleared,
            miss,
            steps,
            combos,
            cleared,
          ].join("|")
        : [
            legal,
            initExact,
            initDist,
            initEq,
            initCombos,
            initCleared,
            miss,
            steps,
            adaptiveMajor,
            combos,
            cleared,
          ].join("|");

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(st);
    }

    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        const aInit = hitsInitTargetComboExactly(a.ev) ? 1 : 0;
        const bInit = hitsInitTargetComboExactly(b.ev) ? 1 : 0;
        const aDist = getInitComboDistance(a.ev);
        const bDist = getInitComboDistance(b.ev);
        const aSteps = stepsOf(a.node);
        const bSteps = stepsOf(b.node);

        const ta = buildNoSpecialRankTuple(
          a.ev,
          a.score,
          aSteps,
          a.violatesN2,
          aInit,
          aDist,
          modeAnchors
        );
        const tb = buildNoSpecialRankTuple(
          b.ev,
          b.score,
          bSteps,
          b.violatesN2,
          bInit,
          bDist,
          modeAnchors
        );

        const t = lexTupleCompareDesc(ta, tb);
        if (t !== 0) return t;

        const af = familyFreq.get(getStateFamilySignature(a)) || 1;
        const bf = familyFreq.get(getStateFamilySignature(b)) || 1;
        return af - bf;
      });
    }

    const bucketKeys = Array.from(buckets.keys());
    const bucketCursor = new Map();
    for (const k of bucketKeys) bucketCursor.set(k, 0);
    let idx = 0;

    while (out.length < BW && bucketKeys.length > 0) {
      const pickIdx = idx % bucketKeys.length;
      const k = bucketKeys[pickIdx];
      const arr = buckets.get(k);
      const cur = bucketCursor.get(k) || 0;

      if (arr && cur < arr.length) {
        const st = arr[cur];
        bucketCursor.set(k, cur + 1);
        if (!takeWithFamilyCap(out, picked, familyUsed, st, familyCap)) {
          continue;
        }
        idx++;
      } else {
        buckets.delete(k);
        bucketCursor.delete(k);
        bucketKeys.splice(pickIdx, 1);
      }
    }

    if (out.length < BW) {
      for (const st of candidates) {
        if (out.length >= BW) break;
        if (picked.has(st)) continue;
        out.push(st);
        picked.add(st);
      }
    }

    return out.slice(0, BW);
  };

  const materializePendingPushMove = (mv) => {
    if (!mv) return null;
    if (mv.nextBoard && mv.hole) return mv;
    if (!mv.parentBoard) return null;

    const nextBoard = clone2D(mv.parentBoard);
    let nextHole;

    if (mv.transitionKind === "enter") {
      nextBoard[mv.r][mv.c] = -1;
      nextHole = { r: mv.r, c: mv.c };
    } else {
      if (!mv.parentHole) return null;
      nextHole = holeStepInPlace(nextBoard, mv.parentHole, {
        r: mv.r,
        c: mv.c,
      });
    }

    mv.nextBoard = nextBoard;
    mv.hole = nextHole;
    mv.parentBoard = null;
    mv.parentHole = null;
    return mv;
  };

  for (let step = 0; step < solverMaxSteps; step++) {
    let candidates = [];
    const pendingPushMoves = [];
    const pendingTerminalMoves = [];

    const phaseIdx = getDepthPhaseIndex(step);
    const phaseScale = getDepthPhaseBeamScale(phaseIdx);
    const adaptiveBeamWidth = Math.max(
      24,
      Math.min(
        baseBeamWidth,
        Math.round(
          getAdaptiveBeamWidth(
            step,
            solverMaxSteps,
            stagnantRounds,
            diversityRatio
          ) * phaseScale
        )
      )
    );

    if (
      bestReachedSteps !== Infinity &&
      step >= bestReachedSteps + (hasSpecial ? 0 : SEARCH_PROFILE.bestStepSlack)
    ) {
      break;
    }

    for (const state of beam) {
      if (nodesExpanded > maxNodesEffective) break;
      if (state.locked) continue;

      for (const [dr, dc] of dirsPlay) {
        if (nodesExpanded > maxNodesEffective) break;

        const nr = state.r + dr;
        const nc = state.c + dc;

        if (nr < 0 || nr >= TOTAL_ROWS || nc < 0 || nc >= COLS) continue;
        if (!useRow0 && nr === 0) continue;
        if (
          state.node?.parent &&
          nr === state.node.parent.r &&
          nc === state.node.parent.c
        ) {
          continue;
        }

        const newNode = makeNode(state.node, nr, nc);
        const dirSig = `${dr},${dc}`;
        const cheapSig = `${getNodeDirectionSignature(newNode)}|${dirSig}`;

        if (useRow0 && state.r === 0) {
          if (nr !== 1) continue;

          const destVal = state.board[nr][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const nextLocked = chk.locked || isAtQ2(nr, nc);
          let nextBoard = null;
          let nextHole = null;
          if (!DEFER_MOVE_MATERIALIZATION) {
            nextBoard = clone2D(state.board);
            nextBoard[nr][nc] = -1;
            nextHole = { r: nr, c: nc };
          }

          pendingPushMoves.push({
            nextBoard,
            held: state.held,
            hole: nextHole,
            parentBoard: DEFER_MOVE_MATERIALIZATION ? state.board : null,
            parentHole: null,
            transitionKind: "enter",
            r: nr,
            c: nc,
            node: newNode,
            locked: nextLocked,
            parentExtraCtx: state.extraCtx,
            parentHumanPlan: state.humanPlan,
            moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "enter"),
            cheapScore: getGuidedMoveCheapScore(
              state,
              nr,
              nc,
              nextLocked,
              step
            ),
            legacyCheapScore: getMoveCheapScore(
              state,
              nr,
              nc,
              nextLocked,
              step
            ),
            cheapSig,
            familySig: `${cheapSig}|enter`,
          });

          nodesExpanded++;
          reportProgress();
          continue;
        }

        if (useRow0 && state.r >= PLAY_ROWS_START && nr === 0) {
          const destVal = state.board[0][nc];
          const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const evalBoard = clone2D(state.board);
          if (state.hole) evalBoard[state.hole.r][state.hole.c] = destVal;

          pendingTerminalMoves.push({
            evalBoard,
            node: newNode,
            parentExtraCtx: state.extraCtx,
            parentHumanPlan: state.humanPlan,
            moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "exit"),
            cheapScore:
              getGuidedMoveCheapScore(
                state,
                nr,
                nc,
                chk.locked || isAtQ2(nr, nc),
                step
              ) + 40,
            cheapSig,
            familySig: `${cheapSig}|exit`,
          });

          nodesExpanded++;
          reportProgress();
          continue;
        }

        if (nr < PLAY_ROWS_START || !state.hole) continue;

        const destVal = state.board[nr][nc];
        const chk = stepConstraint(destVal);
          if (!chk.ok) continue;

          const nextLocked = chk.locked || isAtQ2(nr, nc);
          let nextBoard = null;
          let nextHole = null;
          if (!DEFER_MOVE_MATERIALIZATION) {
            nextBoard = clone2D(state.board);
            nextHole = holeStepInPlace(nextBoard, state.hole, {
              r: nr,
              c: nc,
            });
          }

          pendingPushMoves.push({
            nextBoard,
            held: state.held,
            hole: nextHole,
            parentBoard: DEFER_MOVE_MATERIALIZATION ? state.board : null,
            parentHole: DEFER_MOVE_MATERIALIZATION ? state.hole : null,
            transitionKind: "move",
            r: nr,
          c: nc,
          node: newNode,
          locked: nextLocked,
          parentExtraCtx: state.extraCtx,
          parentHumanPlan: state.humanPlan,
          moveCtx: makeHumanMoveCtx(state.r, state.c, nr, nc, "move"),
          cheapScore: getGuidedMoveCheapScore(
            state,
            nr,
            nc,
            nextLocked,
            step
          ),
          legacyCheapScore: getMoveCheapScore(
            state,
            nr,
            nc,
            nextLocked,
            step
          ),
          cheapSig,
          familySig: `${cheapSig}|${nr},${nc}`,
        });

        nodesExpanded++;
        reportProgress();
      }
    }

    if (!pendingPushMoves.length && !pendingTerminalMoves.length) break;

    for (const mv of pendingTerminalMoves) {
      const rawRes = evalState(
        mv.evalBoard,
        mv.node,
        stepsOf(mv.node),
        0,
        mv.parentExtraCtx
      );
      const res = applyHumanPlanToEvalResult(
        rawRes,
        mv.parentHumanPlan,
        mv.moveCtx,
        stepsOf(mv.node)
      );
      if (!res) continue;

      pushTopCandidate(
        res.ev,
        mv.node,
        res.score,
        res.violatesN2,
        res.extraCtx,
        res.specialTuple
      );
      considerBest(
        res.ev,
        res.score,
        mv.node,
        res.violatesN2,
        res.extraCtx,
        res.specialTuple
      );
    }

    const evalBudget = getCheapEvalBudget(
      pendingPushMoves.length,
      adaptiveBeamWidth,
      stagnantRounds,
      hasSpecial || hasRuleRequirements
    );

    const selectedPushMoves =
      evalBudget >= pendingPushMoves.length
        ? pendingPushMoves
        : pickCheapPortfolioMoves(pendingPushMoves, evalBudget);

    const selectedMoveMeta = acquireArrayFromPool(
      EVAL_PARALLEL_SHARED.moveMetaArrayPool
    );
    const pendingParallelJobs = acquireArrayFromPool(
      EVAL_PARALLEL_SHARED.parallelJobArrayPool
    );
    let parallelPrimitivesByIndex = null;

    try {
      for (let idx = 0; idx < selectedPushMoves.length; idx++) {
        const mv = selectedPushMoves[idx];
        if (!materializePendingPushMove(mv)) continue;
        const boardKey = getBoardKey(mv.nextBoard);
        const primitiveCacheKey = getEvalPrimitiveCacheKey(boardKey, mv.hole, mv.held);
        const cached = getCachedEvalPrimitives(primitiveCacheKey);

        const meta = acquireMoveMeta();
        const materializedIndex = selectedMoveMeta.length;
        meta.mv = mv;
        meta.idx = materializedIndex;
        meta.boardKey = boardKey;
        meta.primitiveCacheKey = primitiveCacheKey;
        meta.primitives = cached;
        selectedMoveMeta.push(meta);

        if (!cached) {
          const job = acquireParallelJob();
          job.index = materializedIndex;
          job.nextBoard = mv.nextBoard;
          job.hole = mv.hole;
          job.held = mv.held;
          pendingParallelJobs.push(job);
        }
      }

      parallelPrimitivesByIndex =
        pendingParallelJobs.length > 0
          ? await runParallelPrimitiveEval(
              pendingParallelJobs,
              selectedMoveMeta.length
            )
          : null;

      for (let i = 0; i < selectedMoveMeta.length; i++) {
        const meta = selectedMoveMeta[i];

        if (!meta.primitives && Array.isArray(parallelPrimitivesByIndex)) {
          const fromWorker = parallelPrimitivesByIndex[meta.idx];
          if (fromWorker) {
            meta.primitives = fromWorker;
            putCachedEvalPrimitives(meta.primitiveCacheKey, fromWorker);
          }
        }

        if (!meta.primitives) {
          const evalBoard = boardWithHeldFilled(
            meta.mv.nextBoard,
            meta.mv.hole,
            meta.mv.held
          );
          meta.primitives = computeEvalPrimitives(evalBoard);
          putCachedEvalPrimitives(meta.primitiveCacheKey, meta.primitives);
        }

        tryPushState({
          nextBoard: meta.mv.nextBoard,
          held: meta.mv.held,
          hole: meta.mv.hole,
          r: meta.mv.r,
          c: meta.mv.c,
          node: meta.mv.node,
          locked: meta.mv.locked,
          scoreBias: 0,
          outCandidates: candidates,
          parentExtraCtx: meta.mv.parentExtraCtx,
          parentHumanPlan: meta.mv.parentHumanPlan,
          moveCtx: meta.mv.moveCtx,
          familySig: meta.mv.familySig || meta.mv.cheapSig || null,
          precomputedBoardKey: meta.boardKey,
          precomputedPrimitives: meta.primitives,
        });
      }
    } finally {
      if (Array.isArray(parallelPrimitivesByIndex)) {
        releaseArrayToPool(
          EVAL_PARALLEL_SHARED.parallelResultArrayPool,
          parallelPrimitivesByIndex,
          EVAL_POOL_MAX.parallelResultArray
        );
      }

      for (let i = 0; i < pendingParallelJobs.length; i++) {
        releaseParallelJob(pendingParallelJobs[i]);
      }
      releaseArrayToPool(
        EVAL_PARALLEL_SHARED.parallelJobArrayPool,
        pendingParallelJobs,
        EVAL_POOL_MAX.parallelJobArray
      );

      for (let i = 0; i < selectedMoveMeta.length; i++) {
        releaseMoveMeta(selectedMoveMeta[i]);
      }
      releaseArrayToPool(
        EVAL_PARALLEL_SHARED.moveMetaArrayPool,
        selectedMoveMeta,
        EVAL_POOL_MAX.moveMetaArray
      );
    }

    if (!candidates.length) {
      if (depthMilestones.includes(step + 1)) flushPendingPools();
      break;
    }

    if (!hasSpecial) {
      if (priority === "combo") {
        beam = pickBeamCombo(candidates, adaptiveBeamWidth, true);
      } else {
        beam = pickBeamStepsNoSpecial(candidates, adaptiveBeamWidth);
      }
    } else {
      beam = pickBeamLexicographicDiverse(
        candidates,
        adaptiveBeamWidth,
        mode,
        specialPriority,
        initTargetCombo
      );
    }

    const currentBestScore = Number(bestGlobal.score);
    if (
      Number.isFinite(currentBestScore) &&
      currentBestScore > lastBestScore + 1e-6
    ) {
      lastBestScore = currentBestScore;
      stagnantRounds = 0;
    } else {
      stagnantRounds++;
    }

    diversityRatio = getDiversityRatio(beam);
    if (depthMilestones.includes(step + 1)) flushPendingPools();

    reportProgress(true);
    const stepNow = nowMs();
    const stepDuration = stepNow - lastStepAt;
    lastStepAt = stepNow;

    if (stepDuration > 26) {
      adaptiveYieldStride = Math.max(1, adaptiveYieldStride - 1);
    } else if (stepDuration < 8) {
      const maxStride = enableParallelEval ? 12 : 6;
      adaptiveYieldStride = Math.min(maxStride, adaptiveYieldStride + 1);
    }

    const shouldYieldByStride = step - lastYieldStep >= adaptiveYieldStride;
    const shouldYieldByTime = stepNow - lastYieldAt >= 16;
    if (
      SHOULD_YIELD_TO_BROWSER &&
      (nodesExpanded > maxNodesEffective ||
        shouldYieldByStride ||
        shouldYieldByTime)
    ) {
      await yieldToBrowser();
      lastYieldAt = nowMs();
      lastYieldStep = step;
    }

    if (nodesExpanded > maxNodesEffective) break;
  }

  flushPendingPools();

  reportProgress(true);

  bestGlobal.path = bestGlobal.node ? buildPath(bestGlobal.node) : [];
  bestGlobal.nodesExpanded = nodesExpanded;
  delete bestGlobal.node;
  const finalExtraCtx = {
    rectGuide: bestGlobal.rectGuide || 0,
    initialCombos: bestGlobal.initialCombos || 0,
    initialClearedCount: bestGlobal.initialClearedCount || 0,
    initialMatchSizes: bestGlobal.initialMatchSizes || [],
    initialComboSizes: bestGlobal.initialComboSizes || [],
    initialAllEqual: !!bestGlobal.initialAllEqual,
    initialDistinctSizeCount: bestGlobal.initialDistinctSizeCount || 0,
    initialComboDistance: bestGlobal.initialComboDistance,
    initialComboExact: !!bestGlobal.initialComboExact,
    initTargetCombo:
      Number.isFinite(Number(initTargetCombo)) && Number(initTargetCombo) >= 0
        ? Number(initTargetCombo)
        : null,
  };

  return {
    ...bestGlobal,
    topSteps: topStepCandidates,
    topCombos: topComboCandidates,
    success:
      !bestGlobal.violatesN2 && isSolvedGoal(bestGlobal, finalExtraCtx),
  };
};

const isDevSolverBench =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("solverBench") === "1";

const runDevSolverBenchmark = async () => {
  if (!isDevSolverBench || devBenchRunning) return;

  const boards = [
    [
      [0, 2, 3, 4, 2, 1],
      [2, 0, 0, 2, 4, 1],
      [0, 5, 2, 5, 0, 1],
      [2, 1, 2, 5, 1, 2],
      [5, 4, 1, 0, 3, 1],
      [1, 1, 4, 3, 5, 0],
    ],
    [
      [1, 1, 5, 1, 5, 0],
      [3, 4, 2, 3, 3, 3],
      [0, 1, 3, 2, 2, 5],
      [3, 3, 2, 5, 1, 2],
      [0, 1, 3, 1, 2, 0],
      [0, 4, 2, 4, 3, 0],
    ],
    [
      [1, 1, 3, 2, 2, 3],
      [2, 0, 3, 3, 3, 4],
      [4, 0, 0, 3, 3, 0],
      [3, 4, 4, 5, 0, 4],
      [0, 3, 1, 3, 3, 0],
      [0, 1, 2, 3, 3, 1],
    ],
    [
      [5, 4, 1, 3, 4, 5],
      [1, 3, 1, 4, 0, 4],
      [4, 3, 5, 3, 5, 1],
      [0, 2, 2, 1, 2, 2],
      [1, 1, 0, 1, 3, 5],
      [2, 0, 1, 5, 5, 4],
    ],
    [
      [4, 2, 0, 1, 3, 2],
      [2, 5, 4, 0, 1, 3],
      [0, 0, 3, 4, 4, 5],
      [1, 2, 5, 5, 0, 2],
      [3, 4, 1, 2, 3, 1],
      [5, 3, 2, 0, 4, 1],
    ],
    [
      [3, 0, 5, 2, 4, 1],
      [1, 4, 0, 5, 2, 3],
      [2, 1, 3, 0, 5, 4],
      [4, 5, 2, 1, 3, 0],
      [0, 3, 4, 2, 1, 5],
      [5, 2, 1, 4, 0, 3],
    ],
  ];

  const defaultRules = makeDefaultRuleProfile();
  const requirementRules = {
    ...makeDefaultRuleProfile(),
    requirements: [
      {
        orb: 0,
        size: 3,
        count: 1,
        match: "exact",
      },
      {
        orb: 1,
        size: 3,
        count: 1,
        match: "exact",
      },
    ],
  };
  const scenarios = [
    {
      name: "combo",
      target: 7,
      mode: "horizontal",
      priority: "combo",
      ruleProfile: defaultRules,
    },
    {
      name: "steps",
      target: 6,
      mode: "horizontal",
      priority: "steps",
      ruleProfile: defaultRules,
    },
    {
      name: "requirement",
      target: 6,
      mode: "horizontal",
      priority: "combo",
      ruleProfile: requirementRules,
    },
  ];
  const baseConfig = {
    beamWidth: 120,
    maxSteps: 30,
    maxNodes: 8000,
    evalWorkers: 1,
    humanPlanner: false,
    reversePlanner: false,
    reverseMaxSteps: 30,
    searchSeed: 20260613,
    stepPenalty: 0,
    potentialWeight: 10,
    clearedWeight: 300,
    browserYield: false,
  };

  const variants = {
    baseline: {
      deferMoveMaterialization: false,
      cheapLocalGuidance: false,
    },
    candidate: {
      deferMoveMaterialization: true,
      cheapLocalGuidance: true,
      cheapLegacyReserve: 0.25,
      cheapEvalScale: 2,
      cheapEvalConstraintScale: 2.5,
    },
  };

  const runOne = async (
    variant,
    flags,
    boardIndex,
    scenario,
    repetition = -1
  ) => {
    const startedAt = performance.now();
    const result = await beamSolve(
      boards[boardIndex].map((row) => row.slice()),
      { ...baseConfig, ...flags },
      scenario.target,
      scenario.mode,
      scenario.priority,
      true,
      true,
      [],
      -1,
      false,
      scenario.ruleProfile,
      null
    );
    const elapsedMs = performance.now() - startedAt;
    return {
      variant,
      repetition,
      boardIndex,
      scenario: scenario.name,
      elapsedMs,
      success: !!result.success,
      requirementSatisfied:
        scenario.name !== "requirement" ||
        Number(result?.ruleRequirementTuple?.[0] || 0) === 1,
      combos: Number(result.combos || 0),
      steps: Math.max(0, (result.path?.length || 1) - 1),
      nodes: Number(result.nodesExpanded || 0),
    };
  };

  const summarize = (rows) => {
    const sortedTimes = rows
      .map((row) => row.elapsedMs)
      .sort((a, b) => a - b);
    const successful = rows.filter((row) => row.success);
    const requirementRows = rows.filter(
      (row) => row.scenario === "requirement"
    );
    const avg = (values) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

    return {
      cases: rows.length,
      avgMs: avg(rows.map((row) => row.elapsedMs)),
      p95Ms:
        sortedTimes[
          Math.min(
            sortedTimes.length - 1,
            Math.floor(sortedTimes.length * 0.95)
          )
        ] || 0,
      successRate: avg(rows.map((row) => (row.success ? 1 : 0))),
      requirementRate: avg(
        requirementRows.map((row) => (row.requirementSatisfied ? 1 : 0))
      ),
      avgCombos: avg(rows.map((row) => row.combos)),
      avgStepsOnSuccess: avg(successful.map((row) => row.steps)),
      avgNodes: avg(rows.map((row) => row.nodes)),
    };
  };

  setDevBenchRunning(true);
  setDevBenchOutput("warming up");
  try {
    const variantNames = Object.keys(variants);
    for (const variant of variantNames) {
      await runOne(variant, variants[variant], 0, scenarios[0]);
    }

    const rowsByVariant = Object.fromEntries(
      variantNames.map((variant) => [variant, []])
    );
    let caseIndex = 0;
    const repetitions = 3;
    const totalCases = boards.length * scenarios.length * repetitions;
    for (let repetition = 0; repetition < repetitions; repetition++) {
      for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
        for (const scenario of scenarios) {
          const rotateBy = caseIndex % variantNames.length;
          const order = [
            ...variantNames.slice(rotateBy),
            ...variantNames.slice(0, rotateBy),
          ];
          for (const variant of order) {
            const row = await runOne(
              variant,
              variants[variant],
              boardIndex,
              scenario,
              repetition
            );
            rowsByVariant[variant].push(row);
          }
          caseIndex++;
          setDevBenchOutput(`running ${caseIndex}/${totalCases}`);
        }
      }
    }
    const summaries = Object.fromEntries(
      variantNames.map((variant) => [
        variant,
        summarize(rowsByVariant[variant]),
      ])
    );
    const baseline = summaries.baseline;
    const deltas = Object.fromEntries(
      variantNames
        .filter((variant) => variant !== "baseline")
        .map((variant) => {
          const summary = summaries[variant];
          return [
            variant,
            {
              avgMs: summary.avgMs - baseline.avgMs,
              p95Ms: summary.p95Ms - baseline.p95Ms,
              successRate: summary.successRate - baseline.successRate,
              requirementRate:
                summary.requirementRate - baseline.requirementRate,
              avgCombos: summary.avgCombos - baseline.avgCombos,
              avgStepsOnSuccess:
                summary.avgStepsOnSuccess - baseline.avgStepsOnSuccess,
              avgNodes: summary.avgNodes - baseline.avgNodes,
            },
          ];
        })
    );
    setDevBenchOutput(
      JSON.stringify(
        {
          protocol: {
            warmupCasesPerVariant: 1,
            repetitions,
            interleaved: variantNames,
            browserYield: false,
            maxNodes: baseConfig.maxNodes,
            beamWidth: baseConfig.beamWidth,
            searchSeed: baseConfig.searchSeed,
          },
          summaries,
          deltas,
          rowsByVariant,
        },
        null,
        2
      )
    );
  } catch (error) {
    setDevBenchOutput(
      JSON.stringify(
        {
          error: error?.message || String(error),
          stack: error?.stack || "",
        },
        null,
        2
      )
    );
  } finally {
    setDevBenchRunning(false);
  }
};

//536244441114
const stopToBase = useCallback((clearStep = true) => {
	  // 1) ????
	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);
	  replayAnimRef.current.raf = 0;

	  // 2) 皜?????
	  setIsReplaying(false);
	  setIsPaused(false);
	  setFloating(null);
	  setReplayBoard(null);
	  setHolePos(null);

	  // 3) ????嚗??baseBoardRef嚗?
	  if (baseBoardRef.current?.length) {
		setBoard(baseBoardRef.current.map(r => [...r]));
	  }

	  // 4) Stop ?臬閬?頝臬???芷?憪?
	  if (clearStep) setCurrentStep(-1);
	}, []);
const [solutionPools, setSolutionPools] = useState({
  steps: [],
  combo: [],
});
const [selectedPoolIndex, setSelectedPoolIndex] = useState(0);
const [solutionPreview, setSolutionPreview] = useState(null);

const solutionPoolsRef = useRef({
  steps: [],
  combo: [],
});

const solutionPoolContextRef = useRef({
  resetKey: "",
});

useEffect(() => {
  solutionPoolsRef.current = solutionPools;
}, [solutionPools]);

const getPathSteps = (path) => Math.max(0, (path?.length || 0) - 1);

const getNormalizedSpecialSlots = (specialPriorities) => {
  const src = Array.isArray(specialPriorities) ? specialPriorities : [];
  const out = src.slice(0, 3);

  while (out.length < 3) out.push({ type: "none" });

  return out.map((sp) =>
    sp && sp.type ? sp : { type: "none" }
  );
};

const getSolutionSpecialSlotStatus = (sol, specialPriorities) => {
  const slots = getNormalizedSpecialSlots(specialPriorities);
  const extraCtx = {
    rectGuide: Number(sol?.rectGuide || 0),
  };

  return slots.map((sp) => {
    if (!sp || sp.type === "none") {
      return {
        type: "none",
        done: true,
        guide: 0,
        label: "none",
      };
    }

    const progress = getSingleSpecialProgress(sol, sp, extraCtx);

    return {
      type: sp.type,
      done: !!progress.done,
      guide: Number(progress.guide || 0),
      label: getSpecialPriorityLabel(sp),
    };
  });
};

const isSolutionAllSpecialSatisfied = (sol, specialPriorities) => {
  const normalized = normalizeSpecialPriorityList(specialPriorities);
  const extraCtx = {
    rectGuide: Number(sol?.rectGuide || 0),
  };
  return isAllSpecialSatisfied(sol, normalized, extraCtx);
};

const hasAnyShapeSpecial = (specialPriorities) => {
  return normalizeSpecialPriorityList(specialPriorities).some(
    (sp) => sp.type === "cross" || sp.type === "l" || sp.type === "t"
  );
};

const hasAnyRectSpecial = (specialPriorities) => {
  return normalizeSpecialPriorityList(specialPriorities).some(
    (sp) => sp.type === "rect"
  );
};

const getRectTotalCount = (sol) => {
  return (
    Object.values(sol?.initialPatternCounts?.rect || {}).reduce(
      (acc, g) => acc + (g?.total || 0),
      0
    ) || 0
  );
};

const filterSolutionsByMaxSteps = (list, maxSteps) => {
  return (list || []).filter((sol) => getPathSteps(sol.path) <= maxSteps);
};

const getSolutionGroupKey = (sol) => {
  const initCombo = sol.initialCombos || 0;
  const skyfallCombo = sol.skyfallCombos || 0;
  return `${initCombo}|${skyfallCombo}`;
};

const getSolutionMergeSignature = (sol) => {
  const initialCombos = Number(sol?.initialCombos || 0);
  const totalCombos = Number(sol?.combos || 0);
  const skyfallCombos = Math.max(0, totalCombos - initialCombos);

  // ?芰????+ ??蝯??? merge signature
  return `${initialCombos}|${skyfallCombos}`;
};

const lexCompareDesc = (a, b) => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;
  }
  return 0;
};

const EMPTY_SPECIAL_TUPLE = Object.freeze([]);

const shouldRefreshRectGuide = (steps, prevRectGuide, hasRectSpecial) => {
  if (!hasRectSpecial) return false;
  if (prevRectGuide == null) return true;
  if (steps <= 6) return true;
  return steps % 2 === 0;
};

const buildVisitedTupleFast = ({
  ev,
  steps,
  score,
  mode,
  hasSpecial,
  specialTuple,
  violatesN2,
  initExact,
}) => {
  if (!hasSpecial) {
    return [
      violatesN2 ? 0 : 1,
      ev.combos || 0,
      mode === "vertical"
        ? ev.verticalCombos || 0
        : mode === "horizontal"
        ? ev.horizontalCombos || 0
        : 0,
      ev.clearedCount || 0,
      initExact ? 1 : 0,
      -steps,
      Math.floor(score),
    ];
  }

  return [
    violatesN2 ? 0 : 1,
    sumSpecialDoneFromTuple(specialTuple),
    sumSpecialGuideFromTuple(specialTuple),
    ev.combos || 0,
    ev.clearedCount || 0,
    initExact ? 1 : 0,
    -steps,
    Math.floor(score),
  ];
};

const buildFinalRankTupleFast = ({
  ev,
  steps,
  score,
  specialTuple,
  violatesN2,
  initExact,
}) => {
  return [
    violatesN2 ? 0 : 1,
    ...(specialTuple || EMPTY_SPECIAL_TUPLE),
    initExact ? 1 : 0,
    ev.combos || 0,
    ev.clearedCount || 0,
    -steps,
    Math.floor(score),
  ];
};

const precomputeCandidateRanks = (
  candidates,
  mode,
  specialPriorities,
  initTargetCombo,
  ruleProfile = null
) => {
  for (const st of candidates) {
    st._poolRank = makePoolRank(
      st,
      mode,
      specialPriorities,
      initTargetCombo,
      ruleProfile
    );
  }
  return candidates;
};

const flushPendingSolutions = (
  currentList,
  pendingList,
  mode,
  specialPriorities,
  initTargetCombo,
  ruleProfile = null,
  limit = 10
) => {
  if (!pendingList.length) return currentList;
  const merged = mergeTopSolutions(
    currentList,
    pendingList,
    mode,
    specialPriorities,
    initTargetCombo,
    ruleProfile,
    limit
  );
  pendingList.length = 0;
  return merged;
};

const isLexBetter = (a, b) => {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
};

const makePoolExtraCtx = (sol, specialPriorities) => {
  const normalized = normalizeSpecialPriorityList(specialPriorities);
  const hasRectSpecial = normalized.some((sp) => sp.type === "rect");

  return {
    rectGuide: hasRectSpecial ? Number(sol.rectGuide || 0) : 0,
  };
};

const normalizeSpecialPriorityListKeepSlots = (specialPriority) => {
  if (Array.isArray(specialPriority)) {
    return [
      specialPriority[0] && specialPriority[0].type
        ? specialPriority[0]
        : { type: "none" },
      specialPriority[1] && specialPriority[1].type
        ? specialPriority[1]
        : { type: "none" },
      specialPriority[2] && specialPriority[2].type
        ? specialPriority[2]
        : { type: "none" },
    ];
  }

  if (specialPriority && specialPriority.type) {
    return [specialPriority, { type: "none" }, { type: "none" }];
  }

  return [{ type: "none" }, { type: "none" }, { type: "none" }];
};

const compileSpecialPriorityListKeepSlots = (specialPriority) => {
  const raw = normalizeSpecialPriorityListKeepSlots(specialPriority);

  return raw.map((sp) => {
    const type = sp?.type || "none";

    if (type === "none") {
      return { type: "none" };
    }

    if (type === "rect") {
      const m = Number(sp.rectM) || 3;
      const n = Number(sp.rectN) || 3;
      const rectOrb = sp.rectOrb ?? SPECIAL_ORB_ANY;

      return {
        ...sp,
        type,
        m,
        n,
        rectKey: `${m}x${n}`,
        rectOrb,
      };
    }

    if (type === "equalFirst") {
      return {
        ...sp,
        type,
        selectedOrbs: normalizeSelectedEqualOrbs(sp.equalOrbs),
      };
    }

    if (type === "clearCount") {
      return {
        ...sp,
        type,
        clearCountValue: Number(sp.clearCount) || 0,
      };
    }

    return {
      ...sp,
      type,
      countValue: Number(sp.count) || 1,
      orbValue: sp.orb ?? SPECIAL_ORB_ANY,
    };
  });
};

const getSpecialPriorityDoneTupleKeepSlots = (
  ev,
  compiledSpecials = [],
  extraCtx = {}
) => {
  const fixed = [
    compiledSpecials[0] || { type: "none" },
    compiledSpecials[1] || { type: "none" },
    compiledSpecials[2] || { type: "none" },
  ];

  return fixed.map((sp) => {
    if (!sp || sp.type === "none") return 0;
    return isSingleSpecialSatisfiedCompiled(ev, sp, extraCtx) ? 1 : 0;
  });
};

const getSpecialComboRank = (d1, d2, d3) => {
  if (d1 && d2 && d3) return 7; // 123
  if (d1 && d2) return 6;       // 12
  if (d1 && d3) return 5;       // 13
  if (d2 && d3) return 4;       // 23
  if (d1) return 3;             // 1
  if (d2) return 2;             // 2
  if (d3) return 1;             // 3
  return 0;                     // none
};

const makePoolRank = (
  sol,
  mode,
  specialPriorities,
  initTargetCombo,
  ruleProfile = null
) => {
  const normalizedRuleProfile = getNormalizedRuleProfileForCache(ruleProfile);
  const compiledRequirements = normalizedRuleProfile.requirements;
  const requirementTuple = [];

  if (compiledRequirements.length > 0) {
    let allDone = 1;
    let totalDone = 0;
    let totalMissing = 0;
    const countsByOrb = sol?.initialComboSizeCountsByOrb;
    for (const req of compiledRequirements) {
      const orb = clampIntRange(req.orb, 0, 5, 0);
      const size = clampIntRange(req.size, 1, 5, 3);
      const count = Math.max(1, clampIntRange(req.count, 1, 999, 1));
      const got = Number(countsByOrb?.[orb]?.[String(size)] || 0);
      const distance =
        req.match === "atLeast"
          ? Math.max(0, count - got)
          : Math.abs(count - got);
      const done = distance === 0 ? 1 : 0;
      if (!done) allDone = 0;
      totalDone += Math.min(got, count);
      totalMissing += distance;
      requirementTuple.push(done, -distance, Math.min(got, count));
    }
    requirementTuple.unshift(-totalMissing);
    requirementTuple.unshift(totalDone);
    requirementTuple.unshift(allDone);
  }

  const cacheKey = JSON.stringify({
    mode,
    initTargetCombo: Number(initTargetCombo) || 0,
    specialPriorities: normalizeSpecialPriorityListKeepSlots(specialPriorities),
    requirements: compiledRequirements,
  });

  if (sol?._poolRankCached && sol?._poolRankCacheKey === cacheKey) {
    return sol._poolRankCached;
  }

  const initialCombos = Number(sol?.initialCombos || 0);
  const totalCombos = Number(sol?.combos || 0);
  const skyfallCombos = Math.max(0, totalCombos - initialCombos);
  const steps = getPathSteps(sol?.path || []);
  const legal = sol?.violatesN2 ? 0 : 1;

  const initTarget = Number(initTargetCombo);
  const initExact =
    Number.isFinite(initTarget) &&
    initTarget >= 0 &&
    initialCombos === initTarget
      ? 1
      : 0;

  const compiledKeepSlots =
    sol?._compiledKeepSlotsCache &&
    sol?._compiledKeepSlotsCacheKey === JSON.stringify(normalizeSpecialPriorityListKeepSlots(specialPriorities))
      ? sol._compiledKeepSlotsCache
      : compileSpecialPriorityListKeepSlots(specialPriorities);

  const extraCtx = {
    rectGuide: Number(sol?.rectGuide || 0),
  };

  const doneTuple = getSpecialPriorityDoneTupleKeepSlots(
    sol,
    compiledKeepSlots,
    extraCtx
  );

  const d1 = Number(doneTuple[0] || 0);
  const d2 = Number(doneTuple[1] || 0);
  const d3 = Number(doneTuple[2] || 0);

  const specialComboRank = getSpecialComboRank(d1, d2, d3);

  sol._compiledKeepSlotsCache = compiledKeepSlots;
  sol._compiledKeepSlotsCacheKey = JSON.stringify(
    normalizeSpecialPriorityListKeepSlots(specialPriorities)
  );

  const initDistance =
    Number.isFinite(initTarget) && initTarget >= 0
      ? Math.abs(initialCombos - initTarget)
      : 0;

  const rank = [
    legal,
    ...requirementTuple,
    specialComboRank,
    initExact,
    -initDistance,
    initialCombos,
  ];

  if (mode === "steps") {
    rank.push(-steps, totalCombos, skyfallCombos);
  } else {
    rank.push(totalCombos, -steps, skyfallCombos);
  }

  sol._poolRankCached = rank;
  sol._poolRankCacheKey = cacheKey;
  return rank;
};

const shouldReplaceSameComboSignature = (
  prev,
  cur,
  mode,
  specialPriorities,
  initTargetCombo,
  ruleProfile = null
) => {
  const prevRank = makePoolRank(
    prev,
    mode,
    specialPriorities,
    initTargetCombo,
    ruleProfile
  );
  const curRank = makePoolRank(
    cur,
    mode,
    specialPriorities,
    initTargetCombo,
    ruleProfile
  );

  const cmp = lexCompareDesc(curRank, prevRank);

  if (cmp < 0) return true;
  if (cmp > 0) return false;

  const prevSteps = getPathSteps(prev?.path || []);
  const curSteps = getPathSteps(cur?.path || []);
  return curSteps < prevSteps;
};

const mergeTopSolutions = (
  oldList,
  newList,
  mode,
  specialPriorities,
  initTargetCombo,
  ruleProfile = null,
  limit = 10
) => {
  const bestBySig = new Map();

  for (const sol of [...(oldList || []), ...(newList || [])]) {
    if (!sol || !Array.isArray(sol.path) || sol.path.length === 0) continue;

    const sig = getSolutionMergeSignature(sol);
    const prev = bestBySig.get(sig);

    if (!prev) {
      bestBySig.set(sig, sol);
      continue;
    }

    if (
      shouldReplaceSameComboSignature(
        prev,
        sol,
        mode,
        specialPriorities,
        initTargetCombo,
        ruleProfile
      )
    ) {
      bestBySig.set(sig, sol);
    }
  }

  const arr = Array.from(bestBySig.values());

  precomputeCandidateRanks(
    arr,
    mode,
    specialPriorities,
    initTargetCombo,
    ruleProfile
  );

  arr.sort((a, b) => lexCompareDesc(a._poolRankCached, b._poolRankCached));

  return arr.slice(0, limit);
};

const getNormalizedRuleProfileForCache = (ruleProfileLike) => {
  if (
    ruleProfileLike &&
    Array.isArray(ruleProfileLike.orbRules) &&
    Array.isArray(ruleProfileLike.requirements)
  ) {
    return ruleProfileLike;
  }

  if (
    ruleProfileLike &&
    ruleProfileLike.profile &&
    Array.isArray(ruleProfileLike.profile.orbRules) &&
    Array.isArray(ruleProfileLike.profile.requirements)
  ) {
    return ruleProfileLike.profile;
  }

  return normalizeRuleProfile(ruleProfileLike);
};

const makeSolutionResetKey = (
  baseBoard,
  diagonalEnabled,
  skyfallEnabled,
  autoRow0Expanded,
  ruleProfile,
  precomputedBoardKey = "",
  hardStepLimitEnabled = false,
  hardStepLimit = 80
) => {
  return JSON.stringify({
    board: precomputedBoardKey || getBoardKey(baseBoard),
    diagonal: !!diagonalEnabled,
    skyfall: !!skyfallEnabled,
    autoRow0Expanded: !!autoRow0Expanded,
    hardStepLimitEnabled: !!hardStepLimitEnabled,
    hardStepLimit: Math.max(
      1,
      Math.min(250, Math.floor(Number(hardStepLimit) || 1))
    ),
    ruleProfile: getNormalizedRuleProfileForCache(ruleProfile),
  });
};

const clearSolutionPools = useCallback(() => {
  setSolutionPools({ steps: [], combo: [] });
  setSelectedPoolIndex(0);
  solutionPoolContextRef.current.resetKey = "";
}, []);

const applyDetectedPlayBoard = useCallback(
  (detected, { autoSolve = false } = {}) => {
    if (!Array.isArray(detected) || detected.length < PLAY_ROWS) {
      throw new Error("辨識結果不是 5x6 版面。");
    }

    stopToBase(true);

    const source =
      baseBoardRef.current?.length
        ? baseBoardRef.current
        : originalBoard?.length
        ? originalBoard
        : board;

    const next = Array.from({ length: TOTAL_ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const existing = source?.[r]?.[c];
        if (existing == null || orbOf(existing) < 0) {
          return withMarks(r === 0 ? c % 5 : 0, 0, 0, 0);
        }
        return withMarks(orbOf(existing), xMarkOf(existing), qMarkOf(existing), nMarkOf(existing));
      })
    );

    for (let r = 0; r < PLAY_ROWS; r++) {
      const row = detected[r];
      if (!Array.isArray(row) || row.length < COLS) {
        throw new Error("辨識結果不是 5x6 版面。");
      }

      for (let c = 0; c < COLS; c++) {
        const orbId = orbOf(row[c]);
        if (orbId < 0 || orbId > 5) {
          throw new Error(`第 ${r + 1} 列第 ${c + 1} 格辨識失敗。`);
        }
        next[r + PLAY_ROWS_START][c] = withMarks(orbId, 0, 0, 0);
      }
    }

    const finalBoard = next.map((row) => [...row]);
    baseBoardRef.current = finalBoard.map((row) => [...row]);
    boardRef.current = finalBoard.map((row) => [...row]);
    setBoard(finalBoard.map((row) => [...row]));
    setOriginalBoard(finalBoard.map((row) => [...row]));
    setEditingBoard(finalBoard.map((row) => [...row]));

    clearSolutionPools();
    solverCache.current.clear();
    refreshTarget(finalBoard);

    setPath([]);
    setCurrentStep(-1);
    setReplayBoard(null);
    setFloating(null);
    setHolePos(null);
    setHiddenBCell(null);
    setGhostArrived(null);
    setIsReplaying(false);
    setIsPaused(false);
    setNeedsSolve(true);

    if (autoSolve) {
      pendingAutoSolveImportRef.current = true;
      setAutoSolveImportVersion((v) => v + 1);
    }
  },
  [board, clearSolutionPools, originalBoard, refreshTarget, stopToBase]
);

const toggleAutoRow0Expanded = useCallback(() => {
  setAutoRow0Expanded((v) => !v);
  clearSolutionPools();
  setNeedsSolve(true);
  setPath([]);
  setCurrentStep(-1);
}, [clearSolutionPools]);

const applySolvedCandidate = useCallback((sol) => {
  if (!sol) return;

  const steps = sol.path ? sol.path.length - 1 : 0;

  const finalStats = {
    combos: sol.initialCombos || 0,
    skyfallCombos: sol.skyfallCombos || 0,
    steps,
    clearedOrbs: sol.clearedCount || 0,
    initialClearedOrbs: sol.initialClearedCount || 0,
    skyfallClearedOrbs: Math.max(
      0,
      (sol.clearedCount || 0) - (sol.initialClearedCount || 0)
    ),
    verticalCombos: sol.verticalCombos || 0,
    horizontalCombos: sol.horizontalCombos || 0,
    crossCount: sol.initialPatternCounts?.cross?.total || 0,
    lCount: sol.initialPatternCounts?.l?.total || 0,
    tCount: sol.initialPatternCounts?.t?.total || 0,
    rectCount:
      Object.values(sol.initialPatternCounts?.rect || {}).reduce(
        (acc, g) => acc + (g?.total || 0),
        0
      ) || 0,
  };

  stopToBase(true);
  setPath(sol.path || []);
  setStats((prev) => ({ ...prev, ...finalStats }));
}, [stopToBase]);

useEffect(() => {
  const activeList =
    priorityMode === "steps" ? solutionPools.steps : solutionPools.combo;

  if (!activeList.length) return;

  const idx = Math.min(selectedPoolIndex, activeList.length - 1);
  if (idx !== selectedPoolIndex) {
    setSelectedPoolIndex(idx);
    return;
  }

  applySolvedCandidate(activeList[idx]);
}, [priorityMode, selectedPoolIndex, solutionPools, applySolvedCandidate]);
const abortGifExport = useCallback(() => {
	  // ??霈迤?刻???exportGif 銋?????await ????湔??
	  exportTokenRef.current.cancelled = true;

	  if (gifRef.current) {
		try { gifRef.current.abort(); } catch (e) { console.warn("Abort error:", e); }
	  }
	  gifRef.current = null;

	  setExportingGif(false);
	  setGifProgress({ cur: 0, total: 0, pct: 0 });

	  // ???恍蝡???扎?甇Ｗ?箏???
	  stopToBase(true);
	}, [stopToBase]);
function finishReplay(st, row0Target = null) {
  const bb = st.b.map((row) => [...row]);

  if (st.hole) {
    bb[st.hole.r][st.hole.c] = row0Target
      ? st.b[0][row0Target.c]
      : st.held;
  }

  setReplayBoard(bb);
  setHolePos(null);
  setHiddenBCell(null);
  setGhostArrived(null);
  setFloating(null);
  setIsReplaying(false);
  setIsPaused(false);
  setCurrentStep(st.targetPath.length - 1);
  clearAllGhosts();

  st.raf = 0;
  st.finished = true;
}

function enterReplayCell(st, nextStep) {
  const prevRC = st.targetPath[nextStep - 1];
  const currRC = st.targetPath[nextStep];

  setGhostArrived(null);
  setHiddenBCell({ r: prevRC.r, c: prevRC.c });

  const pushedCell = st.b?.[currRC.r]?.[currRC.c];
  const pushedOrbId =
    pushedCell == null || pushedCell === -1 ? -1 : orbOf(pushedCell);

  spawnManualGhostWithPt(
    pushedOrbId,
    getCellCenterPx(currRC.r, currRC.c),
    getCellCenterPx(prevRC.r, prevRC.c),
    currRC.r,
    currRC.c,
    prevRC.r,
    prevRC.c
  );

  if (currRC.r === 0) {
    st.lastNode = nextStep;
    finishReplay(st, currRC);
    return false;
  }

  if (!st.hole) {
    st.hole = { r: currRC.r, c: currRC.c };
    st.b[currRC.r][currRC.c] = -1;
  } else {
    st.hole = holeStepInPlace(st.b, st.hole, currRC);
  }

  st.lastNode = nextStep;
  setHolePos({ ...st.hole });
  setReplayBoard(st.b.map((row) => [...row]));
  setCurrentStep(nextStep);
  return true;
}

function runReplayFrame(now) {
  const st = replayAnimRef.current;
  if (!st || st.finished || !st.pts || st.pts.length < 2) return;

  const lastStep = st.targetPath.length - 1;
  const duration = st.moveDurationMs;
  let elapsed = Math.max(0, now - st.segmentStartedAt);

  while (elapsed >= duration && st.segmentIndex < lastStep) {
    const nextStep = st.segmentIndex + 1;
    const endpoint = st.pts[nextStep];

    setFloating((prev) =>
      prev
        ? { ...prev, x: endpoint.x, y: endpoint.y, visible: true }
        : prev
    );

    if (!enterReplayCell(st, nextStep)) return;

    st.segmentIndex = nextStep;
    st.segmentStartedAt += duration;
    elapsed = Math.max(0, now - st.segmentStartedAt);
  }

  if (st.segmentIndex >= lastStep) {
    finishReplay(st);
    return;
  }

  const from = st.pts[st.segmentIndex];
  const to = st.pts[st.segmentIndex + 1];
  const progress = Math.min(1, elapsed / duration);
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;

  st.segmentElapsedMs = elapsed;
  setFloating((prev) =>
    prev ? { ...prev, x, y, visible: true } : prev
  );
  st.raf = requestAnimationFrame(runReplayFrame);
}

const pauseReplay = () => {
  if (!isReplaying) return;

  const st = replayAnimRef.current;
  if (st.raf) cancelAnimationFrame(st.raf);
  st.raf = 0;
  st.segmentElapsedMs = st.segmentStartedAt
    ? Math.min(st.moveDurationMs, performance.now() - st.segmentStartedAt)
    : 0;

  setIsPaused(true);
};

const resumeReplay = () => {
  if (!isPaused) return;

  const st = replayAnimRef.current;
  if (!st || st.finished || !st.pts || !st.targetPath) return;

  setIsPaused(false);
  setIsReplaying(true);
  st.segmentStartedAt = performance.now() - (st.segmentElapsedMs || 0);
  st.raf = requestAnimationFrame(runReplayFrame);
};
const stopReplay = useCallback((clearPath = false) => {
  if (replayAnimRef.current.raf) {
    cancelAnimationFrame(replayAnimRef.current.raf);
  }
  replayAnimRef.current.raf = 0;

  setIsReplaying(false);
  setFloating(null);
  setReplayBoard(null);
  setHolePos(null);

  clearAllGhosts();

  if (clearPath) {
    setCurrentStep(-1);
  }
}, []);

const startSolveProgressTicker = useCallback(() => {
  if (solveProgressTimerRef.current) {
    clearInterval(solveProgressTimerRef.current);
  }

  solveStartTimeRef.current = Date.now();

  solveProgressTimerRef.current = setInterval(() => {
    const raw = solveProgressRawRef.current;
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - solveStartTimeRef.current) / 1000)
    );

    setSolveProgress({
      current: raw.current,
      max: raw.max,
      elapsedSec,
    });
  }, 1000);
}, []);

const stopSolveProgressTicker = useCallback((forceComplete = false) => {
  if (solveProgressTimerRef.current) {
    clearInterval(solveProgressTimerRef.current);
    solveProgressTimerRef.current = null;
  }

  const raw = solveProgressRawRef.current;
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - solveStartTimeRef.current) / 1000)
  );

  setSolveProgress({
    current: forceComplete ? raw.max : raw.current,
    max: raw.max,
    elapsedSec,
  });
}, []);

  const solve = () => {
  if (!ruleValidation.ok) return;
  stopToBase(true);
  setNeedsSolve(false);
  setSelectedPoolIndex(0);

  const base = baseBoardRef.current;
  const baseBoardKey = getBoardKey(base);
  const normalizedRuleProfile = getNormalizedRuleProfileForCache(
    ruleValidation?.normalizedProfile || ruleProfile
  );
  const normalizedRuleRuntimeCtx = getRuleRuntimeContext(normalizedRuleProfile);
  const solverConfigFingerprint = [
    solverConfig?.beamWidth,
    solverConfig?.maxSteps,
    solverConfig?.hardStepLimitEnabled ?? false,
    solverConfig?.hardStepLimit ?? 80,
    solverConfig?.maxNodes,
    solverConfig?.evalWorkers,
    solverConfig?.humanPlanner ?? true,
    solverConfig?.reversePlanner ?? true,
    solverConfig?.reverseMaxSteps ?? 60,
    solverConfig?.searchSeed ?? 0,
    solverConfig?.deferMoveMaterialization ?? true,
    solverConfig?.cheapLocalGuidance ?? true,
    solverConfig?.cheapLegacyReserve ?? 0.25,
    solverConfig?.cheapEvalScale ?? 2,
    solverConfig?.cheapEvalConstraintScale ?? 2.5,
    solverConfig?.stepPenalty,
    solverConfig?.potentialWeight,
    solverConfig?.clearedWeight,
    solverConfig?.replaySpeed,
  ].join("|");

  const configHashCache = solveConfigHashCacheRef.current;
  const isConfigHashCacheHit =
    configHashCache.solverConfigFingerprint === solverConfigFingerprint &&
    configHashCache.target === targetCombos &&
    configHashCache.initTargetCombo === initTargetCombo &&
    configHashCache.mode === solverMode &&
    configHashCache.priority === priorityMode &&
    configHashCache.skyfall === !!skyfallEnabled &&
    configHashCache.diagonal === !!diagonalEnabled &&
    configHashCache.specialPrioritiesRef === specialPriorities &&
    configHashCache.autoRow0Expanded === !!autoRow0Expanded &&
    configHashCache.normalizedRuleProfileRef === normalizedRuleProfile;

  const configHash = isConfigHashCacheHit
    ? configHashCache.value
    : JSON.stringify({
        ...solverConfig,
        target: targetCombos,
        initTargetCombo,
        mode: solverMode,
        priority: priorityMode,
        skyfall: skyfallEnabled,
        diagonal: diagonalEnabled,
        specialPriorities,
        autoRow0Expanded,
        ruleProfile: normalizedRuleProfile,
      });

  if (!isConfigHashCacheHit) {
    configHashCache.solverConfigFingerprint = solverConfigFingerprint;
    configHashCache.target = targetCombos;
    configHashCache.initTargetCombo = initTargetCombo;
    configHashCache.mode = solverMode;
    configHashCache.priority = priorityMode;
    configHashCache.skyfall = !!skyfallEnabled;
    configHashCache.diagonal = !!diagonalEnabled;
    configHashCache.specialPrioritiesRef = specialPriorities;
    configHashCache.autoRow0Expanded = !!autoRow0Expanded;
    configHashCache.normalizedRuleProfileRef = normalizedRuleProfile;
    configHashCache.value = configHash;
  }

  const boardKey = `${baseBoardKey}|cfg:${configHash}`;
  const preferredPoolIndex = 0;

  const resetKeyCache = solveResetKeyCacheRef.current;
  const isResetKeyCacheHit =
    resetKeyCache.boardKey === baseBoardKey &&
    resetKeyCache.diagonal === !!diagonalEnabled &&
    resetKeyCache.skyfall === !!skyfallEnabled &&
    resetKeyCache.autoRow0Expanded === !!autoRow0Expanded &&
    resetKeyCache.hardStepLimitEnabled ===
      !!solverConfig?.hardStepLimitEnabled &&
    resetKeyCache.hardStepLimit ===
      Math.max(
        1,
        Math.min(
          250,
          Math.floor(Number(solverConfig?.hardStepLimit) || 1)
        )
      ) &&
    resetKeyCache.normalizedRuleProfileRef === normalizedRuleProfile;

  const resetKey = isResetKeyCacheHit
    ? resetKeyCache.value
    : makeSolutionResetKey(
        base,
        diagonalEnabled,
        skyfallEnabled,
        autoRow0Expanded,
        normalizedRuleProfile,
        baseBoardKey,
        solverConfig?.hardStepLimitEnabled,
        solverConfig?.hardStepLimit
      );

  if (!isResetKeyCacheHit) {
    resetKeyCache.boardKey = baseBoardKey;
    resetKeyCache.diagonal = !!diagonalEnabled;
    resetKeyCache.skyfall = !!skyfallEnabled;
    resetKeyCache.autoRow0Expanded = !!autoRow0Expanded;
    resetKeyCache.hardStepLimitEnabled =
      !!solverConfig?.hardStepLimitEnabled;
    resetKeyCache.hardStepLimit = Math.max(
      1,
      Math.min(
        250,
        Math.floor(Number(solverConfig?.hardStepLimit) || 1)
      )
    );
    resetKeyCache.normalizedRuleProfileRef = normalizedRuleProfile;
    resetKeyCache.value = resetKey;
  }

  const maxProgressNodes = Math.max(1, solverConfig?.maxNodes || 1);

  // ??蝵桅脣漲
  solveProgressRawRef.current = {
    current: 0,
    max: maxProgressNodes,
  };

  setSolveProgress({
    current: 0,
    max: maxProgressNodes,
    elapsedSec: 0,
  });

  // ?????舫??蛛???瘥? UI ?郊
  startSolveProgressTicker();

  if (solverCache.current.has(boardKey)) {
    const cached = solverCache.current.get(boardKey);

    if (cached?.pools) {
      const hasCachedPools =
        (cached.pools.steps && cached.pools.steps.length > 0) ||
        (cached.pools.combo && cached.pools.combo.length > 0);

      if (hasCachedPools) {
        setSolutionPools(cached.pools);

        const activeList =
          priorityMode === "steps" ? cached.pools.steps : cached.pools.combo;

        const picked = activeList[preferredPoolIndex] || activeList[0];

        solveProgressRawRef.current = {
          current: maxProgressNodes,
          max: maxProgressNodes,
        };

        setSolveProgress({
          current: maxProgressNodes,
          max: maxProgressNodes,
          elapsedSec: 0,
        });

        stopSolveProgressTicker(true);

        if (picked) applySolvedCandidate(picked);
        return;
      }
    }

    if (cached?.path) {
      setPath(cached.path);
      const steps = cached.path ? cached.path.length - 1 : 0;
      setStats((prev) => ({ ...prev, ...cached.stats, steps }));

      solveProgressRawRef.current = {
        current: maxProgressNodes,
        max: maxProgressNodes,
      };

      setSolveProgress({
        current: maxProgressNodes,
        max: maxProgressNodes,
        elapsedSec: 0,
      });

      stopSolveProgressTicker(true);
      return;
    }
  }

  setSolving(true);

  setTimeout(async () => {
    try {
      const result = await beamSolve(
        base,
        solverConfig,
        targetCombos,
        solverMode,
        priorityMode,
        skyfallEnabled,
        diagonalEnabled,
        specialPriorities,
        initTargetCombo,
        autoRow0Expanded,
        normalizedRuleRuntimeCtx,
        ({ current, max }) => {
          // ?芣??raw ref嚗I 瘥??郊銝甈?
          solveProgressRawRef.current = {
            current,
            max,
          };
        }
      );

      const rawOldPools =
        solutionPoolContextRef.current.resetKey === resetKey
          ? solutionPoolsRef.current
          : { steps: [], combo: [] };

      const oldPools = {
        steps: rawOldPools.steps || [],
        combo: rawOldPools.combo || [],
      };

      const mergedPools =
        priorityMode === "steps"
          ? {
              steps: mergeTopSolutions(
                oldPools.steps,
                result.topSteps || [],
                "steps",
                specialPriorities,
                initTargetCombo,
                normalizedRuleProfile,
                10
              ),
              combo: oldPools.combo || [],
            }
          : {
              steps: oldPools.steps || [],
              combo: mergeTopSolutions(
                oldPools.combo,
                result.topCombos || [],
                "combo",
                specialPriorities,
                initTargetCombo,
                normalizedRuleProfile,
                10
              ),
            };

      solutionPoolContextRef.current.resetKey = resetKey;
      setSolutionPools(mergedPools);

      if (mergedPools.steps.length || mergedPools.combo.length) {
        solverCache.current.set(boardKey, {
          pools: mergedPools,
        });
      }

      const activeList =
        priorityMode === "steps" ? mergedPools.steps : mergedPools.combo;

      const picked = activeList[preferredPoolIndex] || activeList[0] || null;

      if (picked) {
        applySolvedCandidate(picked);
      } else {
        const steps = result.path ? result.path.length - 1 : 0;

        const finalStats = {
          combos: result.initialCombos,
          skyfallCombos: result.skyfallCombos,
          steps,
          clearedOrbs: result.clearedCount,
          initialClearedOrbs: result.initialClearedCount || 0,
          skyfallClearedOrbs: Math.max(
            0,
            (result.clearedCount || 0) - (result.initialClearedCount || 0)
          ),
          verticalCombos: result.verticalCombos,
          horizontalCombos: result.horizontalCombos,
          crossCount: result.initialPatternCounts?.cross?.total || 0,
          lCount: result.initialPatternCounts?.l?.total || 0,
          tCount: result.initialPatternCounts?.t?.total || 0,
        };

        setPath(result.path || []);
        setStats((prev) => ({ ...prev, ...finalStats }));
      }

      // 套用??皛?
      solveProgressRawRef.current = {
        current: solveProgressRawRef.current.max || maxProgressNodes,
        max: solveProgressRawRef.current.max || maxProgressNodes,
      };

      stopSolveProgressTicker(true);
    } catch (err) {
      console.error("[solve] beamSolve failed", err);

      solveProgressRawRef.current = {
        current: 0,
        max: maxProgressNodes,
      };

      setSolveProgress({
        current: 0,
        max: maxProgressNodes,
        elapsedSec: 0,
      });

      stopSolveProgressTicker(false);
    } finally {
      setSolving(false);
      setNeedsSolve(false);
    }
  }, 50);
};

const activeSolutions = priorityMode === "steps" ? solutionPools.steps : solutionPools.combo;

const pipWindowRef = useRef(null);
const solveRef = useRef(null);
const videoPipRef = useRef({
  canvas: null,
  video: null,
  stream: null,
  raf: 0,
  recordedUrl: null,
});
const pipAutoOpenAttemptRef = useRef(0);
const pipImageCacheRef = useRef(new Map());
const drawVideoPipFrameRef = useRef(null);
const [pipRoot, setPipRoot] = useState(null);
const [videoPipActive, setVideoPipActive] = useState(false);
const selectedPipSolution =
  activeSolutions?.[selectedPoolIndex] || activeSolutions?.[0] || null;
const canvasStreamSupported =
  typeof document !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  !!HTMLCanvasElement.prototype.captureStream;
const standardVideoPipSupported =
  typeof document !== "undefined" &&
  !!document.pictureInPictureEnabled &&
  typeof HTMLVideoElement !== "undefined" &&
  !!HTMLVideoElement.prototype.requestPictureInPicture;
const webkitVideoPipSupported =
  typeof HTMLVideoElement !== "undefined" &&
  typeof HTMLVideoElement.prototype.webkitSetPresentationMode === "function";
const streamVideoPipSupported =
  canvasStreamSupported && (standardVideoPipSupported || webkitVideoPipSupported);
const recordedVideoPipSupported =
  canvasStreamSupported &&
  typeof MediaRecorder !== "undefined" &&
  (standardVideoPipSupported || webkitVideoPipSupported);
const videoPipSupported = streamVideoPipSupported || recordedVideoPipSupported;
const guidePipSupported =
  (typeof window !== "undefined" && !!window.documentPictureInPicture?.requestWindow) ||
  videoPipSupported;

useEffect(() => {
  solveRef.current = solve;
});

useEffect(() => {
  if (!pendingAutoSolveImportRef.current) return;
  if (showImportCrop || importBusy || showEditor || solving) return;

  if (!ruleValidation.ok) {
    pendingAutoSolveImportRef.current = false;
    alert("截圖已套用到主版面，但目前解盾/底層條件有衝突，無法自動求解。");
    return;
  }

  pendingAutoSolveImportRef.current = false;
  solveRef.current?.();
}, [
  autoSolveImportVersion,
  importBusy,
  ruleValidation.ok,
  showEditor,
  showImportCrop,
  solving,
]);

const closeGuidePip = useCallback(() => {
  const win = pipWindowRef.current;
  pipWindowRef.current = null;
  setPipRoot(null);

  if (win && !win.closed) {
    try {
      win.close();
    } catch (err) {
      console.warn("[pip] close failed", err);
    }
  }

  const videoState = videoPipRef.current;
  if (videoState.raf) {
    cancelAnimationFrame(videoState.raf);
    videoState.raf = 0;
  }

  const video = videoState.video;
  if (video && document.pictureInPictureElement === video) {
    document.exitPictureInPicture?.().catch((err) => {
      console.warn("[pip] video exit failed", err);
    });
  }
  if (
    video &&
    typeof video.webkitSetPresentationMode === "function" &&
    video.webkitPresentationMode === "picture-in-picture"
  ) {
    try {
      video.webkitSetPresentationMode("inline");
    } catch (err) {
      console.warn("[pip] webkit video exit failed", err);
    }
  }

  if (video) {
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load?.();
    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }
  }

  videoState.stream?.getTracks?.().forEach((track) => track.stop());
  videoState.stream = null;
  if (videoState.recordedUrl) {
    URL.revokeObjectURL(videoState.recordedUrl);
    videoState.recordedUrl = null;
  }
  setVideoPipActive(false);
}, []);

const stopBoardSource = useCallback(() => {
  const sourceState = boardSourceRef.current;
  sourceState.stream?.getTracks?.().forEach((track) => track.stop());
  sourceState.stream = null;

  if (sourceState.video) {
    sourceState.video.pause();
    sourceState.video.srcObject = null;
  }

  setBoardSourceName("");
}, []);

const formatBoardSourceName = useCallback((track) => {
  const raw = (track?.label || track?.getSettings?.().displaySurface || "已選擇").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("google")) return "Google";
  if (lower.includes("chrome")) return "Google Chrome";
  if (lower.includes("safari")) return "Safari";
  if (lower.includes("edge")) return "Edge";
  if (lower.includes("tower") || raw.includes("神魔")) return "神魔之塔";

  return raw
    .replace(/^window[:\s-]*/i, "")
    .replace(/^screen[:\s-]*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 18);
}, []);

const ensureBoardSourceVideoReady = useCallback(async (stream) => {
  if (!stream) throw new Error("尚未選擇版面來源。");

  let video = boardSourceRef.current.video;
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    boardSourceRef.current.video = video;
  }

  if (video.srcObject !== stream) {
    video.pause();
    video.srcObject = stream;
  }

  if (!video.videoWidth || !video.videoHeight) {
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("版面來源讀取逾時。"));
      }, 5000);

      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };

      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("版面來源無法讀取。"));
      };
    });
  }

  await video.play().catch(() => {});

  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
  } else {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  return video;
}, []);

const selectBoardSource = useCallback(async (event) => {
  if (boardSourceBusy || importBusy || showImportCrop || solving || exportingGif || showEditor) {
    return null;
  }

  const sourceWindow =
    event?.currentTarget?.ownerDocument?.defaultView ||
    (typeof window !== "undefined" ? window : null);
  const mediaDevices =
    sourceWindow?.navigator?.mediaDevices ||
    (typeof navigator !== "undefined" ? navigator.mediaDevices : null);

  if (!mediaDevices?.getDisplayMedia) {
    alert("目前瀏覽器不支援選擇版面來源，請使用新版 Chrome / Edge。");
    return null;
  }

  setBoardSourceBusy(true);

  try {
    const stream = await mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 3, max: 8 },
      },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    });

    stopBoardSource();
    boardSourceRef.current.stream = stream;

    const track = stream.getVideoTracks?.()[0] || null;
    setBoardSourceName(formatBoardSourceName(track));

    track?.addEventListener?.("ended", () => {
      if (boardSourceRef.current.stream === stream) {
        boardSourceRef.current.stream = null;
        setBoardSourceName("");
      }
    });

    await ensureBoardSourceVideoReady(stream);
    return stream;
  } catch (err) {
    if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
      console.error("[pip] source selection failed", err);
      alert(`版面來源選擇失敗：${err?.message || err}`);
    }
    return null;
  } finally {
    setBoardSourceBusy(false);
  }
}, [
  boardSourceBusy,
  ensureBoardSourceVideoReady,
  exportingGif,
  formatBoardSourceName,
  importBusy,
  showEditor,
  showImportCrop,
  solving,
  stopBoardSource,
]);

const captureBoardSourceFrameBlob = useCallback(async (stream) => {
  const video = await ensureBoardSourceVideoReady(stream);
  const track = stream?.getVideoTracks?.()[0] || null;
  const width = video.videoWidth || track?.getSettings?.().width || 0;
  const height = video.videoHeight || track?.getSettings?.().height || 0;

  if (!width || !height) {
    throw new Error("版面來源尺寸讀取失敗。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("無法建立版面來源畫布。");
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("版面來源轉換失敗。");

  return blob;
}, [ensureBoardSourceVideoReady]);

const calculateFromBoardSource = useCallback(async (event) => {
  if (boardSourceBusy || importBusy || showImportCrop || solving || exportingGif || showEditor) return;

  setBoardSourceBusy(true);
  autoSolveImportedRef.current = true;

  try {
    let stream = boardSourceRef.current.stream;
    const liveTrack = stream?.getVideoTracks?.().find((track) => track.readyState === "live");

    if (!stream || !liveTrack) {
      setBoardSourceBusy(false);
      stream = await selectBoardSource(event);
      setBoardSourceBusy(true);
      if (!stream) {
        autoSolveImportedRef.current = false;
        return;
      }
    }

    const blob = await captureBoardSourceFrameBlob(stream);

    if (importImgUrl) URL.revokeObjectURL(importImgUrl);
    const url = URL.createObjectURL(blob);
    setImportImgUrl(url);
    setShowImportCrop(true);
  } catch (err) {
    autoSolveImportedRef.current = false;
    pendingAutoSolveImportRef.current = false;

    if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
      console.error("[pip] source calculation failed", err);
      alert(`版面來源計算失敗：${err?.message || err}`);
    }
  } finally {
    setBoardSourceBusy(false);
  }
}, [
  boardSourceBusy,
  captureBoardSourceFrameBlob,
  exportingGif,
  importBusy,
  importImgUrl,
  selectBoardSource,
  showEditor,
  showImportCrop,
  solving,
]);

useEffect(() => {
  return () => stopBoardSource();
}, [stopBoardSource]);

const openGuidePip = useCallback(
  async ({ silent = false } = {}) => {
    if (typeof window === "undefined") return;

    const pipApi = window.documentPictureInPicture;
    if (!pipApi?.requestWindow) {
      await openVideoGuidePip({ silent });
      return;
    }

    if (showEditor) return;

    try {
      if (!pipWindowRef.current || pipWindowRef.current.closed) {
        const rowCount = autoRow0Expanded ? TOTAL_ROWS : PLAY_ROWS;
        const pipWidth = 360;
        const pipHeight = Math.round(pipWidth * (rowCount / COLS)) + 64;
        const pipWin = await pipApi.requestWindow({
          width: pipWidth,
          height: Math.max(320, Math.min(460, pipHeight)),
          preferInitialWindowPlacement: true,
        });

        const doc = pipWin.document;
        doc.title = translateText("轉珠路徑", language);
        doc.body.replaceChildren();
        const guideRoot = doc.createElement("div");
        guideRoot.id = "guide-pip-root";
        doc.body.appendChild(guideRoot);

        const style = doc.createElement("style");
        style.textContent = `
          html, body, #guide-pip-root {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
            background: #050505;
            color: #fff;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .guide-pip-shell {
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 7px;
            background: radial-gradient(circle at 50% 0%, rgba(39,39,42,0.92), #050505 58%);
          }
          .guide-pip-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            min-height: 30px;
            flex: 0 0 auto;
          }
          .guide-pip-title {
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: rgba(255,255,255,0.74);
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.06em;
          }
          .guide-pip-actions {
            display: flex;
            align-items: center;
            gap: 5px;
            flex: 0 0 auto;
          }
          .guide-pip-button {
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 7px;
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.86);
            padding: 5px 7px;
            font-size: 11px;
            line-height: 1;
            font-weight: 900;
            cursor: pointer;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .guide-pip-button:hover {
            background: rgba(255,255,255,0.16);
          }
          .guide-pip-button:disabled {
            cursor: wait;
            opacity: 0.55;
          }
          .guide-pip-stage {
            min-height: 0;
            flex: 1 1 auto;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .guide-pip-board {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 10px 18px rgba(0,0,0,0.5));
          }
          .guide-pip-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            height: 100%;
            color: rgba(255,255,255,0.72);
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.14em;
          }
          .guide-pip-spinner {
            width: 46px;
            height: 46px;
            border-radius: 999px;
            border: 4px solid rgba(255,255,255,0.12);
            border-top-color: #facc15;
            animation: guide-pip-spin 0.8s linear infinite;
          }
          @keyframes guide-pip-spin {
            to { transform: rotate(360deg); }
          }
        `;
        doc.head.appendChild(style);

        pipWin.addEventListener("pagehide", () => {
          if (pipWindowRef.current === pipWin) {
            pipWindowRef.current = null;
            setPipRoot(null);
          }
        });

        pipWindowRef.current = pipWin;
        setPipRoot(doc.getElementById("guide-pip-root"));
      }

      const hasAvailableSolution =
        (activeSolutions?.length || 0) > 0 ||
        (Array.isArray(path) && path.length >= 2);

      if (
        needsSolve &&
        !hasAvailableSolution &&
        !solving &&
        !isManual &&
        ruleValidation.ok
      ) {
        solveRef.current?.();
      }
    } catch (err) {
      const fellBack = await openVideoGuidePip({ silent: true });
      if (fellBack) return;

      if (!silent) {
        console.warn("[pip] open failed", err);
        alert("浮動小窗需要由按鈕點擊開啟；若剛剛是切換程式自動觸發，請先按一次「小窗」。");
      }
    }
  },
  [
    activeSolutions,
    autoRow0Expanded,
    isManual,
    language,
    needsSolve,
    path,
    ruleValidation.ok,
    showEditor,
    solving,
  ]
);

useEffect(() => {
  const onLeave = () => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) return;
    if (videoPipActive) return;
    if (!guidePipSupported) return;

    const now = Date.now();
    if (now - pipAutoOpenAttemptRef.current < 2500) return;
    pipAutoOpenAttemptRef.current = now;

    openGuidePip({ silent: true });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") onLeave();
  };

  window.addEventListener("blur", onLeave);
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("pagehide", onLeave);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}, [guidePipSupported, openGuidePip, videoPipActive]);

useEffect(() => {
  return () => closeGuidePip();
}, [closeGuidePip]);

const pipBoardSource =
  Array.isArray(originalBoard) && originalBoard.length ? originalBoard : board;
const pipRowOffset = autoRow0Expanded ? 0 : PLAY_ROWS_START;
const pipRowCount = autoRow0Expanded ? TOTAL_ROWS : PLAY_ROWS;
const pipBoardRows = Array.isArray(pipBoardSource)
  ? pipBoardSource.slice(pipRowOffset, pipRowOffset + pipRowCount)
  : [];
const pipSolutionIndex = selectedPipSolution
  ? Math.max(0, activeSolutions.indexOf(selectedPipSolution))
  : -1;
const pipPathSource = selectedPipSolution?.path || path || [];
const pipPathPoints = Array.isArray(pipPathSource)
  ? pipPathSource.reduce((out, p) => {
      if (!p) return out;
      if (
        p.r < pipRowOffset ||
        p.r >= pipRowOffset + pipRowCount ||
        p.c < 0 ||
        p.c >= COLS
      ) {
        return out;
      }

      const prev = out[out.length - 1];
      if (!prev || prev.r !== p.r || prev.c !== p.c) {
        out.push(p);
      }
      return out;
    }, [])
  : [];
const pipPathKey = pipPathPoints.map((p) => `${p.r},${p.c}`).join("|");
const pipLoading =
  screenshotBusy ||
  boardSourceBusy ||
  importBusy ||
  showImportCrop ||
  solving ||
  (needsSolve && !selectedPipSolution && ruleValidation.ok);
const pipComboText = selectedPipSolution
  ? `${selectedPipSolution.initialCombos || 0}${
      selectedPipSolution.skyfallCombos > 0
        ? `+${selectedPipSolution.skyfallCombos}`
        : ""
    } C`
  : "";
const pipStatusText = pipLoading
  ? boardSourceBusy || screenshotBusy || importBusy || showImportCrop
    ? translateText("讀取來源", language)
    : translateText("計算中", language)
  : selectedPipSolution
  ? translateText(
      `#${pipSolutionIndex + 1} / ${getPathSteps(selectedPipSolution.path)}步 / ${pipComboText}`,
      language
    )
  : translateText("尚無路徑", language);
const boardSourceButtonText = boardSourceName
  ? translateText(`版面來源: ${boardSourceName}`, language)
  : translateText("版面來源", language);
function getPipOrbImage(src) {
  if (!src) return null;

  const cache = pipImageCacheRef.current;
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => drawVideoPipFrameRef.current?.();
    img.src = src;
    cache.set(src, img);
  }

  return img;
}

function buildCompletedPipRoute(cellSize = 1) {
  if (!pipPathPoints.length || pipPathPoints.length < 2) {
    return { geometry: null, points: [], pathD: "" };
  }

  const routeGeometry = buildShiftedRouteGeometry(
    pipPathPoints,
    Math.max(cellSize * 0.1, cellSize === 1 ? 0.06 : 6),
    (r, c) => ({
      x: (c + 0.5) * cellSize,
      y: (r - pipRowOffset + 0.5) * cellSize,
    })
  );
  const points = collectCompletedRoutePoints(routeGeometry);

  return {
    geometry: routeGeometry,
    points,
    pathD: buildStraightPath(points),
  };
}

function drawVideoPipFrame(now = 0) {
  const canvas = videoPipRef.current.canvas;
  if (!canvas) return;

  const width = 720;
  const height = Math.round(width * (pipRowCount / COLS));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);

  if (pipLoading) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.085;
    const start = (now / 1000) * Math.PI * 2;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy - 20, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#facc15";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy - 20, radius, start, start + Math.PI * 1.35);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "900 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(translateText("計算中", language), cx, cy + radius + 34);
    return;
  }

  const cell = width / COLS;
  for (let r = 0; r < pipRowCount; r++) {
    const row = pipBoardRows[r] || [];
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#2b2b2b" : "#151515";
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c * cell, r * cell, cell, cell);

      const orbId = orbOf(row[c]);
      const img = getPipOrbImage(ORB_ICON_IMGS[orbId]);
      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(
          img,
          c * cell + cell * 0.02,
          r * cell + cell * 0.02,
          cell * 0.96,
          cell * 0.96
        );
      }
    }
  }

  if (autoRow0Expanded) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, cell);
    ctx.lineTo(width, cell);
    ctx.stroke();
  }

  if (pipPathPoints.length >= 2) {
    const pipRoute = buildCompletedPipRoute(cell);

    const drawEndpoint = (point, fillStyle, radiusPx) => {
      if (!point) return;
      ctx.fillStyle = fillStyle;
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const drawPath = () => {
      if (pipRoute.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.globalAlpha = 0.96;
      ctx.shadowColor = "rgba(0,0,0,0.95)";
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      pipRoute.points.forEach((point, idx) => {
        if (idx === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    };

    drawEndpoint(pipRoute.geometry?.start, "#22c55e", 14);
    drawPath();
    drawEndpoint(pipRoute.geometry?.end, "#ef4444", 16);
  }
}

function ensureVideoPipElement() {
  const state = videoPipRef.current;

  if (!state.video) {
    state.video = document.createElement("video");
    state.video.muted = true;
    state.video.playsInline = true;
    state.video.loop = true;
    state.video.setAttribute("playsinline", "");
    state.video.setAttribute("webkit-playsinline", "");
    state.video.style.position = "fixed";
    state.video.style.left = "0";
    state.video.style.bottom = "0";
    state.video.style.width = "1px";
    state.video.style.height = "1px";
    state.video.style.opacity = "0.001";
    state.video.style.pointerEvents = "none";
    state.video.style.zIndex = "-1";
    state.video.addEventListener("leavepictureinpicture", () => {
      if (videoPipRef.current.raf) {
        cancelAnimationFrame(videoPipRef.current.raf);
        videoPipRef.current.raf = 0;
      }
      videoPipRef.current.video?.pause();
      videoPipRef.current.video && (videoPipRef.current.video.srcObject = null);
      videoPipRef.current.stream?.getTracks?.().forEach((track) => track.stop());
      videoPipRef.current.stream = null;
      setVideoPipActive(false);
    });
    state.video.addEventListener("webkitpresentationmodechanged", () => {
      if (state.video?.webkitPresentationMode === "picture-in-picture") return;
      if (videoPipRef.current.raf) {
        cancelAnimationFrame(videoPipRef.current.raf);
        videoPipRef.current.raf = 0;
      }
      setVideoPipActive(false);
    });
  }

  if (!state.video.isConnected) {
    document.body.appendChild(state.video);
  }

  return state.video;
}

function getSupportedPipRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const candidates = [
    'video/mp4;codecs="avc1.42E01E"',
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

async function recordPipCanvasVideoUrl(canvas) {
  if (!canvas?.captureStream || typeof MediaRecorder === "undefined") {
    throw new Error("瀏覽器不支援把盤面錄成短影片。");
  }

  drawVideoPipFrame();

  const stream = canvas.captureStream(4);
  const videoTrack = stream.getVideoTracks?.()[0] || null;
  const mimeType = getSupportedPipRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = () => reject(recorder.error || new Error("短影片錄製失敗。"));
  });

  const frameTimer = window.setInterval(() => {
    drawVideoPipFrame();
    videoTrack?.requestFrame?.();
  }, 180);

  recorder.start();
  videoTrack?.requestFrame?.();
  await new Promise((resolve) => setTimeout(resolve, 1050));
  recorder.stop();
  await stopped;

  window.clearInterval(frameTimer);
  stream.getTracks?.().forEach((track) => track.stop());

  if (!chunks.length) throw new Error("短影片沒有產生資料。");

  const blob = new Blob(chunks, { type: mimeType || chunks[0]?.type || "video/webm" });
  return URL.createObjectURL(blob);
}

async function openRecordedVideoGuidePip() {
  if (!recordedVideoPipSupported) return false;

  const state = videoPipRef.current;
  if (!state.canvas) {
    state.canvas = document.createElement("canvas");
  }

  const videoUrl = await recordPipCanvasVideoUrl(state.canvas);
  if (state.recordedUrl) URL.revokeObjectURL(state.recordedUrl);
  state.recordedUrl = videoUrl;

  const video = ensureVideoPipElement();
  video.pause();
  video.srcObject = null;
  video.src = videoUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("短影片載入逾時。")), 5000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("短影片無法載入。"));
    };
  });

  await video.play();

  if (
    typeof video.webkitSetPresentationMode === "function" &&
    (typeof video.webkitSupportsPresentationMode !== "function" ||
      video.webkitSupportsPresentationMode("picture-in-picture"))
  ) {
    video.webkitSetPresentationMode("picture-in-picture");
  } else if (standardVideoPipSupported && document.pictureInPictureElement !== video) {
    await video.requestPictureInPicture();
  } else {
    throw new Error("目前瀏覽器不接受短影片浮動小窗。");
  }

  setVideoPipActive(true);

  const hasAvailableSolution =
    (activeSolutions?.length || 0) > 0 ||
    (Array.isArray(path) && path.length >= 2);

  if (
    needsSolve &&
    !hasAvailableSolution &&
    !solving &&
    !isManual &&
    ruleValidation.ok
  ) {
    solveRef.current?.();
  }

  return true;
}

async function openVideoGuidePip({ silent = false } = {}) {
  if (!videoPipSupported) {
    if (!silent) {
      alert("目前瀏覽器不能把自訂盤面轉成系統浮動小窗。iPhone Safari 的 YouTube 小窗通常只接受真正影片，無法直接吃圖片或 Canvas。");
    }
    return false;
  }

  if (showEditor) return false;

  try {
    const state = videoPipRef.current;
    if (!state.canvas) {
      state.canvas = document.createElement("canvas");
    }

    if (!state.stream) {
      state.stream = state.canvas.captureStream(12);
    }

    const video = ensureVideoPipElement();
    if (state.recordedUrl) {
      URL.revokeObjectURL(state.recordedUrl);
      state.recordedUrl = null;
    }
    video.removeAttribute("src");
    video.srcObject = state.stream;
    drawVideoPipFrame();
    await video.play();

    if (standardVideoPipSupported && document.pictureInPictureElement !== video) {
      await video.requestPictureInPicture();
    } else if (
      typeof video.webkitSetPresentationMode === "function" &&
      (typeof video.webkitSupportsPresentationMode !== "function" ||
        video.webkitSupportsPresentationMode("picture-in-picture"))
    ) {
      video.webkitSetPresentationMode("picture-in-picture");
    } else {
      throw new Error("目前瀏覽器不支援浮動小窗。");
    }

    setVideoPipActive(true);

    const hasAvailableSolution =
      (activeSolutions?.length || 0) > 0 ||
      (Array.isArray(path) && path.length >= 2);

    if (
      needsSolve &&
      !hasAvailableSolution &&
      !solving &&
      !isManual &&
      ruleValidation.ok
    ) {
      solveRef.current?.();
    }

    return true;
  } catch (err) {
    const state = videoPipRef.current;
    state.stream?.getTracks?.().forEach((track) => track.stop());
    state.stream = null;

    try {
      const recordedOpened = await openRecordedVideoGuidePip();
      if (recordedOpened) return true;
    } catch (recordErr) {
      console.warn("[pip] recorded video fallback failed", recordErr);
    }

    if (!silent) {
      console.warn("[pip] video open failed", err);
      alert("浮動小窗需要由按鈕點擊開啟；若剛剛是切換程式自動觸發，請先按一次「小窗」。");
    }
    return false;
  }
}

useEffect(() => {
  drawVideoPipFrameRef.current = drawVideoPipFrame;
});

useEffect(() => {
  if (!videoPipActive) return;
  drawVideoPipFrame();
}, [
  autoRow0Expanded,
  board,
  originalBoard,
  pipLoading,
  pipPathKey,
  pipRowCount,
  selectedPipSolution,
  videoPipActive,
]);

useEffect(() => {
  if (!videoPipActive || !pipLoading) return undefined;

  const tick = (now) => {
    drawVideoPipFrameRef.current?.(now);
    videoPipRef.current.raf = requestAnimationFrame(tick);
  };

  videoPipRef.current.raf = requestAnimationFrame(tick);

  return () => {
    if (videoPipRef.current.raf) {
      cancelAnimationFrame(videoPipRef.current.raf);
      videoPipRef.current.raf = 0;
    }
  };
}, [videoPipActive, pipLoading]);

const buildSolutionPreviewBoard = useCallback((solution) => {
  const base = baseBoardRef.current?.length ? baseBoardRef.current : board;
  const solutionPath = solution?.path;

  if (!Array.isArray(base) || !base.length) {
    return null;
  }

  const previewBoard = base.map((row) => [...row]);
  if (!Array.isArray(solutionPath) || !solutionPath.length) {
    return previewBoard;
  }

  const start = solutionPath[0];
  const held = previewBoard?.[start.r]?.[start.c];
  if (held == null) return previewBoard;

  let hole = null;
  if (start.r >= PLAY_ROWS_START) {
    hole = { r: start.r, c: start.c };
    previewBoard[start.r][start.c] = -1;
  }

  for (let i = 1; i < solutionPath.length; i += 1) {
    const current = solutionPath[i];

    if (current.r === 0) {
      if (hole) {
        previewBoard[hole.r][hole.c] = previewBoard[0][current.c];
      }
      return previewBoard;
    }

    if (!hole) {
      hole = { r: current.r, c: current.c };
      previewBoard[current.r][current.c] = -1;
    } else {
      hole = holeStepInPlace(previewBoard, hole, current);
    }
  }

  if (hole) {
    previewBoard[hole.r][hole.c] = held;
  }

  return previewBoard;
}, [board]);

const getSolutionPreviewPosition = useCallback((clientX, clientY) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  const offset = 16;
  const previewWidth = Math.min(244, viewportWidth - margin * 2);
  const previewHeight = Math.min(
    autoRow0Expanded ? 290 : 244,
    viewportHeight - margin * 2
  );

  let left = clientX + offset;
  if (left + previewWidth > viewportWidth - margin) {
    left = clientX - previewWidth - offset;
  }

  let top = clientY + offset;
  if (top + previewHeight > viewportHeight - margin) {
    top = clientY - previewHeight - offset;
  }

  return {
    left: Math.max(margin, Math.min(left, viewportWidth - previewWidth - margin)),
    top: Math.max(margin, Math.min(top, viewportHeight - previewHeight - margin)),
  };
}, [autoRow0Expanded]);

const showSolutionPreview = useCallback((event, solution, index) => {
  const previewBoard = buildSolutionPreviewBoard(solution);
  if (!previewBoard) return;

  setSolutionPreview({
    board: previewBoard,
    index,
    ...getSolutionPreviewPosition(event.clientX, event.clientY),
  });
}, [buildSolutionPreviewBoard, getSolutionPreviewPosition]);

const moveSolutionPreview = useCallback((event) => {
  const nextPosition = getSolutionPreviewPosition(event.clientX, event.clientY);
  setSolutionPreview((current) =>
    current ? { ...current, ...nextPosition } : current
  );
}, [getSolutionPreviewPosition]);

///////////////////////////////

const [gifFooter, setGifFooter] = useState({
	  comboText: "0",
	  step: 0,
	  stepTotal: 0,
	});
/////////////////
// 蝚砌??嚗IF ?臬瞍?瘜?/////////////////
// 靘?楝敺??瑕??恍銝西撓??GIF??// 靘楝敺??剝??瑕?嚗撓?箇?臭?頛?GIF??
const exportGif = useCallback(async () => {
	  // ?????甈∪?綽???id??瘨?璅飛??
	  const myId = ++exportTokenRef.current.id;
	  exportTokenRef.current.cancelled = false;

	  const isCancelled = () =>
		exportTokenRef.current.cancelled || exportTokenRef.current.id !== myId;

	  try {
		
		setGifReady(prev => {
		  if (prev.url) URL.revokeObjectURL(prev.url);
		  return { url: "", name: "" };
		});
		gifBlobRef.current = null;

		if (!path || path.length < 2) return;

		setExportingGif(true);
		setGifCaptureMode(true);
		setGifStage("capture");

		// ???啣??日嚗??replay ??僕?橘?
		stopToBase(true);

		// 霈?React ?????恍蝛拙?銝?
		await new Promise(r => setTimeout(r, 80));

		const el = boardInnerRef.current;
		if (!el) return;

		// =========
		// 1) ?芸?瘙箏? skip
		// =========
		const totalSteps = path.length - 1;

		const maxFrames = 500;
		const skip = Math.max(1, Math.ceil(totalSteps / maxFrames));
		const frameDelay = Math.max(60, config.replaySpeed * skip);
		const comboText = `${stats.combos}${stats.skyfallCombos > 0 ? `+${stats.skyfallCombos}` : ""}`;

		setGifFooter({
		  comboText,
		  step: 0,
		  stepTotal: totalSteps,
		});

		const baseFrames = 1 + Math.floor(totalSteps / skip); 
		// 1 = firstCanvas
		// + floor(totalSteps/skip) = i=skip,2skip,...,<=totalSteps ?◤?????

		const forceLastFrame = 1; // 雿??Ｗ摰? addFrame() 銝甈∴?撘瑕?敺?甇伐?
		const tailHoldFrame  = 1; // 雿???lastCanvas ??addFrame 銝甈∴?delay 1500嚗?

		const totalFrames = baseFrames + forceLastFrame + tailHoldFrame;

		setGifProgress({ cur: 0, total: totalFrames, pct: 0 });
		// =========
		// 2) 撱箇?蝚砌?甇亦?ｇ?頝???詨?嚗?
		// =========
		const base = baseBoardRef.current.map(r => [...r]);
		const start = path[0];
		const held = base[start.r][start.c];

		let b = base.map(r => [...r]);
		let hole = null;

		if (start.r >= PLAY_ROWS_START) {
		  hole = { r: start.r, c: start.c };
		  b[start.r][start.c] = -1;
		  setHolePos({ ...hole });
		} else {
		  setHolePos(null);
		}

		setReplayBoard(b.map(r => [...r]));
		setCurrentStep(0);

		{
		  const p0 = getCellCenterPx(start.r, start.c);
		  setFloating({ orbId: orbOf(held), x: p0.x, y: p0.y, visible: true });
		}

		// 蝑?DOM ?湔
		await new Promise(r => requestAnimationFrame(() => r()));
		await new Promise(r => requestAnimationFrame(() => r())); // 憭?銝撟?渡帘

		// =========
		// 3) foreignObject ?芸?嚗摰撓?箏偕撖賂??踹???
		// =========
		// const rect0 = el.getBoundingClientRect(); // 雿??典?臭誑?芣?

		const W = el.offsetWidth;
		const H = el.offsetHeight;

		const pixelRatio = 1;

		const captureOpts = {
		  backgroundColor: null,
		  cacheBust: true,
		  width: W,
		  height: H,
		  pixelRatio,
		};

		const bumpProgress = (forceCur = null) => {
		  setGifProgress(prev => {
			const total = prev.total || 1;
			const nextCur =
			  forceCur !== null
				? Math.min(forceCur, total)
				: Math.min((prev.cur || 0) + 1, total);

			const pct = Math.round((nextCur / total) * 100);
			return { ...prev, cur: nextCur, pct };
		  });
		};

		// ???靘?????亙???3 ??
		let lastCanvas = null;

		// ?蝚砌?撟嚗摰捱摰?GIF ?箏???撠箏站
		const firstCanvas = await toCanvas(el, captureOpts);
		lastCanvas = firstCanvas;

		const gif = new GIF({
		  workers: 2,
		  quality: 40,
		  dither: false,
		  workerScript: gifWorkerUrl,
		  width: firstCanvas.width,
		  height: firstCanvas.height,
		});

		gifRef.current = gif;

		gif.addFrame(firstCanvas, { delay: frameDelay, copy: true });
		bumpProgress();

		const addFrame = async () => {
		  if (isCancelled()) return;

		  await new Promise(r => requestAnimationFrame(() => r()));
		  if (isCancelled()) return;

		  const canvas = await toCanvas(el, captureOpts);
		  if (isCancelled()) return;

		  if (canvas.width !== firstCanvas.width || canvas.height !== firstCanvas.height) {
			console.warn("Skip frame due to size mismatch:", canvas.width, canvas.height);
			return;
		  }

		  lastCanvas = canvas; // ??閮??敺?撘蛛??其?撠曄垢憭??蛛?

		  gif.addFrame(canvas, { delay: frameDelay, copy: true });
		  if (!isCancelled()) bumpProgress();
		};

		// =========
		// 4) ?券脫郊撽?+ ?瑕?
		// =========
		for (let i = 1; i < path.length; i++) {
		  if (isCancelled()) return;
		  const currRC = path[i];

		  if (currRC.r === 0) {
			if (hole) b[hole.r][hole.c] = held;

			setReplayBoard(b.map(r => [...r]));
			setHolePos(null);
			setFloating(null);
			setCurrentStep(i);

			await new Promise(r => requestAnimationFrame(() => r()));
			await addFrame();
			break;
		  }

		  if (!hole) {
			hole = { r: currRC.r, c: currRC.c };
			b[currRC.r][currRC.c] = -1;
		  } else {
			const moved = b[currRC.r][currRC.c];
			b[hole.r][hole.c] = moved;
			b[currRC.r][currRC.c] = -1;
			hole = { r: currRC.r, c: currRC.c };
		  }

		  setReplayBoard(b.map(r => [...r]));
		  setHolePos({ ...hole });
		  setCurrentStep(i);

		  {
			const pi = getCellCenterPx(currRC.r, currRC.c);
			setFloating(prev => (prev ? { ...prev, x: pi.x, y: pi.y, visible: true } : prev));
		  }

		  await new Promise(r => requestAnimationFrame(() => r()));
		  if (isCancelled()) return;

		  if (i % skip === 0 || i === path.length - 1) {
			 setGifFooter(prev => ({
			  ...prev,
			  step: i,
			}));

			// ??蝑?footer DOM ???湔?嚗??芸撟嚗?
			await new Promise(r => requestAnimationFrame(r));
			await new Promise(r => requestAnimationFrame(r));

			await addFrame();
			if (isCancelled()) return;
		  }
		}
		
		// ??撘瑕?敺?甇亦? footer + ?芯?撘蛛?蝣箔?憿舐內 step=totalSteps
		setGifFooter(prev => ({
		  ...prev,
		  step: totalSteps,
		}));
		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => requestAnimationFrame(r));
		await addFrame(); // ?撐????甇?? lastCanvas

		// ???敺?撟?賢?摰?嚗撥?園＊蝷?12/12嚗?00%嚗?
		bumpProgress(totalFrames);

		// ??銝???嚗?交??敺?撘?canvas ????3 ??
		if (lastCanvas) {
			if (isCancelled()) return;
			gif.addFrame(lastCanvas, { delay: 1500, copy: true });
		}

		// ??霈?React ???? 12/12 ?思??鳴??芣??祇?嚗?
		await new Promise(r => requestAnimationFrame(r));
		await new Promise(r => setTimeout(r, 60));

		if (isCancelled()) return;

		// ???脣????GIF...??畾?
		setGifStage("render");
		await new Promise(r => requestAnimationFrame(r));

		// =========
		// 5) render GIF
		// =========
		const blob = await new Promise((resolve, reject) => {
		  gif.on("finished", resolve);
		  gif.on("abort", () => reject(new Error("GIF render aborted")));
		  gif.render();
		});

		if (isCancelled()) return;

		gifBlobRef.current = blob;
		const url = URL.createObjectURL(blob);

		if (isCancelled()) {
		  URL.revokeObjectURL(url);
		  return;
		}

		setGifReady({ url, name: `tos_replay_${totalSteps}steps_skip${skip}.gif` });

		stopToBase(true);
	  } catch (e) {
			// ??雿輻??中止/取消嚗?閬?航炊嚗?閬?alert
			  const msg = String(e?.message || e || "");
			  if (exportTokenRef.current.cancelled || /aborted|abort/i.test(msg)) {
				console.log("GIF export cancelled:", e);
				stopToBase(true);
				return;
			  }

			  console.error(e);
			  alert("GIF 匯出失敗，請查看 Console: " + (e?.message || e));
			  stopToBase(true);
	  } finally {
		// ???芣??活?臬???舀??圈甈∴???嗅偏 UI
		const stillMine = exportTokenRef.current.id === myId;
		if (stillMine) {
		  gifRef.current = null;
		  setExportingGif(false);
		  setGifProgress({ cur: 0, total: 0, pct: 0 });
		  setGifStage("capture");
		  setGifCaptureMode(false);
		}
	  }
	}, [path, config.replaySpeed, stopToBase, getCellCenterPx, stats.combos, stats.skyfallCombos]);
const onGifDownloadClick = useCallback(async () => {
	  const blob = gifBlobRef.current;
	  const url = gifReady?.url;
	  const name = gifReady?.name || "replay.gif";
	  if (!blob && !url) return;

	  // ???芸??璈?韏?share嚗??Windows Chrome 銋歲?澈?Ｘ嚗?
	  const isMobile =
		/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints > 1 && window.matchMedia?.("(pointer: coarse)")?.matches);

	  if (isMobile && blob && navigator.share && navigator.canShare) {
		try {
		  const file = new File([blob], name, { type: "image/gif" });
		  if (navigator.canShare({ files: [file] })) {
			await navigator.share({ files: [file], title: name });
			return; // ???? share ??撠梁???
		  }
		} catch (e) {
		  // 雿輻??瘨??澈憭望? ??fallback 銝?
		  console.log("share cancelled/failed:", e);
		}
	  }

	  // ??fallback嚗?乩?頛??餉銝摰粥??嚗?
	  const downloadUrl = url || (blob ? URL.createObjectURL(blob) : "");
	  if (!downloadUrl) return;

	  const a = document.createElement("a");
	  a.href = downloadUrl;
	  a.download = name;
	  a.rel = "noopener";
	  document.body.appendChild(a);
	  a.click();
	  a.remove();

	  // ?交重置 createObjectURL嚗???
	  if (!url && blob) setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
	}, [gifReady?.url, gifReady?.name]);
/////////////////
// 蝚砍??嚗楝敺＊蝷綽?SVG / Segment Label嚗?蝞?
/////////////////
// 撠摨扳?頝臬?頧???摨扳?頝臬?嚗? SVG ??replay ?梁??// 撠摨扳?頝臬?頧??頝臬?嚗楝敺?????梁嚗?
const buildPixelPath = (rcPath, startPx = null) => {
    if (!rcPath || rcPath.length < 2) return null;
    const pts = rcPath.map(p => getCellCenterPx(p.r, p.c));
    if (startPx) pts[0] = startPx;
    return pts;
  };
const cellCenterByRC = (r, c) => {
	  const rc = cellRectsRef.current?.[r]?.[c];
	  if (!rc) return { x: 0, y: 0 };
	  return { x: (rc.left + rc.right) / 2, y: (rc.top + rc.bottom) / 2 };
	};
const replayPathContinuous = (targetPath = path) => {
	  if (!targetPath || targetPath.length < 2) return;

	  if (replayAnimRef.current.raf) cancelAnimationFrame(replayAnimRef.current.raf);

	  setIsReplaying(true);
	  setIsPaused(false);
	  setCurrentStep(0);
	  clearAllGhosts();

	  const start = targetPath[0];
	  const base = baseBoardRef.current;

	  const startCell = base[start.r][start.c]; // ???????瘞賊??箏?
	  const startOrbId = orbOf(startCell);
	  let b = base.map(r => [...r]);

	  // ??????韏瑟???row0嚗??文?銝?瘣?瘣??具洵銝甈∟???row1~5???箇
	  let hole = null;

	if (start.r >= PLAY_ROWS_START) {
	  hole = { r: start.r, c: start.c };
	  b[start.r][start.c] = -1;
	  setHolePos({ ...hole });
	} else {
	  // ??韏瑟???row0嚗???瘝?嚗?????
	  setHolePos(null);
	}

	  setReplayBoard(b);

	  const pts = buildPixelPath(targetPath);
	  if (!pts || pts.length < 2) return;

	  setFloating({ orbId: startOrbId, x: pts[0].x, y: pts[0].y, visible: true });

	  replayAnimRef.current = {
		raf: 0,
		finished: false,
		segmentIndex: 0,
		segmentStartedAt: performance.now(),
		segmentElapsedMs: 0,
		moveDurationMs: Math.max(16, Number(config.replaySpeed) || 250),
		b,
		hole,
		held: startCell,
		lastNode: 0,
		pts,
		targetPath,
	  };

	  replayAnimRef.current.raf = requestAnimationFrame(runReplayFrame);
	};
const routeDirection = (a, b) => ({
  dr: Math.sign(b.r - a.r),
  dc: Math.sign(b.c - a.c),
});
const routeDirectionKey = (a, b) => {
  const { dr, dc } = routeDirection(a, b);
  return `${dr},${dc}`;
};
const ROUTE_DIAGONAL_UNIT = Math.SQRT1_2;
const ROUTE_ORIENTATIONS = {
  H: {
    normal: { x: 0, y: 1 },
  },
  V: {
    normal: { x: 1, y: 0 },
  },
  D_DOWN: {
    normal: { x: ROUTE_DIAGONAL_UNIT, y: -ROUTE_DIAGONAL_UNIT },
  },
  D_UP: {
    normal: { x: ROUTE_DIAGONAL_UNIT, y: ROUTE_DIAGONAL_UNIT },
  },
};
const routeOrientationKey = (a, b) => {
  const { dr, dc } = routeDirection(a, b);
  if (dr === 0) return "H";
  if (dc === 0) return "V";
  return dr * dc > 0 ? "D_DOWN" : "D_UP";
};
const routeTangent = (a, b) => {
  const { dr, dc } = routeDirection(a, b);
  const length = Math.hypot(dc, dr) || 1;
  return { x: dc / length, y: dr / length };
};
const addRouteOffset = (point, line) => {
  const normal = ROUTE_ORIENTATIONS[line.orientation].normal;
  return {
    x: point.x + normal.x * line.offset,
    y: point.y + normal.y * line.offset,
  };
};
const routeSupportCoordinate = (point, orientation) => {
  const normal = ROUTE_ORIENTATIONS[orientation].normal;
  return point.x * normal.x + point.y * normal.y;
};
const routeLaneSlot = (attempt) => {
  if (attempt === 0) return 0;
  const distance = Math.ceil(attempt / 2);
  return attempt % 2 === 1 ? -distance : distance;
};
const intersectRouteLines = (p1, tangent1, p2, tangent2) => {
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const denominator = cross(tangent1, tangent2);
  if (Math.abs(denominator) < 1e-6) return null;

  const delta = { x: p2.x - p1.x, y: p2.y - p1.y };
  const distance = cross(delta, tangent2) / denominator;
  return {
    x: p1.x + tangent1.x * distance,
    y: p1.y + tangent1.y * distance,
  };
};
const buildShiftedRouteGeometry = (rcPath, laneGap, getCenterPx = getCellCenterPx) => {
  if (!rcPath?.length) return { lines: [], start: null, end: null };

  const centers = rcPath.map((p) => getCenterPx(p.r, p.c));
  if (rcPath.length < 2) {
    return { lines: [], start: centers[0] || null, end: centers[0] || null };
  }

  const lines = [];
  let start = 0;
  let direction = routeDirectionKey(rcPath[0], rcPath[1]);

  const appendLine = (end) => {
    const orientation = routeOrientationKey(
      rcPath[start],
      rcPath[start + 1]
    );

    const line = {
      start,
      end,
      orientation,
      tangent: routeTangent(rcPath[start], rcPath[start + 1]),
      lane: 0,
      offset: 0,
      supportCoordinate: 0,
      displayStart: null,
      displayEnd: null,
      entryPoints: null,
    };
    lines.push(line);
  };

  for (let i = 1; i < rcPath.length - 1; i++) {
    const nextDirection = routeDirectionKey(rcPath[i], rcPath[i + 1]);
    if (nextDirection === direction) continue;

    appendLine(i);
    start = i;
    direction = nextDirection;
  }

  appendLine(rcPath.length - 1);

  const usedSupportCoordinates = new Map();
  const minimumSupportGap = laneGap * 0.75;

  for (const line of lines) {
    const orientationSupports =
      usedSupportCoordinates.get(line.orientation) || [];
    const baseSupport = routeSupportCoordinate(
      centers[line.start],
      line.orientation
    );

    let attempt = 0;
    while (true) {
      const lane = routeLaneSlot(attempt);
      const offset = lane * laneGap;
      const candidateSupport = baseSupport + offset;
      const overlapsExtendedLine = orientationSupports.some(
        (usedSupport) =>
          Math.abs(candidateSupport - usedSupport) < minimumSupportGap
      );

      if (!overlapsExtendedLine) {
        line.lane = lane;
        line.offset = offset;
        line.supportCoordinate = candidateSupport;
        orientationSupports.push(candidateSupport);
        usedSupportCoordinates.set(line.orientation, orientationSupports);
        break;
      }

      attempt++;
    }
  }

  lines[0].displayStart = addRouteOffset(centers[lines[0].start], lines[0]);
  const foldbackUsage = new Map();

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    const corner = centers[current.end];
    const currentPoint = addRouteOffset(corner, current);
    const nextPoint = addRouteOffset(corner, next);
    const cross =
      current.tangent.x * next.tangent.y -
      current.tangent.y * next.tangent.x;
    const intersection =
      Math.abs(cross) >= 1e-6
        ? intersectRouteLines(
            currentPoint,
            current.tangent,
            nextPoint,
            next.tangent
          )
        : null;

    if (
      intersection &&
      Number.isFinite(intersection.x) &&
      Number.isFinite(intersection.y)
    ) {
      current.displayEnd = intersection;
      next.displayStart = intersection;
    } else {
      const cornerCell = rcPath[current.end];
      const foldbackKey =
        `${cornerCell.r},${cornerCell.c}:${current.orientation}:` +
        routeDirectionKey(rcPath[current.start], rcPath[current.start + 1]);
      const foldbackIndex = foldbackUsage.get(foldbackKey) || 0;
      foldbackUsage.set(foldbackKey, foldbackIndex + 1);

      const capDepth = laneGap * (0.75 + foldbackIndex * 0.75);
      const capOffset = {
        x: current.tangent.x * capDepth,
        y: current.tangent.y * capDepth,
      };
      const currentCap = {
        x: currentPoint.x + capOffset.x,
        y: currentPoint.y + capOffset.y,
      };
      const nextCap = {
        x: nextPoint.x + capOffset.x,
        y: nextPoint.y + capOffset.y,
      };

      current.displayEnd = currentCap;
      next.displayStart = nextCap;
      next.entryPoints = [currentCap, nextCap];
    }
  }

  const lastLine = lines[lines.length - 1];
  lastLine.displayEnd = addRouteOffset(centers[lastLine.end], lastLine);

  return {
    lines: lines.map((line, index) => ({
      ...line,
      segmentIndex: index,
    })),
    start: lines[0].displayStart,
    end: lastLine.displayEnd,
  };
};
const collectCompletedRoutePoints = (routeGeometry) => {
  const visibleRoutePoints = [];

  for (const line of routeGeometry?.lines || []) {
    const points = line.entryPoints
      ? [...line.entryPoints, line.displayEnd]
      : [line.displayStart, line.displayEnd];

    for (const point of points) {
      if (!point) continue;

      const previousPoint = visibleRoutePoints[visibleRoutePoints.length - 1];
      if (
        previousPoint &&
        Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.01
      ) {
        continue;
      }
      visibleRoutePoints.push(point);
    }
  }

  return visibleRoutePoints;
};
const buildStraightPath = (points) => {
  if (!points || points.length < 2) return "";

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
};
const hypot = (x, y) => Math.hypot(x, y);
const q = (v, unit = 0.25) => Math.round(v / unit) * unit;
const lineIntersection = (P, r, Q, s, eps = 1e-9) => {
  // Solve: P + t r intersects Q + u s
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const rxs = cross(r, s);
  if (Math.abs(rxs) < eps) return null;

  const qmp = { x: Q.x - P.x, y: Q.y - P.y };
  const t = cross(qmp, s) / rxs;
  return { x: P.x + r.x * t, y: P.y + r.y * t, t };
};
const isReasonableIntersectionGeom = (hit, refA, refB, maxDist = 96) => {
  if (!hit) return false;
  if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return false;

  const d1 = hypot(hit.x - refA.x, hit.y - refA.y);
  const d2 = hypot(hit.x - refB.x, hit.y - refB.y);

  return d1 <= maxDist && d2 <= maxDist;
};
const edgeKey = (a, b) => {
  const ax = q(a.x), ay = q(a.y);
  const bx = q(b.x), by = q(b.y);
  if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
};
const dirKey = (a, b, eps = 1e-6) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const sx = Math.abs(dx) < eps ? 0 : Math.sign(dx);
  const sy = Math.abs(dy) < eps ? 0 : Math.sign(dy);
  return `${sx},${sy}`;
};
const laneOf = (count) => (count === 0 ? 0 : (count % 2 ? (count + 1) / 2 : -(count / 2)));
const dedupePts = (pts, eps = 1e-6) => {
  if (!pts || pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q0 = out[out.length - 1];
    if (hypot(p.x - q0.x, p.y - q0.y) > eps) out.push(p);
  }
  return out;
};
const simplifyPts = (pts, eps = 1e-6) => {
  if (!pts || pts.length < 2) return pts;

  const a = dedupePts(pts, eps);
  if (a.length < 3) return a;

  const out = [a[0]];
  for (let i = 1; i < a.length - 1; i++) {
    const p0 = out[out.length - 1];
    const p1 = a[i];
    const p2 = a[i + 1];

    const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x, v2y = p2.y - p1.y;

    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;

    if (Math.abs(cross) < eps && dot > 0) continue; // collinear & same dir
    out.push(p1);
  }
  out.push(a[a.length - 1]);
  return out;
};
const getCellCenter = (p) => {
  const { x, y } = getCellCenterPx(p.r, p.c);
  return { x, y };
};
const collapseUpcomingOverlapRunsV3 = (
  pts,
  {
    prefixMinEdges = 1,
    suffixMinEdges = 1,
    fullMinEdges = 3,
    bump = 14,
    bumpRamp = 14,
    eps = 1e-6,
  } = {}
) => {
  if (!pts || pts.length < 2) return pts;

  const visited = new Set();
  const out = [pts[0]];

  const addRunEdgesToVisited = (fromIdx, toIdx) => {
    for (let k = fromIdx; k < toIdx; k++) visited.add(edgeKey(pts[k], pts[k + 1]));
  };

  const pushBumpWholeRun = (C, A, B, D) => {
    // m = A->B defines run direction
    const mdx = B.x - A.x, mdy = B.y - A.y;
    const mL = hypot(mdx, mdy);
    if (mL <= eps) { out.push(D); return; }

    const ux = mdx / mL, uy = mdy / mL;
    const nx = -uy, ny = ux;

    const rdx = D.x - A.x, rdy = D.y - A.y;
    const rL = hypot(rdx, rdy);
    const h = Math.min(bump, rL * 0.25);

    const fallback = () => {
      const L = Math.max(rL, 1);
      const t = Math.max(2, Math.min(bumpRamp, L * 0.33));
      const bumpIn  = { x: A.x + (rdx / L) * t + nx * h, y: A.y + (rdy / L) * t + ny * h };
      const bumpOut = { x: D.x - (rdx / L) * t + nx * h, y: D.y - (rdy / L) * t + ny * h };
      out.push(bumpIn, bumpOut, D);
    };

    // no C / degenerate => fallback bump
    if (!C || rL <= eps) { fallback(); return; }

    // parallel line through A + n*h with direction u
    const P = { x: A.x + nx * h, y: A.y + ny * h };
    const r = { x: ux, y: uy };

    // C2 = line(C->A) ??parallel line
    const rCA = { x: A.x - C.x, y: A.y - C.y };
    const hitC = lineIntersection(P, r, C, rCA, 1e-9);

    // D2 = line(B->D) ??parallel line
    const rBD = { x: D.x - B.x, y: D.y - B.y };
    const hitD = lineIntersection(P, r, B, rBD, 1e-9);

    if (
      !hitC || !hitD ||
      !isReasonableIntersectionGeom(hitC, C, A) ||
      !isReasonableIntersectionGeom(hitD, B, D)
    ) {
      fallback();
      return;
    }

    out.push({ x: hitC.x, y: hitC.y }, { x: hitD.x, y: hitD.y }, D);
  };

  let i = 0;
  while (i < pts.length - 1) {
    const d = dirKey(pts[i], pts[i + 1], eps);

    // same-direction run: pts[i..j]
    let j = i + 1;
    while (j < pts.length - 1 && dirKey(pts[j], pts[j + 1], eps) === d) j++;

    const edgesCount = j - i;
    const A = pts[i];
    const D = pts[j];

    // prefix overlap count p
    let p = 0;
    while (p < edgesCount && visited.has(edgeKey(pts[i + p], pts[i + p + 1]))) p++;

    // suffix overlap count s
    let s = 0;
    while (s < edgesCount && visited.has(edgeKey(pts[j - 1 - s], pts[j - s]))) s++;

    const fullOverlapped = (p === edgesCount);
    const triggerFull = fullOverlapped && edgesCount >= fullMinEdges;

    const triggerPrefix = (!fullOverlapped) && (p >= prefixMinEdges);
    const triggerSuffix = (!fullOverlapped) && (s >= suffixMinEdges);

    if (triggerFull || triggerPrefix || triggerSuffix) {
      const C = (i > 0) ? pts[i - 1] : null;
      const B = pts[j - 1];
      pushBumpWholeRun(C, A, B, D);

      // mark only the "new" edges (keeps your original behavior)
      const newStart = i + p;
      const newEnd = j - s;
      if (newStart < newEnd) addRunEdgesToVisited(newStart, newEnd);
    } else {
      for (let k = i; k < j; k++) {
        visited.add(edgeKey(pts[k], pts[k + 1]));
        out.push(pts[k + 1]);
      }
    }

    i = j;
  }

  return out;
};
const straightenBumpToParallelLine = (C, A, B, D, h, eps = 1e-6) => {
  const abx = B.x - A.x, aby = B.y - A.y;
  const LAB = hypot(abx, aby);
  if (LAB < eps) return null;

  const ux = abx / LAB, uy = aby / LAB;
  const nx0 = -uy, ny0 = ux;

  // choose outward side away from C
  const acx = C.x - A.x, acy = C.y - A.y;
  const side = Math.sign(acx * nx0 + acy * ny0);
  const sign = (side >= 0) ? -1 : 1;
  const nx = nx0 * sign, ny = ny0 * sign;

  const Pn = { x: A.x + nx * h, y: A.y + ny * h };
  const rn = { x: ux, y: uy };

  const rCA = { x: A.x - C.x, y: A.y - C.y };
  const hitC = lineIntersection(Pn, rn, C, rCA, 1e-9);

  const rBD = { x: D.x - B.x, y: D.y - B.y };
  const hitD = lineIntersection(Pn, rn, B, rBD, 1e-9);

  if (
    !hitC || !hitD ||
    !isReasonableIntersectionGeom(hitC, C, A) ||
    !isReasonableIntersectionGeom(hitD, B, D)
  ) return null;

  return {
    C2: { x: hitC.x, y: hitC.y },
    D2: { x: hitD.x, y: hitD.y },
    nx, ny, ux, uy
  };
};
const deOverlapByRampedDetourV2 = (pts, spacing = 8, ramp = 14, eps = 1e-6) => {
  const clean = dedupePts(pts, eps);
  if (!clean || clean.length < 2) return clean;

  const used = new Map(); // edgeKey -> times seen
  const out = [clean[0]];

  let inRun = false;
  let runStart = null, runEnd = null, runDir = null;
  let runOff = 0, runLen = 0;

  const flushRun = () => {
    if (!inRun) return;

    const a = runStart, b = runEnd;
    const L = runLen;
    const t = Math.max(2, Math.min(ramp, L * 0.33));

    const { ux, uy, nx, ny } = runDir;

    out.push(
      { x: a.x + ux * t + nx * runOff, y: a.y + uy * t + ny * runOff },
      { x: b.x - ux * t + nx * runOff, y: b.y - uy * t + ny * runOff },
      b
    );

    inRun = false;
    runStart = runEnd = runDir = null;
    runOff = 0;
    runLen = 0;
  };

  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];

    const dx = b.x - a.x, dy = b.y - a.y;
    const L = hypot(dx, dy);
    if (L <= eps) continue;

    const k = edgeKey(a, b);
    const cnt = used.get(k) || 0;
    used.set(k, cnt + 1);

    if (cnt === 0) {
      flushRun();
      out.push(b);
      continue;
    }

    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;

    const off = laneOf(cnt) * spacing;

    if (!inRun) {
      inRun = true;
      runStart = a;
      runEnd = b;
      runDir = { ux, uy, nx, ny };
      runOff = off;
      runLen = L;
      continue;
    }

    const sameDir = Math.abs(runDir.ux - ux) < 1e-6 && Math.abs(runDir.uy - uy) < 1e-6;
    const sameOff = Math.abs(runOff - off) < 1e-6;

    if (sameDir && sameOff) {
      runEnd = b;
      runLen += L;
    } else {
      flushRun();
      inRun = true;
      runStart = a;
      runEnd = b;
      runDir = { ux, uy, nx, ny };
      runOff = off;
      runLen = L;
    }
  }

  flushRun();
  return out;
};
const sampleAlongPolyline = (pts, spacing = 22, startOffset = 10) => {
  if (!pts || pts.length < 2) return [];

  const segLen = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const L = hypot(dx, dy);
    segLen.push(L);
    total += L;
  }
  if (total <= 1e-6) return [];

  const out = [];
  for (let dist = startOffset; dist < total - startOffset; dist += spacing) {
    let acc = 0, i = 0;
    while (i < segLen.length && acc + segLen[i] < dist) { acc += segLen[i]; i++; }
    if (i >= segLen.length) break;

    const L = segLen[i] || 1;
    const t = (dist - acc) / L;

    const a = pts[i], b = pts[i + 1];
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;

    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    out.push({ x, y, ang });
  }
  return out;
};
// 撱箇??? path 摮葡?絲蝯?璅?鞈???// ?Ｙ??? SVG path 摮葡?絲蝯?璅???
const buildPathStringAndMarkersRounded = (pts, radius = 8) => {
  if (!pts || pts.length < 2) return { d: "", start: null, tip: null };

  const dist = (a, b) => hypot(b.x - a.x, b.y - a.y);

  const moveTowards = (from, to, len) => {
    const d = dist(from, to);
    if (d <= 1e-6) return { ...from };
    const t = len / d;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  };

  const cleanPts = simplifyPts(pts);

  const start = cleanPts[0];
  const tip = cleanPts[cleanPts.length - 1];

  let dStr = `M ${start.x} ${start.y}`;

  if (cleanPts.length === 2) {
    dStr += ` L ${tip.x} ${tip.y}`;
    return { d: dStr, start, tip };
  }

  for (let i = 1; i < cleanPts.length - 1; i++) {
    const p0 = cleanPts[i - 1];
    const p1 = cleanPts[i];
    const p2 = cleanPts[i + 1];

    const d01 = dist(p0, p1);
    const d12 = dist(p1, p2);

    const r = Math.max(0, Math.min(radius, d01 * 0.5, d12 * 0.5));
    if (r <= 1e-6) { dStr += ` L ${p1.x} ${p1.y}`; continue; }

    const inPt = moveTowards(p1, p0, r);
    const outPt = moveTowards(p1, p2, r);

    dStr += ` L ${inPt.x} ${inPt.y}`;
    dStr += ` Q ${p1.x} ${p1.y} ${outPt.x} ${outPt.y}`;
  }

  dStr += ` L ${tip.x} ${tip.y}`;
  return { d: dStr, start, tip };
};
const normalizeRcPath = (rcPath) => {
  if (!rcPath || rcPath.length < 1) return [];
  const out = [rcPath[0]];
  for (let i = 1; i < rcPath.length; i++) {
    const p = rcPath[i], q0 = out[out.length - 1];
    if (p.r !== q0.r || p.c !== q0.c) out.push(p);
  }
  return out;
};
const buildSegmentsFromRcPath = (rcPathRaw) => {
  const rcPath = normalizeRcPath(rcPathRaw);
  if (rcPath.length < 2) return [];

  const segs = [];
  let start = 0;

  const dir = (a, b) => `${Math.sign(b.r - a.r)},${Math.sign(b.c - a.c)}`;

  let d0 = dir(rcPath[0], rcPath[1]);
  for (let i = 1; i < rcPath.length - 1; i++) {
    const d1 = dir(rcPath[i], rcPath[i + 1]);
    if (d1 !== d0) {
      segs.push({ start, end: i });
      start = i;
      d0 = d1;
    }
  }
  segs.push({ start, end: rcPath.length - 1 });
  return segs;
};
// 靘楝敺挾?賜???1,2,3... 璅惜雿蔭嚗?票朣楝敺???????// 求解瘥挾頝臬??摮?蝐支?蝵株?閫漲??
const buildSegmentLabelsFromRcPath = (
  rcPathRaw,
  getCellCenterPx,
  {
    labelR = 8,
    pathStroke = 4,
    gap = 1.5,
    alongScale = 0.22,
    cellSize = 64,
    minPxLen = 10,
  } = {}
) => {
  const rcPath = normalizeRcPath(rcPathRaw);
  if (rcPath.length < 2) return [];

  const segs = buildSegmentsFromRcPath(rcPath);
  if (!segs.length) return [];

  const labels = [];
  const off = labelR + pathStroke / 2 + gap;
  const alongBase = Math.max(8, Math.min(18, cellSize * alongScale));

  const usage = new Map();
  const segKey = (A, B) => {
    const k1 = `${A.x},${A.y}|${B.x},${B.y}`;
    const k2 = `${B.x},${B.y}|${A.x},${A.y}`;
    return k1 < k2 ? k1 : k2;
  };

  for (let si = 0; si < segs.length; si++) {
    const { start, end } = segs[si];
    const A = rcPath[start];
    const B = rcPath[end];

    const pA = getCellCenterPx(A.r, A.c);
    const pB = getCellCenterPx(B.r, B.c);

    let dx = pB.x - pA.x, dy = pB.y - pA.y;
    let L = hypot(dx, dy);

    // if weird, take first valid step inside segment
    if (!Number.isFinite(L) || L < 1e-6) {
      let k = start;
      while (k < end && rcPath[k].r === rcPath[k + 1].r && rcPath[k].c === rcPath[k + 1].c) k++;
      if (k < end) {
        const p1 = getCellCenterPx(rcPath[k].r, rcPath[k].c);
        const p2 = getCellCenterPx(rcPath[k + 1].r, rcPath[k + 1].c);
        dx = p2.x - p1.x;
        dy = p2.y - p1.y;
        L = hypot(dx, dy);
      }
    }

    // still degenerate => default horizontal
    if (!Number.isFinite(L) || L < 1e-6) { dx = 1; dy = 0; L = 1; }

    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;

    const mx = (pA.x + pB.x) / 2;
    const my = (pA.y + pB.y) / 2;

    const key = segKey(pA, pB);
    const cnt = usage.get(key) || 0;
    usage.set(key, cnt + 1);
    const lane = laneOf(cnt);

    const LforCalc = Math.max(Math.max(L, minPxLen), 1);
    const alongMax = Math.max(0, LforCalc * 0.45 - (labelR + 2));
    const along = Math.min(alongBase, alongMax);

    labels.push({
      idx: labels.length + 1,
      x: mx + nx * off + ux * (along * lane),
      y: my + ny * off + uy * (along * lane),
    });
  }

  return labels;
};
const ensureImageLoaded = (imgEl) =>
	  new Promise((resolve, reject) => {
		if (!imgEl) return reject(new Error("imgEl is null"));
		if (imgEl.complete && imgEl.naturalWidth > 0) return resolve();
		imgEl.onload = () => resolve();
		imgEl.onerror = () => reject(new Error("failed to load template image"));
	  });
const featureFromImageData = (imgData) => {
	  const { data, width, height } = imgData;

	  const H_BINS = 18, S_BINS = 5, V_BINS = 5, E_BINS = 4;
	  const feat = new Float32Array(H_BINS + S_BINS + V_BINS + E_BINS);
	  const gray = new Float32Array(width * height);
	  const mask = new Uint8Array(width * height);
	  const clamp01 = (v) => Math.max(0, Math.min(1, v));

	  let idx = 0;
	  for (let y = 0; y < height; y++) {
		const yn = (y + 0.5) / height;
		for (let x = 0; x < width; x++, idx++) {
		  const xn = (x + 0.5) / width;
		  if (xn > 0.64 && yn < 0.46) continue;

		  const dx = xn - 0.5;
		  const dy = yn - 0.52;
		  if (dx * dx + dy * dy > 0.3) continue;

		  const i = idx * 4;
		  const a = data[i + 3] / 255;
		  if (a < 0.15) continue;

		  const r = data[i] / 255;
		  const g = data[i + 1] / 255;
		  const b = data[i + 2] / 255;
		  const v = Math.max(r, g, b);
		  const m = Math.min(r, g, b);
		  const chroma = v - m;
		  const s = v > 1e-6 ? chroma / v : 0;
		  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

		  gray[idx] = lum;
		  mask[idx] = 1;

		  const colorWeight = clamp01((s - 0.1) / 0.35) * clamp01((v - 0.2) / 0.35);
		  if (colorWeight <= 0) continue;

		  let h = 0;
		  if (chroma > 1e-6) {
			if (v === r) h = ((g - b) / chroma) % 6;
			else if (v === g) h = (b - r) / chroma + 2;
			else h = (r - g) / chroma + 4;
			h *= 60;
			if (h < 0) h += 360;
		  }

		  const hb = Math.min(H_BINS - 1, Math.floor(h / 360 * H_BINS));
		  const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
		  const vb = Math.min(V_BINS - 1, Math.floor(v * V_BINS));

		  feat[hb] += colorWeight * 2.2;
		  feat[H_BINS + sb] += colorWeight * 0.45;
		  feat[H_BINS + S_BINS + vb] += colorWeight * 0.35;
		}
	  }

	  const edgeOffset = H_BINS + S_BINS + V_BINS;
	  for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
		  const p = y * width + x;
		  if (!mask[p] || !mask[p - 1] || !mask[p + 1] || !mask[p - width] || !mask[p + width]) {
			continue;
		  }

		  const gx = gray[p + 1] - gray[p - 1];
		  const gy = gray[p + width] - gray[p - width];
		  const mag = Math.min(1, Math.hypot(gx, gy) * 2.2);
		  const eb = Math.min(E_BINS - 1, Math.floor(mag * E_BINS));
		  feat[edgeOffset + eb] += 0.35;
		}
	  }

	  let norm = 0;
	  for (let i = 0; i < feat.length; i++) norm += feat[i] * feat[i];
	  norm = Math.sqrt(norm) || 1;
	  for (let i = 0; i < feat.length; i++) feat[i] /= norm;

	  return feat;
	};
const dot = (a, b) => {
	  let s = 0;
	  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	  return s;
	};
const isProbablyEmptyCell = (imgData) => {
	  const { data } = imgData;
	  let n = 0;
	  let mean = 0, m2 = 0;

	  // ?見嚗? 4px ??甈∴?
	  for (let i = 0; i < data.length; i += 16) {
		const a = data[i + 3];
		if (a < 30) continue;
		const r = data[i], g = data[i + 1], b = data[i + 2];
		const y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
		n++;
		const d = y - mean;
		mean += d / n;
		m2 += d * (y - mean);
	  }
	  if (n < 40) return true; // 撟曆??券?/?函征

	  const varY = m2 / n;
	  // 雿?Ｚ??舫虜??銝???嚗???蝛箸嚗?
	  return (mean < 35 && varY < 120);
	};
const buildTemplateDB = async (templateSources) => {
	  const types = Array.isArray(templateSources)
		? templateSources
		: Object.values(templateSources);

	  // 蝣箔?璅⊥?頛
	  await Promise.all(types.map(t => ensureImageLoaded(t.imgEl || null)));

	  const SIZE = 28; // 璅⊥?賣見撠箏站嚗?雿??剁?
	  const cvs = document.createElement("canvas");
	  cvs.width = SIZE; cvs.height = SIZE;
	  const ctx = cvs.getContext("2d", { willReadFrequently: true });

	  const db = [];
	  for (const t of types) {
		// t.imgEl嚗??憟賢 ORB_TYPES 鋆⊥銝?歇頛??Image ?拐辣
		// 憒?雿??ORB_TYPES ?芣? img URL嚗?銝銋?靘瘜?蝚?2 蝭嚗?
		ctx.clearRect(0, 0, SIZE, SIZE);
		ctx.drawImage(t.imgEl, 0, 0, SIZE, SIZE);
		const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
		const feat = featureFromImageData(imgData);
		db.push({ id: t.id, feat, key: t.key || `orb-${t.id}` });
	  }
	  return { db, size: SIZE };
	};
const detectFromCroppedCanvas = (cropCanvas, ORB_TYPES, templateCacheRef, opts = {}) => {
	  const rows = opts.rows ?? 5;
	  const cols = opts.cols ?? 6;

	  // innerPad嚗?蝺???嚗???嚗???皞漲嚗?
	  const innerPad = opts.innerPad ?? 0.12; // 12% padding
	  const sampleSize = opts.sampleSize ?? 28;

	  const cache = templateCacheRef.current;
	  if (!cache || !cache.db || cache.db.length === 0) {
		throw new Error("template DB not ready");
	  }

	  const W = cropCanvas.width;
	  const H = cropCanvas.height;
	  const cellW = W / cols;
	  const cellH = H / rows;

	  const out = Array.from({ length: rows }, () => Array(cols).fill(0));

	  const tmp = document.createElement("canvas");
	  tmp.width = sampleSize;
	  tmp.height = sampleSize;
	  const tctx = tmp.getContext("2d", { willReadFrequently: true });

	  const cctx = cropCanvas.getContext("2d", { willReadFrequently: true });

	  for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
		  const x0 = c * cellW;
		  const y0 = r * cellH;

		  // ?抒葬?見?嚗??獢??潛?
		  const px = x0 + cellW * innerPad;
		  const py = y0 + cellH * innerPad;
		  const pw = cellW * (1 - innerPad * 2);
		  const ph = cellH * (1 - innerPad * 2);

		  // draw to small canvas
		  tctx.clearRect(0, 0, sampleSize, sampleSize);
		  tctx.drawImage(cropCanvas, px, py, pw, ph, 0, 0, sampleSize, sampleSize);

		  const imgData = tctx.getImageData(0, 0, sampleSize, sampleSize);

		  // 蝛箸?斗嚗?賂?
		  if (opts.allowEmpty && isProbablyEmptyCell(imgData)) {
			out[r][c] = -1;
			continue;
		  }

		  const feat = featureFromImageData(imgData);

		  // 瘥?璅⊥嚗osine: ??孵噩撌?L2 normalize嚗?隞?dot 撠望 cosine嚗?
		  let bestId = cache.db[0].id;
		  let bestScore = -1;

		  for (let i = 0; i < cache.db.length; i++) {
			const s = dot(feat, cache.db[i].feat);
			if (s > bestScore) {
			  bestScore = s;
			  bestId = cache.db[i].id;
			}
		  }

		  // ?臬?銝??瑼鳴?憭芯??停?嗥征/?芰
		  const minScore = opts.minScore ?? 0.55;
		  if (opts.allowUnknown && bestScore < minScore) {
			out[r][c] = -1; // ???喟 0 / null
		  } else {
			out[r][c] = bestId;
		  }
		}
	  }

	  return out;
	};
const SPECIAL_ORB_OPTIONS = [
  { label: "*", value: SPECIAL_ORB_ANY },
  { label: "W", value: ORB_TYPES.WATER.id },
  { label: "F", value: ORB_TYPES.FIRE.id },
  { label: "P", value: ORB_TYPES.EARTH.id },
  { label: "L", value: ORB_TYPES.LIGHT.id },
  { label: "D", value: ORB_TYPES.DARK.id },
  { label: "H", value: ORB_TYPES.HEART.id },
];
const EQUAL_FIRST_OPTIONS = [
  { label: "W", value: ORB_TYPES.WATER.id },
  { label: "F", value: ORB_TYPES.FIRE.id },
  { label: "P", value: ORB_TYPES.EARTH.id },
  { label: "L", value: ORB_TYPES.LIGHT.id },
  { label: "D", value: ORB_TYPES.DARK.id },
  { label: "H", value: ORB_TYPES.HEART.id },
];

const displayBoard = renderBoard;
/////////////////
// 演算法集中區：特優先顯示摘要
/////////////////
// 將特優先設定轉成單行摘要，供按鈕與列表顯示。
const getSpecialPriorityLabel = (sp) => {
  if (!sp || sp.type === "none") return "未設定";

  const orbNameMap = {
    [SPECIAL_ORB_ANY]: "*",
    [ORB_TYPES.WATER.id]: "W",
    [ORB_TYPES.FIRE.id]: "F",
    [ORB_TYPES.EARTH.id]: "P",
    [ORB_TYPES.LIGHT.id]: "L",
    [ORB_TYPES.DARK.id]: "D",
    [ORB_TYPES.HEART.id]: "H",
  };

  if (sp.type === "clearCount") {
    return `首消總消珠 ${sp.clearCount || 3}`;
  }

  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
    if (selected.length === 0) return "等量首消（未選珠）";
    return `等量首消：${selected.map((x) => orbNameMap[x]).join(" / ")}`;
  }

  if (sp.type === "rect") {
    return `靈罩 ${sp.rectM || 3}x${sp.rectN || 3} / ${
      orbNameMap[sp.rectOrb] ?? "*"
    }`;
  }

  const shapeName =
    sp.type === "cross"
      ? "十字"
      : sp.type === "l"
      ? "L"
      : sp.type === "t"
      ? "T"
      : "特殊";
  const orbLabel = orbNameMap[sp.orb] ?? "*";
  const count = sp.count || 1;

  return `${shapeName} ${orbLabel} x${count}`;
};

const renderSpecialPriorityCompact = (sp) => {
  if (!sp || sp.type === "none") return "未設定";

  if (sp.type === "clearCount") {
    return <span>首消 {sp.clearCount || 3} 粒盾</span>;
  }

  if (sp.type === "equalFirst") {
    const selected = normalizeSelectedEqualOrbs(sp.equalOrbs);
    if (selected.length === 0) return <span>連擊相等盾（未選珠）</span>;
    return (
      <span className="inline-flex items-center gap-1">
        <span>連擊相等盾</span>
        {selected.map((orb) => (
          <span key={`eq-chip-${orb}`} className="inline-flex items-center">
            {renderOrbIcon(orb, "h-3.5 w-3.5")}
          </span>
        ))}
      </span>
    );
  }

  if (sp.type === "rect") {
    return (
      <span className="inline-flex items-center gap-1">
        <span>靈罩 {sp.rectM || 3}x{sp.rectN || 3}</span>
        <span>/</span>
        <span className="inline-flex items-center">
          {Number(sp.rectOrb) === SPECIAL_ORB_ANY ? (
            <span className="text-[11px] font-black">*</span>
          ) : (
            renderOrbIcon(Number(sp.rectOrb), "h-3.5 w-3.5")
          )}
        </span>
      </span>
    );
  }

  const shapeName =
    sp.type === "cross"
      ? "十字"
      : sp.type === "l"
      ? "L 字"
      : sp.type === "t"
      ? "T 字"
      : "特殊";

  return (
    <span className="inline-flex items-center gap-1">
      <span>{shapeName} /</span>
      <span className="inline-flex items-center">
        {Number(sp.orb) === SPECIAL_ORB_ANY ? (
          <span className="text-[11px] font-black">*</span>
        ) : (
          renderOrbIcon(Number(sp.orb), "h-3.5 w-3.5")
        )}
      </span>
      <span>/ {sp.count || 1}組</span>
    </span>
  );
};

const specialPriority1 = specialPriorities[0];
const specialPriority2 = specialPriorities[1];
const specialPriority3 = specialPriorities[2];
const ruleProfileView = ruleValidation.normalizedProfile;
const ruleAddOptions = ruleValidation.addOptions || [];
const getSpecialShapeLabel = (type) =>
  type === "cross" ? "十字" : type === "l" ? "L字" : type === "t" ? "T字" : "指定";

// 皜脫??孵???憿??怎??閬?蝐歹???
const renderPriorityHeaderLabel = (title, sp) => {
  const active = sp?.type && sp.type !== "none";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="shrink-0 text-sm font-black tracking-wide text-pink-400">
        {title}
      </span>

      {active ? (
        <span
          className="
            inline-flex min-w-0 max-w-full items-center rounded-xl
            bg-pink-400
            px-2.5 py-1
            text-sm font-black leading-none text-black
            shadow-[0_0_10px_rgba(244,114,182,0.22)]
          "
        >
          <span className="truncate">{renderSpecialPriorityCompact(sp)}</span>
        </span>
      ) : (
        <span className="text-sm font-bold text-neutral-500">未設定</span>
      )}
    </div>
  );
};

const renderSpecialOrbPicker = (
  currentValue,
  onPick,
  allowAny = true
) => {
  const opts = allowAny ? [SPECIAL_ORB_ANY, ...ORB_IDS] : ORB_IDS;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((orb) => {
        const isAny = orb === SPECIAL_ORB_ANY;
        const active = Number(currentValue) === Number(orb);
        return (
          <button
            key={`special-orb-${orb}`}
            type="button"
            onClick={() => onPick(orb)}
            className={[
              "h-9 w-9 rounded-lg border transition-all inline-flex items-center justify-center",
              active
                ? "bg-pink-600 border-pink-400/30"
                : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800",
            ].join(" ")}
          >
            {isAny ? (
              <span className="text-xs font-black text-white">*</span>
            ) : (
              renderOrbIcon(orb, "h-5 w-5")
            )}
          </button>
        );
      })}
    </div>
  );
};

const currentLanguageOption =
  LANGUAGE_OPTIONS.find((item) => item.code === language) || LANGUAGE_OPTIONS[0];
const languageMenuLabel = LANGUAGE_MENU_TEXT[language] || LANGUAGE_MENU_TEXT.en;

return (
  <div className="solver-app-shell bg-neutral-950 text-white font-sans">
    {isDevSolverBench && (
      <div className="fixed inset-x-2 top-2 z-[9999] max-h-[45vh] overflow-auto rounded-xl border border-cyan-500/50 bg-black/95 p-3 text-xs shadow-2xl">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            disabled={devBenchRunning}
            onClick={runDevSolverBenchmark}
            className="rounded-lg bg-cyan-500 px-3 py-1.5 font-black text-black disabled:opacity-50"
          >
            {devBenchRunning ? "Benchmark running" : "Run solver benchmark"}
          </button>
          <span className="text-cyan-300">
            Same App.jsx solver, fixed boards and seed
          </span>
        </div>
        <pre data-testid="solver-benchmark-output" className="whitespace-pre-wrap text-[11px] text-neutral-200">
          {devBenchOutput || "idle"}
        </pre>
      </div>
    )}
    <div className="solver-app-header w-full bg-neutral-900/95 backdrop-blur border-b border-white/10">
  <div className="solver-app-header-row mx-auto max-w-[1600px] w-full px-4 py-2 flex items-center justify-between gap-1">
    <div className="flex items-center gap-3">
      <div className="relative" data-language-menu data-i18n-skip="true">
        <button
          ref={languageButtonRef}
          type="button"
          onClick={() => {
            updateLanguageMenuPosition();
            setLanguageMenuOpen((open) => !open);
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-neutral-950/40 transition hover:border-cyan-400/50 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/45"
          aria-label={languageMenuLabel}
          title={languageMenuLabel}
        >
          <img src={logoImg} className="h-7 w-7" alt="" />
          <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-neutral-950 bg-cyan-400 px-1 text-[9px] font-black leading-none text-neutral-950">
            {currentLanguageOption.shortLabel}
          </span>
        </button>

        {languageMenuOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed z-[2147483647] w-36 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 p-1 shadow-2xl shadow-black/60 backdrop-blur"
              data-language-menu
              data-i18n-skip="true"
              style={{
                left: languageMenuPosition.left,
                top: languageMenuPosition.top,
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => {
                const active = option.code === language;

                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => handleLanguageChange(option.code)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-black transition ${
                      active
                        ? "bg-cyan-400 text-neutral-950"
                        : "text-neutral-200 hover:bg-neutral-800"
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className={active ? "text-neutral-950/70" : "text-neutral-500"}>
                      {option.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body
          )}
      </div>
      <h1 className="solver-brand-title text-lg md:text-xl font-black tracking-wide">
        Tower of Saviors
        {isManual ? (
          <span className="bg-orange-600 text-white px-2 py-0.5 rounded-md mx-1 shadow-sm">
            手動
          </span>
        ) : (
          <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md mx-1 shadow-sm">
            自動
          </span>
        )}
        轉珠
      </h1>
    </div>

    <div className="solver-mode-toggle flex flex-row bg-neutral-800 p-1 rounded-xl border border-white/10">
      <button
        onClick={() => handleToggleMode(false)}
        className={`px-3 md:px-4 py-1.5 rounded-lg text-[11px] md:text-xs font-black transition-all flex items-center justify-center ${
          !isManual
            ? "bg-indigo-600 text-white"
            : "text-neutral-500 hover:bg-neutral-700"
        }`}
      >
        自動
      </button>

      <button
        onClick={() => handleToggleMode(true)}
        className={`px-3 md:px-4 py-1.5 rounded-lg text-[11px] md:text-xs font-black transition-all flex items-center justify-center ${
          isManual
            ? "bg-orange-600 text-white"
            : "text-neutral-500 hover:bg-neutral-700"
        }`}
      >
        手動
      </button>
    </div>
  </div>

  {/* 憿璇?*/}
  <div
    className={`h-1 w-full transition-colors duration-300 ${
      isManual ? "bg-orange-500" : "bg-indigo-500"
    }`}
  />
</div>

    <div
      data-testid="solver-workspace"
      className="solver-workspace mx-auto w-full"
    >
      {!isManual ? (
  <>
    <div className="solver-mode-bar grid grid-cols-4 gap-1.5 text-[14px]">
      <div className="col-span-2 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
        <button
          onClick={() => {
            setPriorityMode("combo");
            setSelectedPoolIndex(0);
          }}
          className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
            priorityMode === "combo"
              ? "bg-emerald-600 text-white"
              : "text-neutral-500 hover:bg-neutral-800"
          }`}
        >
          <Trophy size={14} /> 消除
        </button>
        <button
          onClick={() => {
            setPriorityMode("steps");
            setSelectedPoolIndex(0);
          }}
          className={`flex-1 flex items-center justify-center gap-1 px-1 py-2 rounded-lg font-black transition-all ${
            priorityMode === "steps"
              ? "bg-amber-600 text-white"
              : "text-neutral-500 hover:bg-neutral-800"
          }`}
        >
          步數 <Footprints size={14} />
        </button>
      </div>

      <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
        <button
          onClick={() => setSkyfallEnabled(!skyfallEnabled)}
          className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${
            skyfallEnabled
              ? "bg-purple-600 text-white"
              : "text-neutral-500 hover:bg-neutral-800"
          }`}
        >
          疊消 <CloudLightning size={14} />
        </button>
      </div>

      <div className="col-span-1 flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 shadow-xl overflow-hidden">
        <button
          onClick={() => setDiagonalEnabled(!diagonalEnabled)}
          className={`flex-1 flex items-center justify-center rounded-lg font-black transition-all ${
            diagonalEnabled
              ? "bg-rose-600 text-white"
              : "text-neutral-500 hover:bg-neutral-800"
          }`}
        >
          斜轉{" "}
          {diagonalEnabled ? <MoveUpRight size={14} /> : <Move size={14} />}
        </button>
      </div>
    </div>

    <div
      data-testid="solver-results-panel"
      className="solver-results-panel rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-2 shadow-xl"
    >
    <div className="solver-results-grid grid grid-cols-2 md:grid-cols-5 gap-2">
      {(activeSolutions || []).map((sol, idx) => {
        const steps = getPathSteps(sol.path);
        const initCombo = sol.initialCombos || 0;
        const skyfallCombo = sol.skyfallCombos || 0;
        const comboText =
          skyfallCombo > 0 ? `${initCombo}+${skyfallCombo}` : `${initCombo}`;
        const initCleared = sol.initialClearedCount || 0;
        const skyfallCleared = Math.max(
          0,
          (sol.clearedCount || 0) - (sol.initialClearedCount || 0)
        );
        const clearedText =
          skyfallCleared > 0 ? `${initCleared}+${skyfallCleared}` : `${initCleared}`;
        const isActive = idx === selectedPoolIndex;

const specialSlotStatus = getSolutionSpecialSlotStatus(sol, specialPriorities);
const specialSatList = specialSlotStatus.map((x) => x.done);
const specialSat = isSolutionAllSpecialSatisfied(sol, specialPriorities);

return (
  <button
    key={`${priorityMode}-${idx}-${getSolutionGroupKey(sol)}-${steps}`}
    type="button"
    onMouseEnter={(event) => showSolutionPreview(event, sol, idx)}
    onMouseMove={moveSolutionPreview}
    onMouseLeave={() => setSolutionPreview(null)}
    onFocus={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      showSolutionPreview(
        {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        },
        sol,
        idx
      );
    }}
    onBlur={() => setSolutionPreview(null)}
    onClick={() => {
      setSelectedPoolIndex(idx);
      applySolvedCandidate(sol);
    }}
    className={`solver-result-card rounded-xl border px-3 py-2 text-left transition-all ${
      isActive
        ? specialSat
          ? "border-emerald-400 bg-emerald-400/15 shadow-[0_0_18px_rgba(74,222,128,0.35)]"
          : "border-rose-400 bg-rose-400/15 shadow-[0_0_18px_rgba(239,68,68,0.35)]"
        : specialSat
        ? "border-emerald-500/50 bg-neutral-900 hover:bg-neutral-800 shadow-[0_0_14px_rgba(74,222,128,0.28)]"
        : "border-rose-500/50 bg-neutral-900 hover:bg-neutral-800 shadow-[0_0_14px_rgba(239,68,68,0.24)]"
    }`}
  >
    <div className="flex items-center justify-between">
      <span className="text-sm font-black text-white">
        #{idx + 1}
      </span>
      <span className="text-[11px] font-black text-white/65">
        消珠 {clearedText}
      </span>
    </div>

    <div className="mt-1 text-xs text-white/80">
      {priorityMode === "steps" ? (
        <>步數 {steps} / Combo {comboText}</>
      ) : (
        <>Combo {comboText} / 步數 {steps}</>
      )}
    </div>

    <div className="mt-1 flex items-center gap-1 text-[11px] font-black flex-wrap">
      <span className="text-white/70">解盾</span>

      {specialSlotStatus.map((item, i) => (
        <span
          key={i}
          className={[
            "px-1.5 py-[1px] rounded-md border",
            item.type === "none"
              ? "text-white/35 border-white/10 bg-white/5"
              : item.done
              ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
              : "text-rose-300 border-rose-400/30 bg-rose-400/10",
          ].join(" ")}
          title={`${item.label}${item.type !== "none" ? ` / guide: ${item.guide}` : ""}`}
        >
          {item.type === "none" ? "-" : item.done ? "✓" : "✕"}
        </span>
      ))}
    </div>
  </button>
);
      })}

      {(!activeSolutions || activeSolutions.length === 0) &&
        Array.from({ length: 10 }).map((_, idx) => (
          <div
            key={`empty-${priorityMode}-${idx}`}
            className="solver-result-card rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-left opacity-70"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-white">
                #{idx + 1}
              </span>
              <span className="text-[11px] text-white/35">尚無結果</span>
            </div>

            <div className="mt-1 text-xs text-white/35">
              {priorityMode === "steps"
                ? "步數 -- / Combo --"
                : "Combo -- / 步數 --"}
            </div>

            <div className="mt-1 text-[11px] text-white/25">
              解盾 --
            </div>
          </div>
        ))}
    </div>
</div>
  </>
) : (
  <div />
)}
	  
      <div className="solver-panels-contents">
        <div
          data-testid="solver-stats-panel"
          className={`solver-stats-panel flex flex-row gap-2 w-full items-stretch ${isManual ? "mt-3" : ""}`}
        >
			<div className="flex-[0.7] min-w-0 bg-neutral-900/50 p-1.5 sm:p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
			  <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
				理論
			  </span>
			  <span className="text-xl font-black text-white/40 w-full text-center leading-none">
				{stats.theoreticalMax}
			  </span>
			</div>

  <div className="flex-[1.2] min-w-0 bg-blue-900/20 p-1.5 sm:p-2.5 rounded-xl border border-blue-500/30 ring-1 ring-blue-500/20 flex flex-col items-center justify-center space-y-1">
    <span className="text-xs text-blue-400 font-bold uppercase truncate w-full text-center leading-none">
      總組
    </span>
    <span className="text-xl font-black text-blue-400 w-full text-center leading-none">
      {stats.combos}
      {stats.skyfallCombos > 0 ? `+${stats.skyfallCombos}` : ""}
    </span>
  </div>

  {/* ????璅∪??梯? ??/L摮?T摮?*/}
  {!isManual &&
  specialPriorities.some(
    (sp) =>
      sp.type === "cross" ||
      sp.type === "l" ||
      sp.type === "t"
  ) && (
    <div className="flex-[1.8] min-w-0 bg-pink-900/20 p-1.5 sm:p-2.5 rounded-xl border border-pink-500/30 ring-1 ring-pink-500/20 flex flex-col items-center justify-center space-y-1">
      
      {/* 銝??箏?憿舐內銝車 */}
      <span className="text-xs text-pink-300 font-bold truncate w-full text-center leading-none">
        十 / T / L
      </span>

      {/* 銝?銝??*/}
      <span className="text-xl font-black text-pink-400 w-full text-center leading-none">
        {(stats.crossCount || 0)} / {(stats.tCount || 0)} / {(stats.lCount || 0)}
      </span>
    </div>
  )}
  <div className="flex-[1.2] min-w-0 bg-neutral-900/50 p-1.5 sm:p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
    <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
      總粒
    </span>
    <span className="text-xl font-black text-purple-400 w-full text-center leading-none">
      {stats.initialClearedOrbs || 0}
      {(stats.skyfallClearedOrbs || 0) > 0 ? `+${stats.skyfallClearedOrbs}` : ""}
    </span>
  </div>

  <div className="flex-[0.7] min-w-0 bg-neutral-900/50 p-1.5 sm:p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center justify-center space-y-1">
    <span className="text-xs text-neutral-500 font-bold uppercase truncate w-full text-center leading-none">
      步數
    </span>
    <span className="text-xl font-black text-emerald-400 w-full text-center leading-none">
      {stats.steps}
    </span>
  </div>
</div>

        <div
          data-testid="solver-settings-panel"
          className={`solver-settings-panel solver-settings-panel--${
            isManual ? "manual" : settingsTab
          } rounded-2xl border overflow-hidden shadow-xl`}
        >
          {!isManual && (
            <div
              className="solver-settings-tabs grid grid-cols-3"
              role="tablist"
              aria-label="求解設定分類"
            >
              {[
                { id: "search", label: "基本設定" },
                { id: "rules", label: "優先消除設定" },
                { id: "shield", label: "解盾設定" },
              ].map((tab) => {
                const active = settingsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSettingsTab(tab.id)}
                    className={`solver-settings-tab solver-settings-tab--${tab.id} ${
                      active ? "is-active" : ""
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

  <div
    className={`solver-settings-content solver-settings-content--${
      isManual ? "manual" : settingsTab
    } p-4 grid grid-cols-1 gap-3 ${
      isManual
        ? "md:grid-cols-2"
        : settingsTab === "search"
          ? "md:grid-cols-2"
          : "md:grid-cols-3"
    }`}
  >
    {!isManual && settingsTab === "search" && (
      <>
        <ParamSlider
  label="目標首消 Combo"
  value={initTargetCombo}
  min={0}
  max={stats.theoreticalMax || 1}
  step={1}
  inputMode="numeric"
  formatInput={(v) => String(v)}
  onChange={(n) => setInitTargetCombo(parseInt(n, 10))}
 />
      </>
    )}

    {!isManual && settingsTab === "search" && (
      <ParamSlider
        label="步數限制"
        labelContent={
          <span className="solver-hard-step-label inline-flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={config.hardStepLimitEnabled}
              aria-label="切換步數限制"
              onClick={() => {
                setConfig((prev) => ({
                  ...prev,
                  hardStepLimitEnabled: !prev.hardStepLimitEnabled,
                }));
                clearSolutionPools();
                setNeedsSolve(true);
              }}
              className={`solver-hard-step-switch ${
                config.hardStepLimitEnabled ? "is-enabled" : ""
              }`}
            >
              <span />
            </button>
            <span>步數限制</span>
          </span>
        }
        value={config.hardStepLimit}
        min={1}
        max={250}
        step={1}
        inputMode="numeric"
        formatInput={(v) => String(v)}
        disabled={!config.hardStepLimitEnabled}
        disabledText="未啟用"
        containerClassName="solver-hard-step-control"
        onChange={(n) => {
          setConfig((prev) => ({
            ...prev,
            hardStepLimit: Math.max(1, Math.min(250, Math.round(n))),
          }));
          clearSolutionPools();
          setNeedsSolve(true);
        }}
      />
    )}

    {isManual && (
      <ParamSlider
        label="手轉倒數時間（秒）"
        value={maxTime}
        min={1}
        max={30}
        step={0.5}
        inputMode="decimal"
        formatInput={(v) => `${v}s`}
        onChange={(n) => {
          const newTime = Number(n);
          setMaxTime(newTime);
          setTimeLeft(newTime);
        }}
      />
    )}

    {(isManual || settingsTab === "search") && (
    <div>
      <ParamSlider
        label="回放速度"
        value={config.replaySpeed / 1000}
        min={0.08}
        max={0.45}
        step={0.01}
        inputMode="decimal"
        formatInput={(v) => Number(v).toFixed(2)}
        onChange={(n) => updateParam("replaySpeed", n * 1000)}
      />
    </div>
    )}
	{!isManual && settingsTab === "search" && (
  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3 flex flex-col justify-between">
    
    {/* 璅? */}
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold text-neutral-300">
        效能等級
      </span>

      <span className="text-xs font-black text-yellow-300">
        {`Lv${performanceLevel} ${translateText(
          PERFORMANCE_PRESETS[performanceLevel - 1]?.label || "",
          language
        )}`}
      </span>
    </div>

    {/* ?? */}
    <div className="flex gap-2 justify-between">
      {[1, 2, 3, 4, 5].map((lv) => {
        const active = lv === performanceLevel;

        return (
          <button
            key={lv}
            onClick={() => applyPerformanceLevel(lv)}
            className={`
              flex-1 py-1.5 rounded-lg text-xs font-black transition-all border
              ${
                active
                  ? "bg-yellow-400 text-black border-yellow-300 shadow-md scale-105"
                  : "bg-neutral-800 text-white border-white/10 hover:bg-neutral-700"
              }
            `}
          >
            Lv{lv}
          </button>
        );
      })}
    </div>
  </div>
)}

    {!isManual && settingsTab === "rules" && (
  <div className="solver-rule-panel md:col-span-3 rounded-2xl border border-neutral-800 bg-neutral-950/50">
      <div className="solver-rule-content">
        <div className="solver-orb-rules-grid grid grid-cols-1 md:grid-cols-3">
          {ORB_IDS.map((orb) => {
            const rule = ruleProfileView.orbRules[orb] || normalizeOrbRule(null);
            const stock = Number(ruleValidation.stockByOrb?.[orb] || 0);
            const used = Number(ruleValidation.usedByOrb?.[orb] || 0);
            const remain = Number(ruleValidation.remainingByOrb?.[orb] || 0);

            return (
              <div
                key={`orb-rule-${orb}`}
                className="solver-orb-rule-card rounded-xl border border-neutral-800 bg-neutral-900/50"
              >
                <div className="solver-orb-rule-stock flex items-center justify-between text-xs">
                  <span
                    className="solver-orb-rule-icon inline-flex items-center justify-center"
                    title={`${ORB_LABELS[orb]} 符石消除設定`}
                    aria-hidden="true"
                  >
                    {renderOrbIcon(orb, "h-4 w-4")}
                  </span>
                  <span className={remain < 0 ? "font-black text-red-400" : "font-bold text-neutral-400"}>
                    {translateText(`版 ${stock} / 用 ${used} / 剩 ${remain}`, language)}
                  </span>
                </div>
                <div className="solver-orb-rule-controls flex items-center gap-2">
                  <select
                    aria-label={`${ORB_LABELS[orb]} 符石最低消除數`}
                    value={rule.minClear}
                    onChange={(e) =>
                      updateRuleOrbSetting(orb, {
                        minClear: Number(e.target.value),
                      })
                    }
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm font-black text-cyan-200"
                  >
                    {RULE_SIZE_OPTIONS.map((item) => (
  <option key={`min-clear-${orb}-${item.id}`} value={item.id}>
    {item.text}消
  </option>
))}
                  </select>

                  <select
                    aria-label={`${ORB_LABELS[orb]} 符石消除規則`}
                    value={rule.clearMode}
                    onChange={(e) =>
                      updateRuleOrbSetting(orb, {
                        clearMode: e.target.value,
                      })
                    }
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm font-black text-cyan-200"
                  >
                    {RULE_CLEAR_MODES.map((opt) => (
                      <option key={`mode-${orb}-${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="solver-rule-requirements rounded-xl border border-neutral-800 bg-neutral-900/50">
          <div className="solver-rule-requirements-title text-sm font-black text-cyan-300">
            需求組合（可複數）
          </div>

          {ruleProfileView.requirements.length === 0 ? (
            <div className="solver-rule-empty text-xs font-bold text-neutral-500">尚未設定需求。</div>
          ) : (
            <div className="solver-rule-requirement-grid grid grid-cols-2 md:grid-cols-4">
  {ruleProfileView.requirements.map((req, idx) => {
    const maxCount = Math.max(
      1,
      getRequirementMaxCountAtIndex(ruleProfileView, ruleValidation.stockByOrb, idx)
    );

    return (
      <div
        key={`req-${idx}`}
        className="solver-rule-requirement-item relative flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 min-w-0"
      >
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm font-black text-cyan-200">
          {renderOrbIcon(req.orb, "h-4 w-4")}
          <span>消 {req.size}</span>
        </span>

        {/* --- 縮減寬度後的 Select --- */}
        <select
          value={req.count}
          onChange={(e) =>
            updateRuleRequirementAt(idx, { count: Number(e.target.value) })
          }
          // w-fit: 根據內容縮放
          // min-w-[3.5rem]: 確保至少有一個適當的點擊寬度，不會縮得太死
          // pr-6: 預留右側箭頭空間
          className="w-fit min-w-[2.5rem] cursor-pointer rounded-lg border border-neutral-700 bg-neutral-900 py-1 pl-2 pr-6 text-right text-sm font-black text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2322d3ee%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1rem_1rem] bg-[right_0.25rem_center] bg-no-repeat"
        >
          {Array.from({ length: maxCount }, (_, i) => i + 1).map((num) => (
            <option key={num} value={num} className="bg-neutral-900 text-cyan-200">
              {num}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => removeRuleRequirement(idx)}
          title="刪除需求"
          aria-label="刪除需求"
          className="solver-rule-remove flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-xs font-black text-red-300 hover:bg-red-500/20"
        >
          ✕
        </button>
      </div>
    );
  })}
</div>
          )}
<hr className="solver-rule-divider border-cyan-400/20" />
          <div className="solver-rule-add">
            <div className="solver-rule-add-grid grid">
              {ruleAddOptions.length === 0 ? (
                <span className="text-xs font-bold text-neutral-500">❌無可新增選項。</span>
              ) : (
                ruleAddOptions.map((opt) => (
                  <button
                    key={`add-opt-${opt.key}`}
                    type="button"
                    onClick={() => addRuleRequirement(opt.orb, opt.size)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-xs font-black text-cyan-200 hover:bg-cyan-500/20"
                  >
                    {renderOrbIcon(opt.orb, "h-4 w-4")}
                    <span>消 {opt.size}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  </div>
)}

    {!isManual && settingsTab === "shield" && (
  <div className="solver-shield-requirements md:col-span-3">
        <div className="space-y-2">
          {/* 解盾 #1 */}
          <div className="solver-shield-card rounded-2xl border border-neutral-800 bg-neutral-950/50 p-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-pink-400 flex items-center gap-2">
                  {specialPriorityExpanded[0] ? (
                    "#1"
                  ) : (
                    <>{renderPriorityHeaderLabel("#1", specialPriority1)}</>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateSpecialPriorityAt(0, { type: "none" })}
                  className="rounded-xl px-3 py-1.5 text-xs font-black transition-all bg-neutral-800 text-white hover:bg-neutral-700"
                >
                  清除
                </button>

                <button
                  type="button"
                  onClick={() => toggleSpecialPriorityExpanded(0)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                    specialPriorityExpanded[0]
                      ? "bg-pink-400 text-black hover:bg-pink-300"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {specialPriorityExpanded[0] ? "收起" : "展開"}
                </button>
              </div>
            </div>

            {specialPriorityExpanded[0] && (
              <div className="solver-shield-card-body mt-4">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {[
                    { key: "none", label: "無" },
                    { key: "clearCount", label: "首消n粒盾" },
                    { key: "equalFirst", label: "連擊相等盾" },
                    { key: "rect", label: "靈罩" },
                    { key: "cross", label: "十字盾" },
                    { key: "l", label: "L 字盾" },
                    { key: "t", label: "T 字盾" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => updateSpecialPriorityAt(0, { type: item.key })}
                      className={[
                        "px-3 py-2 rounded-xl border text-sm font-black transition-all",
                        specialPriority1.type === item.key
                          ? "bg-pink-600 text-white border-pink-400/30"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {specialPriority1.type === "clearCount" && (
                  <div className="solver-shield-clear-count flex flex-col">
                    <div className="solver-shield-inline-control flex items-center">
                      <span className="text-sm font-bold text-neutral-400">總粒數</span>

                      <input
                        type="number"
                        min={3}
                        max={30}
                        value={specialPriority1.clearCount}
                        onChange={(e) =>
                          updateSpecialPriorityAt(0, {
                            clearCount: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          updateSpecialPriorityAt(0, {
                            clearCount: Math.max(
                              3,
                              Math.min(30, Number(e.target.value) || 3)
                            ),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-20 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-pink-300 font-black text-right appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />

                      <input
                        type="range"
                        min={3}
                        max={30}
                        step={1}
                        value={Math.max(
                          3,
                          Math.min(30, Number(specialPriority1.clearCount) || 3)
                        )}
                        onChange={(e) =>
                          updateSpecialPriorityAt(0, {
                            clearCount: Number(e.target.value),
                          })
                        }
                        className="min-w-0 flex-1 accent-pink-500 cursor-pointer"
                      />
                      <span className="solver-shield-description text-neutral-500">
                        首消 {Math.max(3, Math.min(30, Number(specialPriority1.clearCount) || 3))} 顆符石。
                      </span>
                    </div>
                  </div>
                )}

                {specialPriority1.type === "equalFirst" && (
                  <div className="solver-shield-equal flex items-center">
                    <div className="solver-shield-orb-options flex flex-wrap">
                      {EQUAL_FIRST_OPTIONS.map((opt) => {
                        const active = normalizeSelectedEqualOrbs(
                          specialPriority1.equalOrbs
                        ).includes(opt.value);

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleEqualOrbAt(0, opt.value)}
                            className={[
                              "px-2 py-2 rounded-xl border text-sm font-black transition-all",
                              active
                                ? "bg-pink-600 text-white border-pink-400/30"
                                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                            ].join(" ")}
                          >
                            {renderOrbIcon(opt.value, "h-5 w-5")}
                          </button>
                        );
                      })}
                    </div>

                    <span className="solver-shield-description text-neutral-500">
                      所選種類的首消組數需相同且至少1組。
                    </span>
                  </div>
                )}

                {specialPriority1.type === "rect" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">m</span>
                    <select
                      value={specialPriority1.rectM}
                      onChange={(e) =>
                        updateSpecialPriorityAt(0, { rectM: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_M_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400">n</span>
                    <select
                      value={specialPriority1.rectN}
                      onChange={(e) =>
                        updateSpecialPriorityAt(0, { rectN: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_N_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority1.rectOrb,
                      (orb) => updateSpecialPriorityAt(0, { rectOrb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-xs text-neutral-500">
                      首消至少形成 1 組 m*n 的完整矩形。
                    </span>
                  </div>
                )}

                {(specialPriority1.type === "cross" ||
                  specialPriority1.type === "l" ||
                  specialPriority1.type === "t") && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">數量</span>

                    <select
                      value={specialPriority1.count}
                      onChange={(e) =>
                        updateSpecialPriorityAt(0, { count: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority1.orb,
                      (orb) => updateSpecialPriorityAt(0, { orb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-neutral-500">
                      首消至少形成 {specialPriority1.count} 組
                      {getSpecialShapeLabel(specialPriority1.type)}形狀。
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 解盾 #2 */}
          <div className="solver-shield-card rounded-2xl border border-neutral-800 bg-neutral-950/50 p-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-pink-400 flex items-center gap-2">
                  {specialPriorityExpanded[1] ? (
                    "#2"
                  ) : (
                    <>{renderPriorityHeaderLabel("#2", specialPriority2)}</>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateSpecialPriorityAt(1, { type: "none" })}
                  className="rounded-xl px-3 py-1.5 text-xs font-black transition-all bg-neutral-800 text-white hover:bg-neutral-700"
                >
                  清除
                </button>

                <button
                  type="button"
                  onClick={() => toggleSpecialPriorityExpanded(1)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                    specialPriorityExpanded[1]
                      ? "bg-pink-400 text-black hover:bg-pink-300"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {specialPriorityExpanded[1] ? "收起" : "展開"}
                </button>
              </div>
            </div>

            {specialPriorityExpanded[1] && (
              <div className="solver-shield-card-body mt-4">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {[
                    { key: "none", label: "無" },
                    { key: "clearCount", label: "首消n粒盾" },
                    { key: "equalFirst", label: "連擊相等盾" },
                    { key: "rect", label: "靈罩" },
                    { key: "cross", label: "十字盾" },
                    { key: "l", label: "L 字盾" },
                    { key: "t", label: "T 字盾" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => updateSpecialPriorityAt(1, { type: item.key })}
                      className={[
                        "px-3 py-2 rounded-xl border text-sm font-black transition-all",
                        specialPriority2.type === item.key
                          ? "bg-pink-600 text-white border-pink-400/30"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {specialPriority2.type === "clearCount" && (
                  <div className="solver-shield-clear-count flex flex-col">
                    <div className="solver-shield-inline-control flex items-center">
                      <span className="text-sm font-bold text-neutral-400">總粒數</span>

                      <input
                        type="number"
                        min={3}
                        max={30}
                        value={specialPriority2.clearCount}
                        onChange={(e) =>
                          updateSpecialPriorityAt(1, {
                            clearCount: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          updateSpecialPriorityAt(1, {
                            clearCount: Math.max(
                              3,
                              Math.min(30, Number(e.target.value) || 3)
                            ),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-20 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-pink-300 font-black text-right appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />

                      <input
                        type="range"
                        min={3}
                        max={30}
                        step={1}
                        value={Math.max(
                          3,
                          Math.min(30, Number(specialPriority2.clearCount) || 3)
                        )}
                        onChange={(e) =>
                          updateSpecialPriorityAt(1, {
                            clearCount: Number(e.target.value),
                          })
                        }
                        className="min-w-0 flex-1 accent-pink-500 cursor-pointer"
                      />
                      <span className="solver-shield-description text-neutral-500">
                        首消 {Math.max(3, Math.min(30, Number(specialPriority2.clearCount) || 3))} 顆符石。
                      </span>
                    </div>
                  </div>
                )}

                {specialPriority2.type === "equalFirst" && (
                  <div className="solver-shield-equal flex items-center">
                    <div className="solver-shield-orb-options flex flex-wrap">
                      {EQUAL_FIRST_OPTIONS.map((opt) => {
                        const active = normalizeSelectedEqualOrbs(
                          specialPriority2.equalOrbs
                        ).includes(opt.value);

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleEqualOrbAt(1, opt.value)}
                            className={[
                              "px-2 py-2 rounded-xl border text-sm font-black transition-all",
                              active
                                ? "bg-pink-600 text-white border-pink-400/30"
                                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                            ].join(" ")}
                          >
                            {renderOrbIcon(opt.value, "h-5 w-5")}
                          </button>
                        );
                      })}
                    </div>

                    <span className="solver-shield-description text-neutral-500">
                      所選種類的首消組數需相同且至少1組。
                    </span>
                  </div>
                )}

                {specialPriority2.type === "rect" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">m</span>
                    <select
                      value={specialPriority2.rectM}
                      onChange={(e) =>
                        updateSpecialPriorityAt(1, { rectM: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_M_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400">n</span>
                    <select
                      value={specialPriority2.rectN}
                      onChange={(e) =>
                        updateSpecialPriorityAt(1, { rectN: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_N_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority2.rectOrb,
                      (orb) => updateSpecialPriorityAt(1, { rectOrb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-xs text-neutral-500">
                      首消至少形成 1 組 m*n 的完整矩形。
                    </span>
                  </div>
                )}

                {(specialPriority2.type === "cross" ||
                  specialPriority2.type === "l" ||
                  specialPriority2.type === "t") && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">數量</span>

                    <select
                      value={specialPriority2.count}
                      onChange={(e) =>
                        updateSpecialPriorityAt(1, { count: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority2.orb,
                      (orb) => updateSpecialPriorityAt(1, { orb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-neutral-500">
                      首消至少形成 {specialPriority2.count} 組
                      {getSpecialShapeLabel(specialPriority2.type)}形狀。
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 解盾 #3 */}
          <div className="solver-shield-card rounded-2xl border border-neutral-800 bg-neutral-950/50 p-2">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-pink-400 flex items-center gap-2">
                  {specialPriorityExpanded[2] ? (
                    "#3"
                  ) : (
                    <>{renderPriorityHeaderLabel("#3", specialPriority3)}</>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateSpecialPriorityAt(2, { type: "none" })}
                  className="rounded-xl px-3 py-1.5 text-xs font-black transition-all bg-neutral-800 text-white hover:bg-neutral-700"
                >
                  清除
                </button>

                <button
                  type="button"
                  onClick={() => toggleSpecialPriorityExpanded(2)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                    specialPriorityExpanded[2]
                      ? "bg-pink-400 text-black hover:bg-pink-300"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {specialPriorityExpanded[2] ? "收起" : "展開"}
                </button>
              </div>
            </div>

            {specialPriorityExpanded[2] && (
              <div className="solver-shield-card-body mt-4">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {[
                    { key: "none", label: "無" },
                    { key: "clearCount", label: "首消n粒盾" },
                    { key: "equalFirst", label: "連擊相等盾" },
                    { key: "rect", label: "靈罩" },
                    { key: "cross", label: "十字盾" },
                    { key: "l", label: "L 字盾" },
                    { key: "t", label: "T 字盾" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => updateSpecialPriorityAt(2, { type: item.key })}
                      className={[
                        "px-3 py-2 rounded-xl border text-sm font-black transition-all",
                        specialPriority3.type === item.key
                          ? "bg-pink-600 text-white border-pink-400/30"
                          : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                      ].join(" ")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {specialPriority3.type === "clearCount" && (
                  <div className="solver-shield-clear-count flex flex-col">
                    <div className="solver-shield-inline-control flex items-center">
                      <span className="text-sm font-bold text-neutral-400">總粒數</span>

                      <input
                        type="number"
                        min={3}
                        max={30}
                        value={specialPriority3.clearCount}
                        onChange={(e) =>
                          updateSpecialPriorityAt(2, {
                            clearCount: e.target.value,
                          })
                        }
                        onBlur={(e) =>
                          updateSpecialPriorityAt(2, {
                            clearCount: Math.max(
                              3,
                              Math.min(30, Number(e.target.value) || 3)
                            ),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="w-20 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-pink-300 font-black text-right appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />

                      <input
                        type="range"
                        min={3}
                        max={30}
                        step={1}
                        value={Math.max(
                          3,
                          Math.min(30, Number(specialPriority3.clearCount) || 3)
                        )}
                        onChange={(e) =>
                          updateSpecialPriorityAt(2, {
                            clearCount: Number(e.target.value),
                          })
                        }
                        className="min-w-0 flex-1 accent-pink-500 cursor-pointer"
                      />
                      <span className="solver-shield-description text-neutral-500">
                        首消 {Math.max(3, Math.min(30, Number(specialPriority3.clearCount) || 3))} 顆符石。
                      </span>
                    </div>
                  </div>
                )}

                {specialPriority3.type === "equalFirst" && (
                  <div className="solver-shield-equal flex items-center">
                    <div className="solver-shield-orb-options flex flex-wrap">
                      {EQUAL_FIRST_OPTIONS.map((opt) => {
                        const active = normalizeSelectedEqualOrbs(
                          specialPriority3.equalOrbs
                        ).includes(opt.value);

                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleEqualOrbAt(2, opt.value)}
                            className={[
                              "px-2 py-2 rounded-xl border text-sm font-black transition-all",
                              active
                                ? "bg-pink-600 text-white border-pink-400/30"
                                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800",
                            ].join(" ")}
                          >
                            {renderOrbIcon(opt.value, "h-5 w-5")}
                          </button>
                        );
                      })}
                    </div>

                    <span className="solver-shield-description text-neutral-500">
                      所選種類的首消組數需相同且至少1組。
                    </span>
                  </div>
                )}

                {specialPriority3.type === "rect" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">m</span>
                    <select
                      value={specialPriority3.rectM}
                      onChange={(e) =>
                        updateSpecialPriorityAt(2, { rectM: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_M_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400">n</span>
                    <select
                      value={specialPriority3.rectN}
                      onChange={(e) =>
                        updateSpecialPriorityAt(2, { rectN: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      {RECT_N_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority3.rectOrb,
                      (orb) => updateSpecialPriorityAt(2, { rectOrb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-xs text-neutral-500">
                      首消至少形成 1 組 m*n 的完整矩形。
                    </span>
                  </div>
                )}

                {(specialPriority3.type === "cross" ||
                  specialPriority3.type === "l" ||
                  specialPriority3.type === "t") && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-neutral-400">數量</span>

                    <select
                      value={specialPriority3.count}
                      onChange={(e) =>
                        updateSpecialPriorityAt(2, { count: Number(e.target.value) })
                      }
                      className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-pink-300 font-black"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>

                    <span className="text-sm font-bold text-neutral-400"></span>
                    {renderSpecialOrbPicker(
                      specialPriority3.orb,
                      (orb) => updateSpecialPriorityAt(2, { orb: Number(orb) }),
                      true
                    )}

                    <span className="solver-shield-description text-neutral-500">
                      首消至少形成 {specialPriority3.count} 組
                      {getSpecialShapeLabel(specialPriority3.type)}形狀。
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
  </div>
)}
</div>
		</div>

        {isManual && (
          <div className="solver-timer-panel mx-auto w-full max-w-[500px] px-2">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[10px] font-black text-orange-400 italic tracking-widest">
                TIME REMAINING
              </span>
              <span className="text-xl font-black text-white">
                {timeLeft.toFixed(2)}s
              </span>
            </div>

            <div className="w-full h-2.5 bg-neutral-950 rounded-full border border-white/5 overflow-hidden shadow-inner">
              <div
                className={`h-full ${
                  timeLeft < 3
                    ? "bg-red-500 animate-pulse"
                    : "bg-gradient-to-r from-orange-600 to-amber-400"
                }`}
                style={{
                  width: `${Math.max(0, (timeLeft / maxTime) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div
          ref={boardWrapRef}
          data-testid="solver-board-panel"
          className="solver-board-panel relative bg-neutral-700 rounded-3xl shadow-2xl border-2 border-neutral-600 mx-auto w-full max-w-none sm:max-w-[500px] overflow-visible"
          style={{
  contain: "layout paint",
  touchAction: isManual ? "none" : "auto",
  userSelect: isManual ? "none" : "auto",
}}
          onMouseMove={(e) => {
            if (!isManual || manualLocked || !isDraggingRef.current) return;
            const cell = getCellFromClientPoint(e.clientX, e.clientY);
            if (cell) {
              handleManualMove(cell.r, cell.c, e);
            }
          }}
          onTouchMove={(e) => {
            if (!isManual || manualLocked || !isDraggingRef.current) return;
            e.preventDefault();

            const touch = e.touches[0];
            if (!touch) return;

            const cell = getCellFromClientPoint(touch.clientX, touch.clientY);
            if (cell) {
              handleManualMove(cell.r, cell.c, e);
            }
          }}
          onMouseLeave={() => {
            if (isManual && isDraggingRef.current) {
              lastPosRef.current = { r: -1, c: -1 };
              handleManualEnd();
            }
          }}
          onTouchCancel={() => {
            if (isManual && isDraggingRef.current) {
              lastPosRef.current = { r: -1, c: -1 };
              handleManualEnd();
            }
          }}
        >
          <div ref={boardInnerRef} className="relative overflow-visible">
  <div className={isManual ? "pt-3" : ""}>
  {!isManual && (
    <div className="solver-character-orb-bar mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-xl bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-300/20">
          <Sparkles size={14} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-yellow-300">
            角色符石
          </span>

          <span className="text-xs text-white/50">
            {autoRow0Expanded ? "展開中" : "已收合"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleAutoRow0Expanded}
      className={`solver-character-orb-toggle rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
          autoRow0Expanded
            ? "bg-yellow-400 text-black hover:bg-yellow-300"
            : "bg-neutral-800 text-white hover:bg-neutral-700"
        }`}
      >
        {autoRow0Expanded ? "收起" : "展開"}
      </button>
    </div>
  )}
</div>

  <div className="grid grid-cols-6 gap-0">
  {displayBoard.map((row, r) => {
    if (!isManual && !autoRow0Expanded && r === 0) {
      return null;
    }

    return (
      <React.Fragment key={r}>
        {!solving && autoRow0Expanded && r === 1 && (
          <div className="overflow-visible col-span-6 h-2 bg-white z-50 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
        )}

        {row.map((orb, c) => {
          const isMoving =
            !solving &&
            isReplaying &&
            currentStep >= 0 &&
            path[currentStep]?.r === r &&
            path[currentStep]?.c === c;

          const isManualHidden =
            manualHiddenCell &&
            manualHiddenCell.r === r &&
            manualHiddenCell.c === c;

const cellBgClass = (r + c) % 2 === 0 ? "bg-neutral-700" : "bg-neutral-900";

          const row0Type =
  r === 0
    ? Object.keys(ORB_TYPES).find(
        (k) => ORB_TYPES[k].id === orbOf(orb)
      )
    : null;

const row0BoxImg =
  r === 0 ? ROW0_BOX_IMG_MAP[row0Type] || null : null;

const visualOrbId = getVisualOrbId(r, c, orb);
const visualImg = Object.values(ORB_TYPES).find(
  (t) => t.id === visualOrbId
)?.img;
          return (
            <div
              key={`${r}-${c}`}
              data-cell={`${r}-${c}`}
              onMouseDown={(e) => {
                if (isManual && !manualLocked) {
                  handleManualStart(r, c, e);
                }
              }}
              onTouchStart={(e) => {
                if (isManual && !manualLocked) {
                  handleManualStart(r, c, e);
                }
              }}
              onMouseUp={() => {
                if (isManual) {
                  lastPosRef.current = { r: -1, c: -1 };
                  handleManualEnd();
                }
              }}
              onTouchEnd={() => {
                if (isManual) {
                  lastPosRef.current = { r: -1, c: -1 };
                  handleManualEnd();
                }
              }}
              className={`relative w-full aspect-square flex items-center justify-center transition-all duration-75 ${cellBgClass} ${
  isMoving ? "opacity-20 z-40" : "opacity-100"
}`}
            >
				{orb === -1 || visualOrbId === -1 ? (
  <div className="w-full h-full bg-black/20 border border-white/10" />
) : (
  <>
    {r === 0 && row0BoxImg && (
      <img
        src={row0BoxImg}
        className="absolute inset-0 z-[3] w-full h-full object-contain pointer-events-none select-none scale-[1.02]"
        draggable={false}
        alt=""
      />
    )}

    <img
      src={visualImg}
      className={`relative z-[1] w-[100%] h-[100%] object-contain pointer-events-none select-none transition-all duration-75
        ${isManualHidden ? "brightness-[0.35] saturate-[0.6]" : ""}
      `}
      draggable={false}
      alt=""
    />

    {xMarkOf(orb) === 1 && !isManual && (
      <img
        src={x1Img}
        className="absolute z-[3] inset-0 w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        alt=""
      />
    )}

    {xMarkOf(orb) === 2 && (
      <img
        src={x2Img}
        className="absolute z-[3] inset-0 w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        alt=""
      />
    )}

    {qMarkOf(orb) === 1 &&
      !isManual &&
      !(r === 0 && replayDone) && (
        <div className="absolute z-[4] top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
          Start
        </div>
      )}

    {qMarkOf(orb) === 2 && !isManual && (
      <div className="absolute z-[4] top-1 left-1 px-2 py-0.5 rounded-lg bg-fuchsia-500/90 text-black text-xs font-black border border-black/30">
        End
      </div>
    )}

    {nMarkOf(orb) === 1 && (
      <img
        src={n1Img}
        className="absolute inset-0 z-[2] w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        alt=""
      />
    )}

    {nMarkOf(orb) === 2 && (
      <img
        src={n2Img}
        className="absolute inset-0 z-[2] w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        alt=""
      />
    )}
  </>
)}
			</div>
          );
        })}
      </React.Fragment>
    );
  })}
</div>

  <svg
    ref={overlayRef}
    className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-[60]"
    style={{ overflow: "visible" }}
  >
    <defs>
      <filter
        id="glowGreen"
    x="-50%"
        y="-50%"
        width="200%"
        height="200%"
      >
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter
        id="glowRed"
        x="-50%"
        y="-50%"
        width="200%"
        height="200%"
      >
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {(() => {
      const isManualDragging = isManual && isDragging;

      if (isManualDragging) return null;
      if (!path || path.length < 2) return null;

      const routeGeometry = buildShiftedRouteGeometry(
        path,
        Math.max(6, stableCellSize / 10)
      );
      const cursorActive = (isReplaying || isPaused) && floating?.visible;
      let activeEdgeProgress = 0;

      if (
        cursorActive &&
        currentStep >= 0 &&
        currentStep < path.length - 1
      ) {
        const rawFrom = getCellCenterPx(path[currentStep].r, path[currentStep].c);
        const rawTo = getCellCenterPx(
          path[currentStep + 1].r,
          path[currentStep + 1].c
        );
        const dx = rawTo.x - rawFrom.x;
        const dy = rawTo.y - rawFrom.y;
        const lengthSq = dx * dx + dy * dy;
        activeEdgeProgress =
          lengthSq > 0
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((floating.x - rawFrom.x) * dx +
                    (floating.y - rawFrom.y) * dy) /
                    lengthSq
                )
              )
            : 1;
      }

      const visibleSegments = [];
      const visibleRoutePoints = [];
      for (const line of routeGeometry.lines) {
        if (currentStep < line.start) break;

        let lineProgress;
        if (currentStep >= line.end) {
          lineProgress = 1;
        } else {
          const completedEdges = Math.max(0, currentStep - line.start);
          const totalEdges = Math.max(1, line.end - line.start);
          lineProgress =
            (completedEdges + activeEdgeProgress) / totalEdges;
        }

        if (lineProgress <= 0 && line.segmentIndex > 0) continue;

        const endPoint = {
          x:
            line.displayStart.x +
            (line.displayEnd.x - line.displayStart.x) * lineProgress,
          y:
            line.displayStart.y +
            (line.displayEnd.y - line.displayStart.y) * lineProgress,
        };
        const points = line.entryPoints
          ? [...line.entryPoints, endPoint]
          : [line.displayStart, endPoint];
        for (const point of points) {
          const previousPoint =
            visibleRoutePoints[visibleRoutePoints.length - 1];
          if (
            previousPoint &&
            Math.hypot(
              point.x - previousPoint.x,
              point.y - previousPoint.y
            ) < 0.01
          ) {
            continue;
          }
          visibleRoutePoints.push(point);
        }
        visibleSegments.push({
          ...line,
          tip: endPoint,
        });

        if (lineProgress < 1) break;
      }

      if (!visibleSegments.length) return null;

      const start = routeGeometry.start;
      const tip = visibleSegments[visibleSegments.length - 1].tip;
      const routePathD = buildStraightPath(visibleRoutePoints);

      return (
        <>
          {start && (
            <circle
              data-testid="replay-start-marker"
              cx={start.x}
              cy={start.y}
              r="14"
              fill="#22c55e"
              stroke="black"
              strokeWidth="2"
              filter="url(#glowGreen)"
            />
          )}

          <path
            data-testid="replay-route-line"
            d={routePathD}
            stroke="white"
            strokeWidth="4"
            fill="none"
            strokeLinecap="butt"
            strokeLinejoin="miter"
            style={{
              filter: "drop-shadow(3px 3px 4px rgba(0,0,0,0.95))",
            }}
            opacity={0.96}
          />

          {currentStep >= 0 && tip && (
            <circle
              data-testid="replay-cursor-marker"
              cx={tip.x}
              cy={tip.y}
              r="16"
              fill="#ef4444"
              stroke="black"
              strokeWidth="2"
              filter="url(#glowRed)"
            >
              <animate
                attributeName="r"
                values="15;21;15"
                dur="0.8s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="1;0.5;1"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </>
      );
    })()}
  </svg>

<div className="absolute inset-0 pointer-events-none z-[9998]">
  {ghostMatrixRef.current.map((row, gr) =>
    row.map((g, gc) => {
      if (!g.active || g.orbId < 0) return null;

      const imgSrc = Object.values(ORB_TYPES).find((t) => t.id === g.orbId)?.img;
      if (!imgSrc) return null;

      return (
        <div
          key={`ghost-${gr}-${gc}-${ghostVersion}`}
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: g.x,
            top: g.y,
            transform: "translate(-50%, -50%)",
            opacity: g.alpha,
            width: stableCellSize,     // ???寥ㄐ
            height: stableCellSize,    // ???寥ㄐ
            willChange: "transform",
          }}
        >
          {/* ??撱箄降????踹?閬死?刻 */}
          {/* <div className="absolute inset-0 rounded-full blur-md bg-white/25" /> */}

          <img
            src={imgSrc}
            alt=""
            draggable={false}
            className="w-full h-full object-contain"
          />
        </div>
      );
    })
  )}
</div>

  <div className="absolute inset-0 pointer-events-none z-[9999]">
    {floating?.visible && (
      <div
        data-testid="floating-orb"
        className="absolute z-[9999] pointer-events-none flex items-center justify-center"
        style={{
          left: floating.x,
          top: floating.y,
          transform: "translate(-50%, -50%)",
          width: stableCellSize,
          height: stableCellSize,
        }}
      >
        <div className="absolute z-0 flex items-center justify-center">
          <div
            className="absolute rounded-full blur-lg opacity-100"
            style={{
              width: stableCellSize * 1.12,
              height: stableCellSize * 1.12,
              background:
                "radial-gradient(circle, rgba(99,102,241,1) 0%, rgba(99,102,241,0.95) 40%, rgba(99,102,241,0.6) 65%, rgba(0,0,0,0) 80%)",
            }}
          />
          <div
            className="absolute rounded-full blur-sm opacity-100"
            style={{
              width: stableCellSize * 0.94,
              height: stableCellSize * 0.94,
              background:
                "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.5) 75%, rgba(0,0,0,0) 95%)",
            }}
          />
        </div>

        <img
          src={
            Object.values(ORB_TYPES).find(
              (t) => t.id === floating.orbId
            )?.img
          }
          className="relative block h-full w-full object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]"
          draggable={false}
          alt=""
        />
      </div>
    )}
  </div>

  {solving && (
  <div className="absolute inset-0 bg-neutral-950/90 rounded-3xl flex flex-col items-center justify-center z-20 backdrop-blur-xl">
    <div className="relative w-24 h-24 mb-6">
      <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      {priorityMode === "steps" ? (
        <Footprints
          className="absolute inset-0 m-auto text-amber-400 animate-pulse"
          size={32}
        />
      ) : (
        <Trophy
          className="absolute inset-0 m-auto text-emerald-400 animate-pulse"
          size={32}
        />
      )}
    </div>

    <p className="font-black text-xl text-indigo-500 tracking-[0.2em] animate-pulse uppercase">
      {skyfallEnabled
        ? "Combo Analysis"
        : priorityMode === "steps"
        ? "Optimizing Time"
        : "Deep Searching"}
    </p>

    <div className="mt-4 w-64 max-w-[78%]">
      <div className="mb-2">
  {(() => {
    const current = Math.min(solveProgress.current || 0, solveProgress.max || 1);
    const max = solveProgress.max || 1;
    const percent = Math.max(0, Math.min(100, Math.round((current / max) * 100)));

    return (
      <>
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.95)]" />
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
              Progress
            </span>
          </div>

          {/* % Badge */}
          <div className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-black tabular-nums text-fuchsia-300 shadow-[inset_0_0_12px_rgba(217,70,239,0.15),0_0_12px_rgba(217,70,239,0.12)]">
            {percent}%
          </div>
        </div>

        {/* Single Progress Bar */}
        <div className="relative h-3.5 overflow-hidden rounded-full border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_18px_rgba(0,0,0,0.5)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 shadow-[0_0_16px_rgba(56,189,248,0.45)] transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          >
            {/* ?? */}
            <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.2)_35%,transparent_70%)] opacity-70" />
          </div>

          {/* 敺桀獢?*/}
          <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-cyan-300/10" />
        </div>
      </>
    );
  })()}
</div>
    </div>
  </div>
)}
  
  {showMoveEnded && (
    <div className="absolute inset-0 bg-neutral-950/85 rounded-3xl flex flex-col items-center justify-center z-[9999] pointer-events-none">
      <Clock className="text-orange-400 mb-4" size={40} />

      <p className="font-black text-xl text-orange-400 tracking-[0.2em] uppercase">
        Move Ended
      </p>

      <p className="mt-2 text-sm font-black text-white/70 tracking-[0.3em] uppercase">
        Time Up
      </p>
    </div>
  )}

  {gifCaptureMode && (
    <div
      className="solver-gif-footer w-full flex items-center justify-center gap-4 text-[11px] font-black tracking-wide"
      style={{
        height: GIF_FOOTER_H,
        marginTop: 0,
        background: "rgba(0,0,0,0.55)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <span className="text-fuchsia-200">
        combo: {gifFooter.comboText}
      </span>
      <span className="text-emerald-200">
        step: {gifFooter.step}/{gifFooter.stepTotal}
      </span>
    </div>
  )}
</div>
        </div>

        {(() => {
  const showStop =
    isReplaying || isPaused || exportingGif || currentStep !== -1;

  const actionButtons = [
    {
      key: "random",
      node: (
        <button
          onClick={() => initBoard(true)}
          disabled={solving || isReplaying || exportingGif}
          className="w-full min-w-0 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-2 py-3 rounded-2xl font-black transition-all text-sm border border-neutral-700 shadow-md active:scale-95"
        >
          <RefreshCw size={17} /> 隨機
        </button>
      ),
    },
    {
      key: "editor",
      node: (
        <button
          onClick={handleOpenEditor}
          disabled={solving || isReplaying || exportingGif}
          className="w-full min-w-0 flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-20 px-2 py-3 rounded-2xl font-black transition-all text-sm border border-neutral-700 shadow-md active:scale-95"
        >
          <Edit3 size={17} /> 編輯
        </button>
      ),
    },
    ...(!isManual
      ? [
          {
            key: "solve",
            node: (
              <button
                onClick={solve}
                disabled={
                  solving ||
                  isReplaying ||
                  showEditor ||
                  exportingGif ||
                  !ruleValidation.ok
                }
                className={[
                  "w-full min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                  solving || isReplaying || showEditor || exportingGif || !ruleValidation.ok
                    ? "opacity-20"
                    : "",
                  needsSolve
                    ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-emerald-900/30 text-white"
                    : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200",
                ].join(" ")}
                title={
                  !ruleValidation.ok
                    ? "請先修正底層條件的衝突設定"
                    : needsSolve
                    ? "盤面已變更，請重新求解"
                    : "盤面未變更"
                }
              >
                <Lightbulb size={17} />
                求解
              </button>
            ),
          },
        ]
      : []),
    {
      key: "play",
      node: (
        <button
          onClick={() => {
            if (isReplaying && !isPaused) return pauseReplay();
            if (isPaused) return resumeReplay();

            if (!path || path.length === 0) return;
            replayPathContinuous(path);
          }}
          disabled={
            solving ||
            exportingGif ||
            (path.length === 0 && !isReplaying && !isPaused)
          }
          className={[
            "w-full min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
            solving || exportingGif ? "opacity-20" : "",
            isReplaying && !isPaused
              ? "bg-red-600 hover:bg-red-500 border-red-400/30 shadow-red-900/40 text-white"
              : isPaused
              ? "bg-orange-500 hover:bg-orange-400 border-orange-300/30 shadow-orange-900/30 text-white"
              : "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-indigo-900/40 text-white",
          ].join(" ")}
        >
          {isReplaying && !isPaused ? (
            <>
              <Pause size={17} fill="white" /> 暫停
            </>
          ) : isPaused ? (
            <>
              <Play size={17} fill="white" /> 繼續
            </>
          ) : (
            <>
              <Play size={17} fill="white" /> 播放
            </>
          )}
        </button>
      ),
    },
    ...(showStop
      ? [
          {
            key: "stop",
            node: (
              <button
                onClick={() => stopToBase(true)}
                disabled={exportingGif}
                className={[
                  "w-full min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-2xl font-black transition-all text-sm border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 active:scale-95 shadow-md",
                  exportingGif ? "opacity-20 pointer-events-none" : "",
                ].join(" ")}
                title="Stop / 取消"
              >
                <Square size={17} fill="currentColor" />
                停止
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="solver-actions-panel flex justify-center">
      <div
        className="grid gap-2 w-full max-w-4xl"
        style={{
          gridTemplateColumns: `repeat(${actionButtons.length}, minmax(0, 1fr))`,
        }}
      >
        {actionButtons.map((btn) => (
          <React.Fragment key={btn.key}>{btn.node}</React.Fragment>
        ))}
      </div>
    </div>
  );
})()}

        <div className="solver-export-panel flex flex-col items-center gap-2">
          <div className="solver-export-controls flex items-center justify-center gap-2">
            <button
              onClick={() => openGuidePip()}
              disabled={showEditor || exportingGif}
              className={[
                "solver-export-control-button flex items-center justify-center gap-2 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                showEditor || exportingGif ? "opacity-20" : "",
                pipRoot || videoPipActive
                  ? "bg-yellow-500 hover:bg-yellow-400 border-yellow-300/30 shadow-yellow-900/30 text-black"
                  : "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200",
              ].join(" ")}
              title={
                guidePipSupported
                  ? "開啟浮動小窗"
                  : "此瀏覽器可能不支援浮動小窗；點擊後會嘗試使用可用的手機/影片小窗模式"
              }
            >
              <Layers size={20} />
              小窗
            </button>

            <button
              onClick={exportGif}
              disabled={
                solving ||
                exportingGif ||
                !path ||
                path.length < 2 ||
                isReplaying ||
                isPaused
              }
              className={[
                "solver-export-control-button flex items-center justify-center gap-2 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                solving ||
                exportingGif ||
                isReplaying ||
                isPaused ||
                !path ||
                path.length < 2
                  ? "opacity-20"
                  : "",
                "bg-fuchsia-600 hover:bg-fuchsia-500 border-fuchsia-400/30 shadow-fuchsia-900/30 text-white",
              ].join(" ")}
              title="匯出目前回放為 GIF"
            >
              <Database size={20} />
              {exportingGif
                ? gifStage === "render"
                  ? "產生 GIF..."
                  : `擷取中.. ${gifProgress.pct || 0}%`
                : "匯出 GIF"}
            </button>

            {exportingGif && (
              <button
                onClick={abortGifExport}
                className="solver-export-control-button flex items-center justify-center gap-2 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95 bg-red-600 hover:bg-red-500 border-red-400/30 shadow-red-900/30 text-white"
              >
                <Square size={20} />
                中止
              </button>
            )}

            {gifReady.url && (
              <button
                onClick={onGifDownloadClick}
                className={[
                  "solver-export-control-button flex items-center justify-center gap-2 rounded-2xl font-black shadow-xl transition-all text-sm border active:scale-95",
                  "bg-amber-500 hover:bg-amber-400 border-amber-300/30 shadow-amber-900/30 text-white",
                ].join(" ")}
              >
                <FileDown size={20} />
                下載 GIF
              </button>
            )}
          </div>

          {exportingGif && (
            <div className="solver-export-progress-row flex w-full max-w-xl items-center justify-center gap-2">
              <div className="solver-export-progress-track h-2 rounded-full bg-neutral-800 overflow-hidden border border-neutral-700">
                <div
                  className="h-full bg-fuchsia-500 transition-all"
                  style={{ width: `${gifProgress.pct || 0}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-bold text-fuchsia-300">
                {gifProgress.cur}/{gifProgress.total}
              </span>
            </div>
          )}
        </div>

        {showEditor && (
          <div className="solver-editor-overlay fixed inset-0 z-[4000] flex items-start justify-center bg-black/80 md:pt-6">
            <div
              data-testid="board-editor-dialog"
              className="solver-editor-dialog pt-5 bg-neutral-900 w-full max-w-2xl rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col h-[100dvh] md:h-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div
  className="solver-editor-body p-3 flex-1 overflow-y-auto overscroll-contain"
  onMouseUp={endEditorPaint}
  onMouseLeave={endEditorPaint}
  onTouchEnd={endEditorPaint}
  onTouchCancel={endEditorPaint}
                style={{
                  contain: "content",
                }}
              >
                <div className="solver-editor-layout flex flex-col items-center">
                  <div
                    data-testid="board-editor-board"
                    className="solver-editor-board relative bg-neutral-900 rounded-3xl shadow-2xl border-2 border-neutral-800 mb-6 mx-auto w-full max-w-[540px] overflow-visible mt-6"
                  >
                    <div className="grid grid-cols-6 gap-0">
                      {editingBoard.map((row, r) => (
                        <React.Fragment key={r}>
                          {r === 1 && (
                            <div className="col-span-6 h-2 bg-white z-50 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                          )}

                          {row.map((orb, c) => (
                            <div
  key={`${r}-${c}`}
  data-editor-cell="1"
  data-r={r}
  data-c={c}
  onPointerDown={(e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startEditorPaint(r, c);
  }}
  onPointerMove={(e) => {
  if (!editorDraggingRef.current) return;
  e.preventDefault();

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el?.closest?.("[data-editor-cell]");
  if (!cell) return;

  const rr = Number(cell.getAttribute("data-r"));
  const cc = Number(cell.getAttribute("data-c"));
  if (Number.isNaN(rr) || Number.isNaN(cc)) return;

  moveEditorPaint(rr, cc);
  }}
  onPointerUp={(e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    endEditorPaint();
  }}
  onPointerCancel={endEditorPaint}
							  className="relative w-full aspect-square flex items-center justify-center transition-all duration-75 rounded-2xl"
                style={{ touchAction: "none" }}
                            >
                              <div
                                className={`absolute inset-0 m-auto w-[95%] h-[95%] rounded-2xl pointer-events-none transition-all duration-75
                                  ${r === 0 ? "ring-2 ring-yellow-400 z-10" : ""}
                                  ${
                                    orbOf(editingBoard[r][c]) === selectedBrush
                                      ? "ring-2 ring-white z-20"
                                      : ""
                                  }`}
                              />

                              <img
                                src={
                                  Object.values(ORB_TYPES).find(
                                    (t) => t.id === orbOf(orb)
                                  )?.img
                                }
                                className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
                                draggable={false}
                                alt=""
                              />

                              {xMarkOf(orb) === 1 && !isManual && (
                                <img
                                  src={x1Img}
                                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                                  draggable={false}
                                  alt=""
                                />
                              )}

                              {xMarkOf(orb) === 2 && (
                                <img
                                  src={x2Img}
                                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                                  draggable={false}
                                  alt=""
                                />
                              )}

                              
							  
							  {nMarkOf(orb) === 1 && (
  <img
    src={n1Img}
    className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
    draggable={false}
    alt=""
  />
)}

{!isManual && nMarkOf(orb) === 2 && (
  <img
    src={n2Img}
    className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
    draggable={false}
    alt=""
  />
)}
{!isManual && qMarkOf(orb) === 1 && (
                                <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-cyan-500/90 text-black text-xs font-black border border-black/30">
                                  START
                                </div>
                              )}

                              {!isManual && qMarkOf(orb) === 2 && (
                                <div className="absolute top-1 left-1 px-2 py-0.5 rounded-lg bg-fuchsia-500/90 text-black text-xs font-black border border-black/30">
                                  END
                                </div>
                              )}
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="solver-editor-tools w-full">
                    <p className="solver-editor-orb-heading text-xs font-black text-neutral-500 uppercase tracking-widest text-center mb-4">
                      ORB PALETTE
                    </p>

                    <div className="solver-editor-orbs flex justify-center gap-3 mb-2">
                      {Object.values(ORB_TYPES).map((type) => (
                        <button
                          key={type.id}
                          data-editor-orb={type.id}
                          onClick={() => setSelectedBrush(type.id)}
                          className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                            ${
                              selectedBrush === type.id
                                ? "ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20"
                                : "opacity-70 hover:opacity-100"
                            }`}
                        >
                          <img
                            src={type.img}
                            className="w-[100%] h-[100%] object-contain pointer-events-none select-none"
                            draggable={false}
                            alt=""
                          />
                        </button>
                      ))}
                    </div>

                    <div className="solver-editor-state-heading mt-6 mb-4 text-center">
  <p className="text-xs font-black text-neutral-500 uppercase tracking-widest">
    STATE PALETTE:
  </p>

  <p className="mt-2 text-sm md:text-base font-black underline underline-offset-4 text-neutral-200">
    {STATE_DESC[selectedMark] ?? "未知狀態"}
  </p>
</div>

                    <div className="solver-editor-states flex flex-wrap justify-center gap-3 max-w-[450px] mx-auto">
                      <button
                        data-editor-mark="0"
                        onClick={() => setSelectedMark(0)}
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                          ${
                            selectedMark === 0
                              ? "ring-4 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/20"
                              : "opacity-70 hover:opacity-100"
                          }`}
                        title="一般珠子"
                      >
                        <span className="font-black text-neutral-300">ORB</span>
                      </button>

                      {!isManual && (
                        <button
                          data-editor-mark="1"
                          onClick={() => setSelectedMark(1)}
                          className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                            ${
                              selectedMark === 1
                                ? "ring-4 ring-red-500 scale-110 shadow-lg shadow-red-500/20"
                                : "opacity-70 hover:opacity-100"
                            }`}
                          title="設定 X1（不可移動）"
                        >
                          <img
                            src={x1Img}
                            className="w-[85%] h-[85%] object-contain"
                            draggable={false}
                            alt=""
                          />
                        </button>
                      )}

                      <button
                        data-editor-mark="2"
                        onClick={() => setSelectedMark(2)}
                        className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                          ${
                            selectedMark === 2
                              ? "ring-4 ring-yellow-400 scale-110 shadow-lg shadow-yellow-400/20"
                              : "opacity-70 hover:opacity-100"
                          }`}
                        title="設定 X2（可被穿越）"
                      >
                        <img
                          src={x2Img}
                          className="w-[85%] h-[85%] object-contain"
                          draggable={false}
                          alt=""
                        />
                      </button>

                      {!isManual && (
                        <>
                          <button
                            data-editor-mark="3"
                            onClick={() => setSelectedMark(3)}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                              ${
                                selectedMark === 3
                                  ? "ring-4 ring-cyan-400 scale-110 shadow-lg"
                                  : "opacity-70"
                              }`}
                            title="設定 Start"
                          >
                            <span className="font-black text-cyan-300 text-lg">
                              START
                            </span>
                          </button>

                          <button
                            data-editor-mark="4"
                            onClick={() => setSelectedMark(4)}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
                              ${
                                selectedMark === 4
                                  ? "ring-4 ring-fuchsia-400 scale-110 shadow-lg"
                                  : "opacity-70"
                              }`}
                            title="設定 End"
                          >
                            <span className="font-black text-fuchsia-300 text-lg">
                              END
                            </span>
                          </button>
                        </>
                      )}
					  
					  <button
  data-editor-mark="5"
  onClick={() => setSelectedMark(5)}
  className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
    ${
      selectedMark === 5
        ? "ring-4 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/20"
        : "opacity-70 hover:opacity-100"
    }`}
  title="設定 N1（首消與天降不可消）"
>
  <img
    src={n1Img}
    className="w-[85%] h-[85%] object-contain"
    draggable={false}
    alt=""
  />
</button>

{!isManual && (
  <button
    data-editor-mark="6"
    onClick={() => setSelectedMark(6)}
    className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all bg-neutral-950 border border-neutral-800
      ${
        selectedMark === 6
          ? "ring-4 ring-lime-400 scale-110 shadow-lg shadow-lime-500/20"
          : "opacity-70 hover:opacity-100"
      }`}
    title="設定 N2（首消禁消，天降可消）"
  >
    <img
      src={n2Img}
      className="w-[85%] h-[85%] object-contain"
      draggable={false}
      alt=""
    />
  </button>
)}
					  
                    </div>
                  </div>
                </div>
              </div>

              <div className="solver-editor-footer sticky bottom-0 bg-neutral-900 border-t border-neutral-800 p-4">
                <div className="grid grid-cols-4 gap-2 w-full">
                  <button
                    onClick={() => setShowEditor(false)}
                    className="w-full py-5 rounded-2xl font-bold bg-neutral-800 hover:bg-neutral-700 transition-colors text-base"
                  >
                    取消
                  </button>

                  <button
                    onClick={onImportClick}
                    disabled={importBusy}
                    className={[
                      "w-full py-5 rounded-2xl font-black transition-all text-base border active:scale-95",
                      importBusy
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:brightness-110",
                      "bg-fuchsia-600 border-fuchsia-400/30 shadow-xl shadow-fuchsia-900/20",
                    ].join(" ")}
                    title="從圖片辨識盤面"
                  >
                    圖片辨識
                  </button>
				  
				  <button
					  onClick={() => setShowTemplateBrowser(true)}
					  className="w-full py-5 rounded-2xl font-black bg-purple-600 hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all flex items-center justify-center gap-2 text-base"
					>
					  固版搜尋
					</button>

                  <button
  onClick={() => {
  stopToBase(true);
  setPath([]);
  pathRef.current = [];
  setCurrentStep(-1);

  setStats((prev) => ({
    ...prev,
    combos: 0,
    skyfallCombos: 0,
    steps: 0,
    clearedOrbs: 0,
    initialClearedOrbs: 0,
    skyfallClearedOrbs: 0,
    verticalCombos: 0,
    horizontalCombos: 0,
    crossCount: 0,
    lCount: 0,
    tCount: 0,
  }));

  handleApplyCustomBoard();
}}
  className="w-full py-5 rounded-2xl font-black bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-900/20 transition-all flex items-center justify-center gap-2 text-base"
>
  <Check size={22} /> 套用
</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="solver-help-panel flex items-start gap-3 p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 text-xs text-neutral-400 leading-relaxed shadow-inner">
          <div className="solver-help-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10">
            <Wrench size={18} className="text-indigo-300" />
          </div>
          <div className="solver-help-content min-w-0 flex-1">
            <strong className="solver-help-title text-indigo-300 block mb-1 text-sm font-black">
              使用說明
            </strong>
            <strong className="solver-help-copy block text-xs font-semibold text-neutral-300">
              自動模式會依設定搜尋路徑，並在限制內盡量最佳化。
              結果會顯示首消/天降 Combo 與步數，便於比較。
              可切換 Combo 優先或步數優先。
            </strong>

            <div className="solver-help-actions mt-3 flex flex-wrap items-center gap-2">
              <a
                href="https://forum.gamer.com.tw/C.php?bsn=23805&snA=729214"
                target="_blank"
                rel="noopener noreferrer"
                className="solver-help-action inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 text-sm font-black text-indigo-100 transition hover:border-indigo-300/50 hover:bg-indigo-400/15"
              >
                <MoveUpRight size={15} className="text-indigo-300" />
                前往巴哈討論
              </a>
              <button
                type="button"
                onClick={openFeedbackModal}
                className="solver-help-action inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 text-sm font-black text-indigo-100 transition hover:border-indigo-300/50 hover:bg-indigo-400/15"
              >
                <MessageSquare size={15} className="text-indigo-300" />
                意見回饋
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {feedbackOpen &&
      typeof document !== "undefined" &&
      createPortal(
        <div className="fixed inset-0 z-[2147483600] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={20} className="text-cyan-300" />
                <h2 className="text-lg font-black">意見回饋</h2>
              </div>
              <button
                type="button"
                onClick={closeFeedbackModal}
                disabled={feedbackSubmitting}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/10 disabled:opacity-40"
                aria-label="關閉"
                title="關閉"
              >
                <X size={18} />
              </button>
            </div>

            <form
              ref={feedbackFormRef}
              action={FEEDBACK_ENDPOINT}
              method="POST"
              encType="multipart/form-data"
              target={FEEDBACK_IFRAME_NAME}
              onSubmit={handleFeedbackSubmit}
              className="space-y-4 px-5 py-5"
            >
              <input type="hidden" name="_subject" value="AutoCombo 意見回饋" />
              <input type="hidden" name="_template" value="table" />
              <input type="hidden" name="_captcha" value="false" />
              <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" />
              <input ref={feedbackClientRef} type="hidden" name="使用者 IP / 地區" />
              <input ref={feedbackPageRef} type="hidden" name="頁面網址" />
              <input ref={feedbackLanguageRef} type="hidden" name="目前語言" />
              <input ref={feedbackTimeRef} type="hidden" name="送出時間" />
              <input ref={feedbackBrowserRef} type="hidden" name="瀏覽器" />

              <label className="block">
                <span className="mb-2 block text-sm font-black text-neutral-200">回覆信箱（可不填）</span>
                <input
                  type="email"
                  name="email"
                  value={feedbackEmail}
                  onChange={(event) => setFeedbackEmail(event.target.value)}
                  placeholder="example@email.com"
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan-300/70"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-neutral-200">回饋內容</span>
                <textarea
                  name="意見內容"
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  onPaste={handleFeedbackPaste}
                  rows={6}
                  placeholder="可以描述遇到的問題、期望功能，或直接貼上截圖。"
                  className="min-h-36 w-full resize-y rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-sm leading-relaxed text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan-300/70"
                />
              </label>

              <div className="block rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-3 py-3">
                <span className="mb-2 flex items-center gap-2 text-sm font-black text-neutral-200">
                  <ImagePlus size={16} className="text-cyan-300" />
                  圖片附件（可選檔或貼上，總大小 20MB 內）
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={feedbackFileRef}
                    type="file"
                    name="attachment"
                    accept="image/*"
                    multiple
                    onChange={handleFeedbackFileChange}
                    className="sr-only"
                    tabIndex={-1}
                  />
                  <button
                    type="button"
                    onClick={() => feedbackFileRef.current?.click()}
                    disabled={feedbackSubmitting}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-sm font-black text-neutral-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
                  >
                    <ImagePlus size={16} />
                    選擇圖片
                  </button>
                  <span className="text-xs font-bold text-neutral-400">
                    {feedbackFiles.length > 0
                      ? `已選擇 ${feedbackFiles.length} 張圖片`
                      : "尚未選擇圖片"}
                  </span>
                </div>
                {feedbackPreviewItems.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-2 text-xs font-black text-neutral-300">
                      圖片預覽
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {feedbackPreviewItems.map(({ file, index, url }) => (
                        <div
                          key={`${file.name}-${file.size}-${index}`}
                          className="rounded-lg border border-white/10 bg-neutral-900/80 p-2 text-xs text-neutral-200"
                        >
                          <div className="aspect-video overflow-hidden rounded-md border border-white/10 bg-black/30">
                            {url ? (
                              <img
                                src={url}
                                alt={file.name || "圖片預覽"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-cyan-300">
                                <ImagePlus size={22} />
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-bold" title={file.name}>
                                {file.name}
                              </div>
                              <div className="mt-0.5 text-neutral-500">
                                {bytesToReadableSize(file.size)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFeedbackFile(index)}
                              className="shrink-0 rounded-md border border-white/10 px-2 py-1 font-black text-neutral-300 transition hover:bg-white/10"
                              aria-label="移除"
                              title="移除"
                            >
                              移除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {feedbackStatus && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-cyan-100">
                  {feedbackStatus}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeFeedbackModal}
                  disabled={feedbackSubmitting}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-neutral-200 transition hover:bg-white/10 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-neutral-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
                >
                  <Send size={16} />
                  {feedbackSubmitting ? "傳送中..." : "傳送"}
                </button>
              </div>
            </form>

            <iframe
              title="feedback submit"
              name={FEEDBACK_IFRAME_NAME}
              className="hidden"
              onLoad={handleFeedbackIframeLoad}
            />
          </div>
        </div>,
        document.body
      )}

    {solutionPreview && createPortal(
      <div
        data-testid="solution-preview-tooltip"
        className="solution-preview-tooltip"
        style={{
          left: `${solutionPreview.left}px`,
          top: `${solutionPreview.top}px`,
        }}
      >
        <div className="solution-preview-title">
          #{solutionPreview.index + 1} 終點版面
        </div>
        <div className="solution-preview-board">
          {solutionPreview.board.map((row, r) => {
            if (!autoRow0Expanded && r === 0) return null;

            return (
              <React.Fragment key={`preview-row-${r}`}>
                {autoRow0Expanded && r === 1 && (
                  <div className="solution-preview-separator" />
                )}
                {row.map((orb, c) => {
                  const orbId = orbOf(orb);
                  const orbImage = Object.values(ORB_TYPES).find(
                    (type) => type.id === orbId
                  )?.img;
                  const row0Type =
                    r === 0
                      ? Object.keys(ORB_TYPES).find(
                          (key) => ORB_TYPES[key].id === orbId
                        )
                      : null;
                  const row0BoxImg =
                    r === 0 ? ROW0_BOX_IMG_MAP[row0Type] || null : null;

                  return (
                    <div
                      key={`preview-cell-${r}-${c}`}
                      className={`solution-preview-cell ${
                        (r + c) % 2 === 0 ? "bg-neutral-700" : "bg-neutral-900"
                      }`}
                    >
                      {orbId === -1 ? (
                        <div className="h-full w-full border border-white/10 bg-black/20" />
                      ) : (
                        <>
                          {row0BoxImg && (
                            <img
                              src={row0BoxImg}
                              className="solution-preview-layer solution-preview-row0-box"
                              draggable={false}
                              alt=""
                            />
                          )}
                          <img
                            src={orbImage}
                            className="solution-preview-orb"
                            draggable={false}
                            alt=""
                          />
                          {xMarkOf(orb) === 1 && (
                            <img
                              src={x1Img}
                              className="solution-preview-layer"
                              draggable={false}
                              alt=""
                            />
                          )}
                          {xMarkOf(orb) === 2 && (
                            <img
                              src={x2Img}
                              className="solution-preview-layer"
                              draggable={false}
                              alt=""
                            />
                          )}
                          {nMarkOf(orb) === 1 && (
                            <img
                              src={n1Img}
                              className="solution-preview-layer solution-preview-n-mark"
                              draggable={false}
                              alt=""
                            />
                          )}
                          {nMarkOf(orb) === 2 && (
                            <img
                              src={n2Img}
                              className="solution-preview-layer solution-preview-n-mark"
                              draggable={false}
                              alt=""
                            />
                          )}
                          {qMarkOf(orb) === 1 && (
                            <span className="solution-preview-path-mark solution-preview-path-mark--start">
                              Start
                            </span>
                          )}
                          {qMarkOf(orb) === 2 && (
                            <span className="solution-preview-path-mark solution-preview-path-mark--end">
                              End
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>,
      document.body
    )}

    {pipRoot &&
      createPortal(
        <div className="guide-pip-shell">
          <div className="guide-pip-toolbar">
            <div className="guide-pip-title">
              {autoRow0Expanded ? "6x6" : "5x6"} / {pipStatusText}
            </div>
            <div className="guide-pip-actions">
              <button
                type="button"
                className="guide-pip-button"
                onClick={selectBoardSource}
                disabled={boardSourceBusy || importBusy || showImportCrop || solving || showEditor}
                title={translateText("選擇版面來源；之後按計算會直接抓此來源的最新畫面", language)}
              >
                {boardSourceButtonText}
              </button>
              <button
                type="button"
                className="guide-pip-button"
                onClick={calculateFromBoardSource}
                disabled={boardSourceBusy || importBusy || showImportCrop || solving || showEditor}
                title={translateText("從目前版面來源抓最新畫面並開始計算", language)}
              >
                {translateText("計算", language)}
              </button>
            </div>
          </div>

          <div className="guide-pip-stage">
            {pipLoading ? (
              <div className="guide-pip-loading">
                <div className="guide-pip-spinner" />
                <div>{pipStatusText}</div>
              </div>
            ) : (
              (() => {
                const pipRoute = buildCompletedPipRoute(1);

                return (
                  <svg
                    className="guide-pip-board"
                    viewBox={`0 0 ${COLS} ${pipRowCount}`}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="轉珠路徑小窗"
                  >
                    <defs>
                      <filter
                        id="pipGlowGreen"
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                      >
                        <feGaussianBlur stdDeviation="0.045" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter
                        id="pipGlowRed"
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                      >
                        <feGaussianBlur stdDeviation="0.045" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter
                        id="pipRouteShadow"
                        x="-1"
                        y="-1"
                        width={COLS + 2}
                        height={pipRowCount + 2}
                        filterUnits="userSpaceOnUse"
                      >
                        <feDropShadow
                          dx="0.05"
                          dy="0.05"
                          stdDeviation="0.067"
                          floodColor="black"
                          floodOpacity="0.95"
                        />
                      </filter>
                    </defs>

                    <rect x="0" y="0" width={COLS} height={pipRowCount} fill="#080808" />

                    {pipBoardRows.map((row, localR) =>
                      row.map((cell, c) => {
                        const orbId = orbOf(cell);
                        const imgSrc = ORB_ICON_IMGS[orbId];
                        const bg = (localR + c) % 2 === 0 ? "#2b2b2b" : "#151515";

                        return (
                          <React.Fragment key={`pip-cell-${localR}-${c}`}>
                            <rect
                              x={c}
                              y={localR}
                              width="1"
                              height="1"
                              fill={bg}
                              stroke="rgba(255,255,255,0.05)"
                              strokeWidth="0.015"
                            />
                            {imgSrc && (
                              <image
                                href={imgSrc}
                                x={c + 0.02}
                                y={localR + 0.02}
                                width="0.96"
                                height="0.96"
                                preserveAspectRatio="xMidYMid meet"
                              />
                            )}
                          </React.Fragment>
                        );
                      })
                    )}

                    {autoRow0Expanded && (
                      <line
                        x1="0"
                        y1="1"
                        x2={COLS}
                        y2="1"
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth="0.035"
                      />
                    )}

                    {pipRoute.points.length >= 2 && (
                      <>
                        {pipRoute.geometry?.start && (
                          <circle
                            cx={pipRoute.geometry.start.x}
                            cy={pipRoute.geometry.start.y}
                            r="0.22"
                            fill="#22c55e"
                            stroke="black"
                            strokeWidth="0.033"
                            filter="url(#pipGlowGreen)"
                          />
                        )}

                        <path
                          d={pipRoute.pathD}
                          stroke="white"
                          strokeWidth="0.067"
                          fill="none"
                          strokeLinecap="butt"
                          strokeLinejoin="miter"
                          filter="url(#pipRouteShadow)"
                          opacity="0.96"
                        />

                        {pipRoute.geometry?.end && (
                          <circle
                            cx={pipRoute.geometry.end.x}
                            cy={pipRoute.geometry.end.y}
                            r="0.25"
                            fill="#ef4444"
                            stroke="black"
                            strokeWidth="0.033"
                            filter="url(#pipGlowRed)"
                          />
                        )}
                      </>
                    )}
                  </svg>
                );
              })()
            )}
          </div>
        </div>,
        pipRoot
      )}

    <input
      ref={importFileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={onImportFileChange}
    />

    <ImportCropModal
      open={showImportCrop}
      imgUrl={importImgUrl}
      onCancel={() => {
        autoSolveImportedRef.current = false;
        pendingAutoSolveImportRef.current = false;
        setShowImportCrop(false);
      }}
      onConfirm={async ({ cropCanvas }) => {
        console.log("[ImportCropModal] onConfirm fired", cropCanvas);

        setImportBusy(true);
        const shouldAutoSolve = autoSolveImportedRef.current;
        try {
          if (!cropCanvas) {
            alert("裁切資料不存在，請重新開啟裁切視窗。");
            return;
          }

          const detected = detectFromCroppedCanvas(
            cropCanvas,
            ORB_TYPES,
            templateCacheRef,
            {
              rows: 5,
              cols: 6,
              innerPad: 0.12,
              sampleSize: 28,
              allowEmpty: false,
              allowUnknown: false,
              minScore: 0.55,
            }
          );

          console.log("[detect] result", detected);

          if (shouldAutoSolve) {
            applyDetectedPlayBoard(detected, { autoSolve: true });
            setShowImportCrop(false);
            return;
          }

          setEditingBoard((prev) => {
            const next = prev.map((r) => [...r]);
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 6; c++) {
                next[r + 1][c] = detected[r][c];
              }
            }
            return next;
          });

          console.log(
            "sample pixel:",
            cropCanvas?.getContext?.("2d")?.getImageData(0, 0, 1, 1)?.data
          );

          setShowEditor(true);
          setShowImportCrop(false);
        } catch (err) {
          console.error("匯入失敗", err);
          console.error("err.message:", err?.message);
          console.error("err.stack:", err?.stack);
          console.log("cropCanvas:", cropCanvas);
          console.log("cropCanvas size:", cropCanvas?.width, cropCanvas?.height);
          alert("匯入失敗，請查看 console。");
        } finally {
          autoSolveImportedRef.current = false;
          setImportBusy(false);
        }
      }}
    />
	
	<ActiveSkillTemplateModal
  open={showTemplateBrowser}
  onClose={() => setShowTemplateBrowser(false)}
  onSelectTemplate={(template) => {
    try {
      const board2D = convertTemplateBoardTo2D(
        template.board,
        5,
        6,
        template.resolvedAttribute || null
      );

      setEditingBoard((prev) => {
        const next = prev.map((r) => [...r]);

        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 6; c++) {
            next[r + 1][c] = board2D[r][c];
          }
        }

        return next;
      });

      setShowTemplateBrowser(false);
      console.log("套用模板", template.characterName, board2D);
    } catch (err) {
      console.error("套用模板失敗:", err);
      alert(`套用模板失敗: ${err.message}`);
    }
  }}
/>
  </div>
);
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const roundToStep = (v, step, min = 0) => {
  const s = Number(step) || 1;
  const base = Number(min) || 0;
  const k = Math.round((v - base) / s);
  return base + k * s;
};

const ParamSlider = ({
  label,
  labelContent = null,
  value,
  min,
  max,
  step,
  onChange,
  inputMode = "decimal",
  formatInput = (v) => String(v),
  disabled = false,
  disabledText = "未啟用",
  containerClassName = "",
}) => {
  const [text, setText] = React.useState(formatInput(value));
  const isComposingRef = React.useRef(false);

  React.useEffect(() => {
    if (isComposingRef.current) return;
    setText(disabled ? disabledText : formatInput(value));
  }, [value, formatInput, disabled, disabledText]);

  const commit = React.useCallback((rawText = text) => {
    if (disabled) return;

    const nextText = String(rawText);
    if (nextText.trim() === "") {
      setText(formatInput(value));
      return;
    }

    const n = Number(nextText);
    if (!Number.isFinite(n)) {
      setText(formatInput(value));
      return;
    }

    let next = clamp(n, min, max);
    next = roundToStep(next, step, min);

    if (String(step).includes(".")) {
      const decimals = String(step).split(".")[1].length;
      next = Number(next.toFixed(decimals));
    }

    onChange(next);
    setText(formatInput(next));
  }, [text, value, min, max, step, onChange, formatInput, disabled]);

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      <div className="flex justify-between items-center text-[14px] font-bold text-neutral-400 gap-2">
        <span>{labelContent || label}</span>

        {/* ???芯??頛詨 input嚗???砌??航撓??label */}
        <input
          value={disabled ? disabledText : text}
          inputMode={inputMode}
          disabled={disabled}
          className={`w-24 md:w-28 px-2 py-1 rounded-lg border font-bold text-base text-right outline-none ${
            disabled
              ? "cursor-not-allowed border-neutral-800 bg-neutral-900 text-neutral-600"
              : "border-neutral-800 bg-neutral-950 text-blue-400 focus:ring-2 focus:ring-blue-500/40"
          }`}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            commit(e.currentTarget.value);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setText(formatInput(value));
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          const n = Number(e.target.value);
          onChange(n);
          setText(formatInput(n));
        }}
        className={`w-full h-1.5 rounded-lg appearance-none accent-blue-500 ${
          disabled
            ? "cursor-not-allowed bg-neutral-900 opacity-45"
            : "cursor-pointer bg-neutral-800"
        }`}
      />
    </div>
  );
};

export default App;


