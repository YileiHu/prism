import { useState, useEffect, useCallback, useMemo, useRef, type JSX } from "react";
import {
  Search, FileText, ExternalLink,
  FolderOpen, CheckSquare, Maximize2,
  Trash2, Plus, Pencil,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import "../lib/api";
import CollectionsSidebar, { type CollectionData, type NoteGroup } from "./CollectionsSidebar";
import CollectionDetail from "./CollectionDetail";
import CreateCollectionModal from "./CreateCollectionModal";
import CreateNoteModal from "./CreateNoteModal";
import BatchActionBar from "./BatchActionBar";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import Button from "./Button";
import Modal from "./Modal";

interface ObsidianNote {
  id: number;
  path: string;
  title: string;
  content?: string;
  tags: string;
  modified_at: string;
}

interface VaultEntry {
  name: string;
  path: string;
}

interface CollectionsFile {
  version: number;
  collections: CollectionData[];
}

interface ConfirmDialog {
  message: string;
  onConfirm: () => void;
}

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function toRelativePath(absPath: string, vaultPath: string): string {
  const vp = vaultPath.replace(/\\/g, "/").toLowerCase();
  const ap = absPath.replace(/\\/g, "/").toLowerCase();
  if (ap.startsWith(vp)) {
    return absPath.slice(vaultPath.length).replace(/^[/\\]/, "").replace(/\\/g, "/");
  }
  return absPath.replace(/\\/g, "/");
}

export default function ObsidianVault() {
  const { t } = useT();

  // Vault state
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultEntry | null>(null);
  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [scanning, setScanning] = useState(false);

  // Collections state
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionData | null>(null);

  // Rename note state
  const [renameNoteTarget, setRenameNoteTarget] = useState<ObsidianNote | null>(null);
  const [renameNoteTitle, setRenameNoteTitle] = useState("");

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Collapse state for collection groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const allExpanded = collapsedGroups.size === 0 && !ungroupedCollapsed;

  const handleToggleAll = () => {
    if (allExpanded) {
      const groupIds = (selectedCollection?.groups ?? []).map((g) => g.id);
      setCollapsedGroups(new Set(groupIds));
      setUngroupedCollapsed(true);
    } else {
      setCollapsedGroups(new Set());
      setUngroupedCollapsed(false);
    }
  };

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ note: ObsidianNote; x: number; y: number } | null>(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Debounce save timer
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ---- Collections persistence ----

  const saveCollections = useCallback((colls: CollectionData[]) => {
    if (!selectedVault) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.prism.saveCollections(selectedVault.path, { version: 1, collections: colls });
    }, 300);
  }, [selectedVault]);

  const loadCollections = useCallback(async (vaultPath: string) => {
    const data = await window.prism.loadCollections(vaultPath) as CollectionsFile | null;
    setCollections(data?.collections ?? []);
  }, []);

  // ---- Vault loading ----

  useEffect(() => {
    (async () => {
      const [raw, lastPath] = await Promise.all([
        window.prism.getSetting("vault_paths"),
        window.prism.getSetting("last_vault_path"),
      ]);
      if (!raw) return;
      let parsed: VaultEntry[] = [];
      try { parsed = JSON.parse(raw); } catch { return; }
      setVaults(parsed);
      if (parsed.length === 0) return;
      if (lastPath) {
        const last = parsed.find((v) => v.path === lastPath);
        if (last) { await selectVault(last); return; }
      }
      await selectVault(parsed[0]);
    })();
  }, []);

  const selectVault = async (vault: VaultEntry) => {
    const isVaultSwitch = selectedVault !== null && selectedVault.path !== vault.path;

    setSelectedVault(vault);
    setScanning(true);
    setSelectMode(false);
    setSelectedPaths(new Set());
    try {
      await window.prism.setSetting("last_vault_path", vault.path);

      if (isVaultSwitch) {
        // Switching vaults: must scan first to populate DB with new vault's notes
        await window.prism.setVaultPath(vault.path);
        const [freshNotes, collData] = await Promise.all([
          window.prism.getNoteList(),
          window.prism.loadCollections(vault.path) as Promise<CollectionsFile | null>,
        ]);
        setNotes(freshNotes);
        setCollections(collData?.collections ?? []);
        setScanning(false);
        const lastCollId = await window.prism.getSetting(`last_coll_${vault.path}`);
        setSelectedCollectionId(
          lastCollId && (collData?.collections ?? []).some((c: CollectionData) => c.id === lastCollId) ? lastCollId : null
        );
      } else {
        // Same vault (startup): show cached data immediately, scan in background
        const [cachedNotes, collData] = await Promise.all([
          window.prism.getNoteList(),
          window.prism.loadCollections(vault.path) as Promise<CollectionsFile | null>,
        ]);
        setNotes(cachedNotes);
        setCollections(collData?.collections ?? []);
        setScanning(false);
        const lastCollId = await window.prism.getSetting(`last_coll_${vault.path}`);
        if (lastCollId && (collData?.collections ?? []).some((c: CollectionData) => c.id === lastCollId)) {
          setSelectedCollectionId(lastCollId);
        }
        // Background scan: fire-and-forget so UI stays responsive
        window.prism.setVaultPath(vault.path).then(async () => {
          const freshNotes = await window.prism.getNoteList();
          setNotes(freshNotes);
        });
      }
    } finally {
      setScanning(false);
    }
  };

  // Reload vaults on focus
  useEffect(() => {
    const handler = async () => {
      const raw = await window.prism.getSetting("vault_paths");
      if (!raw) return;
      let parsed: VaultEntry[] = [];
      try { parsed = JSON.parse(raw); } catch { return; }
      setVaults(parsed);
      if (selectedVault) {
        const still = parsed.find((v) => v.path === selectedVault.path);
        if (!still) setSelectedVault(null);
      }
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [selectedVault]);

  // ---- Notes loading ----

  const loadNotes = useCallback(async () => {
    if (debouncedQuery.trim()) {
      setNotes(await window.prism.searchNotes(debouncedQuery));
    } else {
      setNotes(await window.prism.getNoteList());
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (selectedVault && !scanning) loadNotes();
  }, [loadNotes, selectedVault, scanning]);

  const handleSelectVault = async (vault: VaultEntry) => {
    await selectVault(vault);
  };

  const handleRefresh = async () => {
    if (!selectedVault) return;
    setScanning(true);
    try {
      await window.prism.setVaultPath(selectedVault.path);
      await loadNotes();
      await loadCollections(selectedVault.path);
    } finally {
      setScanning(false);
    }
  };

  const handleCreateNote = (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => {
    setShowNewNoteModal(false);
    showToast(t["obsidian.newNoteCreated"].replace("{name}", note.title));
    const relPath = toRelativePath(note.path, selectedVault!.path);
    if (collectionId) {
      if (groupId) {
        handleMoveNoteDirect(collectionId, relPath, null, groupId);
      } else {
        handleDropNoteDirect(collectionId, [relPath]);
      }
    }
    loadNotes();
  };

  const handleDropNoteDirect = (collectionId: string, notePaths: string[]) => {
    const updated = collections.map((c) => {
      if (c.id !== collectionId) return c;
      const newPaths = [...c.notePaths];
      let added = 0;
      for (const np of notePaths) {
        if (!newPaths.includes(np)) { newPaths.push(np); added++; }
      }
      if (added > 0) showToast(t["collections.added"].replace("{name}", c.name));
      return { ...c, notePaths: newPaths };
    });
    setCollections(updated);
    saveCollections(updated);
  };

  const handleMoveNoteDirect = (collectionId: string, relPath: string, _fromGroupId: string | null, toGroupId: string) => {
    const updated = collections.map((c) => {
      if (c.id !== collectionId) return c;
      const groups = (c.groups ?? []).map((g) => {
        if (g.id !== toGroupId) return g;
        if (g.notePaths.includes(relPath)) return g;
        return { ...g, notePaths: [...g.notePaths, relPath] };
      });
      return { ...c, groups };
    });
    setCollections(updated);
    saveCollections(updated);
  };

  const handleRenameNote = async () => {
    if (!renameNoteTitle.trim() || !renameNoteTarget || !selectedVault) return;
    const oldRelPath = toRelativePath(renameNoteTarget.path, selectedVault.path);
    const result = await window.prism.renameNote(renameNoteTarget.path, renameNoteTitle.trim());
    const newRelPath = toRelativePath(result.path, selectedVault.path);
    const updated = collections.map((c) => ({
      ...c,
      notePaths: c.notePaths.map((p) => p === oldRelPath ? newRelPath : p),
      groups: (c.groups ?? []).map((g) => ({
        ...g,
        notePaths: g.notePaths.map((p) => p === oldRelPath ? newRelPath : p),
      })),
    }));
    setCollections(updated);
    saveCollections(updated);
    setRenameNoteTarget(null);
    showToast(t["obsidian.renamed"].replace("{name}", renameNoteTitle.trim()));
    loadNotes();
  };

  // ---- Collection operations ----

  const handleCreateCollection = (name: string) => {
    const newColl: CollectionData = { id: makeId(), name, notePaths: [] };
    const updated = [...collections, newColl];
    setCollections(updated);
    saveCollections(updated);
    setShowCreateModal(false);
    setSelectedCollectionId(newColl.id);
  };

  const handleRenameCollection = (name: string) => {
    if (!renameTarget) return;
    const updated = collections.map((c) => c.id === renameTarget.id ? { ...c, name } : c);
    setCollections(updated);
    saveCollections(updated);
    setRenameTarget(null);
  };

  const handleDeleteCollection = (id: string) => {
    const coll = collections.find((c) => c.id === id);
    setConfirm({
      message: t["collections.deleteConfirm"],
      onConfirm: async () => {
        const updated = collections.filter((c) => c.id !== id);
        setCollections(updated);
        saveCollections(updated);
        if (selectedCollectionId === id) {
          setSelectedCollectionId(null);
          if (selectedVault) {
            await window.prism.setSetting(`last_coll_${selectedVault.path}`, "");
          }
        }
        setConfirm(null);
        showToast(t["collections.removed"].replace("{name}", coll?.name ?? ""));
      },
    });
  };

  const handleReorderCollections = (from: number, to: number) => {
    const updated = [...collections];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setCollections(updated);
    saveCollections(updated);
  };

  const handleDropNote = (collectionId: string, notePaths: string[]) => {
    // Normalize to relative paths (may receive absolute paths from multi-select)
    const relPaths = selectedVault
      ? notePaths.map((p) => toRelativePath(p, selectedVault.path))
      : notePaths;
    const updated = collections.map((c) => {
      if (c.id !== collectionId) return c;
      const newPaths = [...c.notePaths];
      let added = 0;
      for (const np of relPaths) {
        if (!newPaths.includes(np)) {
          newPaths.push(np);
          added++;
        }
      }
      if (added > 0) {
        const name = c.name;
        showToast(t["collections.added"].replace("{name}", name));
      } else {
        showToast(t["collections.alreadyExists"]);
      }
      return { ...c, notePaths: newPaths };
    });
    setCollections(updated);
    saveCollections(updated);
  };

  // ---- Group operations ----

  const updateCollection = (collId: string, fn: (c: CollectionData) => CollectionData) => {
    const updated = collections.map((c) => c.id === collId ? fn(c) : c);
    setCollections(updated);
    saveCollections(updated);
  };

  const handleAddGroup = (name: string) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => ({
      ...c,
      groups: [...(c.groups ?? []), { id: makeId(), name, notePaths: [] }],
    }));
  };

  const handleRenameGroup = (groupId: string, newName: string) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => ({
      ...c,
      groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, name: newName } : g),
    }));
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => ({
      ...c,
      groups: (c.groups ?? []).filter((g) => g.id !== groupId),
    }));
  };

  const handleReorderGroups = (fromIndex: number, toIndex: number) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => {
      const groups = [...(c.groups ?? [])];
      const [moved] = groups.splice(fromIndex, 1);
      groups.splice(toIndex, 0, moved);
      return { ...c, groups };
    });
  };

  const handleMoveNote = (relPath: string, fromGroupId: string | null, toGroupId: string | null) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => {
      let updated = { ...c, groups: (c.groups ?? []).map((g) => ({ ...g, notePaths: [...g.notePaths] })), notePaths: [...c.notePaths] };
      // Remove from source
      if (fromGroupId) {
        const fromGroup = updated.groups!.find((g) => g.id === fromGroupId);
        if (fromGroup) fromGroup.notePaths = fromGroup.notePaths.filter((p) => p !== relPath);
      } else {
        updated.notePaths = updated.notePaths.filter((p) => p !== relPath);
      }
      // Add to target
      if (toGroupId) {
        const toGroup = updated.groups!.find((g) => g.id === toGroupId);
        if (toGroup && !toGroup.notePaths.includes(relPath)) {
          toGroup.notePaths = [...toGroup.notePaths, relPath];
        }
      } else {
        if (!updated.notePaths.includes(relPath)) {
          updated.notePaths = [...updated.notePaths, relPath];
        }
      }
      return updated;
    });
  };

  const handleRemoveNote = (relPath: string, groupId: string | null) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => {
      if (groupId) {
        return { ...c, groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, notePaths: g.notePaths.filter((p) => p !== relPath) } : g) };
      }
      return { ...c, notePaths: c.notePaths.filter((p) => p !== relPath) };
    });
    showToast(t["collections.removed"]);
  };

  const handleReorderNotesInGroup = (groupId: string | null, fromIndex: number, toIndex: number) => {
    if (!selectedCollectionId) return;
    updateCollection(selectedCollectionId, (c) => {
      if (groupId) {
        return {
          ...c,
          groups: (c.groups ?? []).map((g) => {
            if (g.id !== groupId) return g;
            const paths = [...g.notePaths];
            const [moved] = paths.splice(fromIndex, 1);
            paths.splice(toIndex, 0, moved);
            return { ...g, notePaths: paths };
          }),
        };
      }
      const paths = [...c.notePaths];
      const [moved] = paths.splice(fromIndex, 1);
      paths.splice(toIndex, 0, moved);
      return { ...c, notePaths: paths };
    });
  };

  // ---- Select mode ----

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedPaths(new Set());
  };

  const toggleSelectPath = (path: string, ctrlKey: boolean = false) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (ctrlKey) {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      } else {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  };

  // ---- Batch operations ----

  const handleBatchAddToCollection = (collectionId: string) => {
    handleDropNote(collectionId, Array.from(selectedPaths));
    setSelectedPaths(new Set());
  };

  const handleBatchDelete = () => {
    const paths = Array.from(selectedPaths);
    const count = paths.length;
    setConfirm({
      message: t["confirm.deleteFiles"].replace("{count}", String(count)),
      onConfirm: async () => {
        setConfirm(null);
        const result = await window.prism.trashFiles(paths);
        if (result.allSuccess) {
          // Remove deleted from all collections (including groups)
          const relativePaths = paths.map((p) => toRelativePath(p, selectedVault!.path));
          const updated = collections.map((c) => ({
            ...c,
            notePaths: c.notePaths.filter((np) => !relativePaths.includes(np)),
            groups: (c.groups ?? []).map((g) => ({
              ...g,
              notePaths: g.notePaths.filter((np) => !relativePaths.includes(np)),
            })),
          }));
          setCollections(updated);
          saveCollections(updated);
          setSelectedPaths(new Set());
          await loadNotes();
          showToast(`Deleted ${count} files`);
        } else {
          const failed = result.results.filter((r: any) => !r.success);
          showToast(`Failed to delete ${failed.length} file(s)`);
        }
      },
    });
  };

  // ---- Context menu ----

  const handleNoteContextMenu = (e: React.MouseEvent, note: ObsidianNote) => {
    e.preventDefault();
    setCtxMenu({ note, x: e.clientX, y: e.clientY });
  };

  const handleCollectionNoteContextMenu = (e: React.MouseEvent, note: { path: string; title: string }) => {
    e.preventDefault();
    setCtxMenu({ note: note as ObsidianNote, x: e.clientX, y: e.clientY });
  };

  const getContextMenuItems = (note: ObsidianNote): MenuItem[] => {
    const relPath = selectedVault ? toRelativePath(note.path, selectedVault.path) : "";

    return [
      {
        label: t["menu.openInObsidian"],
        icon: <ExternalLink size={14} />,
        onClick: () => window.prism.openInObsidian(note.path),
      },
      {
        label: t["menu.showInExplorer"],
        icon: <FolderOpen size={14} />,
        onClick: () => window.prism.showItemInFolder(note.path),
      },
      {
        label: t["menu.rename"],
        icon: <Pencil size={14} />,
        onClick: () => { setRenameNoteTarget(note); setRenameNoteTitle(note.title); },
      },
      { label: "", divider: true },
      {
        label: t["menu.addToCollection"],
        icon: <FileText size={14} />,
        children: collections.length > 0
          ? collections.map((c) => ({
            label: c.name,
            checked: c.notePaths.includes(relPath),
            onClick: () => handleDropNote(c.id, [relPath]),
          }))
          : [{ label: t["collections.none"], onClick: () => {} }],
      },
      { label: "", divider: true },
      {
        label: t["menu.moveToTrash"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => {
          setConfirm({
            message: t["confirm.deleteFile"].replace("{name}", note.title + ".md"),
            onConfirm: async () => {
              setConfirm(null);
              const result = await window.prism.trashFile(note.path);
              if (result.success) {
                // Remove from collections (including groups)
                const updated = collections.map((c) => ({
                  ...c,
                  notePaths: c.notePaths.filter((np) => np !== relPath),
                  groups: (c.groups ?? []).map((g) => ({
                    ...g,
                    notePaths: g.notePaths.filter((np) => np !== relPath),
                  })),
                }));
                setCollections(updated);
                saveCollections(updated);
                await loadNotes();
              } else {
                showToast(`Failed to delete: ${result.error}`);
              }
            },
          });
        },
      },
    ];
  };

  // ---- Derived data ----

  const selectedCollection = useMemo(() => {
    if (!selectedCollectionId) return null;
    return collections.find((c) => c.id === selectedCollectionId) ?? null;
  }, [collections, selectedCollectionId]);

  // Lowercase keys: paths on Windows are case-insensitive, and stored
  // collection paths may differ in case from what the vault scan returns
  const notesByRelPath = useMemo(() => {
    const map = new Map<string, ObsidianNote>();
    if (!selectedVault) return map;
    for (const n of notes) {
      map.set(toRelativePath(n.path, selectedVault.path).replace(/\//g, "\\").toLowerCase(), n);
    }
    return map;
  }, [notes, selectedVault]);

  // Map a notePaths array to note info objects
  const mapNotes = (notePaths: string[]): { path: string; relativePath: string; title: string; missing: boolean }[] => {
    if (!selectedVault) return [];
    return notePaths.map((relPath) => {
      const found = notesByRelPath.get(relPath.replace(/\//g, "\\").toLowerCase());
      return { path: found?.path ?? relPath, relativePath: relPath, title: found?.title ?? relPath, missing: !found };
    });
  };

  // Grouped + ungrouped note views for selected collection
  const groupedViews = useMemo(() => {
    if (!selectedCollection) return [];
    return (selectedCollection.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      notes: mapNotes(g.notePaths),
    }));
  }, [selectedCollection, notesByRelPath]);

  const ungroupedNotes = useMemo(() => {
    if (!selectedCollection) return [];
    return mapNotes(selectedCollection.notePaths);
  }, [selectedCollection, notesByRelPath]);

  const totalCollectionNotes = ungroupedNotes.length + groupedViews.reduce((s, g) => s + g.notes.length, 0);

  // Map each note (lowercase relPath) to the collection names it belongs to
  const noteCollections = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!selectedVault) return map;
    for (const c of collections) {
      for (const np of c.notePaths) {
        const key = np.replace(/\//g, "\\").toLowerCase();
        const names = map.get(key);
        if (names) names.push(c.name);
        else map.set(key, [c.name]);
      }
      for (const g of (c.groups ?? [])) {
        for (const np of g.notePaths) {
          const key = np.replace(/\//g, "\\").toLowerCase();
          const names = map.get(key);
          if (names) names.push(c.name);
          else map.set(key, [c.name]);
        }
      }
    }
    return map;
  }, [collections, selectedVault]);

  // Sort notes: unfiled first, then by collection name, then by title
  const sortedNotes = useMemo(() => {
    if (!selectedVault) return notes;
    return [...notes].sort((a, b) => {
      const aKey = toRelativePath(a.path, selectedVault.path).replace(/\//g, "\\").toLowerCase();
      const bKey = toRelativePath(b.path, selectedVault.path).replace(/\//g, "\\").toLowerCase();
      const aColls = noteCollections.get(aKey) ?? [];
      const bColls = noteCollections.get(bKey) ?? [];
      // Unfiled first
      if (aColls.length === 0 && bColls.length > 0) return -1;
      if (aColls.length > 0 && bColls.length === 0) return 1;
      // Both filed: sort by first collection
      if (aColls.length > 0 && bColls.length > 0) {
        const cmp = aColls[0].localeCompare(bColls[0]);
        if (cmp !== 0) return cmp;
      }
      // Same collection or both unfiled: sort by title
      return a.title.localeCompare(b.title);
    });
  }, [notes, selectedVault, noteCollections]);

  // Virtual scroll for notes list
  const notesScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedNotes.length,
    getScrollElement: () => notesScrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });

  // ---- Render ----

  if (!selectedVault) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t["obsidian.empty"]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Collections Sidebar */}
      <CollectionsSidebar
        collections={collections}
        selectedId={selectedCollectionId}
        allNotesCount={sortedNotes.length}
        vaults={vaults}
        selectedVault={selectedVault}
        scanning={scanning}
        onSelect={(id) => {
          setSelectedCollectionId(id);
          setSelectMode(false);
          setSelectedPaths(new Set());
          setCollapsedGroups(new Set());
          setUngroupedCollapsed(false);
          if (id !== null) setSearchQuery("");
          window.prism.setSetting(`last_coll_${selectedVault.path}`, id ?? "");
        }}
        onCreate={() => setShowCreateModal(true)}
        onRename={(id) => {
          const coll = collections.find((c) => c.id === id);
          if (coll) setRenameTarget(coll);
        }}
        onDelete={handleDeleteCollection}
        onReorder={handleReorderCollections}
        onDropNote={handleDropNote}
        onSelectVault={handleSelectVault}
        onRefresh={handleRefresh}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar + select (only in all notes view) */}
        {!selectedCollectionId && (
          <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-800/50 flex-shrink-0 bg-white/[0.04]">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t["obsidian.search"]}
                className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-3 py-1 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-md"
              onClick={() => setShowNewNoteModal(true)}
              disabled={!selectedVault}
              title={t["obsidian.newNote"]}
            >
              <Plus size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon-md"
              active={selectMode}
              onClick={toggleSelectMode}
              title={selectMode ? t["batch.cancelSelect"] : t["batch.selectMode"]}
            >
              <CheckSquare size={16} />
            </Button>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Collection detail view */}
          {selectedCollection && selectedCollectionId && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 h-11 border-b border-gray-800/50 flex-shrink-0 flex items-center gap-2 bg-white/[0.04]">
                <h2 className="text-base font-semibold text-gray-200">{selectedCollection.name}</h2>
                <span className="text-xs text-gray-500">{totalCollectionNotes} notes</span>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={() => setShowNewNoteModal(true)}
                  disabled={!selectedVault}
                  title={t["obsidian.newNote"]}
                >
                  <Plus size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={handleToggleAll}
                  title={allExpanded
                    ? (t["collections.collapseAll"] ?? "折叠全部")
                    : (t["collections.expandAll"] ?? "展开全部")}
                >
                  <Maximize2 size={16} />
                </Button>
              </div>
              <CollectionDetail
                groups={groupedViews}
                ungroupedNotes={ungroupedNotes}
                collapsedGroups={collapsedGroups}
                ungroupedCollapsed={ungroupedCollapsed}
                onToggleGroup={(id) => setCollapsedGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
                onToggleUngrouped={() => setUngroupedCollapsed(!ungroupedCollapsed)}
                onAddGroup={handleAddGroup}
                onRenameGroup={handleRenameGroup}
                onDeleteGroup={handleDeleteGroup}
                onReorderGroups={handleReorderGroups}
                onMoveNote={handleMoveNote}
                onRemoveNote={handleRemoveNote}
                onReorderNotes={handleReorderNotesInGroup}
                onNoteContextMenu={handleCollectionNoteContextMenu}
              />
            </div>
          )}

          {/* All notes flat list */}
          {!selectedCollectionId && (
            <div className="flex-1 overflow-y-auto py-1" ref={notesScrollRef}>
              {sortedNotes.length === 0 && (
                <div className="text-center text-gray-400 mt-20 animate-pulse text-sm">
                  {scanning ? t["obsidian.scanning"] : (searchQuery ? t["obsidian.emptySearch"] : t["obsidian.emptyVault"])}
                </div>
              )}
              {sortedNotes.length > 0 && (
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const note = sortedNotes[virtualRow.index];
                    const relPath = selectedVault ? toRelativePath(note.path, selectedVault.path) : "";
                    const isSelected = selectedPaths.has(note.path);
                    return (
                      <div
                        key={note.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          draggable
                          onDragStart={(e) => {
                            const paths = selectedPaths.size > 0 && selectedPaths.has(note.path)
                              ? Array.from(selectedPaths)
                              : [relPath];
                            e.dataTransfer.setData("text/x-note-paths", JSON.stringify(paths));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onContextMenu={(e) => handleNoteContextMenu(e, note)}
                          onClick={() => {
                            if (selectMode) toggleSelectPath(note.path);
                            else window.prism.openInObsidian(note.path);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer ${
                            isSelected ? "bg-[var(--accent-muted)]" : "hover:bg-gray-800/30"
                          }`}
                          title={note.path}
                        >
                          {selectMode && (
                            <div
                              className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-[var(--accent)] border-[var(--accent)]"
                                  : "border-gray-600"
                              }`}
                            >
                              {isSelected && <CheckSquare size={12} className="text-white" />}
                            </div>
                          )}
                          <span className={`text-sm truncate flex-1 ${isSelected ? "text-[var(--accent-text)]" : "text-gray-300"}`}>
                            {note.title}
                          </span>
                          {!selectMode && (() => {
                            const noteColls = noteCollections.get(relPath.replace(/\//g, "\\").toLowerCase()) ?? [];
                            if (noteColls.length === 0) {
                              return (
                                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-400 bg-amber-500/10 whitespace-nowrap">
                                  未归类
                                </span>
                              );
                            }
                            return (
                              <span className="flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                                {noteColls.slice(0, 3).map((name) => (
                                  <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400 whitespace-nowrap">
                                    {name}
                                  </span>
                                ))}
                                {noteColls.length > 3 && (
                                  <span className="text-[10px] text-gray-600">+{noteColls.length - 3}</span>
                                )}
                              </span>
                            );
                          })()}
                          {note.tags && !selectMode && (
                            <span className="hidden xl:flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                              {note.tags.split(" ").filter(Boolean).slice(0, 2).map((tag) => (
                                <span key={tag} className="text-xs text-[var(--accent-text)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Batch action bar */}
          {selectMode && selectedPaths.size > 0 && (
            <BatchActionBar
              selectedCount={selectedPaths.size}
              collections={collections}
              onAddToCollection={handleBatchAddToCollection}
              onDelete={handleBatchDelete}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateCollectionModal
          title={t["collections.new"]}
          onSave={handleCreateCollection}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {renameTarget && (
        <CreateCollectionModal
          title={t["collections.rename"]}
          initialName={renameTarget.name}
          onSave={handleRenameCollection}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {showNewNoteModal && selectedVault && (
        <CreateNoteModal
          vaultPath={selectedVault.path}
          collections={collections}
          onCreated={handleCreateNote}
          onClose={() => setShowNewNoteModal(false)}
        />
      )}

      {/* Rename note modal */}
      <Modal
        open={renameNoteTarget !== null}
        title={t["menu.rename"]}
        icon={<Pencil size={18} className="text-[var(--accent-text)]" />}
        onClose={() => setRenameNoteTarget(null)}
        width="400px"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameNoteTarget(null)}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="md" onClick={handleRenameNote} disabled={!renameNoteTitle.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <input
          type="text"
          value={renameNoteTitle}
          onChange={(e) => setRenameNoteTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameNote();
          }}
          placeholder={t["obsidian.renameTitle"]}
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </Modal>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          items={getContextMenuItems(ctxMenu.note)}
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          position="center"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>{t["resources.cancel"]}</Button>
              <Button variant="danger" size="sm" onClick={confirm.onConfirm}>{t["resources.save"]}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-200">{confirm.message}</p>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-sm text-gray-200 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  );
}
