import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { VaultEntry } from "../../types";
import { relKey } from "../../components/pdf/types";
import {
  initialWorkspaceState,
  makeNoteDoc,
  makePdfDoc,
  noteDocId,
  normalizePath,
  pdfDocId,
  type DocTab,
  type LibraryRef,
  type ModuleId,
  type PaneSide,
  type SplitState,
  type WorkspaceState,
} from "./types";

const WORKSPACE_KEY = "workspace_v1";
const RESTORE_KEY = "restore_note_tabs";
const MODULE_IDS: ReadonlySet<string> = new Set(["home", "resources", "gtd", "library", "settings"]);

interface PersistedWorkspace {
  version?: number;
  module?: string;
  tabs?: unknown[];
  activeId?: string | null;
  split?: unknown;
  library?: unknown;
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  hydrate: (vaults: VaultEntry[]) => Promise<void>;
  showModule: (module: ModuleId) => void;
  setLibrary: (library: LibraryRef) => void;
  openDoc: (tab: DocTab) => void;
  activateDoc: (id: string) => void;
  closeDoc: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  removeDocs: (ids: string[]) => void;
  reorderDocs: (id: string, toIndex: number) => void;
  updateDoc: (id: string, patch: { title?: string; path?: string; relPath?: string }) => void;
  openInSplit: (id: string) => void;
  closeSplit: () => void;
  closePane: (side: PaneSide) => void;
  focusSide: (side: PaneSide) => void;
  closeVaultDocs: (vaultPath: string) => void;
  closePdfDocsExcept: (repoPath: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && MODULE_IDS.has(value);
}

function validSplit(raw: unknown, tabs: DocTab[]): SplitState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { leftId?: unknown; rightId?: unknown; focused?: unknown };
  if (typeof value.leftId !== "string" || typeof value.rightId !== "string") return null;
  if (value.leftId === value.rightId) return null;
  const ids = new Set(tabs.map((tab) => tab.id));
  if (!ids.has(value.leftId) || !ids.has(value.rightId)) return null;
  return {
    leftId: value.leftId,
    rightId: value.rightId,
    focused: value.focused === "right" ? "right" : "left",
  };
}

function resolvePersistedTab(
  raw: unknown,
  noteMaps: Map<string, Map<string, string>>,
  pdfRepoPath: string,
  pdfTitles: Map<string, string>,
): DocTab | null {
  if (!raw || typeof raw !== "object") return null;
  const tab = raw as Record<string, unknown>;
  if (tab.kind === "note" && typeof tab.vaultPath === "string" && typeof tab.path === "string") {
    const notes = noteMaps.get(normalizePath(tab.vaultPath));
    const title = notes?.get(normalizePath(tab.path));
    return title ? makeNoteDoc(tab.vaultPath, tab.path, title) : null;
  }
  if (tab.kind === "pdf" && typeof tab.relPath === "string") {
    if (typeof tab.repoPath === "string" && normalizePath(tab.repoPath) !== normalizePath(pdfRepoPath)) {
      return null;
    }
    const title = pdfTitles.get(relKey(tab.relPath));
    return title ? makePdfDoc(pdfRepoPath, tab.relPath, title) : null;
  }
  return null;
}

function validLibrary(raw: unknown, vaults: VaultEntry[], pdfRepoPath: string): LibraryRef | null {
  if (!raw || typeof raw !== "object") return null;
  const ref = raw as { kind?: unknown; vaultPath?: unknown; repoPath?: unknown };
  if (ref.kind === "note" && typeof ref.vaultPath === "string") {
    const vaultPath = ref.vaultPath;
    return vaults.some((vault) => normalizePath(vault.path) === normalizePath(vaultPath))
      ? { kind: "note", vaultPath }
      : null;
  }
  if (ref.kind === "pdf" && typeof ref.repoPath === "string") {
    return pdfRepoPath && normalizePath(ref.repoPath) === normalizePath(pdfRepoPath)
      ? { kind: "pdf", repoPath: pdfRepoPath }
      : null;
  }
  return null;
}

function defaultLibrary(vaults: VaultEntry[], pdfRepoPath: string): LibraryRef {
  if (vaults.length > 0) return { kind: "note", vaultPath: vaults[0].path };
  if (pdfRepoPath) return { kind: "pdf", repoPath: pdfRepoPath };
  return { kind: "note", vaultPath: "" };
}

function dedupeTabs(tabs: DocTab[]): DocTab[] {
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(initialWorkspaceState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydratedRef = useRef(false);
  const hydratingRef = useRef(false);

  const hydrate = useCallback(async (vaults: VaultEntry[]) => {
    if (hydratedRef.current || hydratingRef.current) return;
    hydratingRef.current = true;
    try {
      const [rawWorkspace, rawRestore] = await Promise.all([
        window.prism.getSetting(WORKSPACE_KEY),
        window.prism.getSetting(RESTORE_KEY),
      ]);
      const restore = rawRestore === null ? true : rawRestore !== "false" && rawRestore !== "0";

      const noteMaps = new Map<string, Map<string, string>>();
      for (const vault of vaults) {
        try {
          await window.prism.setVaultPath(vault.path);
          const notes = await window.prism.getNoteList(vault.path);
          noteMaps.set(
            normalizePath(vault.path),
            new Map((notes as { path: string; title: string }[]).map((note) => [normalizePath(note.path), note.title])),
          );
        } catch {
          noteMaps.set(normalizePath(vault.path), new Map());
        }
      }

      let pdfRepoPath = "";
      let pdfTitles = new Map<string, string>();
      try {
        const pdfState = await window.prism.pdfGetState();
        if (pdfState.repoPath && pdfState.exists) {
          pdfRepoPath = pdfState.repoPath;
          const docs = await window.prism.pdfList();
          pdfTitles = new Map(docs.map((doc) => [relKey(doc.rel_path), doc.title]));
        }
      } catch {
        // PDF repo is optional; note tabs still restore.
      }

      let parsed: PersistedWorkspace | null = null;
      if (rawWorkspace) {
        try {
          parsed = JSON.parse(rawWorkspace) as PersistedWorkspace;
        } catch {
          parsed = null;
        }
      }

      let tabs: DocTab[] = [];
      let restoredActiveId: string | null = null;
      let restoredModule: ModuleId = "home";
      let restoredLibrary = defaultLibrary(vaults, pdfRepoPath);

      if (restore && parsed && parsed.version === 1) {
        tabs = dedupeTabs(
          (Array.isArray(parsed.tabs) ? parsed.tabs : [])
            .map((raw) => resolvePersistedTab(raw, noteMaps, pdfRepoPath, pdfTitles))
            .filter((tab): tab is DocTab => tab !== null),
        );
        restoredActiveId = tabs.some((tab) => tab.id === parsed?.activeId)
          ? (parsed.activeId as string)
          : tabs[0]?.id ?? null;
        restoredModule = isModuleId(parsed.module) ? parsed.module : "home";
        restoredLibrary =
          validLibrary(parsed.library, vaults, pdfRepoPath) ?? defaultLibrary(vaults, pdfRepoPath);
      } else if (restore) {
        // One-time migration from the old per-vault / per-repo tab keys.
        for (const vault of vaults) {
          let legacy: { paths?: unknown[]; active?: unknown } | null = null;
          try {
            const raw = await window.prism.getSetting(`note_tabs_${vault.path}`);
            if (raw) legacy = JSON.parse(raw) as { paths?: unknown[]; active?: unknown };
          } catch {
            legacy = null;
          }
          const notes = noteMaps.get(normalizePath(vault.path));
          for (const rawPath of legacy?.paths ?? []) {
            if (typeof rawPath !== "string") continue;
            const title = notes?.get(normalizePath(rawPath));
            if (!title) continue;
            const doc = makeNoteDoc(vault.path, rawPath, title);
            tabs.push(doc);
            if (!restoredActiveId && legacy?.active === rawPath) restoredActiveId = doc.id;
          }
        }
        if (pdfRepoPath) {
          let legacy: { paths?: unknown[]; active?: unknown } | null = null;
          try {
            const raw = await window.prism.getSetting(`pdf_tabs_${pdfRepoPath}`);
            if (raw) legacy = JSON.parse(raw) as { paths?: unknown[]; active?: unknown };
          } catch {
            legacy = null;
          }
          for (const rawPath of legacy?.paths ?? []) {
            if (typeof rawPath !== "string") continue;
            const title = pdfTitles.get(relKey(rawPath));
            if (!title) continue;
            const doc = makePdfDoc(pdfRepoPath, rawPath, title);
            tabs.push(doc);
            if (!restoredActiveId && typeof legacy?.active === "string" && relKey(legacy.active) === relKey(rawPath)) {
              restoredActiveId = doc.id;
            }
          }
        }
        tabs = dedupeTabs(tabs);
        restoredActiveId = tabs.some((tab) => tab.id === restoredActiveId)
          ? restoredActiveId
          : tabs[0]?.id ?? null;
      }

      const restoredSplit = validSplit(parsed?.split, tabs);
      const initialSplit = restoredSplit ?? null;
      if (initialSplit) {
        restoredActiveId =
          initialSplit.focused === "left" ? initialSplit.leftId : initialSplit.rightId;
      }

      setState((prev) => {
        const merged = dedupeTabs([...tabs, ...prev.tabs]);
        const byId = new Map(merged.map((tab) => [tab.id, tab]));
        let activeId =
          prev.activeId && byId.has(prev.activeId) ? prev.activeId : restoredActiveId;
        let split = validSplit(prev.split, merged) ?? validSplit(restoredSplit, merged);
        if (split) {
          activeId = split.focused === "left" ? split.leftId : split.rightId;
        } else if (activeId && !byId.has(activeId)) {
          activeId = merged[0]?.id ?? null;
        }
        const prevLibrarySet =
          prev.library.kind === "note" ? prev.library.vaultPath !== "" : prev.library.repoPath !== "";
        const library = prevLibrarySet
          ? validLibrary(prev.library, vaults, pdfRepoPath) ?? restoredLibrary
          : restoredLibrary;
        return {
          module: prev.activeId ? prev.module : restoredModule,
          tabs: merged,
          activeId: activeId ?? null,
          split,
          library,
          hydrated: true,
        };
      });
    } finally {
      hydratedRef.current = true;
      hydratingRef.current = false;
      setState((prev) => (prev.hydrated ? prev : { ...prev, hydrated: true }));
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const payload: PersistedWorkspace = {
      version: 1,
      module: state.module,
      tabs: state.tabs.map((tab) =>
        tab.kind === "note"
          ? { kind: "note", vaultPath: tab.vaultPath, path: tab.path, title: tab.title }
          : { kind: "pdf", repoPath: tab.repoPath, relPath: tab.relPath, title: tab.title },
      ),
      activeId: state.activeId,
      split: state.split,
      library: state.library,
    };
    const timer = setTimeout(() => {
      void window.prism.setSetting(WORKSPACE_KEY, JSON.stringify(payload)).catch(() => {
        // Keep the in-memory workspace; the next change retries.
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [state]);

  const showModule = useCallback((module: ModuleId) => {
    setState((prev) => ({ ...prev, module, activeId: null }));
  }, []);

  const setLibrary = useCallback((library: LibraryRef) => {
    setState((prev) => ({ ...prev, library }));
  }, []);

  const activateDoc = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.tabs.some((tab) => tab.id === id)) return prev;
      if (prev.split) {
        if (prev.split.leftId === id) {
          return { ...prev, activeId: id, split: { ...prev.split, focused: "left" } };
        }
        if (prev.split.rightId === id) {
          return { ...prev, activeId: id, split: { ...prev.split, focused: "right" } };
        }
        const split =
          prev.split.focused === "left"
            ? { ...prev.split, leftId: id }
            : { ...prev.split, rightId: id };
        return { ...prev, activeId: id, split };
      }
      return { ...prev, activeId: id };
    });
  }, []);

  const openDoc = useCallback((tab: DocTab) => {
    setState((prev) => {
      const existing = prev.tabs.find((item) => item.id === tab.id);
      const tabs = existing
        ? prev.tabs.map((item) => (item.id === tab.id ? tab : item))
        : [...prev.tabs, tab];
      if (!prev.split) return { ...prev, tabs, activeId: tab.id };
      if (prev.split.leftId === tab.id) {
        return { ...prev, tabs, activeId: tab.id, split: { ...prev.split, focused: "left" } };
      }
      if (prev.split.rightId === tab.id) {
        return { ...prev, tabs, activeId: tab.id, split: { ...prev.split, focused: "right" } };
      }
      const split =
        prev.split.focused === "left"
          ? { ...prev.split, leftId: tab.id }
          : { ...prev.split, rightId: tab.id };
      return { ...prev, tabs, activeId: tab.id, split };
    });
  }, []);

  const closeDoc = useCallback((id: string) => {
    setState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.id === id);
      if (index === -1) return prev;
      const tabs = prev.tabs.filter((tab) => tab.id !== id);
      let split = prev.split;
      let activeId = prev.activeId;
      if (split && (split.leftId === id || split.rightId === id)) {
        const survivor = split.leftId === id ? split.rightId : split.leftId;
        split = null;
        activeId = survivor;
      } else if (activeId === id) {
        activeId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
      }
      if (activeId && !tabs.some((tab) => tab.id === activeId)) activeId = null;
      if (split && activeId !== split.leftId && activeId !== split.rightId) {
        activeId = split.focused === "left" ? split.leftId : split.rightId;
      }
      return { ...prev, tabs, split, activeId };
    });
  }, []);

  const closeOthers = useCallback((id: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((item) => item.id === id);
      if (!tab) return prev;
      return {
        ...prev,
        tabs: [tab],
        activeId: id,
        split: null,
      };
    });
  }, []);

  const closeAll = useCallback(() => {
    setState((prev) => ({ ...prev, tabs: [], activeId: null, split: null }));
  }, []);

  const removeDocs = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    setState((prev) => {
      if (!prev.tabs.some((tab) => gone.has(tab.id))) return prev;
      const tabs = prev.tabs.filter((tab) => !gone.has(tab.id));
      let split = prev.split;
      let activeId = prev.activeId;
      if (split && (gone.has(split.leftId) || gone.has(split.rightId))) {
        const survivor = gone.has(split.leftId) ? split.rightId : split.leftId;
        if (!gone.has(survivor) && tabs.some((tab) => tab.id === survivor)) {
          split = null;
          activeId = survivor;
        } else {
          split = null;
          activeId = tabs[0]?.id ?? null;
        }
      }
      if (activeId && gone.has(activeId)) activeId = tabs[0]?.id ?? null;
      if (activeId && !tabs.some((tab) => tab.id === activeId)) activeId = null;
      if (split && activeId !== split.leftId && activeId !== split.rightId) {
        activeId = split.focused === "left" ? split.leftId : split.rightId;
      }
      return { ...prev, tabs, split, activeId };
    });
  }, []);

  const reorderDocs = useCallback((id: string, toIndex: number) => {
    setState((prev) => {
      const from = prev.tabs.findIndex((tab) => tab.id === id);
      if (from === -1) return prev;
      const tabs = [...prev.tabs];
      const [tab] = tabs.splice(from, 1);
      tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, tab);
      return { ...prev, tabs };
    });
  }, []);

  const updateDoc = useCallback(
    (id: string, patch: { title?: string; path?: string; relPath?: string }) => {
      setState((prev) => {
        const index = prev.tabs.findIndex((tab) => tab.id === id);
        if (index === -1) return prev;
        const old = prev.tabs[index];
        let next: DocTab;
        let nextId = old.id;
        if (old.kind === "note") {
          const path = patch.path ?? old.path;
          next = { ...old, path, title: patch.title ?? old.title, id: noteDocId(path) };
          nextId = next.id;
        } else {
          const relPath = patch.relPath ?? old.relPath;
          next = {
            ...old,
            relPath,
            title: patch.title ?? old.title,
            id: pdfDocId(old.repoPath, relPath),
          };
          nextId = next.id;
        }
        const tabs = prev.tabs.map((tab, i) => (i === index ? next : tab));
        const activeId = prev.activeId === old.id ? nextId : prev.activeId;
        const split = prev.split
          ? {
              ...prev.split,
              leftId: prev.split.leftId === old.id ? nextId : prev.split.leftId,
              rightId: prev.split.rightId === old.id ? nextId : prev.split.rightId,
            }
          : null;
        return { ...prev, tabs, activeId, split };
      });
    },
    [],
  );

  const openInSplit = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.tabs.some((tab) => tab.id === id)) return prev;
      if (prev.split) {
        if (prev.split.leftId === id) {
          return { ...prev, activeId: id, split: { ...prev.split, focused: "left" } };
        }
        if (prev.split.rightId === id) {
          return { ...prev, activeId: id, split: { ...prev.split, focused: "right" } };
        }
        return { ...prev, activeId: id, split: { ...prev.split, rightId: id, focused: "right" } };
      }
      const other = prev.activeId && prev.activeId !== id
        ? prev.activeId
        : prev.tabs.find((tab) => tab.id !== id)?.id;
      if (!other) return prev;
      return {
        ...prev,
        activeId: id,
        split: { leftId: other, rightId: id, focused: "right" },
      };
    });
  }, []);

  const closeSplit = useCallback(() => {
    setState((prev) => {
      if (!prev.split) return prev;
      const activeId =
        prev.activeId === prev.split.leftId || prev.activeId === prev.split.rightId
          ? prev.activeId
          : prev.split.leftId;
      return { ...prev, split: null, activeId };
    });
  }, []);

  const closePane = useCallback((side: PaneSide) => {
    setState((prev) => {
      if (!prev.split) return prev;
      const survivor = side === "left" ? prev.split.rightId : prev.split.leftId;
      return { ...prev, split: null, activeId: survivor };
    });
  }, []);

  const focusSide = useCallback((side: PaneSide) => {
    setState((prev) => {
      if (!prev.split) return prev;
      const activeId = side === "left" ? prev.split.leftId : prev.split.rightId;
      return { ...prev, activeId, split: { ...prev.split, focused: side } };
    });
  }, []);

  const closeVaultDocs = useCallback((vaultPath: string) => {
    const key = normalizePath(vaultPath);
    const ids = stateRef.current.tabs
      .filter((tab) => tab.kind === "note" && normalizePath(tab.vaultPath) === key)
      .map((tab) => tab.id);
    removeDocs(ids);
  }, [removeDocs]);

  const closePdfDocsExcept = useCallback((repoPath: string) => {
    const key = normalizePath(repoPath);
    const ids = stateRef.current.tabs
      .filter((tab) => tab.kind === "pdf" && normalizePath(tab.repoPath) !== key)
      .map((tab) => tab.id);
    removeDocs(ids);
  }, [removeDocs]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      hydrate,
      showModule,
      setLibrary,
      openDoc,
      activateDoc,
      closeDoc,
      closeOthers,
      closeAll,
      removeDocs,
      reorderDocs,
      updateDoc,
      openInSplit,
      closeSplit,
      closePane,
      focusSide,
      closeVaultDocs,
      closePdfDocsExcept,
    }),
    [
      state,
      hydrate,
      showModule,
      setLibrary,
      openDoc,
      activateDoc,
      closeDoc,
      closeOthers,
      closeAll,
      removeDocs,
      reorderDocs,
      updateDoc,
      openInSplit,
      closeSplit,
      closePane,
      focusSide,
      closeVaultDocs,
      closePdfDocsExcept,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}
