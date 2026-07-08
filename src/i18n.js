import { UI_TRANSLATION_ROWS } from "./i18nTranslationData.js";

export const LANGUAGE_STORAGE_KEY = "comboauto.language";

export const LANGUAGE_OPTIONS = [
  { code: "zh", label: "中文", shortLabel: "中", htmlLang: "zh-Hant" },
  { code: "en", label: "English", shortLabel: "EN", htmlLang: "en" },
  { code: "ja", label: "日本語", shortLabel: "日", htmlLang: "ja" },
];

export const LANGUAGE_MENU_TEXT = {
  zh: "切換語言",
  en: "Change language",
  ja: "言語を切り替え",
};

export const SEO_METADATA = {
  zh: {
    path: "/",
    htmlLang: "zh-Hant",
    title: "神魔之塔自動轉珠模擬器 | AutoCombo",
    description:
      "神魔之塔自動轉珠模擬器，可自動搜尋最佳轉珠路徑。支援自訂盤面、圖片辨識、天降與斜轉判定、Combo 與步數比較、解盾與回放。",
    keywords: "神魔之塔, 神魔, TOS, 轉珠, 自動轉珠, 轉珠模擬器, Combo, 解盾, 最佳路徑",
    url: "https://taivsallen.github.io/AutoCombo/",
    locale: "zh_TW",
  },
  en: {
    path: "/en/",
    htmlLang: "en",
    title: "Tower of Saviors Auto Combo Solver | AutoCombo",
    description:
      "An auto combo solver and orb route simulator for Tower of Saviors. Search optimized paths, import boards from images, compare combos and steps, handle shields, and replay solutions.",
    keywords:
      "Tower of Saviors, TOS, auto combo solver, orb route simulator, combo optimizer, board recognition, shield solver",
    url: "https://taivsallen.github.io/AutoCombo/en/",
    locale: "en_US",
  },
  ja: {
    path: "/ja/",
    htmlLang: "ja",
    title: "タワーオブセイバーズ 自動コンボルート検索 | AutoCombo",
    description:
      "Tower of Saviors / 神魔之塔 向けの自動ドロップ操作シミュレーター。画像から盤面を認識し、最適ルート検索、コンボと手数の比較、ギミック対応、リプレイ表示に対応。",
    keywords:
      "Tower of Saviors, 神魔之塔, タワーオブセイバーズ, 自動コンボ, ドロップ操作, ルート検索, コンボ最適化, 盤面認識",
    url: "https://taivsallen.github.io/AutoCombo/ja/",
    locale: "ja_JP",
  },
};

const SITE_BASE_PATH = "/AutoCombo";

const SUPPORTED_LANGUAGES = new Set(LANGUAGE_OPTIONS.map((item) => item.code));
const TRANSLATED_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"];
const TEXT_ORIGINALS = new WeakMap();
const ATTR_ORIGINALS = new WeakMap();

let activeLanguage = "zh";
let observer = null;
let isApplyingTranslation = false;
let dialogsPatched = false;
let originalAlert = null;
let originalConfirm = null;

const normalizeLanguage = (lang) =>
  SUPPORTED_LANGUAGES.has(lang) ? lang : "en";

export const getStoredLanguage = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.has(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const setStoredLanguage = (lang) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(lang));
  } catch {
    // localStorage can be unavailable in private contexts.
  }
};

export const getPathLanguage = () => {
  if (typeof window === "undefined") return null;

  const path = window.location.pathname.replace(/\/+$/, "/");
  const relativePath = path.startsWith(`${SITE_BASE_PATH}/`)
    ? path.slice(SITE_BASE_PATH.length)
    : path;

  if (relativePath === "/en/" || relativePath.startsWith("/en/")) return "en";
  if (relativePath === "/ja/" || relativePath.startsWith("/ja/")) return "ja";
  if (relativePath === "/" || relativePath === "") return "zh";
  return null;
};

export const syncLanguagePath = (lang) => {
  if (typeof window === "undefined") return;

  const normalizedLang = normalizeLanguage(lang);
  const targetPath = `${SITE_BASE_PATH}${SEO_METADATA[normalizedLang]?.path || "/"}`;
  const nextUrl = `${targetPath}${window.location.search}${window.location.hash}`;

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.pushState({ language: normalizedLang }, "", nextUrl);
  }
};

const upsertMeta = (selector, attrs) => {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });
};

const upsertLink = (selector, attrs) => {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    document.head.appendChild(el);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });
};

const updatePageMetadata = (lang) => {
  if (typeof document === "undefined") return;

  const normalizedLang = normalizeLanguage(lang);
  const meta = SEO_METADATA[normalizedLang] || SEO_METADATA.en;
  const alternates = [
    ["zh-Hant", SEO_METADATA.zh.url],
    ["en", SEO_METADATA.en.url],
    ["ja", SEO_METADATA.ja.url],
    ["x-default", SEO_METADATA.en.url],
  ];

  document.title = meta.title;
  upsertMeta('meta[name="description"]', { name: "description", content: meta.description });
  upsertMeta('meta[name="keywords"]', { name: "keywords", content: meta.keywords });
  upsertMeta('meta[property="og:title"]', { property: "og:title", content: meta.title });
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: meta.description,
  });
  upsertMeta('meta[property="og:url"]', { property: "og:url", content: meta.url });
  upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: meta.locale });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: meta.title });
  upsertMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: meta.description,
  });
  upsertLink('link[rel="canonical"]', { rel: "canonical", href: meta.url });

  alternates.forEach(([hreflang, href]) => {
    upsertLink(`link[rel="alternate"][hreflang="${hreflang}"]`, {
      rel: "alternate",
      hreflang,
      href,
    });
  });
};

export const getBrowserFallbackLanguage = () => {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || navigator.languages?.[0] || "").toLowerCase();
  if (lang.startsWith("ja")) return "ja";
  if (
    lang.startsWith("zh") ||
    lang.includes("-tw") ||
    lang.includes("-hk") ||
    lang.includes("-mo") ||
    lang.includes("-cn")
  ) {
    return "zh";
  }
  return "en";
};

const countryToLanguage = (countryCode) => {
  const code = String(countryCode || "").trim().toUpperCase();
  if (code === "JP") return "ja";
  if (["TW", "CN", "HK", "MO"].includes(code)) return "zh";
  if (code) return "en";
  return null;
};

const fetchJsonWithTimeout = async (url, timeoutMs = 2400) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(timeout);
  }
};

export const detectLanguageByIp = async () => {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return getBrowserFallbackLanguage();
  }

  const endpoints = [
    {
      url: "https://ipapi.co/json/",
      pick: (data) => data?.country_code,
    },
    {
      url: "https://ipwho.is/",
      pick: (data) => data?.country_code,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await fetchJsonWithTimeout(endpoint.url);
      const lang = countryToLanguage(endpoint.pick(data));
      if (lang) return lang;
    } catch {
      // Try the next provider, then fall back to browser locale.
    }
  }

  return getBrowserFallbackLanguage();
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PLACEHOLDER_RE = /\{([A-Za-z0-9_]+)\}/g;

const hasPlaceholder = (value) => {
  PLACEHOLDER_RE.lastIndex = 0;
  return PLACEHOLDER_RE.test(value);
};

const compileTemplate = (source, target) => {
  PLACEHOLDER_RE.lastIndex = 0;
  const names = [];
  let pattern = "";
  let lastIndex = 0;
  let match;

  while ((match = PLACEHOLDER_RE.exec(source))) {
    pattern += escapeRegex(source.slice(lastIndex, match.index));
    pattern += "(.+?)";
    names.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  pattern += escapeRegex(source.slice(lastIndex));

  return {
    regex: new RegExp(`^${pattern}$`, "u"),
    names,
    target,
  };
};

const exactTranslations = {
  en: new Map(),
  ja: new Map(),
};

const templateTranslations = {
  en: [],
  ja: [],
};

const addTranslationKey = (lang, key, target) => {
  const source = String(key || "").trim();
  const translated = String(target || "").trim();
  if (!source || !translated) return;

  if (hasPlaceholder(source)) {
    templateTranslations[lang].push(compileTemplate(source, translated));
    return;
  }

  if (!exactTranslations[lang].has(source)) {
    exactTranslations[lang].set(source, translated);
  }
};

for (const row of UI_TRANSLATION_ROWS) {
  for (const lang of ["en", "ja"]) {
    addTranslationKey(lang, row.source, row[lang]);
    addTranslationKey(lang, row.zh, row[lang]);
  }
}

const translateTemplate = (text, lang) => {
  for (const item of templateTranslations[lang] || []) {
    const match = item.regex.exec(text);
    if (!match) continue;

    const values = new Map();
    item.names.forEach((name, idx) => {
      values.set(name, match[idx + 1] || "");
    });

    return item.target.replace(PLACEHOLDER_RE, (_, name) => values.get(name) ?? "");
  }
  return null;
};

const translateTrimmed = (text, lang) => {
  const normalizedLang = normalizeLanguage(lang);
  if (normalizedLang === "zh") return text;

  const exact = exactTranslations[normalizedLang]?.get(text);
  if (exact !== undefined) return exact;

  const templated = translateTemplate(text, normalizedLang);
  return templated ?? text;
};

export const translateText = (value, lang = activeLanguage) => {
  const text = String(value ?? "");
  if (!text.trim()) return text;

  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return translateTrimmed(text, lang);

  const [, leading, body, trailing] = match;
  return `${leading}${translateTrimmed(body, lang)}${trailing}`;
};

const isSkippableElement = (el) => {
  if (!el) return true;
  const tag = el.tagName;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(tag)) return true;
  return Boolean(el.closest?.('[data-i18n-skip="true"]'));
};

const translateTextNode = (node) => {
  if (!node?.parentElement || isSkippableElement(node.parentElement)) return;

  const current = node.nodeValue || "";
  let original = TEXT_ORIGINALS.get(node);

  if (original === undefined) {
    original = current;
    TEXT_ORIGINALS.set(node, original);
  } else {
    const expected = translateText(original, activeLanguage);
    if (current !== expected) {
      original = current;
      TEXT_ORIGINALS.set(node, original);
    }
  }

  const next = translateText(original, activeLanguage);
  if (current !== next) node.nodeValue = next;
};

const getAttrOriginals = (el) => {
  let originals = ATTR_ORIGINALS.get(el);
  if (!originals) {
    originals = {};
    ATTR_ORIGINALS.set(el, originals);
  }
  return originals;
};

const translateElementAttributes = (el) => {
  if (!el || isSkippableElement(el)) return;

  const originals = getAttrOriginals(el);

  for (const attr of TRANSLATED_ATTRIBUTES) {
    if (!el.hasAttribute(attr)) continue;

    const current = el.getAttribute(attr) || "";
    let original = originals[attr];

    if (original === undefined) {
      original = current;
      originals[attr] = original;
    } else {
      const expected = translateText(original, activeLanguage);
      if (current !== expected) {
        original = current;
        originals[attr] = original;
      }
    }

    const next = translateText(original, activeLanguage);
    if (current !== next) el.setAttribute(attr, next);
  }
};

const translateTree = (root) => {
  if (typeof document === "undefined" || !root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(root);
  }

  root.querySelectorAll?.("*").forEach(translateElementAttributes);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node);
    node = walker.nextNode();
  }
};

const patchDialogs = () => {
  if (dialogsPatched || typeof window === "undefined") return;
  dialogsPatched = true;
  originalAlert = window.alert?.bind(window);
  originalConfirm = window.confirm?.bind(window);

  if (originalAlert) {
    window.alert = (message) => originalAlert(translateText(message, activeLanguage));
  }

  if (originalConfirm) {
    window.confirm = (message) => originalConfirm(translateText(message, activeLanguage));
  }
};

const ensureObserver = () => {
  if (observer || typeof MutationObserver === "undefined" || !document.body) return;

  observer = new MutationObserver((mutations) => {
    if (isApplyingTranslation) return;

    isApplyingTranslation = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
        } else if (mutation.type === "attributes") {
          translateElementAttributes(mutation.target);
        } else {
          mutation.addedNodes.forEach(translateTree);
        }
      }
    } finally {
      isApplyingTranslation = false;
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
    characterData: true,
    childList: true,
    subtree: true,
  });
};

export const applyLanguageToDocument = (lang) => {
  activeLanguage = normalizeLanguage(lang);

  if (typeof document === "undefined") return;

  const option = LANGUAGE_OPTIONS.find((item) => item.code === activeLanguage);
  document.documentElement.lang =
    SEO_METADATA[activeLanguage]?.htmlLang || option?.htmlLang || activeLanguage;
  updatePageMetadata(activeLanguage);

  patchDialogs();

  isApplyingTranslation = true;
  try {
    translateTree(document.body);
  } finally {
    isApplyingTranslation = false;
  }

  ensureObserver();
};
