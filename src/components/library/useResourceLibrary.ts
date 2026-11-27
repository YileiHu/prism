import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { hashColor, type PaletteColor } from "../../lib/colors";
import { librarySelectionKey, readLibrarySelection, writeLibrarySelection } from "../../lib/librarySelection";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Resource, ResourceCollection } from "../../shared/models";

export interface ResourceCollectionGroup {
  collection: ResourceCollection;
  resources: Resource[];
  color: PaletteColor;
}

const LEGACY_TAG_SELECTION_KEY = "last_resource_tag";

// Web resources are the path-less singleton library source. The data lives in
// SQLite and is only read through IPC; this hook keeps it warm above the library
// panes so switching sources never refetches or loses the filter. Collections are
// single-assignment: a resource may belong to one collection or none.
export function useResourceLibrary() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [collections, setCollections] = useState<ResourceCollection[]>([]);
  const [ungroupedCount, setUngroupedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [selectedCollectionId, setSelectedCollectionIdState] = useState<number | null>(null);
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(new Set());
  const selectionKey = librarySelectionKey("resources");
  const selectionRestoredRef = useRef(false);
  // Guard against out-of-order replies when the query or collection changes.
  const resourcesRequestRef = useRef(0);
  const collectionsRequestRef = useRef(0);

  const loadResources = useCallback(async (collectionOverride?: number | null) => {
    const request = ++resourcesRequestRef.current;
    const collectionId = collectionOverride === undefined ? selectedCollectionId : collectionOverride;
    try {
      const all: Resource[] = debouncedQuery.trim()
        ? await window.prism.searchResources(debouncedQuery)
        : await window.prism.getResources();
      if (request !== resourcesRequestRef.current) return;
      if (!debouncedQuery.trim()) setTotalCount(all.length);
      setResources(collectionId === null ? all : all.filter((resource) => resource.collectionId === collectionId));
    } catch {
      // Keep the previous list: a failed refresh must not blank the library.
    } finally {
      if (request === resourcesRequestRef.current) setLoaded(true);
    }
  }, [debouncedQuery, selectedCollectionId]);

  const loadCollections = useCallback(async () => {
    const request = ++collectionsRequestRef.current;
    try {
      const data = await window.prism.getResourceCollections() as {
        collections: ResourceCollection[];
        ungroupedCount: number;
      };
      if (request !== collectionsRequestRef.current) return;
      setCollections(data.collections);
      setUngroupedCount(data.ungroupedCount);
    } catch {
      // Keep the previous collections; the next mutation or reload retries.
    } finally {
      if (request === collectionsRequestRef.current) setCollectionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  // Collections load after the first render; restore the remembered collection
  // only once and only when it still exists. The old build stored a tag name, so
  // fall back to matching a collection by name (migration keeps tag names).
  useEffect(() => {
    if (!collectionsLoaded || selectionRestoredRef.current) return;
    selectionRestoredRef.current = true;
    if (selectedCollectionId !== null) return;
    void (async () => {
      const saved = await readLibrarySelection(selectionKey);
      if (saved) {
        const match = collections.find((collection) => String(collection.id) === saved)
          ?? collections.find((collection) => collection.name === saved);
        if (match) {
          setSelectedCollectionIdState(match.id);
          void writeLibrarySelection(selectionKey, String(match.id));
          return;
        }
      }
      const legacyTag = await readLibrarySelection(LEGACY_TAG_SELECTION_KEY);
      if (!legacyTag) {
        if (saved) void writeLibrarySelection(selectionKey, null);
        return;
      }
      const match = collections.find((collection) => collection.name === legacyTag);
      if (match) {
        setSelectedCollectionIdState(match.id);
        void writeLibrarySelection(selectionKey, String(match.id));
      }
    })();
  }, [collections, collectionsLoaded, selectedCollectionId, selectionKey]);

  const setSelectedCollection = useCallback((id: number | null) => {
    setSelectedCollectionIdState(id);
    void writeLibrarySelection(selectionKey, id === null ? "" : String(id));
  }, [selectionKey]);

  const colorForCollection = useCallback(
    (collection: ResourceCollection) => hashColor(collection.name),
    [],
  );

  // Card view groups follow the sidebar's collection order; a selected collection
  // switches the content to a flat list, so groups are not used then.
  const collectionGroups = useMemo(() => {
    if (selectedCollectionId !== null) {
      return { groups: [] as ResourceCollectionGroup[], ungrouped: [] as Resource[] };
    }
    const byCollection = new Map<number, Resource[]>();
    const ungrouped: Resource[] = [];
    for (const resource of resources) {
      if (resource.collectionId === null) {
        ungrouped.push(resource);
      } else {
        const bucket = byCollection.get(resource.collectionId);
        if (bucket) bucket.push(resource);
        else byCollection.set(resource.collectionId, [resource]);
      }
    }
    const groups = collections
      .map((collection) => ({
        collection,
        resources: byCollection.get(collection.id) ?? [],
        color: colorForCollection(collection),
      }))
      .filter((group) => group.resources.length > 0);
    return { groups, ungrouped };
  }, [resources, collections, selectedCollectionId, colorForCollection]);

  const selectedCollection = useMemo(
    () => (selectedCollectionId === null ? null : collections.find((c) => c.id === selectedCollectionId) ?? null),
    [collections, selectedCollectionId],
  );

  const toggleCollectionCollapse = useCallback((id: string) => {
    setCollapsedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadResources(), loadCollections()]);
  }, [loadResources, loadCollections]);

  const addResource = useCallback(async (url: string, title: string, notes: string, collectionId: number | null) => {
    const created = await window.prism.addResource(url, title, notes, collectionId);
    await Promise.all([loadResources(), loadCollections()]);
    return created;
  }, [loadResources, loadCollections]);

  const updateResource = useCallback(
    async (id: number, url: string, title: string, notes: string, collectionId: number | null) => {
      const updated = await window.prism.updateResource(id, url, title, notes, collectionId);
      await Promise.all([loadResources(), loadCollections()]);
      return updated;
    },
    [loadResources, loadCollections],
  );

  const removeResource = useCallback(async (id: number) => {
    const deleted = await window.prism.deleteResource(id);
    await Promise.all([loadResources(), loadCollections()]);
    return deleted;
  }, [loadResources, loadCollections]);

  const moveResources = useCallback(async (ids: number[], collectionId: number | null) => {
    const moved = await window.prism.moveResourcesToCollection(ids, collectionId);
    await Promise.all([loadResources(), loadCollections()]);
    return moved;
  }, [loadResources, loadCollections]);

  const createCollection = useCallback(async (name: string) => {
    const created = await window.prism.createResourceCollection(name) as ResourceCollection;
    await loadCollections();
    setSelectedCollection(created.id);
    await loadResources(created.id);
    return created;
  }, [loadCollections, loadResources, setSelectedCollection]);

  const renameCollection = useCallback(async (id: number, name: string) => {
    await window.prism.renameResourceCollection(id, name);
    await loadCollections();
  }, [loadCollections]);

  const setCollectionIcon = useCallback(async (id: number, icon: string) => {
    await window.prism.setResourceCollectionIcon(id, icon);
    await loadCollections();
  }, [loadCollections]);

  const deleteCollection = useCallback(async (id: number) => {
    await window.prism.deleteResourceCollection(id);
    const nextSelection = selectedCollectionId === id ? null : selectedCollectionId;
    if (nextSelection !== selectedCollectionId) setSelectedCollection(nextSelection);
    await Promise.all([loadCollections(), loadResources(nextSelection)]);
  }, [loadCollections, loadResources, selectedCollectionId, setSelectedCollection]);

  // Collection order is global; only the dragged subset changes, and a failed
  // write restores the previous order.
  const reorderCollections = useCallback(async (from: number, to: number) => {
    const previous = collections;
    const next = arrayMove(collections, from, to);
    setCollections(next);
    try {
      await window.prism.reorderResourceCollections(next.map((collection) => collection.id));
    } catch (error) {
      setCollections(previous);
      throw error;
    }
  }, [collections]);

  // Rows keep the slots they already occupy in the global order; the caller
  // passes the reordered subset.
  const reorderResources = useCallback(async (next: Resource[]) => {
    const previous = resources;
    const subset = new Set(next.map((resource) => resource.id));
    setResources((prev) => {
      let index = 0;
      return prev.map((resource) => (subset.has(resource.id) ? next[index++] : resource));
    });
    try {
      await window.prism.reorderResources(next.map((resource) => resource.id));
    } catch (error) {
      setResources(previous);
      throw error;
    }
  }, [resources]);

  return {
    resources,
    collections,
    ungroupedCount,
    loaded,
    collectionsLoaded,
    totalCount,
    searchQuery,
    debouncedQuery,
    setSearchQuery,
    selectedCollectionId,
    selectedCollection,
    setSelectedCollection,
    colorForCollection,
    collectionGroups,
    collapsedCollections,
    toggleCollectionCollapse,
    reload,
    addResource,
    updateResource,
    removeResource,
    moveResources,
    createCollection,
    renameCollection,
    deleteCollection,
    setCollectionIcon,
    reorderCollections,
    reorderResources,
  };
}

export type ResourceLibrary = ReturnType<typeof useResourceLibrary>;
