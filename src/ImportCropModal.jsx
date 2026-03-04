import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

const ROWS = 5;
const COLS = 6;
const ASPECT = ROWS / COLS; // height / width = 5/6

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rectToStyle(r) {
  return {
    transform: `translate3d(${r.x}px, ${r.y}px, 0)`,
    width: `${r.w}px`,
    height: `${r.h}px`,
  };
}

export default function ImportCropModal({
  open,
  imgUrl,
  onCancel,
  onConfirm, // async (cropInfo) => void
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const boxRef = useRef(null);

  const rafRef = useRef(0);

  // ✅ 最後會 commit 到 state（用來顯示）
  const [cropRect, setCropRect] = useState({ x: 20, y: 20, w: 240, h: 240 * ASPECT });

  // ✅ 拖曳/縮放過程用 ref（不卡）
  const cropRectRef = useRef(cropRect);
  useEffect(() => { cropRectRef.current = cropRect; }, [cropRect]);

  // ====== 匯入狀態 ======
  const [importing, setImporting] = useState(false);

  // ====== pointer 狀態（支援兩指 pinch） ======
  const pointersRef = useRef(new Map()); // pointerId -> {x,y}
  const gestureRef = useRef(null); // pinch init snapshot

  const dragRef = useRef(null); // drag snapshot
  const resizeRef = useRef(null); // resize snapshot { corner, ... }
  
    // ✅ ADD: cache rects to avoid getBoundingClientRect every move
  const rectCacheRef = useRef({ wrapRect: null, imgRect: null });
  
  const winListeningRef = useRef(false);
  const moveFnRef = useRef(null);
  const endFnRef = useRef(null);

	// 這兩個 handler 是固定的（不會變動），只透過 ref 呼叫最新的邏輯
  const onWinMove = useCallback((e) => moveFnRef.current?.(e), []);
  const onWinUp = useCallback((e) => endFnRef.current?.(e), []);

  const attachWin = useCallback(() => {
	  if (winListeningRef.current) return;
	  winListeningRef.current = true;
	  window.addEventListener("pointermove", onWinMove, { passive: false });
	  window.addEventListener("pointerup", onWinUp, { passive: false });
	  window.addEventListener("pointercancel", onWinUp, { passive: false });
	}, [onWinMove, onWinUp]);

  const detachWin = useCallback(() => {
	  if (!winListeningRef.current) return;
	  winListeningRef.current = false;
	  window.removeEventListener("pointermove", onWinMove);
	  window.removeEventListener("pointerup", onWinUp);
	  window.removeEventListener("pointercancel", onWinUp);
	}, [onWinMove, onWinUp]);
  

  const cacheRects = useCallback(() => {
	const wrapRect = wrapRef.current?.getBoundingClientRect() || null;
	const imgRect = imgRef.current?.getBoundingClientRect() || null;
	rectCacheRef.current = { wrapRect, imgRect };
	}, []);

  const applyRectToDOM = useCallback((r) => {
	  const el = boxRef.current;
	  if (!el) return;
	  el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
	  el.style.width = `${r.w}px`;
	  el.style.height = `${r.h}px`;
	}, []);

  const scheduleApply = useCallback((r) => {
    cropRectRef.current = r;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyRectToDOM(cropRectRef.current);
    });
  }, [applyRectToDOM]);

  const getBounds = () => {
    const wrap = wrapRef.current;
    if (!wrap) return { W: 0, H: 0 };
    return { W: wrap.clientWidth, H: wrap.clientHeight };
  };

  const fitRectIntoBounds = (r) => {
    const { W, H } = getBounds();
    const minW = 120;
    let w = clamp(r.w, minW, W);
    let h = w * ASPECT;
    if (h > H) {
      h = H;
      w = h / ASPECT;
    }
    let x = clamp(r.x, 0, W - w);
    let y = clamp(r.y, 0, H - h);
    return { x, y, w, h };
  };

  // 初次打開時：給一個居中的裁切框
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const { W, H } = getBounds();
      if (!W || !H) return;
      // 取一個盡量大的 5:6
      // ✅ 預設：圖片最寬 + 貼底
		let w = Math.min(W, H / ASPECT);
		let h = w * ASPECT;

		const x = (W - w) / 2; // 置中
		const y = H - h;       // 貼底
      const r = fitRectIntoBounds({ x, y, w, h });
      setCropRect(r);
      // 同步 DOM（避免第一幀閃）
      requestAnimationFrame(() => applyRectToDOM(r));
    }, 0);
    return () => clearTimeout(t);
  }, [open, applyRectToDOM]);



  // ====== 拉角縮放（桌機/單指也可） ======
  const startResize = (corner) => (e) => {
    if (importing) return;
	
	attachWin();
    e.preventDefault();
    e.stopPropagation();
    boxRef.current?.setPointerCapture?.(e.pointerId);

	// ✅ ADD
    cacheRects();

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const r0 = cropRectRef.current;
    resizeRef.current = {
      id: e.pointerId,
      corner, // "tl" | "tr" | "bl" | "br"
      x0: e.clientX,
      y0: e.clientY,
      r0,
    };
  };

  const onWrapPointerMove = useCallback((e) => {
	  if (!open || importing) return;

	  if (pointersRef.current.has(e.pointerId)) {
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
	  }

	  // 1) pinch
	  if (pointersRef.current.size >= 2) {
		
		const pts = Array.from(pointersRef.current.values());
		const pA = pts[0], pB = pts[1];
		const cx = (pA.x + pB.x) / 2;
		const cy = (pA.y + pB.y) / 2;
		const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);

		if (!gestureRef.current) {
		  cacheRects();
		  const r0 = cropRectRef.current;
		  gestureRef.current = { dist0: dist, r0 };
		  return;
		}

		const g = gestureRef.current;
		const ratio = dist / Math.max(1, g.dist0);

		const wrapRect = rectCacheRef.current.wrapRect;
		if (!wrapRect) return;

		const ax = cx - wrapRect.left;
		const ay = cy - wrapRect.top;

		const rBase = g.r0;
		const w1 = rBase.w * ratio;
		const h1 = w1 * ASPECT;

		const x1 = ax - (ax - rBase.x) * ratio;
		const y1 = ay - (ay - rBase.y) * ratio;

		const r1 = fitRectIntoBounds({ x: x1, y: y1, w: w1, h: h1 });
		scheduleApply(r1);
		return;
	  } else {
		gestureRef.current = null;
	  }

	  // 2) resize
	  const rs = resizeRef.current;
	  if (rs && rs.id === e.pointerId) {
		const { corner, x0, y0, r0 } = rs;
		const dx = e.clientX - x0;
		const dy = e.clientY - y0;

		const sgnX = (corner === "br" || corner === "tr") ? 1 : -1;
		const sgnY = (corner === "br" || corner === "bl") ? 1 : -1;
		const major = Math.abs(dx) > Math.abs(dy) ? dx * sgnX : dy * sgnY;

		let w1 = Math.max(120, r0.w + major);
		let h1 = w1 * ASPECT;

		let x1 = r0.x;
		let y1 = r0.y;

		if (corner === "tr") y1 = r0.y + (r0.h - h1);
		if (corner === "bl") x1 = r0.x + (r0.w - w1);
		if (corner === "tl") {
		  x1 = r0.x + (r0.w - w1);
		  y1 = r0.y + (r0.h - h1);
		}

		const r1 = fitRectIntoBounds({ x: x1, y: y1, w: w1, h: h1 });
		scheduleApply(r1);
		return;
	  }

	  // 3) drag
	  const dr = dragRef.current;
	  if (dr && dr.id === e.pointerId) {
		const dx = e.clientX - dr.x0;
		const dy = e.clientY - dr.y0;
		const r0 = dr.r0;
		const r1 = fitRectIntoBounds({ ...r0, x: r0.x + dx, y: r0.y + dy });
		scheduleApply(r1);
	  }
	}, [open, importing, scheduleApply, fitRectIntoBounds, cacheRects]);

  // ====== 拖曳裁切框（單指/滑鼠拖 box 本體） ======
  const onBoxPointerDown = (e) => {
    if (importing) return;
	
	attachWin();
    e.preventDefault();
    e.stopPropagation();
    boxRef.current?.setPointerCapture?.(e.pointerId);

	// ✅ ADD
    cacheRects();

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 若此時已經有兩指 → 交給 pinch
    if (pointersRef.current.size >= 2) return;

    const r0 = cropRectRef.current;
    dragRef.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      r0,
    };
  };

  useEffect(() => { moveFnRef.current = onWrapPointerMove; }, [onWrapPointerMove]);
  

  const endPointer = (e) => {
    if (!open) return;

    pointersRef.current.delete(e.pointerId);

    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
    if (resizeRef.current?.id === e.pointerId) resizeRef.current = null;

    if (pointersRef.current.size < 2) gestureRef.current = null;

    // ✅ 結束時 commit 一次 state（UI 正式記錄）
    const r = fitRectIntoBounds(cropRectRef.current);
    setCropRect(r);
    applyRectToDOM(r);
	detachWin();
  };

  useEffect(() => { endFnRef.current = endPointer; }, [endPointer]);

  // ====== 把裁切框映射回原圖像素，生成 6x5 canvas ======
  const buildCropCanvas = () => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return null;

    const wrapRect = wrap.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // cropRect 是以 wrap 內座標（px）表示
    const r = cropRectRef.current;

    // 把 cropRect 對應到「img 顯示區」座標
    // 注意：img 可能用 object-contain，會有 letterbox；所以用 imgRect 直接算縮放
    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;

    // crop 左上在 viewport 的位置：
    const cropLeftVp = wrapRect.left + r.x;
    const cropTopVp  = wrapRect.top + r.y;

    // 轉成相對 img 左上（viewport）
    const sx = (cropLeftVp - imgRect.left) * scaleX;
    const sy = (cropTopVp - imgRect.top) * scaleY;
    const sw = r.w * scaleX;
    const sh = r.h * scaleY;

    // ✅ 生成固定大小 canvas（每格 64px，你也可改 80/96）
    const cell = 64;
    const canvas = document.createElement("canvas");
    canvas.width = COLS * cell;
    canvas.height = ROWS * cell;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // 直接把裁切區 draw 到固定大小（等比縮放到 6*5）
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    return canvas;
  };

  const onOk = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const cropCanvas = buildCropCanvas();
      if (!cropCanvas) return;

      // 交給外層做 detect + setEditingBoard
      await onConfirm({ cropCanvas });
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl"
           onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          {/* ✅ 圖片固定，不做任何遮罩變暗 */}
          <div ref={wrapRef} className="relative w-full aspect-[6/5] bg-black rounded-2xl overflow-hidden border border-white/10 touch-none">
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
              onLoad={() => {
                // 確保 DOM 同步一次
                requestAnimationFrame(() => applyRectToDOM(cropRectRef.current));
              }}
            />

            {/* 裁切框 */}
            <div
              ref={boxRef}
              className="absolute left-0 top-0 rounded-xl border-2 border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.35)] touch-none will-change-transform"
              style={rectToStyle(cropRect)}
              onPointerDown={onBoxPointerDown}
            >
              {/* 角落 handles（桌機拉） */}
              {["tl","tr","bl","br"].map((corner) => (
                <div
                  key={corner}
                  onPointerDown={startResize(corner)}
                  className={[
                    "absolute w-4 h-4 bg-fuchsia-400 rounded-[6px] border border-black/40 touch-none",
                    corner==="tl" ? "left-[-8px] top-[-8px] cursor-nwse-resize" : "",
                    corner==="tr" ? "right-[-8px] top-[-8px] cursor-nesw-resize" : "",
                    corner==="bl" ? "left-[-8px] bottom-[-8px] cursor-nesw-resize" : "",
                    corner==="br" ? "right-[-8px] bottom-[-8px] cursor-nwse-resize" : "",
                  ].join(" ")}
                />
              ))}

              {/* ✅ 內部提示（不遮暗原圖） */}
              <div className="absolute left-2 top-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-black">
                兩指縮放 / 拖曳移動
              </div>
            </div>

            {/* 匯入中遮罩（只有偵測時才出現） */}
            {importing && (
              <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <div className="mt-3 text-white font-black">版面匯入中...</div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-between">
          <button onClick={onCancel} disabled={importing}
                  className="px-6 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 font-black disabled:opacity-30">
            取消
          </button>

          <button onClick={onOk} disabled={importing}
                  className="px-8 py-3 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 font-black shadow-xl disabled:opacity-30">
            確定並偵測
          </button>
        </div>
      </div>
    </div>
  );
}