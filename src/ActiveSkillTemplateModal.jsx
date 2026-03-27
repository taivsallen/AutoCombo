import { useMemo, useState, useRef, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import wImg from "./assets/w.png";
import fImg from "./assets/f.png";
import pImg from "./assets/p.png";
import lImg from "./assets/l.png";
import dImg from "./assets/d.png";
import hImg from "./assets/h.png";
import xImg from "./assets/x.png";

import {
  ACTIVE_SKILL_TEMPLATE_DATA,
  ATTRIBUTE_OPTIONS,
  RACE_OPTIONS,
} from "./activeSkillTemplateData.jsx";

const ATTRIBUTE_PICKER_OPTIONS = [
  { value: "w", label: "水", img: wImg },
  { value: "f", label: "火", img: fImg },
  { value: "p", label: "木", img: pImg },
  { value: "l", label: "光", img: lImg },
  { value: "d", label: "暗", img: dImg },
  { value: "h", label: "心", img: hImg }
];

const TEMPLATE_ORB_IMG = {
  w: wImg,
  f: fImg,
  p: pImg,
  l: lImg,
  d: dImg,
  h: hImg,
  x: xImg,
};

const RACE_IMG = {
  human: "./race/human.png",
  god: "./race/god.png",
  demon: "./race/demon.png",
  beast: "./race/beast.png",
  dragon: "./race/dragon.png",
  machina: "./race/machina.png",
  elf: "./race/elf.png",
};

function getColumnCount() {
  if (typeof window === "undefined") return 1;
  if (window.innerWidth >= 1280) return 3; // xl
  if (window.innerWidth >= 640) return 2;  // sm
  return 1;
}

const TemplateBoardPreview = memo(function TemplateBoardPreview({ board }) {
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
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain pointer-events-none select-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
});

function TemplateCard({
  item,
  selected,
  onClick,
}) {
  const typeBadgeClass =
    item.type === "active"
      ? "text-yellow-300 border-yellow-400/40 bg-yellow-500/10"
      : item.type === "team"
      ? "text-red-300 border-red-400/40 bg-red-500/10"
      : "text-neutral-300 border-white/10 bg-white/5";

  const typeBadgeText =
    item.type === "active"
      ? "主動技"
      : item.type === "team"
      ? "隊伍技"
      : "-";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        `
        relative
        group w-full text-left rounded-3xl
        bg-neutral-800
        border p-3 transition-all duration-200
        shadow-lg
        `,
        selected
          ? "border-white ring-2 ring-white/90 bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_0_24px_rgba(255,255,255,0.10)]"
          : "border-white/10 hover:border-fuchsia-400/30",
      ].join(" ")}
    >
      {selected && (
        <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-lg bg-white text-black text-[11px] font-black shadow">
          已選取
        </div>
      )}

      <div className="flex gap-3 items-start mb-3">
        <div className="flex flex-col items-center shrink-0 gap-2">
          <div
            className="
              relative
              w-16 h-16 shrink-0 rounded-sm
              bg-neutral-950/90 border border-white/10
              overflow-hidden flex items-center justify-center
              shadow-inner
            "
          >
            <img
              src={item.characterImg}
              alt={item.characterName}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain"
            />

            <img
              src={RACE_IMG[item.race]}
              alt={item.race}
              loading="lazy"
              decoding="async"
              className="
                absolute bottom-0 right-0
                w-5 h-5 object-contain
                drop-shadow-md
                pointer-events-none
              "
            />
          </div>

          <div
            className={[
              "px-2 py-1 rounded-lg text-[11px] font-black border leading-none whitespace-nowrap",
              typeBadgeClass,
            ].join(" ")}
          >
            {typeBadgeText}
          </div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="rounded-2xl px-3 py-2 bg-fuchsia-500/10 border border-fuchsia-400/20">
            <div className="text-base md:text-lg font-black text-white leading-tight break-words line-clamp-2">
              {item.characterName}
            </div>
          </div>

          <div className="min-h-[44px] rounded-2xl px-3 py-2 bg-neutral-950/70 border border-white/8 flex items-center">
            <span className="text-sm md:text-base text-neutral-400 leading-tight break-words line-clamp-2">
              {item.note?.trim() ? item.note : "-"}
            </span>
          </div>
        </div>
      </div>

      <div
        className={[
          "rounded-2xl p-2.5 border transition-all duration-200",
          selected
            ? "bg-white/10 border-white/40"
            : "bg-neutral-950/75 border-white/10 group-hover:border-fuchsia-400/20",
        ].join(" ")}
      >
        <TemplateBoardPreview board={item.board} />
      </div>
    </button>
  );
}

export default function ActiveSkillTemplateModal({
  open,
  onClose,
  onSelectTemplate,
}) {
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [showAttributePicker, setShowAttributePicker] = useState(false);
  const [search, setSearch] = useState("");
  const [attribute, setAttribute] = useState("all");
  const [race, setRace] = useState("all");
  const [skillType, setSkillType] = useState("all");
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const [columnCount, setColumnCount] = useState(() => getColumnCount());

  const parentRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      setColumnCount(getColumnCount());
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const filteredTemplates = useMemo(() => {
  const q = search.trim().toLowerCase();

  return ACTIVE_SKILL_TEMPLATE_DATA.filter((item) => {
    const matchSearch =
      !q || item.characterName.toLowerCase().includes(q);

    const matchAttribute =
      attribute === "all" || item.attribute === attribute;

    const matchRace =
      race === "all" || item.race === race;

    const matchSkillType =
      skillType === "all" || item.type === skillType;

    return matchSearch && matchAttribute && matchRace && matchSkillType;
  });
}, [search, attribute, race, skillType]);
  
  const rows = useMemo(() => {
    const result = [];
    for (let i = 0; i < filteredTemplates.length; i += columnCount) {
      result.push(filteredTemplates.slice(i, i + columnCount));
    }
    return result;
  }, [filteredTemplates, columnCount]);

  const overscanRows = Math.max(4, Math.ceil(40 / columnCount));

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: overscanRows,
    getItemKey: (index) => {
      const first = rows[index]?.[0];
      return first ? `row-${first.id}` : `row-${index}`;
    },
  });

  useEffect(() => {
  if (!open) return;

  if (parentRef.current) {
    parentRef.current.scrollTop = 0;
  }

  rowVirtualizer.scrollToIndex(0, { align: "start" });
}, [search, attribute, race, skillType, open, rowVirtualizer]);
  
  useEffect(() => {
  rowVirtualizer.measure();
}, [columnCount, rows.length, rowVirtualizer]);
  
const handleTemplateConfirm = (item) => {
  const hasX = Array.isArray(item.board) && item.board.includes("x");

  if (hasX) {
    setPendingTemplate(item);
    setShowAttributePicker(true);
    return;
  }

  onSelectTemplate(item);
  onClose();
};

const handleResolveXAttribute = (attributeValue) => {
  if (!pendingTemplate) return;

  onSelectTemplate({
    ...pendingTemplate,
    resolvedAttribute: attributeValue,
  });

  setShowAttributePicker(false);
  setPendingTemplate(null);
  onClose();
};

const handleCloseAttributePicker = () => {
  setShowAttributePicker(false);
  setPendingTemplate(null);
};

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5000] bg-black/80 p-4 flex items-start md:items-center justify-center">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-neutral-900 rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* header */}
        <div className="p-4 border-b border-neutral-800 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0 md:flex-1">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setShowSearchBox((v) => !v)}
                className="md:hidden flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-bold shrink-0"
              >
                <Search size={16} />
                搜尋
                {showSearchBox ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              <div className="hidden md:block w-full min-w-0">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋角色名稱..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500 outline-none text-[16px]"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowFilterPanel((v) => !v)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-neutral-800 border border-neutral-700 text-white font-bold shrink-0"
              >
                <SlidersHorizontal size={16} />
                篩選
                {showFilterPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            <div className="text-xs text-neutral-400 font-semibold ml-1">
              共有 {filteredTemplates.length} 個搜尋結果
            </div>
          </div>

          <div className="shrink-0 pt-0">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all"
            >
              關閉
            </button>
          </div>
        </div>

        {(showSearchBox || showFilterPanel) && (
          <div className="px-4 pt-3 pb-3 border-b border-neutral-800 space-y-3">
            {showFilterPanel && (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {/* 屬性 */}
    <div className="min-w-0">
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
              "px-3 py-2 rounded-xl text-sm font-black border transition-all whitespace-nowrap",
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

    {/* 種族 */}
    <div className="min-w-0">
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
              "px-3 py-2 rounded-xl text-sm font-black border transition-all whitespace-nowrap",
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

    {/* 技能 */}
    <div className="min-w-0">
      <div className="mb-2 text-xs font-black tracking-widest text-neutral-500">
        技能
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "全部" },
          { value: "team", label: "隊伍技" },
          { value: "active", label: "主動技" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSkillType(opt.value)}
            className={[
              "px-3 py-2 rounded-xl text-sm font-black border transition-all whitespace-nowrap",
              skillType === opt.value
                ? opt.value === "active"
                  ? "bg-yellow-500/20 text-yellow-300 border-yellow-400/40"
                  : opt.value === "team"
                  ? "bg-red-500/20 text-red-300 border-red-400/40"
                  : "bg-cyan-500/20 text-cyan-300 border-cyan-400/40"
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
			
            {showSearchBox && (
              <div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋角色名稱..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500 outline-none text-[16px]"
                />
              </div>
            )}
          </div>
        )}

        {/* list */}
        <div ref={parentRef} className="flex-1 overflow-y-auto p-4">
          {filteredTemplates.length === 0 ? (
            <div className="py-16 text-center text-neutral-500 font-bold">
              找不到符合條件的固版
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowItems = rows[virtualRow.index] || [];

                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className={`grid gap-4 ${
                        columnCount === 1
                          ? "grid-cols-1"
                          : columnCount === 2
                          ? "grid-cols-2"
                          : "grid-cols-3"
                      }`}
                    >
                      {rowItems.map((item) => (
                        <TemplateCard
                          key={item.id}
                          item={item}
                          selected={selectedTemplateId === item.id}
                          onClick={() => {
							  if (selectedTemplateId === item.id) {
								setSelectedTemplateId(null);
								handleTemplateConfirm(item);
								return;
							  }

							  setSelectedTemplateId(item.id);
							}}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
		        {showAttributePicker && pendingTemplate && (
          <div className="absolute inset-0 z-[5200] bg-black/75 flex items-center justify-center">
            <div className="bg-neutral-900 rounded-3xl p-6 border border-white/10 shadow-2xl w-full max-w-md">
              
              <div className="text-lg font-black text-white text-center mb-4">
                {pendingTemplate.follow
                  ? `【${pendingTemplate.follow}】`
                  : "【選取屬性】"}
              </div>

             <div className="grid grid-cols-3 gap-3">
  {ATTRIBUTE_PICKER_OPTIONS.map((opt) => (
    <button
      key={opt.value}
      onClick={() => handleResolveXAttribute(opt.value)}
      className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 flex flex-col items-center"
    >
      <img src={opt.img} className="w-10 h-10" />
      <span className="text-xs mt-1 text-white font-bold">
        {opt.label}
      </span>
    </button>
  ))}
</div>

              <button
                onClick={handleCloseAttributePicker}
                className="mt-4 w-full py-2 rounded-xl bg-neutral-700 text-white font-bold"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}