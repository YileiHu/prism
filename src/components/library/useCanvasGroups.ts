import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasFile, CanvasGroup, CanvasGroupsFile } from "../../shared/models";
import { relativePathInsideVault } from "../useCollections";

const SAVE_DELAY = 300;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const vaultRef = useRef(vaultPath);
  vaultRef.current = vaultPath;
  // Vault the current state belongs to; edits are always written back to it,
  // even if the user switches vaults during the debounce window.
  const saveVaultRef = useRef("");

  const flush = useCallback(() => {
    if (!loadedRef.current || !dirtyRef.current || !saveVaultRef.current) return;
    dirtyRef.current = false;
    const target = saveVaultRef.current;
    void window.prism.saveCanvasGroups(target, {
      version: 1,
      groups: stateRef.current.groups,
      paths: stateRef.current.paths,
    }).catch(() => {
      dirtyRef.current = true;
    });
  }, []);

  useEffect(() => {
    flush();
    let cancelled = false;
    setLoaded(false);
    loadedRef.current = false;
    dirtyRef.current = false;
    saveVaultRef.current = "";
    if (!vaultPath) {
      setState({ groups: [], paths: [] });
      setLoaded(true);
      loadedRef.current = true;
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
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPath, flush]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(flush, SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [state, loaded, flush]);

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

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
    apply({
      ...current,
      groups: current.groups.map((group) => (
        group.id === id ? { ...group, name: trimmed } : group
      )),
    });
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
    apply({ ...current, groups: current.groups.filter((group) => group.id !== id) });
  }, [apply]);

  const reorderGroups = useCallback((from: number, to: number) => {
    const current = stateRef.current;
    if (from === to || from < 0 || to < 0 || from >= current.groups.length || to >= current.groups.length) {
      return;
    }
    const groups = [...current.groups];
    const [moved] = groups.splice(from, 1);
    groups.splice(to, 0, moved);
    apply({ ...current, groups });
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
      list.splice(toIndex === undefined ? list.length : clamp(toIndex, 0, list.length), 0, rel);
      paths = list;
    } else {
      groups = groups.map((group) => {
        if (group.id !== toGroupId) return group;
        const next = [...group.paths];
        next.splice(toIndex === undefined ? next.length : clamp(toIndex, 0, next.length), 0, rel);
        return { ...group, paths: next };
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
      const list = [...ungroupedRef.current];
      if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      apply({ ...current, paths: list });
      return;
    }
    const groups = current.groups.map((group) => {
      if (group.id !== groupId) return group;
      const paths = [...group.paths];
      if (from < 0 || to < 0 || from >= paths.length || to >= paths.length) return group;
      const [moved] = paths.splice(from, 1);
      paths.splice(to, 0, moved);
      return { ...group, paths };
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
