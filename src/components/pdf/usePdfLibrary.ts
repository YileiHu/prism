import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../lib/settings";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { PdfDocument, PdfSort, PdfSortDir } from "./types";

// Natural order per field: titles read A→Z, dates and page counts read
// newest/largest first.
const DEFAULT_DIR: Record<PdfSort, PdfSortDir> = {
  title: "asc",
  added: "desc",
  modified: "desc",
  pages: "desc",
};

function compareTitle(a: PdfDocument, b: PdfDocument): number {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
}

function compareField(sort: PdfSort, a: PdfDocument, b: PdfDocument): number {
  switch (sort) {
    case "added":
      return a.addedAt.localeCompare(b.addedAt);
    case "modified":
      return a.modifiedAt.localeCompare(b.modifiedAt);
    case "pages":
      return (a.pageCount ?? -1) - (b.pageCount ?? -1);
    default:
      return compareTitle(a, b);
  }
}

function compareDocs(sort: PdfSort, dir: PdfSortDir, a: PdfDocument, b: PdfDocument): number {
  const result = compareField(sort, a, b);
  if (result !== 0) return dir === "asc" ? result : -result;
  return compareTitle(a, b);
}

export function usePdfLibrary(active: boolean) {
  const { values, ready, set: setSetting } = useSettings();
  const [repoPath, setRepoPath] = useState("");
  const [repoExists, setRepoExists] = useState(false);
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<PdfSort>(values.pdf_default_sort);
  const [sortDir, setSortDir] = useState<PdfSortDir>(DEFAULT_DIR[values.pdf_default_sort]);
  const sortTouched = useRef(false);
  const loadedRepoRef = useRef<string | null>(null);

  // Settings load asynchronously; follow the stored default until the user
  // picks a sort in this session.
  useEffect(() => {
    if (ready && !sortTouched.current) {
      setSort(values.pdf_default_sort);
      setSortDir(DEFAULT_DIR[values.pdf_default_sort]);
    }
  }, [ready, values.pdf_default_sort]);

  const load = useCallback(async () => {
    try {
      const state = await window.prism.getPdfState();
      // Drop the previous repo's rows immediately so a stale list cannot
      // drive collection pruning or tab restoration while the new repo is
      // still being listed.
      if (loadedRepoRef.current !== null && loadedRepoRef.current !== state.repoPath) {
        setDocuments([]);
        setLoaded(false);
      }
      loadedRepoRef.current = state.repoPath;
      setRepoPath(state.repoPath);
      setRepoExists(state.exists);
      if (state.repoPath && state.exists) {
        const rows = await window.prism.listPdfs();
        // Ignore a response that finished after another repo switch.
        if (loadedRepoRef.current !== state.repoPath) return;
        setDocuments(rows);
      } else {
        setDocuments([]);
      }
    } catch {
      setRepoExists(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(() => window.prism.onPdfUpdated(() => { void load(); }), [load]);

  const chooseRepo = useCallback(async () => {
    const dir = await window.prism.choosePdfRepo();
    if (!dir) return;
    setSearch("");
    setSetting("pdf_repo_path", dir);
  }, [setSetting]);

  const rescan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await window.prism.rescanPdfs();
      await load();
    } finally {
      setScanning(false);
    }
  }, [load, scanning]);

  const removeDocuments = useCallback(async (ids: number[]) => {
    const result = await window.prism.deletePdfDocuments(ids);
    await load();
    return result;
  }, [load]);

  const patchDocument = useCallback((id: number, patch: Partial<PdfDocument>) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)));
  }, []);

  const changeSort = useCallback((next: PdfSort) => {
    sortTouched.current = true;
    setSort(next);
    setSortDir(DEFAULT_DIR[next]);
  }, []);

  const toggleSortDir = useCallback(() => {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const { visible, limitHit } = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = documents;
    if (query) {
      list = list.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          doc.relPath.toLowerCase().includes(query),
      );
    }
    const sorted = [...list].sort((a, b) => compareDocs(sort, sortDir, a, b));
    const limit = Math.max(1, Math.floor(values.search_result_limit));
    return { visible: sorted.slice(0, limit), limitHit: sorted.length > limit };
  }, [documents, search, sort, sortDir, values.search_result_limit]);

  return {
    repoPath,
    repoExists,
    documents,
    loaded,
    scanning,
    search,
    setSearch,
    sort,
    sortDir,
    setSort: changeSort,
    toggleSortDir,
    visible,
    limitHit,
    reload: load,
    chooseRepo,
    rescan,
    removeDocuments,
    patchDocument,
  };
}
