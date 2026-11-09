import { useState, useCallback, useMemo, useEffect } from "react";
import { type CollectionData } from "./collectionTypes";
import type { NoteBrief } from "../shared/models";
import { useT } from "../i18n";
import { useToast } from "../lib/toast";
import { noteKey } from "../lib/workspace/types";
import { relativePathInsideVault, toRelativePath } from "../lib/paths";
import { useDebouncedPersist } from "../lib/useDebouncedJsonPersist";
import { deleteById, insertAt, moveItem, renameById } from "../lib/collectionOps";

export { relativePathInsideVault, toRelativePath } from "../lib/paths";

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

interface CollectionsFile {
  version: number;
  collections: CollectionData[];
}

// Invariant: within one collection a note lives in exactly one place —
// either the root notePaths (ungrouped) or a single group.
function collectionHasNote(c: CollectionData, relPath: string): boolean {
  return c.notePaths.includes(relPath) || (c.groups ?? []).some((g) => g.notePaths.includes(relPath));
}

interface UseCollectionsOptions {
  vaultPath: string;
  dataVaultPath: string;
  notes: NoteBrief[];
  loadNotes: () => Promise<void>;
  // While a search is active, `notes` is only the matching subset — healing
  // against it would mark (or even relink) everything else as missing.
  searching?: boolean;
}

export function useCollections({ vaultPath, dataVaultPath, notes, loadNotes, searching = false }: UseCollectionsOptions) {
  const { t } = useT();
  const showToast = useToast();
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const { schedule: schedulePersist } = useDebouncedPersist({
    onError: () => showToast(t["common.saveFailed"], "error"),
  });

  const persistCollections = useCallback((colls: CollectionData[]) => {
    // Never write collections that belong to a different vault than the target.
    // Dropping the save is strictly safer than overwriting another vault's file.
    if (dataVaultPath !== vaultPath) {
      console.warn("Skipped collections save: state/vault mismatch", { dataVaultPath, vaultPath });
      return Promise.resolve();
    }
    return window.prism.saveNoteCollections(vaultPath, { version: 1, collections: colls });
  }, [vaultPath, dataVaultPath]);

  const saveCollections = useCallback((colls: CollectionData[]) => {
    schedulePersist(() => persistCollections(colls));
  }, [schedulePersist, persistCollections]);

  const loadCollections = useCallback(async (vp: string) => {
    const data = await window.prism.loadNoteCollections(vp) as CollectionsFile | null;
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
      const updated = renameById(prev, target.id, name);
      saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  const handleDeleteCollection = useCallback((id: string) => {
    const coll = collections.find((c) => c.id === id);
    return {
      collName: coll?.name ?? "",
      onConfirm: () => {
        const updated = deleteById(collections, id);
        setCollections(updated);
        saveCollections(updated);
        if (selectedCollectionId === id) {
          setSelectedCollectionId(null);
          window.prism.setSetting(`last_coll_${vaultPath}`, "");
        }
      },
    };
  }, [collections, saveCollections, selectedCollectionId, vaultPath]);

  const restoreCollections = useCallback((snapshot: CollectionData[], selectedId?: string | null) => {
    setCollections(snapshot);
    saveCollections(snapshot);
    if (selectedId !== undefined) {
      setSelectedCollectionId(selectedId);
      window.prism.setSetting(`last_coll_${vaultPath}`, selectedId ?? "");
    }
  }, [saveCollections, vaultPath]);

  const handleSetCollectionColor = useCallback((collId: string, color: string) => {
    updateCollection(collId, (c) => ({ ...c, color }));
  }, [updateCollection]);

  const handleReorderCollections = useCallback((from: number, to: number) => {
    setCollections((prev) => {
      const updated = moveItem(prev, from, to);
      if (updated !== prev) saveCollections(updated);
      return updated;
    });
  }, [saveCollections]);

  // ---- Note-to-collection operations ----
  // A note may belong to multiple collections (context menu checkmarks imply it),
  // so adding never removes it from other collections.

  const handleDropNote = useCallback((collectionId: string, notePaths: string[]) => {
    const relPaths = notePaths.map((p) => toRelativePath(p, vaultPath));
    const target = collections.find((c) => c.id === collectionId);
    if (!target) return;
    const newOnes = relPaths.filter((np) => !collectionHasNote(target, np));
    showToast(newOnes.length > 0
      ? t["collections.added"].replace("{name}", target.name)
      : t["collections.alreadyExists"]);
    if (newOnes.length === 0) return;
    const updated = collections.map((c) =>
      c.id === collectionId ? { ...c, notePaths: [...c.notePaths, ...newOnes] } : c);
    setCollections(updated);
    saveCollections(updated);
  }, [collections, vaultPath, saveCollections, showToast, t]);

  const handleDropNoteDirect = useCallback((collectionId: string, notePaths: string[], silent = false) => {
    const target = collections.find((c) => c.id === collectionId);
    if (!target) return;
    const newOnes = notePaths.filter((np) => !collectionHasNote(target, np));
    if (!silent) {
      showToast(newOnes.length > 0
        ? t["collections.added"].replace("{name}", target.name)
        : t["collections.alreadyExists"]);
    }
    if (newOnes.length === 0) return;
    const updated = collections.map((c) =>
      c.id === collectionId ? { ...c, notePaths: [...c.notePaths, ...newOnes] } : c);
    setCollections(updated);
    saveCollections(updated);
  }, [collections, saveCollections, showToast, t]);

  const handleMoveNoteDirect = useCallback((collectionId: string, relPath: string, toGroupId: string) => {
    updateCollection(collectionId, (c) => {
      if (!(c.groups ?? []).some((g) => g.id === toGroupId)) return c;
      return {
        ...c,
        notePaths: c.notePaths.filter((p) => p !== relPath),
        groups: (c.groups ?? []).map((g) => {
          const paths = g.notePaths.filter((p) => p !== relPath);
          return g.id === toGroupId ? { ...g, notePaths: [...paths, relPath] } : { ...g, notePaths: paths };
        }),
      };
    });
  }, [updateCollection]);

  // ---- Group operations ----

  const handleAddGroup = useCallback((collId: string, name: string, color?: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: [...(c.groups ?? []), { id: makeId(), name, notePaths: [], ...(color ? { color } : {}) }],
    }));
  }, [updateCollection]);

  const handleSetGroupColor = useCallback((collId: string, groupId: string, color: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, color } : g),
    }));
  }, [updateCollection]);

  const handleRenameGroup = useCallback((collId: string, groupId: string, newName: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: renameById(c.groups ?? [], groupId, newName),
    }));
  }, [updateCollection]);

  const handleDeleteGroup = useCallback((collId: string, groupId: string) => {
    updateCollection(collId, (c) => ({
      ...c,
      groups: deleteById(c.groups ?? [], groupId),
    }));
  }, [updateCollection]);

  const handleReorderGroups = useCallback((collId: string, fromIndex: number, toIndex: number) => {
    updateCollection(collId, (c) => {
      const groups = moveItem(c.groups ?? [], fromIndex, toIndex);
      return groups === c.groups ? c : { ...c, groups };
    });
  }, [updateCollection]);

  const handleMoveNote = useCallback((collId: string, relPath: string, fromGroupId: string | null, toGroupId: string | null, toIndex?: number) => {
    updateCollection(collId, (c) => {
      const groups = (c.groups ?? []).map((g) => ({ ...g, notePaths: [...g.notePaths] }));
      let notePaths = c.notePaths;
      if (fromGroupId) {
        const fromGroup = groups.find((g) => g.id === fromGroupId);
        if (fromGroup) fromGroup.notePaths = fromGroup.notePaths.filter((p) => p !== relPath);
      } else {
        notePaths = notePaths.filter((p) => p !== relPath);
      }
      const target = toGroupId ? groups.find((g) => g.id === toGroupId) : null;
      const targetPaths = toGroupId ? target?.notePaths : notePaths;
      if (!targetPaths || targetPaths.includes(relPath)) return { ...c, groups, notePaths };
      const next = insertAt(targetPaths, toIndex ?? targetPaths.length, relPath);
      if (target) target.notePaths = next;
      else notePaths = next;
      return { ...c, groups, notePaths };
    });
  }, [updateCollection]);

  const handleRemoveNote = useCallback((collId: string, relPath: string, groupId: string | null) => {
    const coll = collections.find((c) => c.id === collId);
    const source = groupId
      ? (coll?.groups ?? []).find((g) => g.id === groupId)?.notePaths
      : coll?.notePaths;
    const oldIndex = source ? source.indexOf(relPath) : -1;

    updateCollection(collId, (c) => {
      if (groupId) {
        return { ...c, groups: (c.groups ?? []).map((g) => g.id === groupId ? { ...g, notePaths: g.notePaths.filter((p) => p !== relPath) } : g) };
      }
      return { ...c, notePaths: c.notePaths.filter((p) => p !== relPath) };
    });
    showToast(t["collections.removed"], {
      action: {
        label: t["common.undo"],
        onClick: () => handleMoveNote(collId, relPath, null, groupId, oldIndex >= 0 ? oldIndex : undefined),
      },
    });
  }, [collections, updateCollection, handleMoveNote, showToast, t]);

  const handleMoveToCollection = useCallback((fromCollId: string, toCollId: string, relPath: string, fromGroupId: string | null) => {
    const target = collections.find((c) => c.id === toCollId);
    const updated = collections.map((c) => {
      if (c.id === fromCollId) {
        if (fromGroupId) {
          return { ...c, groups: (c.groups ?? []).map((g) => g.id === fromGroupId ? { ...g, notePaths: g.notePaths.filter((p) => p !== relPath) } : g) };
        }
        return { ...c, notePaths: c.notePaths.filter((p) => p !== relPath) };
      }
      if (c.id === toCollId && !collectionHasNote(c, relPath)) {
        return { ...c, notePaths: [...c.notePaths, relPath] };
      }
      return c;
    });
    setCollections(updated);
    saveCollections(updated);
    showToast(t["collections.moved"].replace("{name}", target?.name ?? ""));
  }, [collections, saveCollections, showToast, t]);

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
  const removeNotePaths = useCallback((relPaths: string[]) => {
    setCollections((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        notePaths: c.notePaths.filter((np) => !relPaths.includes(np)),
        groups: (c.groups ?? []).map((g) => ({
          ...g,
          notePaths: g.notePaths.filter((np) => !relPaths.includes(np)),
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
    const map = new Map<string, NoteBrief>();
    for (const n of notes) {
      map.set(noteKey(toRelativePath(n.path, vaultPath)), n);
    }
    return map;
  }, [notes, vaultPath]);

  // Auto-heal collection paths after an external (e.g. external) rename/move.
  // A missing path is relinked only when exactly one note in the vault shares the
  // same file name — ambiguous or absent matches keep the "missing" marker.
  useEffect(() => {
    if (dataVaultPath !== vaultPath) return;
    if (searching) return;
    if (notes.length === 0 || collections.length === 0) return;

    const missing = new Set<string>();
    const collectMissing = (notePaths: string[]) => {
      for (const np of notePaths) {
        if (!notesByRelPath.has(noteKey(np))) missing.add(np);
      }
    };
    for (const c of collections) {
      collectMissing(c.notePaths);
      for (const g of c.groups ?? []) collectMissing(g.notePaths);
    }
    if (missing.size === 0) return;

    const notesByTitle = new Map<string, NoteBrief[]>();
    for (const n of notes) {
      const arr = notesByTitle.get(n.title);
      if (arr) arr.push(n);
      else notesByTitle.set(n.title, [n]);
    }

    const renames = new Map<string, string>();
    for (const oldRel of missing) {
      const fileName = oldRel.split(/[/\\]/).pop() ?? "";
      const title = fileName.replace(/\.md$/i, "");
      if (!title) continue;
      const candidates = notesByTitle.get(title) ?? [];
      if (candidates.length === 1) {
        const rel = relativePathInsideVault(candidates[0].path, vaultPath);
        if (rel) renames.set(oldRel, rel);
      }
    }
    if (renames.size === 0) return;

    setCollections((prev) => {
      const remap = (notePaths: string[]) => notePaths.map((p) => renames.get(p) ?? p);
      const updated = prev.map((c) => ({
        ...c,
        notePaths: remap(c.notePaths),
        groups: (c.groups ?? []).map((g) => ({ ...g, notePaths: remap(g.notePaths) })),
      }));
      saveCollections(updated);
      return updated;
    });
  }, [notes, collections, notesByRelPath, vaultPath, dataVaultPath, saveCollections, searching]);

  const mapNotes = useCallback((notePaths: string[]) => {
    return notePaths.map((relPath) => {
      const found = notesByRelPath.get(noteKey(relPath));
      const absPath = found?.path ?? `${vaultPath}/${relPath}`.replace(/\\/g, "/");
      return { path: absPath, relPath, title: found?.title ?? relPath, missing: !found };
    });
  }, [vaultPath, notesByRelPath]);

  const groupedViews = useMemo(() => {
    if (!selectedCollection) return [];
    return (selectedCollection.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
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
    for (const c of collections) {
      for (const np of c.notePaths) {
        const key = noteKey(np);
        const names = map.get(key);
        if (names) names.push(c.name);
        else map.set(key, [c.name]);
      }
      for (const g of (c.groups ?? [])) {
        for (const np of g.notePaths) {
          const key = noteKey(np);
          const names = map.get(key);
          if (names) names.push(c.name);
          else map.set(key, [c.name]);
        }
      }
    }
    return map;
  }, [collections]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      const aKey = noteKey(toRelativePath(a.path, vaultPath));
      const bKey = noteKey(toRelativePath(b.path, vaultPath));
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
  }, [notes, vaultPath, noteCollections]);

  // ---- Batch operations ----

  const handleBatchAddToCollection = useCallback((collectionId: string, notePaths: string[]) => {
    handleDropNote(collectionId, notePaths);
  }, [handleDropNote]);

  const handleBatchDelete = useCallback((notePaths: string[]) => {
    return {
      onConfirm: async () => {
        const result = await window.prism.trashFiles(notePaths);
        const succeeded = (result.results as { path: string; success: boolean }[])
          .filter((r) => r.success)
          .map((r) => r.path);
        if (succeeded.length > 0) {
          // Remove DB rows too, otherwise the next loadNotes() resurrects them
          await window.prism.deleteNotes(succeeded);
          removeNotePaths(succeeded.map((p) => toRelativePath(p, vaultPath)));
          await loadNotes();
        }
        const failed = result.results.length - succeeded.length;
        if (failed === 0) {
          showToast(t["batch.deleted"].replace("{count}", String(succeeded.length)));
        } else {
          showToast(t["batch.deleteFailed"].replace("{count}", String(failed)), "error");
        }
      },
    };
  }, [vaultPath, removeNotePaths, loadNotes, showToast, t]);

  return {
    collections,
    setCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    loadCollections,
    // CRUD
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    restoreCollections,
    handleSetCollectionColor,
    handleReorderCollections,
    // Notes in collections
    handleDropNote,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
    handleMoveToCollection,
    handleReorderNotesInGroup,
    // Groups
    handleAddGroup,
    handleSetGroupColor,
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
