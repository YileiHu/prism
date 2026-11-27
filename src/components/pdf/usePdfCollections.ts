import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useDebouncedPersist } from "../../lib/useDebouncedJsonPersist";
import { deleteById, insertAt, moveItem, renameById } from "../../lib/collectionOps";
import { librarySelectionKey, readLibrarySelection, writeLibrarySelection } from "../../lib/librarySelection";
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
    ...(typeof c.icon === "string" && c.icon ? { icon: c.icon } : {}),
    pdfPaths: Array.isArray(c.pdfPaths) ? c.pdfPaths.filter((p): p is string => typeof p === "string") : [],
  };
}

export function usePdfCollections(repoPath: string) {
  const { t } = useT();
  const showToast = useToast();
  const [collections, setCollections] = useState<PdfCollectionData[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const selectionKey = librarySelectionKey("pdf", repoPath);

  const { schedule: schedulePersist, flush: flushPersist } = useDebouncedPersist({
    onError: () => showToast(t["pdf.saveFailed"], "error"),
  });

  const persist = useCallback((colls: PdfCollectionData[]) => {
    return window.prism.savePdfCollections(repoPath, { version: 1, collections: colls });
  }, [repoPath]);

  const saveCollections = useCallback((colls: PdfCollectionData[]) => {
    schedulePersist(() => persist(colls));
  }, [schedulePersist, persist]);

  useEffect(() => {
    let cancelled = false;
    // Write any pending edit back to the repository it belongs to before the
    // new repo's state replaces it.
    flushPersist();
    setCollections([]);
    setSelectedIdState(null);
    setLoaded(false);
    if (!repoPath) {
      setLoaded(true);
      return;
    }
    void (async () => {
      try {
        const data = (await window.prism.loadPdfCollections()) as PdfCollectionsFile | null;
        if (cancelled) return;
        const colls = Array.isArray(data?.collections)
          ? data.collections.map(normalizeCollection).filter((c): c is PdfCollectionData => c !== null)
          : [];
        setCollections(colls);
        const saved = await readLibrarySelection(selectionKey);
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
  }, [repoPath, selectionKey, flushPersist]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedIdState(id);
    void writeLibrarySelection(selectionKey, id);
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
    update((prev) => renameById(prev, id, name));
  }, [update]);

  const setCollectionIcon = useCallback((id: string, icon: string) => {
    update((prev) => prev.map((c) => (c.id === id ? { ...c, icon } : c)));
  }, [update]);

  const reorderCollections = useCallback((from: number, to: number) => {
    update((prev) => moveItem(prev, from, to));
  }, [update]);

  const deleteCollection = useCallback((id: string) => {
    const target = collections.find((c) => c.id === id);
    const snapshot = collections;
    const next = deleteById(collections, id);
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
      return { ...c, pdfPaths: insertAt(c.pdfPaths, index, relPath) };
    }));
  }, [update]);

  // Single assignment: moving into one collection removes the paths from every
  // other collection, so the same write cannot leave a duplicate behind.
  const movePaths = useCallback((collId: string, relPaths: string[]) => {
    const target = collections.find((c) => c.id === collId);
    if (!target || relPaths.length === 0) return 0;
    const wanted = new Map<string, string>();
    for (const relPath of relPaths) {
      const key = relKey(relPath);
      if (!wanted.has(key)) wanted.set(key, relPath);
    }
    const keys = new Set(wanted.keys());
    let changed = false;
    const next = collections.map((c) => {
      const kept = c.pdfPaths.filter((p) => !keys.has(relKey(p)));
      if (c.id !== collId) {
        if (kept.length === c.pdfPaths.length) return c;
        changed = true;
        return { ...c, pdfPaths: kept };
      }
      const present = new Set(kept.map(relKey));
      const additions = [...wanted.entries()]
        .filter(([key]) => !present.has(key))
        .map(([, path]) => path);
      if (additions.length === 0 && kept.length === c.pdfPaths.length) return c;
      changed = true;
      return { ...c, pdfPaths: [...kept, ...additions] };
    });
    if (changed) {
      setCollections(next);
      saveCollections(next);
    }
    return wanted.size;
  }, [collections, saveCollections]);

  /** Copies stay consistent even if the same path was listed twice. */
  const removePathsFromAll = useCallback((relPaths: string[]) => {
    if (relPaths.length === 0) return 0;
    const keys = new Set(relPaths.map(relKey));
    let changed = false;
    const next = collections.map((c) => {
      const kept = c.pdfPaths.filter((p) => !keys.has(relKey(p)));
      if (kept.length === c.pdfPaths.length) return c;
      changed = true;
      return { ...c, pdfPaths: kept };
    });
    if (changed) {
      setCollections(next);
      saveCollections(next);
    }
    return relPaths.length;
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

  const findCollectionForPath = useCallback((relPath: string): string | null => {
    const key = relKey(relPath);
    const owner = collections.find((c) => c.pdfPaths.some((p) => relKey(p) === key));
    return owner?.id ?? null;
  }, [collections]);

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
    findCollectionForPath,
    createCollection,
    renameCollection,
    deleteCollection,
    setCollectionIcon,
    reorderCollections,
    movePaths,
    removePathsFromAll,
    removePath,
    insertPath,
    pruneMissing,
  };
}
