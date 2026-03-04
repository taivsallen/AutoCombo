import React, { useEffect, useRef, useState, useCallback } from "react";

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
  onConfirm, // async ({ cropCanvas }) => void
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const boxRef = useRef(null);

  const rafRef = useRef(0);

  // ✅ 最後會 commit 到 state（用來顯示）
  const [cropRect, setCropRect] = useState({
    x: 20,
    y: 20,
    w: 240,
    h: 240 * ASPECT,
  });

  const getContainContentRect = (wrapW, wrapH, naturalW, naturalH) => {
	  const s = Math.min(wrapW / naturalW, wrapH / naturalH);
	  const drawW = naturalW * s;
	  const drawH = naturalH * s;
	  const drawX = (wrapW - drawW) / 2;
	  const drawY = (wrapH - drawH) / 2;
	  return { drawX, drawY, drawW, drawH, scale: s };
	};

  // ✅ 拖曳/縮放過程用 ref（不卡）
  const cropRectRef = useRef(cropRect);
  useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  // ====== 匯入狀態 ======
  const [importing, setImporting] = useState(false);

  // ====== pointer 狀態（支援兩指 pinch） ======
  const pointersRef = useRef(new Map()); // pointerId -> {x,y}
  const dragRef = useRef(null); // drag snapshot
  const resizeRef = useRef(null); // resize snapshot { corner, ... }

  // ✅ cache rects（pinch anchor 用）
  const rectCacheRef = useRef({ wrapRect: null, imgRect: null });

  // ✅ cache bounds（避免每 move layout）
  const boundsRef = useRef({ W: 0, H: 0 });
  const cacheBounds = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    boundsRef.current = { W: wrap.clientWidth, H: wrap.clientHeight };
  }, []);

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

  const fitRectIntoBounds = useCallback((r) => {
    const { W, H } = boundsRef.current;
    const minW = 120;

    if (!W || !H) return r;

    let w = clamp(r.w, minW, W);
    let h = w * ASPECT;

    if (h > H) {
      h = H;
      w = h / ASPECT;
    }

    const x = clamp(r.x, 0, W - w);
    const y = clamp(r.y, 0, H - h);
    return { x, y, w, h };
  }, []);

  const scheduleApply = useCallback(
    (r) => {
      cropRectRef.current = r;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        applyRectToDOM(cropRectRef.current);
      });
    },
    [applyRectToDOM]
  );

  // 初次打開時：給一個居中的裁切框（你要的：最寬+貼底）
  useEffect(() => {
    if (!open) return;

    const t = setTimeout(() => {
      cacheBounds();
      const { W, H } = boundsRef.current;
      if (!W || !H) return;

      let w = Math.min(W, H / ASPECT);
      let h = w * ASPECT;

      const x = (W - w) / 2;
      const y = H - h;

      const r = fitRectIntoBounds({ x, y, w, h });
      setCropRect(r);
      requestAnimationFrame(() => applyRectToDOM(r));
    }, 0);

    return () => clearTimeout(t);
  }, [open, cacheBounds, fitRectIntoBounds, applyRectToDOM]);

  // ====== 角落縮放（桌機/單指也可） ======
  const startResize = (corner) => (e) => {
    if (importing) return;

    e.preventDefault();
    e.stopPropagation();

    // ✅ 用 wrap 捕獲：手指離開框也能繼續 move/up
    wrapRef.current?.setPointerCapture?.(e.pointerId);

    cacheBounds();
    cacheRects();

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const r0 = cropRectRef.current;
    resizeRef.current = { id: e.pointerId, corner, x0: e.clientX, y0: e.clientY, r0 };
  };

  useEffect(() => {
	  if (!open) return;

	  const prevOverflow = document.body.style.overflow;
	  const prevTouchAction = document.body.style.touchAction;

	  document.body.style.overflow = "hidden";   // ✅ 禁止頁面滾動
	  document.body.style.touchAction = "none";  // ✅ iOS/Safari 也比較不會亂縮放

	  return () => {
		document.body.style.overflow = prevOverflow;
		document.body.style.touchAction = prevTouchAction;
	  };
	}, [open]);

  // ====== 拖曳裁切框（單指/滑鼠拖 box 本體） ======
  const onBoxPointerDown = (e) => {
	  if (importing) return;

	  e.preventDefault();
	  e.stopPropagation();

	  // ✅ 第二指不處理（拿掉兩指縮放）
	  if (pointersRef.current.size >= 1) return;

	  wrapRef.current?.setPointerCapture?.(e.pointerId);

	  cacheBounds();
	  cacheRects();

	  pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

	  const r0 = cropRectRef.current;
	  dragRef.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, r0 };
	};

  const onWrapPointerMove = useCallback(
    (e) => {
      if (!open || importing) return;

      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // 2) resize
      const rs = resizeRef.current;
      if (rs && rs.id === e.pointerId) {
        const { corner, x0, y0, r0 } = rs;
        const dx = e.clientX - x0;
        const dy = e.clientY - y0;

        const sgnX = corner === "br" || corner === "tr" ? 1 : -1;
        const sgnY = corner === "br" || corner === "bl" ? 1 : -1;
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
    },
    [open, importing, cacheBounds, cacheRects, fitRectIntoBounds, scheduleApply]
  );

  const endPointer = useCallback(
    (e) => {
      if (!open) return;

      pointersRef.current.delete(e.pointerId);

      if (dragRef.current?.id === e.pointerId) dragRef.current = null;
      if (resizeRef.current?.id === e.pointerId) resizeRef.current = null;

      // ✅ 只有全部手指都離開才 commit（避免 pinch 斷線/卡住）
      if (pointersRef.current.size === 0) {
        cacheBounds();
        const r = fitRectIntoBounds(cropRectRef.current);
        setCropRect(r);
        applyRectToDOM(r);
      }
    },
    [open, cacheBounds, fitRectIntoBounds, applyRectToDOM]
  );

  // ====== 把裁切框映射回原圖像素，生成 6x5 canvas ======
  const buildCropCanvas = () => {
	  const img = imgRef.current;
	  const wrap = wrapRef.current;
	  if (!img || !wrap) return null;

	  const wrapW = wrap.clientWidth;
	  const wrapH = wrap.clientHeight;

	  // ✅ 真正圖片內容在 wrap 裡的顯示矩形（去掉黑邊）
	  const { drawX, drawY, drawW, drawH } = getContainContentRect(
		wrapW,
		wrapH,
		img.naturalWidth,
		img.naturalHeight
	  );

	  const r = cropRectRef.current;

	  // ✅ 把裁切框（wrap 座標）轉到「圖片內容座標」(0..drawW/H)
	  const cx0 = r.x - drawX;
	  const cy0 = r.y - drawY;

	  // ✅ 夾在圖片內容內（避免框到黑邊）
	  const cx = clamp(cx0, 0, drawW);
	  const cy = clamp(cy0, 0, drawH);
	  const cw = clamp(r.w, 0, drawW - cx);
	  const ch = clamp(r.h, 0, drawH - cy);

	  // ✅ 回推到原圖像素
	  const sx = (cx / drawW) * img.naturalWidth;
	  const sy = (cy / drawH) * img.naturalHeight;
	  const sw = (cw / drawW) * img.naturalWidth;
	  const sh = (ch / drawH) * img.naturalHeight;

	  const cell = 64;
	  const canvas = document.createElement("canvas");
	  canvas.width = COLS * cell;
	  canvas.height = ROWS * cell;
	  const ctx = canvas.getContext("2d", { willReadFrequently: true });

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
      await onConfirm({ cropCanvas });
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur p-4 flex items-center justify-center">
      <div
        className="w-full max-w-2xl bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          <div
            ref={wrapRef}
            className="relative w-full aspect-[6/5] bg-black rounded-2xl overflow-hidden border border-white/10 touch-none"
            style={{
				touchAction: "none",            // ✅ 禁止瀏覽器手勢（滾動/縮放/回彈）
				overscrollBehavior: "contain",  // ✅ 防止滾動鏈到 body（Chrome/Android 很有效）
				WebkitUserSelect: "none",
				userSelect: "none",
			  }}
			onPointerDown={(e) => {
			  if (importing) return;

			  e.preventDefault();
			  e.stopPropagation();

			  // ✅ 若已經有一指在操作，第二指直接忽略（拿掉兩指縮放）
			  if (pointersRef.current.size >= 1) return;

			  wrapRef.current?.setPointerCapture?.(e.pointerId);
			  pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

			  cacheBounds();
			  cacheRects();
			}}
            onPointerMove={onWrapPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            {/* ✅ 你漏掉的 img 在這裡 */}
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
              onLoad={() => {
                cacheBounds();
                requestAnimationFrame(() => applyRectToDOM(cropRectRef.current));
              }}
            />

            {/* 裁切框 */}
            <div
              ref={boxRef}
              className="absolute left-0 top-0 rounded-xl border-2 border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.35)] touch-none will-change-transform"
              style={{ ...rectToStyle(cropRect), touchAction: "none" }}
              onPointerDown={onBoxPointerDown}
			  onPointerMove={onWrapPointerMove}
			  onPointerUp={endPointer}
			  onPointerCancel={endPointer}
            >
              {["tl", "tr", "bl", "br"].map((corner) => (
                <div
                  key={corner}
                  onPointerDown={startResize(corner)}
                  className={[
                    "absolute w-4 h-4 bg-fuchsia-400 rounded-[6px] border border-black/40 touch-none",
                    corner === "tl" ? "left-[-8px] top-[-8px] cursor-nwse-resize" : "",
                    corner === "tr" ? "right-[-8px] top-[-8px] cursor-nesw-resize" : "",
                    corner === "bl" ? "left-[-8px] bottom-[-8px] cursor-nesw-resize" : "",
                    corner === "br" ? "right-[-8px] bottom-[-8px] cursor-nwse-resize" : "",
                  ].join(" ")}
                />
              ))}

              <div className="absolute left-2 top-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-black">
                兩指縮放 / 拖曳移動
              </div>
            </div>

            {importing && (
              <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <div className="mt-3 text-white font-black">版面匯入中...</div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={onCancel}
            disabled={importing}
            className="px-6 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 font-black disabled:opacity-30"
          >
            取消
          </button>

          <button
            onClick={onOk}
            disabled={importing}
            className="px-8 py-3 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 font-black shadow-xl disabled:opacity-30"
          >
            確定並偵測
          </button>
        </div>
      </div>
    </div>
  );
}