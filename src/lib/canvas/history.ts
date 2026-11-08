import { cloneCanvas, type CanvasDoc } from "./model";

const HISTORY_LIMIT = 100;

export interface CanvasHistory {
  past: CanvasDoc[];
  future: CanvasDoc[];
}

export function emptyHistory(): CanvasHistory {
  return { past: [], future: [] };
}

// Record the pre-change snapshot. Repeated calls during a drag/resize must be
// coalesced by the caller (commit once on gesture end).
export function recordHistory(history: CanvasHistory, doc: CanvasDoc): CanvasHistory {
  return {
    past: [...history.past, cloneCanvas(doc)].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function undoHistory(
  history: CanvasHistory,
  current: CanvasDoc,
): { history: CanvasHistory; doc: CanvasDoc } | null {
  const prior = history.past[history.past.length - 1];
  if (!prior) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [cloneCanvas(current), ...history.future].slice(0, HISTORY_LIMIT),
    },
    doc: cloneCanvas(prior),
  };
}

export function redoHistory(
  history: CanvasHistory,
  current: CanvasDoc,
): { history: CanvasHistory; doc: CanvasDoc } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: {
      past: [...history.past, cloneCanvas(current)].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
    },
    doc: cloneCanvas(next),
  };
}
