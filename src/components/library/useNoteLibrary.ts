import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../lib/settings";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { useCollections } from "../useCollections";
import { resolveTagColor, type PaletteColor } from "../../lib/colors";
import type { CollectionData } from "../collectionTypes";

export interface VaultNote {
  id: number;
  path: string;
  title: string;
  content?: string;
  tags: string;
  modified_at: string;
}

const norm = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export function useNoteLibrary(vaultPath: string) {
  const { values: settings } = useSettings();
  const [notes, setNotes] = useState<VaultNote[]>([]);
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
    if (!vaultPath) {
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
  }, [debouncedQuery, vaultPath]);

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
    if (!vaultPath) {
      setScanning(false);
      setInitialLoading(false);
      setSwitching(false);
      if (switchHintTimer.current) {
        clearTimeout(switchHintTimer.current);
        switchHintTimer.current = null;
      }
      setShownVaultPath("");
      dataVaultRef.current = "";
      return;
    }
    void (async () => {
      try {
        await window.prism.setVaultPath(vaultPath);
        const [cachedNotes, collData] = await Promise.all([
          window.prism.getNoteList(vaultPath),
          window.prism.loadCollections(vaultPath) as Promise<{ collections: CollectionData[] } | null>,
        ]);
        if (cancelled) return;
        const colls = collData?.collections ?? [];
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
  }, [vaultPath, reloadKey]);

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
  const collectionsApi = useCollections({ vaultPath: viewVaultPath, dataVaultPath, notes, loadNotes });
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
    return window.prism.onVaultUpdated((changedPath) => {
      if (norm(changedPath) !== norm(vaultPath) || scanning) return;
      void loadNotes();
    });
  }, [vaultPath, loadNotes, scanning]);

  const toggleFavorite = useCallback(async (note: { path: string; title: string }) => {
    const nowFavorite = await window.prism.toggleFavoriteNote(note.path, note.title);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (nowFavorite) next.add(note.path);
      else next.delete(note.path);
      return next;
    });
    window.dispatchEvent(new Event("favorites-changed"));
  }, []);

  const changeSearchScope = useCallback((scope: "title" | "content") => {
    setSearchScope(scope);
    localStorage.setItem(`prism_note_search_scope_v2_${vaultPath}`, scope);
  }, [vaultPath]);

  const selectCollection = useCallback((id: string | null) => {
    setSelectedCollectionId(id);
    if (vaultPath) void window.prism.setSetting(`last_coll_${vaultPath}`, id ?? "");
  }, [setSelectedCollectionId, vaultPath]);

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
    favorites,
    toggleFavorite,
    loadNotes,
    reload: () => setReloadKey((key) => key + 1),
    collectionColorByName,
    initialLoadDone,
    ...collectionsApi,
  };
}

export type NoteLibrary = ReturnType<typeof useNoteLibrary>;
