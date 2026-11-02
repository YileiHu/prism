import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../../lib/settings";

export interface NoteTab {
  path: string;
  title: string;
}

const settingKey = (vaultPath: string) => `note_tabs_${vaultPath}`;

// Per-vault open-note tabs with session persistence. The open list is stored
// in the settings table as { paths, active } and revalidated against the
// vault's notes on restore, so tabs for externally deleted notes are dropped.
export function useNoteTabs(vaultPath: string) {
  const { get } = useSettings();
  const [tabs, setTabs] = useState<NoteTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const tabsRef = useRef<NoteTab[]>([]);
  tabsRef.current = tabs;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activePath;

  useEffect(() => {
    if (!restoredRef.current || !get("restore_note_tabs")) return;
    void window.prism.setSetting(settingKey(vaultPath), JSON.stringify({
      paths: tabs.map((t) => t.path),
      active: activePath,
    }));
  }, [vaultPath, tabs, activePath, get]);

  // Merge persisted tabs with whatever is already open (an early openNote from
  // a deep link may land before the async restore resolves)
  const restoreFrom = useCallback((notes: { path: string; title: string }[]) => {
    restoredRef.current = false;
    if (!get("restore_note_tabs")) {
      restoredRef.current = true;
      return;
    }
    (async () => {
      let persisted: { paths?: string[]; active?: string | null } | null = null;
      try {
        const raw = await window.prism.getSetting(settingKey(vaultPath));
        if (raw) persisted = JSON.parse(raw) as { paths?: string[]; active?: string | null };
      } catch { /* corrupted setting — start from current state */ }

      const byPath = new Map(notes.map((n) => [n.path, n]));
      const valid = (persisted?.paths ?? [])
        .map((p) => byPath.get(p))
        .filter((n): n is { path: string; title: string } => Boolean(n))
        .map((n) => ({ path: n.path, title: n.title }));
      const prev = tabsRef.current;
      const validSet = new Set(valid.map((t) => t.path));
      const merged = [...valid, ...prev.filter((t) => !validSet.has(t.path))];
      const desired = activeRef.current ?? persisted?.active ?? null;
      setTabs(merged);
      setActivePath(
        desired && merged.some((t) => t.path === desired) ? desired : merged[0]?.path ?? null,
      );
      restoredRef.current = true;
    })();
  }, [vaultPath, get]);

  const openNote = useCallback((note: { path: string; title: string }) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === note.path);
      if (existing) {
        return existing.title === note.title
          ? prev
          : prev.map((t) => (t.path === note.path ? { ...t, title: note.title } : t));
      }
      return [...prev, { path: note.path, title: note.title }];
    });
    setActivePath(note.path);
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.path !== path);
      setActivePath((active) => {
        if (active !== path) return active;
        return next[Math.min(idx, next.length - 1)]?.path ?? null;
      });
      return next;
    });
  }, []);

  const closeAll = useCallback(() => {
    setTabs([]);
    setActivePath(null);
  }, []);

  // Renames keep the tab in place and its active state
  const updateNote = useCallback((oldPath: string, note: { path: string; title: string }) => {
    setTabs((prev) => prev.map((t) => (t.path === oldPath ? { path: note.path, title: note.title } : t)));
    setActivePath((active) => (active === oldPath ? note.path : active));
  }, []);

  const removePaths = useCallback((paths: string[]) => {
    const gone = new Set(paths);
    setTabs((prev) => {
      const next = prev.filter((t) => !gone.has(t.path));
      if (next.length === prev.length) return prev;
      setActivePath((active) => (active && gone.has(active) ? next[0]?.path ?? null : active));
      return next;
    });
  }, []);

  // Drag-to-reorder: insert the tab at toIndex (index in the array AFTER
  // removal); the persist effect above saves the new order automatically
  const moveTab = useCallback((path: string, toIndex: number) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.path === path);
      if (from === -1) return prev;
      const next = [...prev];
      const [tab] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, tab);
      return next;
    });
  }, []);

  return {
    tabs,
    activePath,
    setActivePath,
    restoreFrom,
    openNote,
    closeTab,
    closeAll,
    updateNote,
    removePaths,
    moveTab,
  };
}
