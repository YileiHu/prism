import { useState, useCallback, useMemo, useRef } from "react";
import { type CollectionData } from "./CollectionsSidebar";

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function toRelativePath(absPath: string, vaultPath: string): string {
  const vp = vaultPath.replace(/\\/g, "/").toLowerCase();
  const ap = absPath.replace(/\\/g, "/").toLowerCase();
  if (ap.startsWith(vp)) {
    return absPath.slice(vaultPath.length).replace(/^[/\\]/, "").replace(/\\/g, "/");
  }
  return absPath.replace(/\\/g, "/");
}

interface ObsidianNote {
  id: number;
  path: string;
  title: string;
  content?: string;
  tags: string;
  modified_at: string;
}

interface CollectionsFile {
  version: number;
  collections: CollectionData[];
}

interface UseCollectionsOptions {
  selectedVault: { name: string; path: string } | null;
  notes: ObsidianNote[];
  showToast: (msg: string) => void;
  loadNotes: () => Promise<void>;
}

export function useCollections({ selectedVault, notes, showToast, loadNotes }: UseCollectionsOptions) {
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const updateCollection = useCallback((collId: string, fn: (c: CollectionData) => CollectionData) => {
    setCollections((prev) => {
      const updated = prev.map((c) => c.id === collId ? fn(c) : c);
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  // ---- Collection CRUD ----

  const handleCreateCollection = useCallback((name: string) => {
    const newColl: CollectionData = { id: makeId(), name, notePaths: [] };
    setCollections((prev) => {
      const updated = [...prev, newColl];
      saveCollections(updated);
      return updated;
    });
    setSelectedCollectionId(newColl.id);
  }, [saveCollections]);

  const handleRenameCollection = useCallback((target: CollectionData, name: string) => {
    setCollections((prev) => {
      const updated = prev.map((c) => c.id === target.id ? { ...c, name } : c);
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  const handleDeleteCollection = useCallback((id: string) => {
    const coll = collections.find((c) => c.id === id);
    return {
      message: "",
      collName: coll?.name ?? "",
      onConfirm: async () => {
        setCollections((prev) => {
          const updated = prev.filter((c) => c.id !== id);
          saveCollections(updated);
          return updated;
        });
        if (selectedCollectionId === id) {
          setSelectedCollectionId(null);
          if (selectedVault) {
            await window.prism.setSetting(`last_coll_${selectedVault.path}`, "");
          }
        }
        showToast(coll?.name ?? "");
      },
    };
  }, [collections, saveCollections, selectedCollectionId, selectedVault, showToast]);

  const handleReorderCollections = useCallback((from: number, to: number) => {
    setCollections((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  // ---- Note-to-collection operations ----

  const handleDropNote = useCallback((collectionId: string, notePaths: string[]) => {
    const relPaths = selectedVault
      ? notePaths.map((p) => toRelativePath(p, selectedVault.path))
      : notePaths;
    setCollections((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== collectionId) return c;
        const newPaths = [...c.notePaths];
        let added = 0;
        for (const np of relPaths) {
          if (!newPaths.includes(np)) { newPaths.push(np); added++; }
        }
        if (added > 0) showToast(c.name);
        else showToast("");
        return { ...c, notePaths: newPaths };
      });
      saveCollections(updated);
      return updated;
    });
  }, [selectedVault, saveCollections, showToast]);

  const handleDropNoteDirect = useCallback((collectionId: string, notePaths: string[]) => {
    setCollections((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== collectionId) return c;
        const newPaths = [...c.notePaths];
        for (const np of notePaths) {
          if (!newPaths.includes(np)) newPaths.push(np);
        }
        return { ...c, notePaths: newPaths };
      });
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  const handleMoveNoteDirect = useCallback((collectionId: string, relPath: string, toGroupId: string) => {
    updateCollection(collectionId, (c) => ({
      ...c,
      groups: (c.groups ?? []).map((g) =>
        g.id !== toGroupId ? g :
        g.notePaths.includes(relPath) ? g :
        { ...g, notePaths: [...g.notePaths, relPath] }
      ),
    }));
  }, [updateCollection]);

  // ---- Group operations ----

  const handleAddGroup = useCallback((collId: string, name: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: [...(c.groups ?? []), { id: makeId(), name, notePaths: [] }],
    }));
  }, [updateCollection]);

  const handleRenameGroup = useCallback((collId: string, groupId: string, newName: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, name: newName } : g),
    }));
  }, [updateCollection]);

  const handleDeleteGroup = useCallback((collId: string, groupId: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: (c.groups ?? []).filter((g) => g.id !== groupId),
    }));
  }, [updateCollection]);

  const handleReorderGroups = useCallback((collId: string, fromIndex: number, toIndex: number) => {
    updateCollection(collId, (c) => {
      const groups = [...(c.groups ?? [])];
      const [moved] = groups.splice(fromIndex, 1);
      groups.splice(toIndex, 0, moved);
      return { ...c, groups };
    });
  }, [updateCollection]);

  const handleMoveNote = useCallback((collId: string, relPath: string, fromGroupId: string | null, toGroupId: string | null) => {
    updateCollection(collId, (c) => {
      let updated = { ...c, groups: (c.groups ?? []).map((g) => ({ ...g, notePaths: [...g.notePaths] })), notePaths: [...c.notePaths] };
      if (fromGroupId) {
        const fromGroup = updated.groups!.find((g) => g.id === fromGroupId);
        if (fromGroup) fromGroup.notePaths = fromGroup.notePaths.filter((p) => p !== relPath);
      } else {
        updated.notePaths = updated.notePaths.filter((p) => p !== relPath);
      }
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
  }, [updateCollection]);

  const handleRemoveNote = useCallback((collId: string, relPath: string, groupId: string | null) => {
    updateCollection(collId, (c) => {
      if (groupId) {
        return { ...c, groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, notePaths: g.notePaths.filter((p) => p !== relPath) } : g) };
      }
      return { ...c, notePaths: c.notePaths.filter((p) => p !== relPath) };
    });
    showToast("");
  }, [updateCollection, showToast]);

  const handleReorderNotesInGroup = useCallback((collId: string, groupId: string | null, fromIndex: number, toIndex: number) => {
    updateCollection(collId, (c) => {
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
  }, [updateCollection]);

  // Update note paths in collections after rename
  const updateNotePaths = useCallback((oldRelPath: string, newRelPath: string) => {
    setCollections((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        notePaths: c.notePaths.map((p) => p === oldRelPath ? newRelPath : p),
        groups: (c.groups ?? []).map((g) => ({
          ...g,
          notePaths: g.notePaths.map((p) => p === oldRelPath ? newRelPath : p),
        })),
      }));
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  // Remove deleted note paths from collections
  const removeNotePaths = useCallback((relativePaths: string[]) => {
    setCollections((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        notePaths: c.notePaths.filter((np) => !relativePaths.includes(np)),
        groups: (c.groups ?? []).map((g) => ({
          ...g,
          notePaths: g.notePaths.filter((np) => !relativePaths.includes(np)),
        })),
      }));
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  // ---- Derived data ----

  const selectedCollection = useMemo(() => {
    if (!selectedCollectionId) return null;
    return collections.find((c) => c.id === selectedCollectionId) ?? null;
  }, [collections, selectedCollectionId]);

  const notesByRelPath = useMemo(() => {
    const map = new Map<string, ObsidianNote>();
    if (!selectedVault) return map;
    for (const n of notes) {
      map.set(toRelativePath(n.path, selectedVault.path).replace(/\//g, "\\").toLowerCase(), n);
    }
    return map;
  }, [notes, selectedVault]);

  const mapNotes = useCallback((notePaths: string[]) => {
    if (!selectedVault) return [];
    return notePaths.map((relPath) => {
      const found = notesByRelPath.get(relPath.replace(/\//g, "\\").toLowerCase());
      const absPath = found?.path ?? `${selectedVault.path}/${relPath}`.replace(/\\/g, "/");
      return { path: absPath, relativePath: relPath, title: found?.title ?? relPath, missing: !found };
    });
  }, [selectedVault, notesByRelPath]);

  const groupedViews = useMemo(() => {
    if (!selectedCollection) return [];
    return (selectedCollection.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      notes: mapNotes(g.notePaths),
    }));
  }, [selectedCollection, mapNotes]);

  const ungroupedNotes = useMemo(() => {
    if (!selectedCollection) return [];
    return mapNotes(selectedCollection.notePaths);
  }, [selectedCollection, mapNotes]);

  const totalCollectionNotes = ungroupedNotes.length + groupedViews.reduce((s, g) => s + g.notes.length, 0);

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

  const sortedNotes = useMemo(() => {
    if (!selectedVault) return notes;
    return [...notes].sort((a, b) => {
      const aKey = toRelativePath(a.path, selectedVault.path).replace(/\//g, "\\").toLowerCase();
      const bKey = toRelativePath(b.path, selectedVault.path).replace(/\//g, "\\").toLowerCase();
      const aColls = noteCollections.get(aKey) ?? [];
      const bColls = noteCollections.get(bKey) ?? [];
      if (aColls.length === 0 && bColls.length > 0) return -1;
      if (aColls.length > 0 && bColls.length === 0) return 1;
      if (aColls.length > 0 && bColls.length > 0) {
        const cmp = aColls[0].localeCompare(bColls[0]);
        if (cmp !== 0) return cmp;
      }
      return a.title.localeCompare(b.title);
    });
  }, [notes, selectedVault, noteCollections]);

  // ---- Batch operations ----

  const handleBatchAddToCollection = useCallback((collectionId: string, paths: string[]) => {
    handleDropNote(collectionId, paths);
  }, [handleDropNote]);

  const handleBatchDelete = useCallback((paths: string[]) => {
    if (!selectedVault) return { message: "", onConfirm: () => {} };
    const relativePaths = paths.map((p) => toRelativePath(p, selectedVault.path));
    return {
      message: "",
      onConfirm: async () => {
        const result = await window.prism.trashFiles(paths);
        if (result.allSuccess) {
          removeNotePaths(relativePaths);
          await loadNotes();
          showToast(`Deleted ${paths.length} files`);
        } else {
          const failed = result.results.filter((r: any) => !r.success);
          showToast(`Failed to delete ${failed.length} file(s)`);
        }
      },
    };
  }, [selectedVault, removeNotePaths, loadNotes, showToast]);

  return {
    collections,
    setCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    loadCollections,
    saveCollections,
    // CRUD
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    handleReorderCollections,
    // Notes in collections
    handleDropNote,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
    handleReorderNotesInGroup,
    // Groups
    handleAddGroup,
    handleRenameGroup,
    handleDeleteGroup,
    handleReorderGroups,
    // Path updates
    updateNotePaths,
    removeNotePaths,
    // Batch
    handleBatchAddToCollection,
    handleBatchDelete,
    // Derived
    selectedCollection,
    groupedViews,
    ungroupedNotes,
    totalCollectionNotes,
    noteCollections,
    sortedNotes,
  };
}
