export type ShortcutAction = "focusSearch" | "toggleReadEdit";

export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_ACTIONS = ["focusSearch", "toggleReadEdit"] as const;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  focusSearch: "Ctrl+F",
  toggleReadEdit: "Ctrl+E",
};

export const SHORTCUT_EVENT = "prism:shortcut";

export interface ShortcutEventDetail {
  action: ShortcutAction;
  vaultPath: string;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "CapsLock"]);

// Combinations whose native meaning (text editing, save, reload) must win.
// Windows rejects Ctrl+Alt entirely below (AltGr), so only Ctrl/Alt sets land
// in this list.
const RESERVED = new Set([
  "Ctrl+A", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y",
  "Ctrl+S", "Ctrl+B", "Ctrl+I", "Ctrl+R", "Ctrl+W", "Ctrl+Q",
  "Ctrl+Shift+Z", "Ctrl+Shift+R",
  "Alt+F4",
]);

const KEY_PATTERN = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/;

function normalizeKey(key: string): string | null {
  if (/^[a-z]$/.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F(?:[1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

function buildCombo(ctrl: boolean, alt: boolean, shift: boolean, key: string): string {
  const parts: string[] = [];
  if (ctrl) parts.push("Ctrl");
  if (alt) parts.push("Alt");
  if (shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

// Canonical combo for a keydown, or null when the event should be ignored
// (bare modifiers, unsupported keys, Win key, AltGr).
export function shortcutFromEvent(e: KeyboardEvent): string | null {
  if (e.repeat || e.isComposing || e.key === "Process") return null;
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (e.metaKey) return null;
  if (e.ctrlKey && e.altKey) return null;
  if (!e.ctrlKey && !e.altKey) return null;
  const key = normalizeKey(e.key);
  if (!key) return null;
  return buildCombo(e.ctrlKey, e.altKey, e.shiftKey, key);
}

export function isReservedShortcut(combo: string): boolean {
  return RESERVED.has(combo);
}

export function isValidShortcut(combo: string): boolean {
  const parts = combo.split("+");
  if (parts.length < 2) return false;
  const key = parts[parts.length - 1];
  if (!KEY_PATTERN.test(key)) return false;
  let ctrl = false;
  let alt = false;
  let shift = false;
  for (const modifier of parts.slice(0, -1)) {
    if (modifier === "Ctrl" && !ctrl) ctrl = true;
    else if (modifier === "Alt" && !alt) alt = true;
    else if (modifier === "Shift" && !shift) shift = true;
    else return false;
  }
  if (!ctrl && !alt) return false;
  if (ctrl && alt) return false;
  if (buildCombo(ctrl, alt, shift, key) !== combo) return false;
  return !RESERVED.has(combo);
}

// Merge stored values over the defaults, dropping invalid or duplicate combos.
// Defaults are reserved first so stored data can never leave two actions on
// the same combination.
export function normalizeShortcuts(value: unknown): ShortcutMap {
  const out: ShortcutMap = { ...DEFAULT_SHORTCUTS };
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  const used = new Set<string>(Object.values(DEFAULT_SHORTCUTS));
  for (const action of SHORTCUT_ACTIONS) {
    const raw = record[action];
    if (typeof raw === "string" && isValidShortcut(raw) && !used.has(raw)) {
      out[action] = raw;
      used.add(raw);
    }
  }
  return out;
}

export function formatShortcut(combo: string): string[] {
  return combo.split("+");
}
