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

  const contentRectRef = useRef({ drawX: 0, drawY: 0, drawW: 0, drawH: 0 });

  const cacheContentRect = useCallback(() => {
	  const wrap = wrapRef.current;
	  const img = imgRef.current;
	  if (!wrap || !img || !img.naturalWidth || !img.naturalHeight) return;

	  const { drawX, drawY, drawW, drawH } = getContainContentRect(
		wrap.clientWidth,
		wrap.clientHeight,
		img.naturalWidth,
		img.naturalHeight
	  );
	  contentRectRef.current = { drawX, drawY, drawW, drawH };
	}, []);
  
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

  // ====== pointer 狀態 ======
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
	  cacheContentRect(); // ✅ 加這行
	}, [cacheContentRect]);

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
	  if (!W || !H) return r;

	  const minW = 120;

	  // ✅ 用圖片內容矩形當邊界（不是 wrap）
	  const { drawX, drawY, drawW, drawH } = contentRectRef.current;

	  // 如果圖片還沒 load，退回用 wrap 夾（保底）
	  const bx = drawW ? drawX : 0;
	  const by = drawH ? drawY : 0;
	  const bW = drawW ? drawW : W;
	  const bH = drawH ? drawH : H;

	  // 1) 尺寸先夾在內容邊界內
	  let w = clamp(r.w, minW, bW);
	  let h = w * ASPECT;

	  if (h > bH) {
		h = bH;
		w = h / ASPECT;
	  }

	  // 2) 位置夾在內容邊界內
	  const x = clamp(r.x, bx, bx + bW - w);
	  const y = clamp(r.y, by, by + bH - h);

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

  // 在圖片像素座標中，快速抓出「非黑邊內容」的 bounding box
  const detectContentBounds = (imgEl) => {
	  const natW = imgEl.naturalWidth;
	  const natH = imgEl.naturalHeight;

	  // 縮小掃描，超快
	  const targetW = Math.min(420, natW);
	  const s = targetW / natW;
	  const W = Math.max(1, Math.round(natW * s));
	  const H = Math.max(1, Math.round(natH * s));

	  const c = document.createElement("canvas");
	  c.width = W;
	  c.height = H;
	  const ctx = c.getContext("2d", { willReadFrequently: true });
	  ctx.drawImage(imgEl, 0, 0, W, H);
	  const { data } = ctx.getImageData(0, 0, W, H);

	  // 判斷「黑邊」：亮度太低視為黑
	  const lum = (i) => {
		const r = data[i], g = data[i + 1], b = data[i + 2];
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	  };

	  const TH = 18;       // 亮度門檻：越大越不會吃到暗角，但可能多留一點邊
	  const RUN = 6;       // 連續 RUN 行/列都達標才算進入內容（抗雜訊）
	  const DENS = 0.08;   // 一行/列中「非黑」像素比例門檻

	  const rowNonBlackRatio = (y) => {
		let cnt = 0;
		const base = y * W * 4;
		for (let x = 0; x < W; x++) {
		  const i = base + x * 4;
		  if (lum(i) > TH) cnt++;
		}
		return cnt / W;
	  };

	  const colNonBlackRatio = (x) => {
		let cnt = 0;
		const step = W * 4;
		let i = x * 4;
		for (let y = 0; y < H; y++) {
		  if (lum(i) > TH) cnt++;
		  i += step;
		}
		return cnt / H;
	  };

	  const findEdge = (max, ratioFn, dir) => {
		// dir=+1 從 0 往內找；dir=-1 從 max-1 往內找
		let run = 0;
		let lastGood = dir === 1 ? 0 : max - 1;

		for (let k = dir === 1 ? 0 : max - 1; dir === 1 ? k < max : k >= 0; k += dir) {
		  const r = ratioFn(k);
		  if (r > DENS) {
			run++;
			if (run >= RUN) return k - dir * (RUN - 1); // 回到第一個達標點
			lastGood = k;
		  } else {
			run = 0;
		  }
		}
		return lastGood;
	  };

	  let top = findEdge(H, rowNonBlackRatio, +1);
	  let bottom = findEdge(H, rowNonBlackRatio, -1);
	  let left = findEdge(W, colNonBlackRatio, +1);
	  let right = findEdge(W, colNonBlackRatio, -1);

	  // 小 padding，避免切到外框陰影（你可調）
	  const pad = 6;
	  top = Math.max(0, top - pad);
	  left = Math.max(0, left - pad);
	  bottom = Math.min(H - 1, bottom + pad);
	  right = Math.min(W - 1, right + pad);

	  // 轉回原圖像素座標
	  const inv = 1 / s;
	  const x0 = left * inv;
	  const y0 = top * inv;
	  const x1 = (right + 1) * inv;
	  const y1 = (bottom + 1) * inv;

	  return {
		sx: x0,
		sy: y0,
		sw: Math.max(1, x1 - x0),
		sh: Math.max(1, y1 - y0),
	  };
	};

	// 在 wrap 座標中，產生「符合 ASPECT、最大、貼底」的 cropRect
  const makeCropRectFromBounds = (wrapW, wrapH, imgEl) => {
	  const { drawX, drawY, drawW, drawH } = getContainContentRect(
		wrapW,
		wrapH,
		imgEl.naturalWidth,
		imgEl.naturalHeight
	  );

	  // 1) 找「內容」在原圖中的 bounds
	  const b = detectContentBounds(imgEl);

	  // 2) 把 bounds（原圖像素）投影到 wrap 的 drawRect 座標
	  const bx = drawX + (b.sx / imgEl.naturalWidth) * drawW;
	  const by = drawY + (b.sy / imgEl.naturalHeight) * drawH;
	  const bw = (b.sw / imgEl.naturalWidth) * drawW;
	  const bh = (b.sh / imgEl.naturalHeight) * drawH;

	  // 3) 在 bounds 裡放「最大且符合 ASPECT」的矩形，並貼底
	  let w = Math.min(bw, bh / ASPECT);
	  let h = w * ASPECT;

	  // 置中 + 貼底（你要的底盤）
	  let x = bx + (bw - w) / 2;
	  let y = by + (bh - h);

	  // 4) 最後保險：不要跑出 wrap
	  return fitRectIntoBounds({ x, y, w, h });
	};

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

	  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

	  // 保存原本狀態
	  const prev = {
		overflow: document.body.style.overflow,
		position: document.body.style.position,
		top: document.body.style.top,
		width: document.body.style.width,
		touchAction: document.body.style.touchAction,
	  };

	  // ✅ iOS 最穩的鎖法：body fixed
	  document.body.style.overflow = "hidden";
	  document.body.style.position = "fixed";
	  document.body.style.top = `-${scrollY}px`;
	  document.body.style.width = "100%";
	  document.body.style.touchAction = "none";

	  // ✅ 再加一層：擋住「非可滾動區域」的 touchmove（iOS/LINE 很需要）
	  const preventTouchMove = (e) => {
		// 只要 modal 開著，直接阻止整頁滾動
		e.preventDefault();
	  };
	  document.addEventListener("touchmove", preventTouchMove, { passive: false });

	  return () => {
		document.removeEventListener("touchmove", preventTouchMove);

		// 還原 body
		document.body.style.overflow = prev.overflow;
		document.body.style.position = prev.position;
		document.body.style.top = prev.top;
		document.body.style.width = prev.width;
		document.body.style.touchAction = prev.touchAction;

		// 回到原本卷軸位置
		window.scrollTo(0, scrollY);
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
    <div
	  className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur p-4 flex items-center justify-center"
	  onTouchMove={(e) => e.preventDefault()}
	  style={{ touchAction: "none" }}
	>
      <div
        className="w-full max-w-2xl bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          <div
            ref={wrapRef}
            className="relative w-full aspect-[6/5] bg-black rounded-2xl border border-white/10 touch-none"
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
				  cacheContentRect(); // ✅ 加這行
				  const wrap = wrapRef.current;
				  const img = imgRef.current;
				  if (!wrap || !img) return;

				  const r = makeCropRectFromBounds(wrap.clientWidth, wrap.clientHeight, img);

				  cropRectRef.current = r;
				  setCropRect(r);
				  requestAnimationFrame(() => applyRectToDOM(r));
				}}
            />

            {/* 裁切框 */}
            <div
              ref={boxRef}
              className="absolute left-0 top-0 rounded-none border-2 border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.35)] touch-none will-change-transform"
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
                    "absolute w-4 h-4 bg-fuchsia-400 rounded-none border border-black/40 touch-none",
					corner === "tl" ? "left-[-8px] top-[-8px] cursor-nwse-resize" : "",
					corner === "tr" ? "right-[-8px] top-[-8px] cursor-nesw-resize" : "",
					corner === "bl" ? "left-[-8px] bottom-[-8px] cursor-nesw-resize" : "",
					corner === "br" ? "right-[-8px] bottom-[-8px] cursor-nwse-resize" : "",
                  ].join(" ")}
                />
              ))}
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