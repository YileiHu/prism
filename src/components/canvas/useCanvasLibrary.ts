import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasFile } from "../../shared/models";
import { createCanvasDoc, serializeCanvas } from "../../lib/canvas/model";
import {
  CANVAS_CHANGED_EVENT,
  notifyCanvasChanged,
  type CanvasChangeDetail,
} from "../../lib/canvas/events";
import { normalizePath } from "../../lib/workspace/types";

export { notifyCanvasChanged } from "../../lib/canvas/events";
export type { CanvasChangeDetail } from "../../lib/canvas/events";

export function useCanvasLibrary(vaultPath: string) {
  const [files, setFiles] = useState<CanvasFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!vaultPath) {
      setFiles([]);
      setLoaded(true);
      return;
    }
    const request = ++requestRef.current;
    try {
      const next = await window.prism.listCanvases(vaultPath);
      if (request === requestRef.current) {
        setFiles(next);
        setLoaded(true);
      }
    } catch {
      if (request === requestRef.current) {
        setFiles([]);
        setLoaded(true);
      }
    }
  }, [vaultPath]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CanvasChangeDetail>).detail;
      if (!detail?.vaultPath || !vaultPath) return;
      if (normalizePath(detail.vaultPath) === normalizePath(vaultPath)) void refresh();
    };
    window.addEventListener(CANVAS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CANVAS_CHANGED_EVENT, handler);
  }, [refresh, vaultPath]);

  const create = useCallback(async (title: string) => {
    const file = await window.prism.createCanvas(vaultPath, title, serializeCanvas(createCanvasDoc()));
    notifyCanvasChanged(vaultPath, { created: file.path });
    return file;
  }, [vaultPath]);

  const rename = useCallback(async (file: CanvasFile, title: string) => {
    const next = await window.prism.renameCanvas(file.path, title);
    notifyCanvasChanged(vaultPath, { renamedFrom: file.path, renamedTo: next.path });
    return next;
  }, [vaultPath]);

  const remove = useCallback(async (file: CanvasFile) => {
    await window.prism.trashFile(file.path);
    notifyCanvasChanged(vaultPath, { deleted: file.path });
  }, [vaultPath]);

  return { files, loaded, refresh, create, rename, remove };
}
