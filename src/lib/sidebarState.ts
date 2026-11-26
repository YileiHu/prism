import { useCallback, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "prism_sidebar_collapsed";
const LEGACY_KEYS = ["prism_vault_sidebar_collapsed", "prism_pdf_sidebar_collapsed"];

function readInitial(): boolean {
  const shared = localStorage.getItem(STORAGE_KEY);
  if (shared !== null) return shared === "1";
  for (const key of LEGACY_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(STORAGE_KEY, legacy);
      return legacy === "1";
    }
  }
  return false;
}

let collapsed = readInitial();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSidebarCollapsed(next: boolean) {
  if (next === collapsed) return;
  collapsed = next;
  localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  emit();
}

export function toggleSidebarCollapsed() {
  setSidebarCollapsed(!collapsed);
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, () => collapsed, () => collapsed);
}

/** One module keeps the open/closed state of its sidebar sections in one JSON
 *  object, so the preference survives switching modules and restarts. */
function readSectionOpen(storageKey: string, name: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultOpen;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed[name] === "boolean" ? (parsed[name] as boolean) : defaultOpen;
  } catch {
    return defaultOpen;
  }
}

function writeSectionOpen(storageKey: string, name: string, open: boolean): void {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[name] = open;
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    // Non-fatal UI preference
  }
}

/**
 * Open/closed state for one collapsible sidebar section, persisted under
 * `storageKey` (one key per module). `name` is the section's slot in that file.
 */
export function useSidebarSection(
  storageKey: string,
  name: string,
  defaultOpen = true,
): [boolean, () => void] {
  const [open, setOpen] = useState(() => readSectionOpen(storageKey, name, defaultOpen));
  const toggle = useCallback(() => {
    setOpen((previous) => {
      const next = !previous;
      writeSectionOpen(storageKey, name, next);
      return next;
    });
  }, [storageKey, name]);
  return [open, toggle];
}
