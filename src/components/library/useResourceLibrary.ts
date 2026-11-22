import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { hashColor, resolveTagColor, type PaletteColor } from "../../lib/colors";
import { librarySelectionKey, readLibrarySelection, writeLibrarySelection } from "../../lib/librarySelection";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Resource, TagInfo } from "../../shared/models";

export interface ResourceTagGroup {
  tag: string;
  resources: Resource[];
  color: PaletteColor;
}

// Web resources are the path-less singleton library source. The data lives in
// SQLite and is only read through IPC; this hook keeps it warm above the
// library panes so switching sources never refetches or loses the filter.
export function useResourceLibrary() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [activeTag, setActiveTagState] = useState<string | null>(null);
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());
  const selectionKey = librarySelectionKey("resources");
  const selectionRestoredRef = useRef(false);
  // Guard against out-of-order replies when the query or tag changes quickly.
  const resourcesRequestRef = useRef(0);
  const tagsRequestRef = useRef(0);

  const loadResources = useCallback(async (tagOverride?: string | null) => {
    const request = ++resourcesRequestRef.current;
    const tag = tagOverride === undefined ? activeTag : tagOverride;
    try {
      const all: Resource[] = debouncedQuery.trim()
        ? await window.prism.searchResources(debouncedQuery)
        : await window.prism.getResources();
      if (request !== resourcesRequestRef.current) return;
      if (!debouncedQuery.trim()) setTotalCount(all.length);
      setResources(tag ? all.filter((resource) => resource.tags.includes(tag)) : all);
    } catch {
      // Keep the previous list: a failed refresh must not blank the library.
    } finally {
      if (request === resourcesRequestRef.current) setLoaded(true);
    }
  }, [debouncedQuery, activeTag]);

  const loadTags = useCallback(async () => {
    const request = ++tagsRequestRef.current;
    try {
      const next = await window.prism.getAllTags();
      if (request !== tagsRequestRef.current) return;
      setTags(next);
    } catch {
      // Keep the previous tags; the next mutation or reload retries.
    } finally {
      if (request === tagsRequestRef.current) setTagsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  // Tags load after the first render; restore the remembered tag only once and
  // only when it still exists.
  useEffect(() => {
    if (!tagsLoaded || selectionRestoredRef.current) return;
    selectionRestoredRef.current = true;
    // A user selection made before the saved tag arrives wins.
    if (activeTag !== null) return;
    void readLibrarySelection(selectionKey).then((saved) => {
      if (!saved) return;
      if (tags.some((tag) => tag.name === saved)) setActiveTagState(saved);
      else void writeLibrarySelection(selectionKey, null);
    });
  }, [activeTag, selectionKey, tags, tagsLoaded]);

  const setActiveTag = useCallback((tag: string | null) => {
    setActiveTagState(tag);
    void writeLibrarySelection(selectionKey, tag);
  }, [selectionKey]);

  const tagColorMap = useMemo(() => {
    const map = new Map<string, PaletteColor>();
    for (const tag of tags) map.set(tag.name, resolveTagColor(tag.name, tag.color));
    return map;
  }, [tags]);

  const colorForTag = useCallback(
    (name: string) => tagColorMap.get(name) ?? hashColor(name),
    [tagColorMap],
  );

  // Card view groups follow the sidebar's tag order; an active tag switches the
  // content to a flat list, so groups are not used then.
  const tagGroups = useMemo(() => {
    if (activeTag) return { groups: [] as ResourceTagGroup[], untagged: [] as Resource[] };
    const grouped = new Map<string, Resource[]>();
    const untagged: Resource[] = [];

    for (const resource of resources) {
      if (resource.tags.length === 0) {
        untagged.push(resource);
      } else {
        for (const tag of resource.tags) {
          const bucket = grouped.get(tag);
          if (bucket) bucket.push(resource);
          else grouped.set(tag, [resource]);
        }
      }
    }

    const order = new Map(tags.map((tag, index) => [tag.name, index]));
    const groups = Array.from(grouped.entries())
      .sort((a, b) => (order.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (order.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
      .map(([tag, items]) => ({ tag, resources: items, color: colorForTag(tag) }));

    return { groups, untagged };
  }, [resources, activeTag, tags, colorForTag]);

  const toggleTagCollapse = useCallback((tag: string) => {
    setCollapsedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadResources(), loadTags()]);
  }, [loadResources, loadTags]);

  const addResource = useCallback(async (url: string, title: string, resourceTags: string[], notes: string) => {
    const created = await window.prism.addResource(url, title, resourceTags, notes);
    await Promise.all([loadResources(), loadTags()]);
    return created;
  }, [loadResources, loadTags]);

  const updateResource = useCallback(
    async (id: number, url: string, title: string, resourceTags: string[], notes: string) => {
      const updated = await window.prism.updateResource(id, url, title, resourceTags, notes);
      await Promise.all([loadResources(), loadTags()]);
      return updated;
    },
    [loadResources, loadTags],
  );

  const removeResource = useCallback(async (id: number) => {
    const deleted = await window.prism.deleteResource(id);
    await Promise.all([loadResources(), loadTags()]);
    return deleted;
  }, [loadResources, loadTags]);

  const setTagColor = useCallback(async (name: string, color: string) => {
    await window.prism.setTagColor(name, color);
    await loadTags();
  }, [loadTags]);

  const renameTag = useCallback(async (oldName: string, newName: string) => {
    await window.prism.renameTag(oldName, newName);
    // Renaming onto an existing tag merges them, so the selection follows the
    // surviving name instead of silently filtering by a deleted tag.
    const nextActiveTag = activeTag === oldName ? newName : activeTag;
    setActiveTag(nextActiveTag);
    await Promise.all([loadResources(nextActiveTag), loadTags()]);
  }, [activeTag, loadResources, loadTags, setActiveTag]);

  const deleteTag = useCallback(async (name: string) => {
    await window.prism.deleteTag(name);
    const nextActiveTag = activeTag === name ? null : activeTag;
    setActiveTag(nextActiveTag);
    await Promise.all([loadResources(nextActiveTag), loadTags()]);
  }, [activeTag, loadResources, loadTags, setActiveTag]);

  // Tag order is global; only the dragged subset changes, and a failed write
  // restores the previous order.
  const reorderTags = useCallback(async (from: number, to: number) => {
    const previous = tags;
    const next = arrayMove(tags, from, to);
    setTags(next);
    try {
      await window.prism.reorderTags(next.map((tag) => tag.name));
    } catch (error) {
      setTags(previous);
      throw error;
    }
  }, [tags]);

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
    tags,
    loaded,
    tagsLoaded,
    totalCount,
    searchQuery,
    debouncedQuery,
    setSearchQuery,
    activeTag,
    setActiveTag,
    colorForTag,
    tagGroups,
    collapsedTags,
    toggleTagCollapse,
    reload,
    addResource,
    updateResource,
    removeResource,
    setTagColor,
    renameTag,
    deleteTag,
    reorderTags,
    reorderResources,
  };
}

export type ResourceLibrary = ReturnType<typeof useResourceLibrary>;
