import { useCallback, useEffect, useRef, useState } from "react";
import { relKey, type PdfDocument } from "./types";

export interface PdfTab {
  relPath: string;
  title: string;
}

interface PersistedTabs {
  paths?: string[];
  active?: string | null;
}

const settingKey = (repoPath: string) => `pdf_tabs_${repoPath}`;

// Per-repository open-PDF tabs with session persistence. Paths are stored
// repo-relative (case-insensitive comparison via relKey) and revalidated
// against the scanned document list on restore.
export function usePdfTabs(repoPath: string) {
  const [tabs, setTabs] = useState<PdfTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const restoringRef = useRef(false);
  const tabsRef = useRef<PdfTab[]>([]);
  tabsRef.current = tabs;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activePath;
  const repoRef = useRef(repoPath);
  repoRef.current = repoPath;

  // Repository switch: drop the old tabs and allow a fresh restore. Declared
  // before the persistence effect so a stale list is never written under the
  // new repository's key.
  useEffect(() => {
    restoredRef.current = false;
    restoringRef.current = false;
    setTabs([]);
    setActivePath(null);
  }, [repoPath]);

  useEffect(() => {
    if (!restoredRef.current || !repoPath) return;
    void window.prism.setSetting(settingKey(repoPath), JSON.stringify({
      paths: tabs.map((tab) => tab.relPath),
      active: activePath,
    }));
  }, [repoPath, tabs, activePath]);

  // Merge persisted tabs with anything opened before the async restore lands.
  const restoreFrom = useCallback((documents: PdfDocument[]) => {
    if (!repoPath || restoredRef.current || restoringRef.current) return;
    restoringRef.current = true;
    const repoAtStart = repoPath;
    void (async () => {
      let persisted: PersistedTabs | null = null;
      try {
        const raw = await window.prism.getSetting(settingKey(repoAtStart));
        if (raw) persisted = JSON.parse(raw) as PersistedTabs;
      } catch { /* corrupted setting — start from current state */ }

      if (repoRef.current !== repoAtStart) {
        restoringRef.current = false;
        return;
      }

      const byKey = new Map(documents.map((doc) => [relKey(doc.rel_path), doc]));
      const valid: PdfTab[] = [];
      const seen = new Set<string>();
      for (const path of persisted?.paths ?? []) {
        if (typeof path !== "string") continue;
        const key = relKey(path);
        if (seen.has(key)) continue;
        const doc = byKey.get(key);
        if (!doc) continue;
        seen.add(key);
        valid.push({ relPath: doc.rel_path, title: doc.title });
      }
      for (const tab of tabsRef.current) {
        const key = relKey(tab.relPath);
        if (seen.has(key)) continue;
        seen.add(key);
        valid.push(tab);
      }

      const desired = activeRef.current ?? persisted?.active ?? null;
      const desiredKey = desired ? relKey(desired) : null;
      const matched = desiredKey
        ? valid.find((tab) => relKey(tab.relPath) === desiredKey)
        : undefined;
      setTabs(valid);
      setActivePath(matched?.relPath ?? valid[0]?.relPath ?? null);
      restoredRef.current = true;
      restoringRef.current = false;
    })();
  }, [repoPath]);

  const openTab = useCallback((doc: PdfDocument) => {
    const key = relKey(doc.rel_path);
    setTabs((prev) => {
      const idx = prev.findIndex((tab) => relKey(tab.relPath) === key);
      if (idx === -1) return [...prev, { relPath: doc.rel_path, title: doc.title }];
      const existing = prev[idx];
      if (existing.relPath === doc.rel_path && existing.title === doc.title) return prev;
      const next = [...prev];
      next[idx] = { relPath: doc.rel_path, title: doc.title };
      return next;
    });
    setActivePath(doc.rel_path);
  }, []);

  const closeTab = useCallback((relPath: string) => {
    const key = relKey(relPath);
    setTabs((prev) => {
      const idx = prev.findIndex((tab) => relKey(tab.relPath) === key);
      if (idx === -1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setActivePath((active) => {
        if (!active || relKey(active) !== key) return active;
        return next[Math.min(idx, next.length - 1)]?.relPath ?? null;
      });
      return next;
    });
  }, []);

  const removePaths = useCallback((paths: string[]) => {
    const gone = new Set(paths.map(relKey));
    setTabs((prev) => {
      const next = prev.filter((tab) => !gone.has(relKey(tab.relPath)));
      if (next.length === prev.length) return prev;
      setActivePath((active) => (active && gone.has(relKey(active)) ? next[0]?.relPath ?? null : active));
      return next;
    });
  }, []);

  const moveTab = useCallback((relPath: string, toIndex: number) => {
    const key = relKey(relPath);
    setTabs((prev) => {
      const from = prev.findIndex((tab) => relKey(tab.relPath) === key);
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
    openTab,
    closeTab,
    removePaths,
    moveTab,
  };
}
