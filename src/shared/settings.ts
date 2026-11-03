// Typed preference registry shared by the renderer and the Electron main
// process. The settings table stores raw strings; this module owns defaults,
// validation and string codecs so both sides agree on the shape.

import { DEFAULT_SHORTCUTS, normalizeShortcuts, type ShortcutMap } from "./shortcuts";

export type ColorMode = "dark" | "light" | "system";

export interface AppSettings {
  color_mode: ColorMode;
  clock_format: "24" | "12";
  home_recents_count: number;
  restore_note_tabs: boolean;
  attachments_dir: string;
  autosave_delay: number;
  default_view: "read" | "edit";
  indent_width: number;
  line_wrapping: boolean;
  content_font_size: number;
  content_line_height: number;
  content_width: number;
  show_frontmatter: boolean;
  search_result_limit: number;
  pdf_repo_path: string;
  pdf_default_sort: "title" | "added" | "modified" | "pages";
  pdf_default_zoom: number;
  shortcuts: ShortcutMap;
  // Note heading / bold colors, configured independently per color mode
  md_h1_dark: string;
  md_h2_dark: string;
  md_h3_dark: string;
  md_h4_dark: string;
  md_h5_dark: string;
  md_h6_dark: string;
  md_bold_dark: string;
  md_h1_light: string;
  md_h2_light: string;
  md_h3_light: string;
  md_h4_light: string;
  md_h5_light: string;
  md_h6_light: string;
  md_bold_light: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  color_mode: "dark",
  clock_format: "24",
  home_recents_count: 10,
  restore_note_tabs: true,
  attachments_dir: "attachments",
  autosave_delay: 1000,
  default_view: "read",
  indent_width: 4,
  line_wrapping: true,
  content_font_size: 14.5,
  content_line_height: 1.7,
  content_width: 750,
  show_frontmatter: true,
  search_result_limit: 200,
  pdf_repo_path: "",
  pdf_default_sort: "title",
  pdf_default_zoom: 50,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  md_h1_dark: "#e58080",
  md_h2_dark: "#7fc87f",
  md_h3_dark: "#85b6ee",
  md_h4_dark: "#ab98f0",
  md_h5_dark: "#6fcdcd",
  md_h6_dark: "#eda05c",
  md_bold_dark: "#f6d968",
  md_h1_light: "#9c453a",
  md_h2_light: "#3f6b45",
  md_h3_light: "#37699b",
  md_h4_light: "#6a54a0",
  md_h5_light: "#2f6f68",
  md_h6_light: "#9c5c2e",
  md_bold_light: "#8a4358",
};

export type SettingKey = keyof AppSettings;
export type SettingValue = AppSettings[SettingKey];

export type NumberRange = { min: number; max: number; step: number };

export type SettingMeta =
  | { kind: "enum"; options: readonly string[] }
  | { kind: "number"; range: NumberRange }
  | { kind: "boolean" }
  | { kind: "string" }
  | { kind: "color" }
  | { kind: "json" };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export const SETTING_META: Record<SettingKey, SettingMeta> = {
  color_mode: { kind: "enum", options: ["dark", "light", "system"] },
  clock_format: { kind: "enum", options: ["24", "12"] },
  home_recents_count: { kind: "number", range: { min: 5, max: 30, step: 1 } },
  restore_note_tabs: { kind: "boolean" },
  attachments_dir: { kind: "string" },
  autosave_delay: { kind: "number", range: { min: 300, max: 3000, step: 100 } },
  default_view: { kind: "enum", options: ["read", "edit"] },
  indent_width: { kind: "number", range: { min: 2, max: 8, step: 2 } },
  line_wrapping: { kind: "boolean" },
  content_font_size: { kind: "number", range: { min: 12, max: 20, step: 0.5 } },
  content_line_height: { kind: "number", range: { min: 1.4, max: 2, step: 0.05 } },
  content_width: { kind: "number", range: { min: 560, max: 1000, step: 20 } },
  show_frontmatter: { kind: "boolean" },
  search_result_limit: { kind: "number", range: { min: 50, max: 1000, step: 50 } },
  pdf_repo_path: { kind: "string" },
  pdf_default_sort: { kind: "enum", options: ["title", "added", "modified", "pages"] },
  pdf_default_zoom: { kind: "number", range: { min: 10, max: 200, step: 10 } },
  shortcuts: { kind: "json" },
  md_h1_dark: { kind: "color" },
  md_h2_dark: { kind: "color" },
  md_h3_dark: { kind: "color" },
  md_h4_dark: { kind: "color" },
  md_h5_dark: { kind: "color" },
  md_h6_dark: { kind: "color" },
  md_bold_dark: { kind: "color" },
  md_h1_light: { kind: "color" },
  md_h2_light: { kind: "color" },
  md_h3_light: { kind: "color" },
  md_h4_light: { kind: "color" },
  md_h5_light: { kind: "color" },
  md_h6_light: { kind: "color" },
  md_bold_light: { kind: "color" },
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

function clampNumber(key: SettingKey, value: number): number {
  const meta = SETTING_META[key];
  if (meta.kind !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS[key] as number;
  const { min, max } = meta.range;
  return Math.min(max, Math.max(min, value));
}

// Parse a stored string into a valid value, falling back to the default.
export function decodeSetting<K extends SettingKey>(key: K, raw: string | null): AppSettings[K] {
  const fallback = DEFAULT_SETTINGS[key];
  if (raw === null) return fallback;
  const meta = SETTING_META[key];
  switch (meta.kind) {
    case "number": {
      const n = Number(raw);
      return (Number.isFinite(n) ? clampNumber(key, n) : fallback) as AppSettings[K];
    }
    case "boolean":
      return (raw === "true" || raw === "1") as AppSettings[K];
    case "enum":
      return (meta.options.includes(raw) ? raw : fallback) as AppSettings[K];
    case "color":
      return (isHexColor(raw) ? raw : fallback) as AppSettings[K];
    case "json": {
      try {
        return normalizeShortcuts(JSON.parse(raw)) as AppSettings[K];
      } catch {
        return fallback;
      }
    }
    default:
      return raw as AppSettings[K];
  }
}

// Coerce a value coming from the UI into a valid value for storage.
export function normalizeSetting<K extends SettingKey>(key: K, value: unknown): AppSettings[K] {
  const meta = SETTING_META[key];
  switch (meta.kind) {
    case "number":
      return clampNumber(key, typeof value === "number" ? value : Number(value)) as AppSettings[K];
    case "boolean":
      return Boolean(value) as AppSettings[K];
    case "enum":
      return (meta.options.includes(String(value)) ? String(value) : DEFAULT_SETTINGS[key]) as AppSettings[K];
    case "color": {
      const color = String(value ?? "");
      return (isHexColor(color) ? color : DEFAULT_SETTINGS[key]) as AppSettings[K];
    }
    case "json":
      return normalizeShortcuts(value) as AppSettings[K];
    default:
      return String(value ?? "") as AppSettings[K];
  }
}

export function serializeSetting<K extends SettingKey>(key: K, value: AppSettings[K]): string {
  if (SETTING_META[key].kind === "json") return JSON.stringify(value);
  return String(value);
}
