// Theme data + authoring factory. Lives in shared/ because the main process
// needs the same base color for the native window surface (the renderer alone
// used to know the palette, which made the first paint and the window border
// fall back to a hard-coded gray).
//
// A theme declares the modes it supports; omitting a mode means "not supported"
// and the app pins itself to a supported one (see resolveAppearance). That is
// what lets a Black-Ops-style dark-only theme exist without inventing a light
// palette nobody wants.
//
// Adding a theme: call theme({...}) with an accent and, ideally, nothing else —
// the factory derives surfaces from the accent's hue plus a ramp preset. Pass
// dark/light blocks only to override individual tokens.

import {
  hexToOklch,
  isHexColor,
  oklchToHex,
  parseHex,
  rgbaFromHex,
  rgbTriplet,
  shiftLightness,
} from "./themeColor";
import { normalizeThemeFx, type ThemeFx } from "./themeEffects";
import { CHROME_PALETTES } from "./chromePalettes";

export type ColorModeName = "dark" | "light";


/** The color_mode setting: an explicit mode or "follow the system". */
export type ModeSetting = ColorModeName | "system";

export interface SurfacePalette {
  base: string;
  surface: string;
  elevated: string;
  hover: string;
  tint: string;
  overlay: string;
  primary: string;
  secondary: string;
  tertiary: string;
  muted: string;
  faint: string;
  line: string;
  strong: string;
}

export interface ThemeVariant {
  primaryHover: string;
  primaryMuted: string;
  primaryText: string;
  primaryBorder: string;
  surfaces: SurfacePalette;
  /** Old palette used only by the chrome (sidebar / toolbar / header). */
  chrome: SurfacePalette;
}

/** Corner radii (px) for the shared radius tokens; themes may override all. */
export interface ThemeRadius {
  chip: number;
  control: number;
  card: number;
  pill: number;
  segment: number;
}

export const DEFAULT_RADIUS: ThemeRadius = {
  chip: 4,
  control: 8,
  card: 12,
  pill: 9999,
  segment: 5,
};


export interface ThemeDef {
  id: string;
  name: string;
  nameEn: string;
  /** Accent hex — drives --accent and, when derived, the whole neutral cast. */
  accent: string;
  /** Contrast colour for selected rows and data-viz reference/uncertainty marks. */
  emphasis: string;
  /** Optional second accent for decorative highlights (see design doc). */
  accent2?: string;
  /** Optional text colour for primary buttons; defaults to the variant primaryText. */
  primaryButtonText?: string;
  /** Optional primary-button text colour on hover/press; defaults to primaryButtonText. */
  primaryButtonHoverText?: string;
  /** Modes this theme actually ships. At least one. */
  modes: readonly ColorModeName[];
  dark?: ThemeVariant;
  light?: ThemeVariant;
  /** Decoration layer (pattern / glow / blur); absent = flat. */
  fx?: ThemeFx;
  /** Corner radii for --radius-chip/control/card/pill/segment. */
  radius: ThemeRadius;

}

export const DEFAULT_THEME_ID = "graphite";

// ---- Authoring API -------------------------------------------------------

export type ThemeRamp = "soft" | "normal" | "punchy" | "ink";

export interface NeutralSeed {
  /** Degrees; defaults to the accent's hue so neutrals carry its temperature. */
  hue?: number;
  /** 0 = pure gray. 0.01–0.02 reads as "tinted charcoal". */
  chroma?: number;
}

type VariantSeed = Partial<Omit<ThemeVariant, "surfaces">> & {
  surfaces?: Partial<SurfacePalette>;
};

export interface ThemeSeed {
  id: string;
  name: string;
  nameEn: string;
  accent: string;
  /** Contrast colour for selected rows and data-viz accents; defaults to the accent. */
  emphasis?: string;
  accent2?: string;
  /** Text colour for primary buttons; defaults to the variant primaryText. */
  primaryButtonText?: string;
  /** Text colour for primary buttons on hover/press; defaults to primaryButtonText. */
  primaryButtonHoverText?: string;
  /** Authoring intent; the factory only materializes the declared modes. */
  mode: ColorModeName | "both";
  neutral?: NeutralSeed | Partial<Record<ColorModeName, NeutralSeed>>;
  ramp?: ThemeRamp;
  /** Decoration layer; omitted means a flat theme. */
  fx?: ThemeFx;
  /** Corner radii override; omitted keeps DEFAULT_RADIUS. */
  radius?: Partial<ThemeRadius>;

  dark?: VariantSeed;
  light?: VariantSeed;
}

type RampSteps = {
  base: number;
  surface: number;
  elevated: number;
  hover: number;
  line: number;
  strong: number;
};

type LightRampSteps = Pick<RampSteps, "base" | "hover" | "line" | "strong">;

// OKLCH lightness ladder, calibrated against the shipped themes (violet dark
// base = 0.137, surface = 0.187, hover = 0.312). "ink" is the pure-black page
// game themes want: base is effectively #000, cards sit just above it.
const DARK_RAMP: Record<ThemeRamp, RampSteps> = {
  soft: { base: 0.175, surface: 0.225, elevated: 0.275, hover: 0.335, line: 0.255, strong: 0.355 },
  normal: { base: 0.14, surface: 0.2, elevated: 0.255, hover: 0.32, line: 0.245, strong: 0.335 },
  punchy: { base: 0.11, surface: 0.165, elevated: 0.225, hover: 0.295, line: 0.205, strong: 0.3 },
  ink: { base: 0.075, surface: 0.12, elevated: 0.175, hover: 0.245, line: 0.155, strong: 0.235 },
};

const LIGHT_RAMP: Record<ThemeRamp, LightRampSteps> = {
  soft: { base: 0.978, hover: 0.96, line: 0.936, strong: 0.885 },
  normal: { base: 0.972, hover: 0.953, line: 0.928, strong: 0.862 },
  punchy: { base: 0.966, hover: 0.945, line: 0.918, strong: 0.845 },
  ink: { base: 0.96, hover: 0.938, line: 0.91, strong: 0.83 },
};

const DARK_TEXT = { primary: 0.92, secondary: 0.85, tertiary: 0.7, muted: 0.55, faint: 0.43 };
const LIGHT_TEXT = { primary: 0.23, secondary: 0.38, tertiary: 0.48, muted: 0.58, faint: 0.73 };

const DEFAULT_NEUTRAL_CHROMA = 0.010;

function neutralFor(seed: ThemeSeed, mode: ColorModeName): Required<NeutralSeed> {
  const accentHue = hexToOklch(seed.accent).h;
  const raw = seed.neutral;
  const scoped =
    raw && !("hue" in raw) && !("chroma" in raw)
      ? (raw as Partial<Record<ColorModeName, NeutralSeed>>)[mode]
      : (raw as NeutralSeed | undefined);
  return {
    hue: scoped?.hue ?? accentHue,
    chroma: scoped?.chroma ?? DEFAULT_NEUTRAL_CHROMA,
  };
}

function deriveVariant(
  mode: ColorModeName,
  accent: string,
  neutral: Required<NeutralSeed>,
  ramp: ThemeRamp,
): ThemeVariant {
  const tone = (lightness: number, chromaScale = 1): string =>
    rgbTriplet(oklchToHex(lightness, neutral.chroma * chromaScale, neutral.hue));
  const surfaces: SurfacePalette =
    mode === "dark"
      ? (() => {
          const r = DARK_RAMP[ramp];
          return {
            base: tone(r.base),
            surface: tone(r.surface),
            elevated: tone(r.elevated),
            hover: tone(r.hover),
            tint: "255 255 255",
            overlay: "0 0 0",
            primary: tone(DARK_TEXT.primary, 0.55),
            secondary: tone(DARK_TEXT.secondary, 0.55),
            tertiary: tone(DARK_TEXT.tertiary, 0.6),
            muted: tone(DARK_TEXT.muted, 0.6),
            faint: tone(DARK_TEXT.faint, 0.6),
            line: tone(r.line, 0.8),
            strong: tone(r.strong, 0.8),
          };
        })()
      : (() => {
          const r = LIGHT_RAMP[ramp];
          // Light paper carries less of the accent than charcoal does: the same
          // chroma that reads as "tinted black" turns a near-white page into a
          // colored card.
          const overlay = tone(0.1, 0.5);
          return {
            base: tone(r.base, 0.35),
            surface: "255 255 255",
            elevated: "255 255 255",
            hover: tone(r.hover, 0.35),
            tint: overlay,
            overlay,
            primary: tone(LIGHT_TEXT.primary, 0.35),
            secondary: tone(LIGHT_TEXT.secondary, 0.35),
            tertiary: tone(LIGHT_TEXT.tertiary, 0.4),
            muted: tone(LIGHT_TEXT.muted, 0.4),
            faint: tone(LIGHT_TEXT.faint, 0.4),
            line: tone(r.line, 0.3),
            strong: tone(r.strong, 0.3),
          };
        })();

  const accentL = hexToOklch(accent).l;
  // Accent text must read on the page without turning white: aim for a fixed
  // lightness band instead of a fixed offset from a possibly-bright accent.
  const textTarget =
    mode === "dark"
      ? Math.min(0.88, Math.max(0.72, accentL + 0.2))
      : Math.min(0.55, Math.max(0.3, accentL - 0.2));

  return {
    primaryHover: shiftLightness(accent, mode === "dark" ? -0.05 : -0.06),
    primaryMuted: rgbaFromHex(accent, mode === "dark" ? 0.15 : 0.12),
    primaryText: shiftLightness(accent, textTarget - accentL, 0.9),
    primaryBorder: rgbaFromHex(accent, mode === "dark" ? 0.3 : 0.35),
    surfaces,
    chrome: { ...surfaces },
  };
}

const PAPER_ACCENT_RATIO = 0.09;

/** Light-mode cards sit on a tinted paper instead of pure white. */
function tintPaper(accent: string, ratio = PAPER_ACCENT_RATIO): string {
  const [r, g, b] = parseHex(accent);
  const mix = (channel: number) => Math.round(channel * ratio + 255 * (1 - ratio));
  return `${mix(r)} ${mix(g)} ${mix(b)}`;
}

/** Mix an existing RGB triplet toward the accent; used for light base/hover.
 */
function tintTriplet(triplet: string, accent: string, ratio: number): string {
  const [br, bg, bb] = triplet.split(" ").map(Number);
  const [ar, ag, ab] = parseHex(accent);
  const mix = (base: number, accentChannel: number) =>
    Math.round(base * (1 - ratio) + accentChannel * ratio);
  return `${mix(br, ar)} ${mix(bg, ag)} ${mix(bb, ab)}`;
}

function buildVariant(mode: ColorModeName, seed: ThemeSeed): ThemeVariant {
  const derived = deriveVariant(mode, seed.accent, neutralFor(seed, mode), seed.ramp ?? "normal");
  const { surfaces: surfaceOverride, ...variantOverride } = (mode === "dark" ? seed.dark : seed.light) ?? {};
  const merged: ThemeVariant = {
    ...derived,
    ...variantOverride,
    surfaces: { ...derived.surfaces, ...surfaceOverride },
    chrome: { ...derived.chrome, ...((mode === "dark" ? seed.dark : seed.light)?.chrome ?? {}) },
  };
  // The paper rule is structural, not a per-theme token: keep it even when a
  // theme hands in a complete light palette.
  if (mode === "light") {
    merged.surfaces = {
      ...merged.surfaces,
      base: tintTriplet(merged.surfaces.base, seed.accent, 0.06),
      hover: tintTriplet(merged.surfaces.hover, seed.accent, 0.055),
      surface: tintPaper(seed.accent),
      elevated: tintPaper(seed.accent, 0.052),
    };
    merged.chrome = { ...merged.chrome, surface: tintPaper(seed.accent, 0.03) };
  }
  return merged;
}

export function theme(seed: ThemeSeed): ThemeDef {
  if (!isHexColor(seed.accent)) throw new Error(`theme "${seed.id}": invalid accent ${seed.accent}`);
  if (seed.accent2 && !isHexColor(seed.accent2)) {
    throw new Error(`theme "${seed.id}": invalid accent2 ${seed.accent2}`);
  }
  if (seed.emphasis && !isHexColor(seed.emphasis)) {
    throw new Error(`theme "${seed.id}": invalid emphasis ${seed.emphasis}`);
  }
  if (seed.primaryButtonText && !isHexColor(seed.primaryButtonText)) {
    throw new Error(`theme "${seed.id}": invalid primaryButtonText ${seed.primaryButtonText}`);
  }
  if (seed.primaryButtonHoverText && !isHexColor(seed.primaryButtonHoverText)) {
    throw new Error(`theme "${seed.id}": invalid primaryButtonHoverText ${seed.primaryButtonHoverText}`);
  }
  for (const [key, value] of Object.entries(seed.radius ?? {})) {
    if (!Number.isFinite(value) || (value as number) < 0) {
      throw new Error(`theme "${seed.id}": invalid radius ${key} ${String(value)}`);
    }
  }

  const modes: ColorModeName[] = seed.mode === "both" ? ["dark", "light"] : [seed.mode];
  const def: ThemeDef = {
    id: seed.id,
    name: seed.name,
    nameEn: seed.nameEn,
    accent: seed.accent,
    emphasis: seed.emphasis ?? seed.accent,
    accent2: seed.accent2,
    primaryButtonText: seed.primaryButtonText,
    primaryButtonHoverText: seed.primaryButtonHoverText,
    modes,
    fx: normalizeThemeFx(seed.fx),
    radius: { ...DEFAULT_RADIUS, ...seed.radius },
  };
  if (modes.includes("dark")) def.dark = buildVariant("dark", seed);
  if (modes.includes("light")) def.light = buildVariant("light", seed);
  // Every theme gets the sidebar hover glow. Themes that did not author a
  // fountain get a smooth accent wash (no square texture); GENESIS keeps its
  // cyan matrix because it ships an explicit fountain spec.
  const fx = def.fx ?? {};
  if (!fx.fountain) {
    fx.fountain = {
      color: seed.accent,
      selectedColor: def.emphasis,
      opacity: 0.4,
      texture: false,
      flow: "none",
    };
  }
  // All sidebars use the flat row treatment: hover/press have no grey chip,
  // the glow is the feedback; the selected row keeps an emphasis-coloured glow.
  fx.sidebarRows = fx.sidebarRows ?? "flat";
  def.fx = fx;
  return def;
}

export const themes: readonly ThemeDef[] = [
  theme({
    mode: "both",
    id: "graphite",
    name: "石墨冰",
    nameEn: "Graphite Ice",
    accent: "#71717a",
    emphasis: "#38bdf8",
    neutral: { hue: 220, chroma: 0.003 },
    dark: {
      primaryHover: "#52525b",
      primaryMuted: "rgba(113, 113, 122, 0.15)",
      primaryText: "#d4d4d8",
      primaryBorder: "rgba(113, 113, 122, 0.3)",
      chrome: CHROME_PALETTES.graphite.dark,
    },
    light: {
      primaryHover: "#52525b",
      primaryMuted: "rgba(113, 113, 122, 0.12)",
      primaryText: "#3f3f46",
      primaryBorder: "rgba(82, 82, 91, 0.35)",
      chrome: CHROME_PALETTES.graphite.light,
    },
  }),
  theme({
    mode: "both",
    id: "champagne",
    name: "香槟金",
    nameEn: "Champagne",
    accent: "#c9a86a",
    emphasis: "#0f766e",
    neutral: { hue: 40, chroma: 0.006 },
    dark: {
      primaryHover: "#b08d4f",
      primaryMuted: "rgba(201, 168, 106, 0.15)",
      primaryText: "#e8d5ae",
      primaryBorder: "rgba(201, 168, 106, 0.3)",
      chrome: CHROME_PALETTES.champagne.dark,
    },
    light: {
      primaryHover: "#b08d4f",
      primaryMuted: "rgba(201, 168, 106, 0.12)",
      primaryText: "#7a5c2e",
      primaryBorder: "rgba(176, 141, 79, 0.35)",
      chrome: CHROME_PALETTES.champagne.light,
    },
  }),
  theme({
    mode: "both",
    id: "olive",
    name: "橄榄绿",
    nameEn: "Olive",
    accent: "#708238",
    emphasis: "#f2e8cf",
    neutral: { hue: 85, chroma: 0.005 },
    dark: {
      primaryHover: "#5c6b2e",
      primaryMuted: "rgba(112, 130, 56, 0.15)",
      primaryText: "#c8d4a0",
      primaryBorder: "rgba(112, 130, 56, 0.3)",
      chrome: CHROME_PALETTES.olive.dark,
    },
    light: {
      primaryHover: "#5c6b2e",
      primaryMuted: "rgba(112, 130, 56, 0.12)",
      primaryText: "#4d5c24",
      primaryBorder: "rgba(92, 107, 46, 0.35)",
      chrome: CHROME_PALETTES.olive.light,
    },
  }),
  theme({
    mode: "both",
    id: "sage",
    name: "鼠尾草",
    nameEn: "Sage",
    accent: "#84a98c",
    emphasis: "#c97c5d",
    neutral: { hue: 145, chroma: 0.005 },
    dark: {
      primaryHover: "#6b8f74",
      primaryMuted: "rgba(132, 169, 140, 0.15)",
      primaryText: "#b7d3bd",
      primaryBorder: "rgba(132, 169, 140, 0.3)",
      chrome: CHROME_PALETTES.sage.dark,
    },
    light: {
      primaryHover: "#5f8268",
      primaryMuted: "rgba(132, 169, 140, 0.12)",
      primaryText: "#4f6b56",
      primaryBorder: "rgba(95, 130, 104, 0.35)",
      chrome: CHROME_PALETTES.sage.light,
    },
  }),
  theme({
    mode: "both",
    id: "emerald",
    name: "翡翠绿",
    nameEn: "Emerald",
    accent: "#10b981",
    emphasis: "#f472b6",
    dark: {
      primaryHover: "#059669",
      primaryMuted: "rgba(16, 185, 129, 0.15)",
      primaryText: "#6ee7b7",
      primaryBorder: "rgba(16, 185, 129, 0.3)",
      chrome: CHROME_PALETTES.emerald.dark,
    },
    light: {
      primaryHover: "#059669",
      primaryMuted: "rgba(16, 185, 129, 0.12)",
      primaryText: "#047857",
      primaryBorder: "rgba(5, 150, 105, 0.35)",
      chrome: CHROME_PALETTES.emerald.light,
    },
  }),
  theme({
    mode: "both",
    id: "teal",
    name: "松石绿",
    nameEn: "Teal",
    accent: "#0f766e",
    emphasis: "#f59e0b",
    neutral: { hue: 185, chroma: 0.008 },
    dark: {
      primaryHover: "#0b5f59",
      primaryMuted: "rgba(15, 118, 110, 0.15)",
      primaryText: "#5eead4",
      primaryBorder: "rgba(15, 118, 110, 0.3)",
      chrome: CHROME_PALETTES.teal.dark,
    },
    light: {
      primaryHover: "#0b5f59",
      primaryMuted: "rgba(15, 118, 110, 0.12)",
      primaryText: "#115e59",
      primaryBorder: "rgba(15, 118, 110, 0.35)",
      chrome: CHROME_PALETTES.teal.light,
    },
  }),
  theme({
    mode: "both",
    id: "ocean",
    name: "海洋蓝",
    nameEn: "Ocean",
    accent: "#3b82f6",
    emphasis: "#fbbf24",
    dark: {
      primaryHover: "#2563eb",
      primaryMuted: "rgba(59, 130, 246, 0.15)",
      primaryText: "#93c5fd",
      primaryBorder: "rgba(59, 130, 246, 0.3)",
      chrome: CHROME_PALETTES.ocean.dark,
    },
    light: {
      primaryHover: "#2563eb",
      primaryMuted: "rgba(59, 130, 246, 0.12)",
      primaryText: "#1d4ed8",
      primaryBorder: "rgba(37, 99, 235, 0.35)",
      chrome: CHROME_PALETTES.ocean.light,
    },
  }),
  theme({
    mode: "both",
    id: "violet",
    name: "紫罗兰",
    nameEn: "Violet",
    accent: "#ae7fe2",
    emphasis: "#f472b6",
    dark: {
      primaryHover: "#9b6bd6",
      primaryMuted: "rgba(174, 127, 226, 0.15)",
      primaryText: "#dcc4f5",
      primaryBorder: "rgba(174, 127, 226, 0.3)",
      chrome: CHROME_PALETTES.violet.dark,
    },
    light: {
      primaryHover: "#9463ce",
      primaryMuted: "rgba(174, 127, 226, 0.12)",
      primaryText: "#62368f",
      primaryBorder: "rgba(148, 99, 206, 0.35)",
      chrome: CHROME_PALETTES.violet.light,
    },
  }),
  theme({
    mode: "both",
    id: "plum",
    name: "梅子红",
    nameEn: "Plum",
    accent: "#7b2d5e",
    emphasis: "#e9c46a",
    neutral: { hue: 330, chroma: 0.006 },
    dark: {
      primaryHover: "#64234c",
      primaryMuted: "rgba(123, 45, 94, 0.15)",
      primaryText: "#d8a7c6",
      primaryBorder: "rgba(123, 45, 94, 0.3)",
      chrome: CHROME_PALETTES.plum.dark,
    },
    light: {
      primaryHover: "#64234c",
      primaryMuted: "rgba(123, 45, 94, 0.12)",
      primaryText: "#64234c",
      primaryBorder: "rgba(100, 35, 76, 0.35)",
      chrome: CHROME_PALETTES.plum.light,
    },
  }),
  theme({
    mode: "both",
    id: "sakura",
    name: "樱花粉",
    nameEn: "Sakura",
    accent: "#f9a8d4",
    emphasis: "#0f766e",
    neutral: { hue: 330, chroma: 0.006 },
    dark: {
      primaryHover: "#ec4899",
      primaryMuted: "rgba(249, 168, 212, 0.15)",
      primaryText: "#fbcfe8",
      primaryBorder: "rgba(249, 168, 212, 0.3)",
      chrome: CHROME_PALETTES.sakura.dark,
    },
    light: {
      primaryHover: "#db2777",
      primaryMuted: "rgba(249, 168, 212, 0.12)",
      primaryText: "#9d174d",
      primaryBorder: "rgba(219, 39, 119, 0.35)",
      chrome: CHROME_PALETTES.sakura.light,
    },
  }),
  theme({
    mode: "both",
    id: "rose",
    name: "玫瑰粉",
    nameEn: "Rose",
    accent: "#f43f5e",
    emphasis: "#22d3ee",
    dark: {
      primaryHover: "#e11d48",
      primaryMuted: "rgba(244, 63, 94, 0.15)",
      primaryText: "#fda4af",
      primaryBorder: "rgba(244, 63, 94, 0.3)",
      chrome: CHROME_PALETTES.rose.dark,
    },
    light: {
      primaryHover: "#e11d48",
      primaryMuted: "rgba(244, 63, 94, 0.12)",
      primaryText: "#be123c",
      primaryBorder: "rgba(225, 29, 72, 0.35)",
      chrome: CHROME_PALETTES.rose.light,
    },
  }),
  theme({
    mode: "both",
    id: "coral",
    name: "珊瑚橙",
    nameEn: "Coral",
    accent: "#ff6f61",
    emphasis: "#0ea5e9",
    neutral: { hue: 20, chroma: 0.006 },
    dark: {
      primaryHover: "#e85545",
      primaryMuted: "rgba(255, 111, 97, 0.15)",
      primaryText: "#ffb4a8",
      primaryBorder: "rgba(255, 111, 97, 0.3)",
      chrome: CHROME_PALETTES.coral.dark,
    },
    light: {
      primaryHover: "#e85545",
      primaryMuted: "rgba(255, 111, 97, 0.12)",
      primaryText: "#b9382d",
      primaryBorder: "rgba(232, 85, 69, 0.35)",
      chrome: CHROME_PALETTES.coral.light,
    },
  }),
  theme({
    mode: "dark",
    id: "genesis",
    name: "GENESIS",
    nameEn: "GENESIS",
    accent: "#d4a53a",
    // Secondary colour, used by the theme card swatch (gold + cyan split).
    accent2: "#35c9d6",
    // Primary buttons read cyan, not the gold interaction colour.
    primaryButtonHoverText: "#84d6df",
    emphasis: "#f0c75e",
    neutral: { hue: 42, chroma: 0.004 },
    ramp: "ink",
    // Entire theme is square-cornered (buttons, inputs, cards, menus, icon
    // buttons) — the tactical chrome has no rounded edges.
    radius: { chip: 0, control: 0, card: 0, pill: 0, segment: 0 },

    dark: {
      primaryMuted: "rgba(212, 165, 58, 0.12)",
      primaryBorder: "rgba(212, 165, 58, 0.3)",
      // Charcoal, not pure black: the gold interaction color needs a gray
      // field, and the panels need to sit above the page.
      surfaces: {
        base: "8 8 9",
        surface: "14 14 16",
        elevated: "22 22 25",
        hover: "33 33 37",
        line: "28 28 32",
        strong: "46 46 51",
      },
    },
    fx: {
      // Large surfaces stay neutral gray-black: chrome takes no accent tint.
      chrome: "neutral",

      // Sidebar rows: on hover the matrix sprays in from the dock edge with a
      // rotated-Gaussian falloff; pressed rows brighten. `flat` drops the gray
      // hover/selected chips so only the texture marks the row.
      // Hover = cyan-blue fountain; the selected row switches to gold (both the
      // matrix and the text/icon glow).
      fountain: {
        color: "#4fe0ea",
        selectedColor: "#f0c75e",
        opacity: 0.58,
        scale: 3,
        weight: 1,
        reach: 130,
        height: 70,
        flow: "breathe",
        flowDuration: 0.8,
      },
      // Hovered buttons get the cyan matrix and a cyan edge instead of the
      // generic gray/gold hover fill.
      hover: { color: "#2a9fae", opacity: 0.26, scale: 3, weight: 1 },
      // A selected tab keeps its gold fill and gets a gold matrix on hover.
      selectedHover: { color: "#e0b24c", opacity: 0.35, scale: 3, weight: 1 },
      // Focused fields: cyan 1px border + the active-button matrix wash.
      focus: { color: "#35c9d6", textureOpacity: 0.08 },
      sidebarRows: "flat",
      blur: 12,
    },
  }),
];

export const THEME_IDS: readonly string[] = themes.map((t) => t.id);

// ---- Resolution ----------------------------------------------------------

export interface ResolvedAppearance {
  theme: ThemeDef;
  variant: ThemeVariant;
  /** The mode that actually applies (pinned to a supported one if needed). */
  mode: ColorModeName;
  /** True when the requested mode is unsupported and we forced a theme mode. */
  pinned: boolean;
}

export function findTheme(id: string | null | undefined): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes.find((t) => t.id === DEFAULT_THEME_ID) ?? themes[0];
}

export function themeVariant(themeDef: ThemeDef, mode: ColorModeName): ThemeVariant | null {
  return (mode === "dark" ? themeDef.dark : themeDef.light) ?? null;
}

export function themeSupports(themeDef: ThemeDef, mode: ColorModeName): boolean {
  return themeDef.modes.includes(mode);
}

export function resolveAppearance(
  themeId: string | null | undefined,
  modeSetting: ModeSetting,
  systemDark: boolean,
): ResolvedAppearance {
  const themeDef = findTheme(themeId);
  const wanted: ColorModeName = modeSetting === "system" ? (systemDark ? "dark" : "light") : modeSetting;
  if (themeDef.modes.includes(wanted)) {
    return { theme: themeDef, variant: themeVariant(themeDef, wanted)!, mode: wanted, pinned: false };
  }
  const forced = themeDef.modes[0] ?? "dark";
  return {
    theme: themeDef,
    variant: themeVariant(themeDef, forced)!,
    mode: forced,
    pinned: true,
  };
}

/** Native window surface color for an appearance (`#rrggbb`). */
export function appearanceBaseHex(appearance: ResolvedAppearance): string {
  const channels = appearance.variant.surfaces.base
    .split(" ")
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
