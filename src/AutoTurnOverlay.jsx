import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TOTAL_ROWS = 6;
const COLS = 6;

function normalizePayload(payload) {
  const path = Array.isArray(payload?.path)
    ? payload.path
        .map((point) => ({
          r: Number(point?.r),
          c: Number(point?.c),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.r) &&
            Number.isFinite(point.c) &&
            point.r >= 0 &&
            point.r < TOTAL_ROWS &&
            point.c >= 0 &&
            point.c < COLS
        )
    : [];

  return {
    ...payload,
    rows: TOTAL_ROWS,
    cols: COLS,
    path,
  };
}

export default function AutoTurnOverlay() {
  const gridRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [turning, setTurning] = useState(false);
  const hasPath = payload?.path?.length >= 2;

  useEffect(() => {
    document.documentElement.dataset.autoTurnOverlay = "true";
    document.body.dataset.autoTurnOverlay = "true";

    let unlisten = null;
    let cancelled = false;

    listen("auto-turn:update", (event) => {
      if (!cancelled) {
        setPayload(normalizePayload(event.payload));
      }
    })
      .then((dispose) => {
        if (cancelled) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch((err) => {
        console.warn("[auto-turn] listen failed", err);
      });

    return () => {
      cancelled = true;
      unlisten?.();
      delete document.documentElement.dataset.autoTurnOverlay;
      delete document.body.dataset.autoTurnOverlay;
    };
  }, []);

  const runAutoTurn = useCallback(async () => {
    if (turning || !hasPath || !gridRef.current) return;

    setTurning(true);
    const currentWindow = getCurrentWindow();
    const gridRect = gridRef.current.getBoundingClientRect();
    const cellW = gridRect.width / COLS;
    const cellH = gridRect.height / TOTAL_ROWS;
    const screenLeft =
      typeof window.screenX === "number" ? window.screenX : window.screenLeft || 0;
    const screenTop =
      typeof window.screenY === "number" ? window.screenY : window.screenTop || 0;
    const dpr = window.devicePixelRatio || 1;

    const pathClientPoints = payload.path.map((point) => ({
      r: point.r,
      c: point.c,
      x: gridRect.left + (point.c + 0.5) * cellW,
      y: gridRect.top + (point.r + 0.5) * cellH,
    }));
    let screenOrigin = null;
    let scaleFactor = dpr;

    try {
      const [innerPosition, factor] = await Promise.all([
        currentWindow.innerPosition(),
        currentWindow.scaleFactor(),
      ]);
      screenOrigin = innerPosition;
      scaleFactor = Number.isFinite(factor) && factor > 0 ? factor : dpr;
    } catch (err) {
      console.warn("[auto-turn] Tauri window position unavailable; using browser coordinates", err);
    }

    const originX = Number.isFinite(screenOrigin?.x) ? screenOrigin.x : screenLeft * dpr;
    const originY = Number.isFinite(screenOrigin?.y) ? screenOrigin.y : screenTop * dpr;
    const pathScreenPoints = pathClientPoints.map((point) => ({
      r: point.r,
      c: point.c,
      x: Math.round(originX + point.x * scaleFactor),
      y: Math.round(originY + point.y * scaleFactor),
      logicalX: screenLeft + point.x,
      logicalY: screenTop + point.y,
    }));

    let failure = null;

    try {
      await currentWindow.setIgnoreCursorEvents(true).catch((err) => {
        console.warn("[auto-turn] click-through failed", err);
      });
      await new Promise((resolve) => window.setTimeout(resolve, 70));

      await invoke("play_auto_turn_path", {
        payload: {
          ...payload,
          overlay: {
            gridClientRect: {
              left: gridRect.left,
              top: gridRect.top,
              width: gridRect.width,
              height: gridRect.height,
            },
            window: {
              screenX: screenLeft,
              screenY: screenTop,
              outerWidth: window.outerWidth,
              outerHeight: window.outerHeight,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              devicePixelRatio: dpr,
            },
            pathClientPoints,
            pathScreenPoints,
          },
        },
      });
    } catch (err) {
      console.error("[auto-turn] native turn failed", err);
      failure = err;
    } finally {
      await currentWindow.setIgnoreCursorEvents(false).catch((err) => {
        console.warn("[auto-turn] restore cursor events failed", err);
      });
      setTurning(false);
    }

    if (failure) {
      alert(`自動轉珠失敗：${failure?.message || failure}`);
    }
  }, [hasPath, payload, turning]);

  return (
    <main className="auto-turn-overlay-shell">
      <section className="auto-turn-overlay-grid-wrap" aria-label="自動轉珠格線">
        <div ref={gridRef} className="auto-turn-overlay-grid" data-auto-turn-grid>
          {Array.from({ length: TOTAL_ROWS * COLS }, (_, idx) => (
            <div key={`auto-turn-cell-${idx}`} className="auto-turn-overlay-cell" />
          ))}
        </div>
      </section>

      <button
        type="button"
        className="auto-turn-overlay-button"
        onClick={runAutoTurn}
        disabled={turning || !hasPath}
      >
        {turning ? "轉珠中..." : "轉珠"}
      </button>
    </main>
  );
}
