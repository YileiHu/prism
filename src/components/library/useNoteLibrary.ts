import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../lib/settings";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { toRelativePath, useCollections } from "../useCollections";
import { resolveTagColor, type PaletteColor } from "../../lib/colors";
import { useVaultLock } from "../../lib/vaultLock";
import type { NoteBrief, NoteListChanges } from "../../shared/models";
import { noteKey, normalizePath } from "../../lib/workspace/types";

// Sentinel stored in the per-vault `last_coll_*` setting. The whiteboard view is
// selectable exactly like a collection, so it shares the same memory slot.
export const CANVAS_VIEW_ID = "__canvas__";

// Patch the in-memory list instead of re-reading the vault: keep unchanged
// rows (and their object identity), drop deletions, replace/append upserts.
function mergeNoteChanges(prev: NoteBrief[], changes: NoteListChanges): NoteBrief[] {
  const deleted = new Set(changes.deleted.map(normalizePath));
  const byPath = new Map<string, NoteBrief>();
  for (const note of prev) {
    const key = normalizePath(note.path);
    if (!deleted.has(key)) byPath.set(key, note);
  }
  for (const note of changes.upserted) byPath.set(normalizePath(note.path), note);
  return [...byPath.values()].sort((a, b) =>
    a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0,
  );
}

export function useNoteLibrary(vaultPath: string) {
  const { values: settings } = useSettings();
  const vaultLock = useVaultLock();
  const privateVault = vaultLock.isPrivate(vaultPath);
  const locked = vaultLock.isLocked(vaultPath);
  const lockEpoch = vaultLock.epoch;
  const [notes, setNotes] = useState<NoteBrief[]>([]);
  const [scanning, setScanning] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [vaultError, setVaultError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"title" | "content">(
    () => (localStorage.getItem(`prism_note_search_scope_v2_${vaultPath}`) === "title" ? "title" : "content"),
  );
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [notesLoading, setNotesLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Which vault the current `notes` / `collections` state belongs to. Writes to
  // collections.json are gated on this matching the live vaultPath — switching
  // vaults must never let stale data be saved under the new vault.
  const [dataVaultPath, setDataVaultPath] = useState("");
  // Synchronous mirror of dataVaultPath, readable before effects commit.
  const dataVaultRef = useRef("");
  // Vault whose notes/collections are currently on screen. Stays on the old
  // vault during a warm switch so the UI does not flash a blank state.
  const [shownVaultPath, setShownVaultPath] = useState("");
  const [switching, setSwitching] = useState(false);
  const loadedVaultRef = useRef("");
  const initialLoadDone = useRef(false);
  const hasDataRef = useRef(false);
  const switchHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`prism_note_search_scope_v2_${vaultPath}`);
    setSearchScope(saved === "title" ? "title" : "content");
    setSearchQuery("");
  }, [vaultPath]);

  const loadNotes = useCallback(async () => {
    // A locked private vault has no readable notes and no index to query.
    if (!vaultPath || locked) {
      setNotes([]);
      return;
    }
    const requestVault = vaultPath;
    setNotesLoading(true);
    try {
      const next = debouncedQuery.trim()
        ? await window.prism.searchNotes(vaultPath, debouncedQuery)
        : await window.prism.getNoteList(vaultPath);
      // A slow response for the previous vault must not overwrite the new one.
      if (dataVaultRef.current !== requestVault) return;
      setNotes(next);
    } finally {
      setNotesLoading(false);
    }
  }, [debouncedQuery, locked, vaultPath]);

  useEffect(() => {
    let cancelled = false;
    const switched = loadedVaultRef.current !== vaultPath;
    loadedVaultRef.current = vaultPath;
    // A warm switch keeps the previous vault on screen (dimmed) until the new
    // data lands; only a cold start needs the blocking spinner.
    const warmSwitch = switched && hasDataRef.current;
    setScanning(true);
    if (switchHintTimer.current) {
      clearTimeout(switchHintTimer.current);
      switchHintTimer.current = null;
    }
    // Fast switches finish before the delay, so the hint never flickers in.
    setSwitching(false);
    if (warmSwitch) {
      switchHintTimer.current = setTimeout(() => {
        switchHintTimer.current = null;
        setSwitching(true);
      }, 150);
    }
    if (!warmSwitch) setInitialLoading(true);
    setVaultError(false);
    if (switched) {
      // Saves are already gated on dataVaultPath matching the live vault, so
      // old content may stay visible without leaking into the new vault.
      setDataVaultPath("");
      dataVaultRef.current = "";
      if (!warmSwitch) {
        setNotes([]);
        setCollections([]);
        setSelectedCollectionId(null);
        setFavorites(new Set());
        setShownVaultPath("");
      }
    }
    if (!vaultPath || locked) {
      setNotes([]);
      setCollections([]);
      setSelectedCollectionId(null);
      setFavorites(new Set());
      setScanning(false);
      setInitialLoading(false);
      setSwitching(false);
      if (switchHintTimer.current) {
        clearTimeout(switchHintTimer.current);
        switchHintTimer.current = null;
      }
      setShownVaultPath("");
      setDataVaultPath("");
      dataVaultRef.current = "";
      return;
    }
    void (async () => {
      try {
        const summary = await window.prism.getVaultLibrarySummary(vaultPath);
        if (cancelled) return;
        const cachedNotes = summary.notes;
        const colls = summary.collections?.collections ?? [];
        const lastCollId = await window.prism.getSetting(`last_coll_${vaultPath}`);
        if (cancelled) return;
        // Notes, collections and their owning vault must commit together.
        setCollections(colls);
        setNotes(cachedNotes);
        setDataVaultPath(vaultPath);
        dataVaultRef.current = vaultPath;
        setShownVaultPath(vaultPath);
        hasDataRef.current = true;
        setSelectedCollectionId(
          lastCollId && colls.some((c) => c.id === lastCollId) ? lastCollId : null,
        );
      } catch {
        if (!cancelled) {
          setVaultError(true);
          setNotes([]);
          setCollections([]);
          setSelectedCollectionId(null);
          setShownVaultPath("");
          dataVaultRef.current = "";
        }
      } finally {
        if (!cancelled) {
          setScanning(false);
          setInitialLoading(false);
          setSwitching(false);
          if (switchHintTimer.current) {
            clearTimeout(switchHintTimer.current);
            switchHintTimer.current = null;
          }
          initialLoadDone.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
      if (switchHintTimer.current) {
        clearTimeout(switchHintTimer.current);
        switchHintTimer.current = null;
      }
    };
    // setCollections/setSelectedCollectionId come from useCollections below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, reloadKey, locked, lockEpoch]);

  useEffect(() => {
    if (scanning || initialLoading || !vaultPath) return;
    // Notes may only be refreshed for the vault whose data is actually loaded;
    // without this a warm switch briefly mixed target-vault notes with the
    // still-displayed previous-vault collections (everything showed missing).
    if (dataVaultRef.current !== vaultPath) return;
    void loadNotes();
  }, [loadNotes, scanning, initialLoading, vaultPath]);

  // Derive collection paths from the vault the data actually belongs to. While
  // a warm switch is in flight the live vaultPath is already the target, but
  // notes/collections are still the previous vault's — mixing them would mark
  // every collection note as missing.
  const viewVaultPath = shownVaultPath || vaultPath;
  const collectionsApi = useCollections({ vaultPath: viewVaultPath, dataVaultPath, notes, loadNotes, searching: debouncedQuery.trim() !== "" });
  const { setCollections, setSelectedCollectionId } = collectionsApi;

  const refreshFavorites = useCallback(async () => {
    if (notes.length === 0) {
      setFavorites(new Set());
      return;
    }
    const paths = await window.prism.getFavoriteStatus(notes.map((note) => note.path));
    setFavorites(new Set(paths));
  }, [notes]);

  useEffect(() => {
    void refreshFavorites();
  }, [refreshFavorites]);

  useEffect(() => {
    const handler = () => { void refreshFavorites(); };
    window.addEventListener("favorites-changed", handler);
    return () => window.removeEventListener("favorites-changed", handler);
  }, [refreshFavorites]);

  useEffect(() => {
    return window.prism.onVaultUpdated((changedPath, changes) => {
      if (normalizePath(changedPath) !== normalizePath(vaultPath) || scanning || locked) return;
      // A search result is a filtered projection; patch only the plain list.
      if (changes && !debouncedQuery.trim()) {
        setNotes((prev) => mergeNoteChanges(prev, changes));
        return;
      }
      void loadNotes();
    });
  }, [vaultPath, loadNotes, locked, scanning, debouncedQuery]);

  const changeSearchScope = useCallback((scope: "title" | "content") => {
    setSearchScope(scope);
    localStorage.setItem(`prism_note_search_scope_v2_${vaultPath}`, scope);
  }, [vaultPath]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedCollectionId(id);
    // Collection view doesn't support searching; drop any active query so the
    // missing-marker resolution always runs against the full note list.
    if (id) setSearchQuery("");
    if (vaultPath) void window.prism.setSetting(`last_coll_${vaultPath}`, id ?? "");
  }, [setSelectedCollectionId, vaultPath]);

  // Whiteboards are a view, not a collection, but they occupy the same slot in
  // the per-vault selection memory so switching vaults restores the last view.
  const selectCanvasView = useCallback(() => {
    setSelectedCollectionId(null);
    setSearchQuery("");
    if (vaultPath) void window.prism.setSetting(`last_coll_${vaultPath}`, CANVAS_VIEW_ID);
  }, [setSelectedCollectionId, vaultPath]);

  // Collection (root list or group) that contains an absolute note path
  const findCollectionForNote = useCallback((absPath: string): string | null => {
    const rel = noteKey(toRelativePath(absPath, viewVaultPath));
    const owner = collectionsApi.collections.find((c) =>
      c.notePaths.some((p) => noteKey(p) === rel) ||
      (c.groups ?? []).some((g) =>
        g.notePaths.some((p) => noteKey(p) === rel),
      ),
    );
    return owner?.id ?? null;
  }, [collectionsApi.collections, viewVaultPath]);

  const collectionColorByName = useMemo(() => {
    const map = new Map<string, PaletteColor>();
    if (!collectionsApi.collections) return map;
    for (const collection of collectionsApi.collections) {
      map.set(collection.name, resolveTagColor(collection.name, collection.color));
    }
    return map;
  }, [collectionsApi.collections]);

  return {
    vaultPath: viewVaultPath,
    notes,
    privateVault,
    locked,
    settings,
    scanning,
    switching,
    shownVaultPath,
    notesLoading,
    initialLoading,
    vaultError,
    debouncedQuery,
    searchQuery,
    setSearchQuery,
    searchScope,
    changeSearchScope,
    selectCollection,
    selectCanvasView,
    findCollectionForNote,
    favorites,
    loadNotes,
    reload: () => setReloadKey((key) => key + 1),
    collectionColorByName,
    initialLoadDone,
    ...collectionsApi,
  };
}

export type NoteLibrary = ReturnType<typeof useNoteLibrary>;
