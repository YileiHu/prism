import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasFile, CanvasGroup, CanvasGroupsFile } from "../../shared/models";
import { useDebouncedPersist } from "../../lib/useDebouncedJsonPersist";
import { deleteById, insertAt, moveItem, renameById } from "../../lib/collectionOps";
import { relativePathInsideVault } from "../useCollections";

interface GroupsState {
  groups: CanvasGroup[];
  paths: string[];
}

function makeId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function normalizeRel(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

// Group paths win; anything left in `paths` (or untouched on disk) is
// ungrouped. Dedupes case-insensitively because canvas paths are Windows-first.
export function collectUngrouped(
  groups: CanvasGroup[],
  paths: string[],
  fileByRel: Map<string, { rel: string }>,
): string[] {
  const grouped = new Set<string>();
  for (const group of groups) {
    for (const rel of group.paths) grouped.add(rel.toLowerCase());
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (rel: string) => {
    const key = rel.toLowerCase();
    if (grouped.has(key) || seen.has(key) || !fileByRel.has(key)) return;
    seen.add(key);
    out.push(rel);
  };
  for (const rel of paths) push(rel);
  for (const entry of fileByRel.values()) push(entry.rel);
  return out;
}

function sanitize(raw: CanvasGroupsFile | null): GroupsState {
  if (!raw || typeof raw !== "object") return { groups: [], paths: [] };
  const seen = new Set<string>();
  const takePaths = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const out: string[] = [];
    for (const item of input) {
      if (typeof item !== "string") continue;
      const rel = normalizeRel(item);
      const key = rel.toLowerCase();
      if (!rel || seen.has(key)) continue;
      seen.add(key);
      out.push(rel);
    }
    return out;
  };
  const groups: CanvasGroup[] = [];
  if (Array.isArray(raw.groups)) {
    for (const group of raw.groups) {
      if (!group || typeof group.id !== "string" || typeof group.name !== "string") continue;
      groups.push({
        id: group.id,
        name: group.name,
        color: typeof group.color === "string" ? group.color : "",
        paths: takePaths(group.paths),
      });
    }
  }
  return { groups, paths: takePaths(raw.paths) };
}

function stripFromGroups(groups: CanvasGroup[], key: string): CanvasGroup[] {
  return groups.map((group) => ({
    ...group,
    paths: group.paths.filter((rel) => rel.toLowerCase() !== key),
  }));
}

export function useCanvasGroups(vaultPath: string, files: CanvasFile[]) {
  const [state, setState] = useState<GroupsState>({ groups: [], paths: [] });
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dirtyRef = useRef(false);
  const vaultRef = useRef(vaultPath);
  vaultRef.current = vaultPath;
  // Vault the current state belongs to; edits are always written back to it,
  // even if the user switches vaults during the debounce window.
  const saveVaultRef = useRef("");

  const { schedule: schedulePersist, flush: flushPending } = useDebouncedPersist({
    onError: () => { dirtyRef.current = true; },
  });

  const persist = useCallback(() => {
    const target = saveVaultRef.current;
    if (!target || !dirtyRef.current) return Promise.resolve();
    dirtyRef.current = false;
    return window.prism.saveCanvasGroups(target, {
      version: 1,
      groups: stateRef.current.groups,
      paths: stateRef.current.paths,
    });
  }, []);

  useEffect(() => {
    flushPending();
    let cancelled = false;
    setLoaded(false);
    dirtyRef.current = false;
    saveVaultRef.current = "";
    if (!vaultPath) {
      setState({ groups: [], paths: [] });
      setLoaded(true);
      return;
    }
    void (async () => {
      let next: GroupsState = { groups: [], paths: [] };
      try {
        next = sanitize(await window.prism.loadCanvasGroups(vaultPath));
      } catch {
        // Missing/corrupt groups file: all canvases stay ungrouped.
      }
      if (cancelled) return;
      setState(next);
      stateRef.current = next;
      saveVaultRef.current = vaultPath;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, flushPending]);

  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    schedulePersist(persist);
  }, [state, loaded, schedulePersist, persist]);

  const apply = useCallback((next: GroupsState) => {
    saveVaultRef.current = vaultRef.current;
    dirtyRef.current = true;
    stateRef.current = next;
    setState(next);
  }, []);

  const fileByRel = useMemo(() => {
    const map = new Map<string, { rel: string; file: CanvasFile }>();
    for (const file of files) {
      const rel = relativePathInsideVault(file.path, vaultPath);
      if (!rel) continue;
      map.set(rel.toLowerCase(), { rel, file });
    }
    return map;
  }, [files, vaultPath]);

  const ungroupedPaths = useMemo(
    () => collectUngrouped(state.groups, state.paths, fileByRel),
    [state.groups, state.paths, fileByRel],
  );
  const ungroupedRef = useRef<string[]>([]);
  ungroupedRef.current = ungroupedPaths;

  const createGroup = useCallback((name: string, color = "") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = stateRef.current;
    apply({
      ...current,
      groups: [...current.groups, { id: makeId(), name: trimmed, color, paths: [] }],
    });
  }, [apply]);

  const renameGroup = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = stateRef.current;
    apply({ ...current, groups: renameById(current.groups, id, trimmed) });
  }, [apply]);

  const setGroupColor = useCallback((id: string, color: string) => {
    const current = stateRef.current;
    apply({
      ...current,
      groups: current.groups.map((group) => (
        group.id === id ? { ...group, color } : group
      )),
    });
  }, [apply]);

  const deleteGroup = useCallback((id: string) => {
    const current = stateRef.current;
    apply({ ...current, groups: deleteById(current.groups, id) });
  }, [apply]);

  const reorderGroups = useCallback((from: number, to: number) => {
    const current = stateRef.current;
    const groups = moveItem(current.groups, from, to);
    if (groups !== current.groups) apply({ ...current, groups });
  }, [apply]);

  const movePath = useCallback((
    rel: string,
    _fromGroupId: string | null,
    toGroupId: string | null,
    toIndex?: number,
  ) => {
    const current = stateRef.current;
    const key = rel.toLowerCase();
    let groups = stripFromGroups(current.groups, key);
    let paths = current.paths.filter((entry) => entry.toLowerCase() !== key);
    if (toGroupId === null) {
      const list = collectUngrouped(groups, paths, fileByRel);
      paths = insertAt(list, toIndex ?? list.length, rel);
    } else {
      groups = groups.map((group) => {
        if (group.id !== toGroupId) return group;
        return { ...group, paths: insertAt(group.paths, toIndex ?? group.paths.length, rel) };
      });
    }
    apply({ groups, paths });
  }, [apply, fileByRel]);

  const removePath = useCallback((rel: string, groupId: string | null) => {
    if (!groupId) return;
    const current = stateRef.current;
    apply({ ...current, groups: stripFromGroups(current.groups, rel.toLowerCase()) });
  }, [apply]);

  const reorderPaths = useCallback((groupId: string | null, from: number, to: number) => {
    const current = stateRef.current;
    if (from === to) return;
    if (groupId === null) {
      const list = moveItem(ungroupedRef.current, from, to);
      if (list !== ungroupedRef.current) apply({ ...current, paths: list });
      return;
    }
    const groups = current.groups.map((group) => {
      if (group.id !== groupId) return group;
      const paths = moveItem(group.paths, from, to);
      return paths === group.paths ? group : { ...group, paths };
    });
    apply({ ...current, groups });
  }, [apply]);

  const renamePath = useCallback((oldRel: string, newRel: string) => {
    const from = oldRel.toLowerCase();
    const to = normalizeRel(newRel);
    if (!to) return;
    const current = stateRef.current;
    apply({
      groups: current.groups.map((group) => ({
        ...group,
        paths: group.paths.map((rel) => (rel.toLowerCase() === from ? to : rel)),
      })),
      paths: current.paths.map((rel) => (rel.toLowerCase() === from ? to : rel)),
    });
  }, [apply]);

  const removePaths = useCallback((rels: string[]) => {
    if (rels.length === 0) return;
    const keys = new Set(rels.map((rel) => rel.toLowerCase()));
    const current = stateRef.current;
    apply({
      groups: current.groups.map((group) => ({
        ...group,
        paths: group.paths.filter((rel) => !keys.has(rel.toLowerCase())),
      })),
      paths: current.paths.filter((rel) => !keys.has(rel.toLowerCase())),
    });
  }, [apply]);

  const resolveFile = useCallback(
    (rel: string) => fileByRel.get(rel.toLowerCase())?.file ?? null,
    [fileByRel],
  );

  return {
    loaded,
    groups: state.groups,
    ungroupedPaths,
    createGroup,
    renameGroup,
    setGroupColor,
    deleteGroup,
    reorderGroups,
    movePath,
    removePath,
    reorderPaths,
    renamePath,
    removePaths,
    resolveFile,
  };
}
