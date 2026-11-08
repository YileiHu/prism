// Cross-surface canvas change notifications. The library, embedded previews
// and open tabs all listen to the same window events.

export const CANVAS_CHANGED_EVENT = "prism:canvas-changed";
export const CANVAS_SAVED_EVENT = "prism:canvas-saved";

export interface CanvasChangeDetail {
  vaultPath: string;
  created?: string;
  renamedFrom?: string;
  renamedTo?: string;
  deleted?: string;
}

export interface CanvasSavedDetail {
  vaultPath: string;
  canvasPath: string;
}

export function notifyCanvasChanged(
  vaultPath: string,
  extra: Omit<CanvasChangeDetail, "vaultPath"> = {},
): void {
  window.dispatchEvent(new CustomEvent<CanvasChangeDetail>(CANVAS_CHANGED_EVENT, {
    detail: { vaultPath, ...extra },
  }));
}

export function notifyCanvasSaved(vaultPath: string, canvasPath: string): void {
  window.dispatchEvent(new CustomEvent<CanvasSavedDetail>(CANVAS_SAVED_EVENT, {
    detail: { vaultPath, canvasPath },
  }));
}
