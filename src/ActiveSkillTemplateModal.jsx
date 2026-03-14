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

import {
  ACTIVE_SKILL_TEMPLATE_DATA,
  ATTRIBUTE_OPTIONS,
  RACE_OPTIONS,
} from "./activeSkillTemplateData.jsx";

const TEMPLATE_ORB_IMG = {
  w: wImg,
  f: fImg,
  p: pImg,
  l: lImg,
  d: dImg,
  h: hImg,
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
        <div
          className="
            relative
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
              w-6 h-6 object-contain
              drop-shadow-md
              pointer-events-none
            "
          />
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
  const [search, setSearch] = useState("");
  const [attribute, setAttribute] = useState("all");
  const [race, setRace] = useState("all");
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

      return matchSearch && matchAttribute && matchRace;
    });
  }, [search, attribute, race]);

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
  }, [search, attribute, race, open, rowVirtualizer]);

  useEffect(() => {
    rowVirtualizer.measure();
  }, [columnCount, rows.length, showSearchBox, showFilterPanel, rowVirtualizer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[5000] bg-black/80 p-4 flex items-start md:items-center justify-center">
      <div className="w-full max-w-5xl max-h-[90vh] bg-neutral-900 rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
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
              <div className="space-y-3">
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
                              onSelectTemplate(item);
                              onClose();
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
      </div>
    </div>
  );
}