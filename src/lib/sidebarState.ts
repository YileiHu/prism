import { useSyncExternalStore } from "react";

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
