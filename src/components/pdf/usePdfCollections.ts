import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { relKey, type PdfCollectionData } from "./types";

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

interface PdfCollectionsFile {
  version: number;
  collections: PdfCollectionData[];
}

function normalizeCollection(raw: unknown): PdfCollectionData | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<PdfCollectionData>;
  if (typeof c.id !== "string" || typeof c.name !== "string") return null;
  return {
    id: c.id,
    name: c.name,
    ...(typeof c.color === "string" && c.color ? { color: c.color } : {}),
    pdfPaths: Array.isArray(c.pdfPaths) ? c.pdfPaths.filter((p): p is string => typeof p === "string") : [],
  };
}

export function usePdfCollections(repoPath: string) {
  const { t } = useT();
  const showToast = useToast();
  const [collections, setCollections] = useState<PdfCollectionData[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PdfCollectionData[] | null>(null);
  const saveFailedRef = useRef(false);

  const repoKey = repoPath.toLowerCase().replace(/\\/g, "/");
  const selectionKey = `last_pdf_coll_${repoKey}`;

  const persist = useCallback((colls: PdfCollectionData[]) => {
    return window.prism
      .pdfSaveCollections(repoPath, { version: 1, collections: colls })
      .then(() => { saveFailedRef.current = false; })
      .catch(() => {
        if (saveFailedRef.current) return;
        saveFailedRef.current = true;
        showToast(t["pdf.saveFailed"], "error");
        setTimeout(() => { saveFailedRef.current = false; }, 4000);
      });
  }, [repoPath, showToast, t]);

  const saveCollections = useCallback((colls: PdfCollectionData[]) => {
    pendingRef.current = colls;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pendingRef.current = null;
      saveTimer.current = null;
      void persist(colls);
    }, 300);
  }, [persist]);

  // Flush the last edit on unmount. On a repo switch this cleanup runs first,
  // writing the pending edit back to the repository it belongs to.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (pendingRef.current) {
        void persist(pendingRef.current);
        pendingRef.current = null;
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingRef.current = null;
    setCollections([]);
    setSelectedIdState(null);
    setLoaded(false);
    if (!repoPath) {
      setLoaded(true);
      return;
    }
    void (async () => {
      try {
        const data = (await window.prism.pdfLoadCollections()) as PdfCollectionsFile | null;
        if (cancelled) return;
        const colls = Array.isArray(data?.collections)
          ? data.collections.map(normalizeCollection).filter((c): c is PdfCollectionData => c !== null)
          : [];
        setCollections(colls);
        const saved = await window.prism.getSetting(selectionKey);
        if (!cancelled && saved && colls.some((c) => c.id === saved)) {
          setSelectedIdState(saved);
        }
      } catch {
        if (!cancelled) setCollections([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [repoPath, selectionKey]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedIdState(id);
    void window.prism.setSetting(selectionKey, id ?? "");
  }, [selectionKey]);

  const update = useCallback((fn: (prev: PdfCollectionData[]) => PdfCollectionData[]) => {
    setCollections((prev) => {
      const next = fn(prev);
      if (next !== prev) saveCollections(next);
      return next;
    });
  }, [saveCollections]);

  const createCollection = useCallback((name: string) => {
    const coll: PdfCollectionData = { id: makeId(), name, pdfPaths: [] };
    setCollections((prev) => {
      const next = [...prev, coll];
      saveCollections(next);
      return next;
    });
    selectCollection(coll.id);
    return coll;
  }, [saveCollections, selectCollection]);

  const renameCollection = useCallback((id: string, name: string) => {
    update((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, [update]);

  const setCollectionColor = useCallback((id: string, color: string) => {
    update((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  }, [update]);

  const reorderCollections = useCallback((from: number, to: number) => {
    update((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  }, [update]);

  const deleteCollection = useCallback((id: string) => {
    const target = collections.find((c) => c.id === id);
    const snapshot = collections;
    const next = collections.filter((c) => c.id !== id);
    setCollections(next);
    saveCollections(next);
    if (selectedId === id) selectCollection(null);
    if (target) {
      showToast(t["pdf.collectionDeleted"].replace("{name}", target.name), {
        action: {
          label: t["common.undo"],
          onClick: () => {
            setCollections(snapshot);
            saveCollections(snapshot);
            selectCollection(id);
          },
        },
      });
    }
  }, [collections, saveCollections, selectCollection, selectedId, showToast, t]);

  const insertPath = useCallback((collId: string, relPath: string, index: number) => {
    update((prev) => prev.map((c) => {
      if (c.id !== collId) return c;
      if (c.pdfPaths.some((p) => relKey(p) === relKey(relPath))) return c;
      const paths = [...c.pdfPaths];
      paths.splice(Math.max(0, Math.min(index, paths.length)), 0, relPath);
      return { ...c, pdfPaths: paths };
    }));
  }, [update]);

  const addPaths = useCallback((collId: string, relPaths: string[]) => {
    const target = collections.find((c) => c.id === collId);
    if (!target) return 0;
    const existing = new Set(target.pdfPaths.map(relKey));
    const fresh = relPaths.filter((p, i) => !existing.has(relKey(p)) && relPaths.findIndex((q) => relKey(q) === relKey(p)) === i);
    if (fresh.length === 0) return 0;
    const next = collections.map((c) => (c.id === collId ? { ...c, pdfPaths: [...c.pdfPaths, ...fresh] } : c));
    setCollections(next);
    saveCollections(next);
    return fresh.length;
  }, [collections, saveCollections]);

  const removePath = useCallback((collId: string, relPath: string) => {
    const target = collections.find((c) => c.id === collId);
    if (!target) return;
    const index = target.pdfPaths.findIndex((p) => relKey(p) === relKey(relPath));
    if (index < 0) return;
    const next = collections.map((c) => (
      c.id === collId ? { ...c, pdfPaths: c.pdfPaths.filter((p) => relKey(p) !== relKey(relPath)) } : c
    ));
    setCollections(next);
    saveCollections(next);
    showToast(t["pdf.removeFromCollectionDone"].replace("{name}", target.name), {
      action: {
        label: t["common.undo"],
        onClick: () => insertPath(collId, relPath, index),
      },
    });
  }, [collections, saveCollections, insertPath, showToast, t]);

  // Drop stale paths after an external rename/delete. Returns how many were
  // removed so the caller can surface a single toast.
  const pruneMissing = useCallback((validKeys: Set<string>) => {
    let removed = 0;
    const next = collections.map((c) => {
      const kept = c.pdfPaths.filter((p) => validKeys.has(relKey(p)));
      removed += c.pdfPaths.length - kept.length;
      return kept.length === c.pdfPaths.length ? c : { ...c, pdfPaths: kept };
    });
    if (removed > 0) {
      setCollections(next);
      saveCollections(next);
    }
    return removed;
  }, [collections, saveCollections]);

  const selected = useMemo(
    () => (selectedId ? collections.find((c) => c.id === selectedId) ?? null : null),
    [collections, selectedId],
  );

  return {
    collections,
    selectedId,
    selected,
    loaded,
    selectCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    setCollectionColor,
    reorderCollections,
    addPaths,
    removePath,
    insertPath,
    pruneMissing,
  };
}
