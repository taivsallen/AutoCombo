import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import wImg from "./assets/w.png";
import fImg from "./assets/f.png";
import pImg from "./assets/p.png";
import lImg from "./assets/l.png";
import dImg from "./assets/d.png";
import hImg from "./assets/h.png";

import {
  ACTIVE_SKILL_TEMPLATE_DATA,
  ATTRIBUTE_OPTIONS,
  RACE_OPTIONS,
} from "./activeSkillTemplateData";

const TEMPLATE_ORB_IMG = {
  w: wImg,
  f: fImg,
  p: pImg,
  l: lImg,
  d: dImg,
  h: hImg,
};

function TemplateBoardPreview({ board }) {
  return (
    <div className="rounded-2xl bg-neutral-900/80 border border-white/5 p-1.5">
      <div className="grid grid-cols-6 gap-0.5">
        {board.map((orb, idx) => (
          <div
            key={idx}
            className="
              relative w-full aspect-square rounded-lg
              bg-black/20 flex items-center justify-center overflow-hidden
            "
          >
            <img
              src={TEMPLATE_ORB_IMG[orb]}
              alt={orb}
              draggable={false}
              className="w-full h-full object-contain pointer-events-none select-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActiveSkillTemplateModal({
  open,
  onClose,
  onSelectTemplate,
}) {
  const [search, setSearch] = useState("");
  const [attribute, setAttribute] = useState("all");
  const [race, setRace] = useState("all");
  
  const [showSearchBox, setShowSearchBox] = useState(false);
const [showFilterPanel, setShowFilterPanel] = useState(false);

  const filteredTemplates = useMemo(() => {
    return ACTIVE_SKILL_TEMPLATE_DATA.filter((item) => {
      const matchSearch =
        !search.trim() ||
        item.characterName.toLowerCase().includes(search.trim().toLowerCase());

      const matchAttribute =
        attribute === "all" || item.attribute === attribute;

      const matchRace = race === "all" || item.race === race;

      return matchSearch && matchAttribute && matchRace;
    });
  }, [search, attribute, race]);

const getAttributeLabel = (value) =>
  ATTRIBUTE_OPTIONS.find((opt) => opt.value === value)?.label ?? "屬性";

const getRaceLabel = (value) =>
  RACE_OPTIONS.find((opt) => opt.value === value)?.label ?? "種族";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5000] bg-black/80 p-4 flex items-start md:items-center justify-center">
      <div className="w-full max-w-5xl max-h-[90vh] bg-neutral-900 rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-black text-purple-300">主動技固版</div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold transition-all"
          >
            關閉
          </button>
        </div>

        <>
  {/* 手機版：App 風格工具列 */}
  <div className="md:hidden px-4 pt-3 pb-3 border-b border-neutral-800">
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setShowSearchBox((v) => !v)}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-bold"
      >
        <Search size={16} />
        搜尋
        {showSearchBox ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <button
        type="button"
        onClick={() => setShowFilterPanel((v) => !v)}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-bold"
      >
        <SlidersHorizontal size={16} />
        篩選
        {showFilterPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>

    {showSearchBox && (
      <div className="mt-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋角色名稱..."
          className="w-full px-4 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500 outline-none text-[16px]"
        />
      </div>
    )}

    {showFilterPanel && (
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-2 text-xs font-black tracking-widest text-neutral-500">
            屬性
          </div>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAttribute(opt.value)}
                className={[
                  "px-3 py-2 rounded-xl text-sm font-black border transition-all",
                  attribute === opt.value
                    ? "bg-fuchsia-600 text-white border-fuchsia-400/30"
                    : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-black tracking-widest text-neutral-500">
            種族
          </div>
          <div className="flex flex-wrap gap-2">
            {RACE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRace(opt.value)}
                className={[
                  "px-3 py-2 rounded-xl text-sm font-black border transition-all",
                  race === opt.value
                    ? "bg-indigo-600 text-white border-indigo-400/30"
                    : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>

  {/* 桌機版：維持展開 */}
  <div className="hidden md:grid p-4 border-b border-neutral-800 grid-cols-3 gap-3">
  <input
    type="search"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="搜尋角色名稱..."
    className="px-4 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500 outline-none text-[16px]"
  />

  <select
    value={attribute}
    onChange={(e) => setAttribute(e.target.value)}
    className="px-4 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white outline-none text-[16px]"
  >
    {ATTRIBUTE_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>

  <select
    value={race}
    onChange={(e) => setRace(e.target.value)}
    className="px-4 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white outline-none text-[16px]"
  >
    {RACE_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
</div>
</>

        {/* list */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.length === 0 ? (
            <div className="col-span-full py-16 text-center text-neutral-500 font-bold">
              找不到符合條件的固版
            </div>
          ) : (
            filteredTemplates.map((item) => (
  <button
    key={item.id}
    type="button"
    onClick={() => {
      onSelectTemplate(item);
      onClose();
    }}
    className="
      group w-full text-left rounded-3xl
      bg-gradient-to-b from-neutral-800 to-neutral-900
      border border-white/10
      p-3 transition-all duration-200
      shadow-[0_10px_30px_rgba(0,0,0,0.28)]
      hover:-translate-y-0.5 hover:border-fuchsia-400/30
      hover:shadow-[0_14px_36px_rgba(168,85,247,0.16)]
      active:scale-[0.985]
    "
  >
    {/* 上半部 */}
    <div className="flex gap-3 items-start mb-3">
      {/* 角色縮圖 */}
      <div
        className="
          w-20 h-20 shrink-0 rounded-sm
          bg-neutral-950/90 border border-white/10
          overflow-hidden flex items-center justify-center
          shadow-inner
        "
      >
        <img
          src={item.characterImg}
          alt={item.characterName}
          draggable={false}
          className="w-full h-full object-contain"
        />
      </div>

      {/* 名稱 / note */}
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <div
          className="
            rounded-2xl px-3 py-2
            bg-fuchsia-500/10 border border-fuchsia-400/20
          "
        >
          <div className="text-sm md:text-[15px] font-black text-white leading-tight break-words line-clamp-2">
            {item.characterName}
          </div>
        </div>

        <div
          className="
            min-h-[44px] rounded-2xl px-3 py-2
            bg-neutral-950/70 border border-white/8
            flex items-center
          "
        >
          <span className="text-xs md:text-sm font-bold text-neutral-400 leading-tight break-words line-clamp-2">
            {item.note?.trim() ? item.note : "-"}
          </span>
        </div>
      </div>
    </div>

    {/* 固版區 */}
    <div
      className="
        rounded-2xl p-2.5
        bg-neutral-950/75 border border-white/10
        group-hover:border-fuchsia-400/20
        transition-all
      "
    >
      <TemplateBoardPreview board={item.board} />
    </div>
  </button>
))
			)}
        </div>
      </div>
    </div>
  );
}

export const TEMPLATE_CHAR_TO_ORB_ID = {
  w: 0,
  f: 1,
  p: 2,
  l: 3,
  d: 4,
  h: 5,
};

export function convertTemplateBoardToEditorBoard(board) {
  if (!Array.isArray(board) || board.length !== 30) {
    throw new Error("template board 格式錯誤，必須是長度 30 的陣列");
  }

  return board.map((ch) => {
    const orbId = TEMPLATE_CHAR_TO_ORB_ID[ch];
    if (orbId === undefined) {
      throw new Error(`未知的模板符石字元: ${ch}`);
    }
    return orbId;
  });
}

export function convertTemplateBoardTo2D(board, rows = 5, cols = 6) {
  const flat = convertTemplateBoardToEditorBoard(board);

  const out = [];
  for (let r = 0; r < rows; r++) {
    out.push(flat.slice(r * cols, (r + 1) * cols));
  }
  return out;
}