export interface PaletteColor {
  bar: string;
  name: string;
  bg: string;
  // Section/group header wash — stronger in light mode so it stays visible
  tint: string;
}

// `name` (foreground), `bg` (chip wash) and `tint` (header wash) are
// mode-aware: the first color in light-dark() applies under data-mode="light",
// the second in dark mode. The bar color is solid and works on both surfaces.
const tint = (r: number, g: number, b: number) =>
  `light-dark(rgba(${r}, ${g}, ${b}, 0.16), rgba(${r}, ${g}, ${b}, 0.094))`;

export const PALETTE: readonly PaletteColor[] = [
  {
    bar: "#c75b4a",
    name: "light-dark(#a8483a, #d4846e)",
    bg: "light-dark(rgba(199, 91, 74, 0.14), rgba(199, 91, 74, 0.08))",
    tint: tint(199, 91, 74),
  },
  {
    bar: "#c4a43e",
    name: "light-dark(#8f7520, #d4b85a)",
    bg: "light-dark(rgba(196, 164, 62, 0.16), rgba(196, 164, 62, 0.08))",
    tint: tint(196, 164, 62),
  },
  {
    bar: "#5b7fa5",
    name: "light-dark(#40617f, #7a9db8)",
    bg: "light-dark(rgba(91, 127, 165, 0.14), rgba(91, 127, 165, 0.08))",
    tint: tint(91, 127, 165),
  },
  {
    bar: "#6b8e5a",
    name: "light-dark(#4d6b3d, #8aa878)",
    bg: "light-dark(rgba(107, 142, 90, 0.14), rgba(107, 142, 90, 0.08))",
    tint: tint(107, 142, 90),
  },
];

export function hashColor(s: string): PaletteColor {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
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
  { key: "violet", bar: "#8a6fb0", name: "light-dark(#6b5290, #a68cc6)", bg: "light-dark(rgba(138, 111, 176, 0.14), rgba(138, 111, 176, 0.08))", tint: tint(138, 111, 176) },
  { key: "teal", bar: "#4f8f87", name: "light-dark(#37766f, #74ada5)", bg: "light-dark(rgba(79, 143, 135, 0.14), rgba(79, 143, 135, 0.08))", tint: tint(79, 143, 135) },
  { key: "pink", bar: "#b06a8e", name: "light-dark(#914f73, #c98dab)", bg: "light-dark(rgba(176, 106, 142, 0.14), rgba(176, 106, 142, 0.08))", tint: tint(176, 106, 142) },
  { key: "slate", bar: "#6f7f95", name: "light-dark(#526276, #93a3b8)", bg: "light-dark(rgba(111, 127, 149, 0.14), rgba(111, 127, 149, 0.08))", tint: tint(111, 127, 149) },
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
