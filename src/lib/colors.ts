export interface PaletteColor {
  bar: string;
  name: string;
  bg: string;
}

export const PALETTE: readonly PaletteColor[] = [
  { bar: "#c75b4a", name: "#d4846e", bg: "rgba(199, 91, 74, 0.08)" },
  { bar: "#c4a43e", name: "#d4b85a", bg: "rgba(196, 164, 62, 0.08)" },
  { bar: "#5b7fa5", name: "#7a9db8", bg: "rgba(91, 127, 165, 0.08)" },
  { bar: "#6b8e5a", name: "#8aa878", bg: "rgba(107, 142, 90, 0.08)" },
];

export function hashColor(s: string): PaletteColor {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function positionalColor(i: number): PaletteColor {
  return PALETTE[i % PALETTE.length];
}

export type TagColorKey = "brick" | "gold" | "blue" | "green" | "violet" | "teal" | "pink" | "slate";

export interface TagColorOption extends PaletteColor {
  key: TagColorKey;
}

export const TAG_COLORS: readonly TagColorOption[] = [
  { key: "brick", ...PALETTE[0] },
  { key: "gold", ...PALETTE[1] },
  { key: "blue", ...PALETTE[2] },
  { key: "green", ...PALETTE[3] },
  { key: "violet", bar: "#8a6fb0", name: "#a68cc6", bg: "rgba(138, 111, 176, 0.08)" },
  { key: "teal", bar: "#4f8f87", name: "#74ada5", bg: "rgba(79, 143, 135, 0.08)" },
  { key: "pink", bar: "#b06a8e", name: "#c98dab", bg: "rgba(176, 106, 142, 0.08)" },
  { key: "slate", bar: "#6f7f95", name: "#93a3b8", bg: "rgba(111, 127, 149, 0.08)" },
];

// Tags store a palette `bar` hex in the DB; anything unrecognized falls back
// to the deterministic hash color.
export function resolveTagColor(name: string, bar?: string | null): PaletteColor {
  if (bar) {
    const match = TAG_COLORS.find((c) => c.bar.toLowerCase() === bar.toLowerCase());
    if (match) return match;
  }
  return hashColor(name);
}
