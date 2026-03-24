// solverWorker.js
import {
  beamSolve,
} from "./solverCore";

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type !== "solve") return;

  try {
    const result = beamSolve(...payload.args, ({ current, max }) => {
      self.postMessage({
        type: "progress",
        payload: { current, max },
      });
    });

    self.postMessage({
      type: "done",
      payload: result,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      payload: {
        message: err?.message || String(err),
        stack: err?.stack || "",
      },
    });
  }
};