import React, { useEffect, useRef, useState, useCallback } from "react";

const ROWS = 5;
const COLS = 6;
const ASPECT = ROWS / COLS; // height / width = 5/6

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function ImportCropModal({
  open,
  imgUrl,
  onCancel,
  onConfirm, // async ({ cropCanvas }) => void
}) {
  const imgRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ====== 偵測圖片非黑邊內容 ======
  const detectContentBounds = useCallback((imgEl) => {
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;

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

    const lum = (i) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const TH = 18;
    const RUN = 6;
    const DENS = 0.08;

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
      let run = 0;
      let lastGood = dir === 1 ? 0 : max - 1;

      for (
        let k = dir === 1 ? 0 : max - 1;
        dir === 1 ? k < max : k >= 0;
        k += dir
      ) {
        const r = ratioFn(k);
        if (r > DENS) {
          run++;
          if (run >= RUN) return k - dir * (RUN - 1);
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

    const pad = 6;
    top = Math.max(0, top - pad);
    left = Math.max(0, left - pad);
    bottom = Math.min(H - 1, bottom + pad);
    right = Math.min(W - 1, right + pad);

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
  }, []);

  // ====== 偵測血條 ======
  const detectHpBar = useCallback((imgEl) => {
    const natW = imgEl.naturalWidth;
    const natH = imgEl.naturalHeight;

    const targetW = Math.min(500, natW);
    const s = targetW / natW;
    const W = Math.max(1, Math.round(natW * s));
    const H = Math.max(1, Math.round(natH * s));

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, W, H);

    const { data } = ctx.getImageData(0, 0, W, H);

    const get = (x, y) => {
      const i = (y * W + x) * 4;
      return {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
      };
    };

    const lumOf = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const isHpPixel = ({ r, g, b, a }) => {
      if (a < 200) return false;

      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const sat = maxc - minc;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      return (
        r >= 150 &&
        g >= 70 &&
        g <= 190 &&
        b >= 70 &&
        b <= 180 &&
        r > g + 20 &&
        r > b &&
        sat >= 35 &&
        lum >= 90 &&
        lum <= 235
      );
    };

    const yStart = Math.floor(H * (4.9 / 11));
    const yEnd = Math.floor(H * (6.4 / 11));
    const targetY = H * (5.5 / 11);

    const minRunW = W * 0.42;
    const candidates = [];

    for (let y = yStart; y < yEnd; y++) {
      let runStart = -1;

      for (let x = 0; x < W; x++) {
        const ok = isHpPixel(get(x, y));

        if (ok && runStart < 0) runStart = x;

        const end = !ok || x === W - 1;
        if (runStart >= 0 && end) {
          const runEnd = ok && x === W - 1 ? x : x - 1;
          const runW = runEnd - runStart + 1;

          if (runW >= minRunW) {
            const leftProbeX = Math.max(0, runStart - 8);
            const rightProbeX = Math.min(W - 1, runEnd + 8);

            const leftLum = lumOf(get(leftProbeX, y));
            const rightLum = lumOf(get(rightProbeX, y));

            const sideScore =
              (leftLum < 130 ? 1 : 0) + (rightLum < 130 ? 1 : 0);

            candidates.push({
              x: runStart,
              y,
              w: runW,
              h: 1,
              sideScore,
            });
          }

          runStart = -1;
        }
      }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (b.sideScore !== a.sideScore) return b.sideScore - a.sideScore;
      if (b.w !== a.w) return b.w - a.w;
      return Math.abs(a.y - targetY) - Math.abs(b.y - targetY);
    });

    const bestBase = candidates[0];

    let top = bestBase.y;
    let bottom = bestBase.y;

    const rowMatchRatio = (yy, x0, x1) => {
      let hit = 0;
      let total = 0;
      for (let x = x0; x <= x1; x++) {
        total++;
        if (isHpPixel(get(x, yy))) hit++;
      }
      return total ? hit / total : 0;
    };

    while (
      top - 1 >= yStart &&
      rowMatchRatio(top - 1, bestBase.x, bestBase.x + bestBase.w - 1) > 0.32
    ) {
      top--;
    }

    while (
      bottom + 1 < yEnd &&
      rowMatchRatio(bottom + 1, bestBase.x, bestBase.x + bestBase.w - 1) > 0.32
    ) {
      bottom++;
    }

    const hh = bottom - top + 1;
    if (hh < 3 || hh > Math.max(16, H * 0.03)) return null;

    const centerY = (top + bottom) / 2;
    if (centerY > H * (6.5 / 11)) return null;

    const inv = 1 / s;
    return {
      sx: bestBase.x * inv,
      sy: top * inv,
      sw: bestBase.w * inv,
      sh: hh * inv,
    };
  }, []);

  // ====== 自動算出 5x6 裁切區 ======
  const getAutoCropSourceRect = useCallback((imgEl) => {
    const content = detectContentBounds(imgEl);
    const hp = detectHpBar(imgEl);

    const fallback = () => {
      let w = Math.min(content.sw, content.sh / ASPECT);
      let h = w * ASPECT;
      let x = content.sx + (content.sw - w) / 2;
      let y = content.sy + (content.sh - h);

      x = clamp(x, content.sx, content.sx + content.sw - w);
      y = clamp(y, content.sy, content.sy + content.sh - h);

      return { sx: x, sy: y, sw: w, sh: h };
    };

    if (!hp) return fallback();

    const hpOffsetDown = Math.max(2, Math.round(imgEl.naturalHeight * 0.002));
    const top = hp.sy + hp.sh + hpOffsetDown;

    const contentCenterX = content.sx + content.sw / 2;

    const usableLeft = content.sx + content.sw * 0.04;
    const usableRight = content.sx + content.sw * 0.96;
    const usableWidth = usableRight - usableLeft;

    const bottom = content.sy + content.sh;
    const availableH = bottom - top;
    if (availableH <= 0) return fallback();

    let w = Math.min(usableWidth, availableH / ASPECT);
    let h = w * ASPECT;

    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      return fallback();
    }

    let x = contentCenterX - w / 2;
    let y = top;

    x = clamp(x, usableLeft, usableRight - w);
    y = clamp(y, content.sy, bottom - h);

    return {
      sx: x,
      sy: y,
      sw: w,
      sh: h,
    };
  }, [detectContentBounds, detectHpBar]);

  const buildCropCanvas = useCallback(() => {
    const img = imgRef.current;
    if (!img) return null;

    const { sx, sy, sw, sh } = getAutoCropSourceRect(img);

    const cell = 64;
    const canvas = document.createElement("canvas");
    canvas.width = COLS * cell;
    canvas.height = ROWS * cell;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    return canvas;
  }, [getAutoCropSourceRect]);

  const runImport = useCallback(async () => {
    if (importing) return;

    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;

    setImporting(true);
    try {
      const cropCanvas = buildCropCanvas();
      if (!cropCanvas) return;
      await onConfirm({ cropCanvas });
    } catch (err) {
      console.error("Import crop failed:", err);
      onCancel?.();
    } finally {
      setImporting(false);
    }
  }, [importing, buildCropCanvas, onConfirm, onCancel]);

  useEffect(() => {
    if (!open || !loaded) return;
    runImport();
  }, [open, loaded, runImport]);

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setImporting(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        width: 0,
        height: 0,
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <img
        ref={imgRef}
        src={imgUrl}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}