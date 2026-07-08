export const SITE_BASE_PATH = "/AutoCombo";

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

export const HTML_ALTERNATES = [
  ["zh-Hant", SEO_METADATA.zh.url],
  ["en", SEO_METADATA.en.url],
  ["ja", SEO_METADATA.ja.url],
  ["x-default", SEO_METADATA.en.url],
];
