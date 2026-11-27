// Theme decoration layer: patterns and surface effects are described as data
// and rendered into CSS variables here, so a "fancy" theme never ships custom
// CSS and components never branch on the theme id.
//
// Every token is a no-op by default (`none` / `0px` / the normal sheen), and
// patterns are pure generators: a new look is a new kind (one function + one
// line in the docs), not a new stylesheet.

import { isHexColor, rgbaFromHex, rgbTriplet } from "./themeColor";

export type PatternKind = "grid" | "pixels" | "scanlines" | "waves" | "contours" | "matrix";

export interface PatternSpec {
  kind: PatternKind;
  /** Base spacing in px. Kind-specific defaults; clamped to a sane band. */
  scale?: number;
  /** Stroke/ink opacity, 0..0.4 (higher would fight the page text). */
  opacity?: number;
  /** Ink hex; defaults to the theme accent. */
  color?: string;
  /** Stroke thickness in px (line kinds). */
  weight?: number;
}

/** Soft ambient wash behind the texture — the "bright accent fading into
 *  charcoal" layer. Two shapes: a radial light source or a linear wash. */
export interface BloomSpec {
  /** Default "radial". */
  kind?: "radial" | "linear";
  /** Hex; defaults to the theme accent. */
  color?: string;
  /** Peak alpha, 0..0.85. Default 0.3. */
  opacity?: number;
  /** Radial center as percentages of the window; may sit outside 0..100. */
  x?: number;
  y?: number;
  /** Radial ellipse radius in percent of the window size. Default 130. */
  size?: number;
  /** Radial vertical radius as a fraction of `size`. Default 1. */
  aspect?: number;
  /** Linear gradient direction in degrees (180 = top→bottom). Default 180. */
  angle?: number;
  /** Where the color reaches zero, as a fraction of the gradient length. Default 0.7. */
  fade?: number;
}

/** Regular square matrix used as the ChipTabs selection glow.
 *  One square per tile: aligned grid, no random dots. The soft falloff comes
 *  from a radial mask in CSS, so the tile can stay tiny. */
export interface HighlightSpec {
  /** Hex; defaults to the theme accent. */
  color?: string;
  /** 0..1 field opacity. Default 0.6. */
  opacity?: number;
  /** Grid pitch in px. Default 4. */
  scale?: number;
  /** Square size in px. Default 2. */
  weight?: number;
}

/** Sidebar hover glow that sprays in from the dock edge. `texture` paints the
 *  square matrix (GENESIS); otherwise it is a smooth theme-colour wash. The
 *  mask is a rotated Gaussian (bell along the row height, decay from the edge),
 *  so the spray widens inward instead of being a flat band. */
export interface FountainSpec {
  /** Hex; defaults to the theme accent. */
  color?: string;
  /** Hex used for the selected row (defaults to `color`). */
  selectedColor?: string;
  /** Hover opacity, 0..1. Default 0.5. */
  opacity?: number;
  /** Grid pitch in px. Default 4. */
  scale?: number;
  /** Square size in px. Default 2. */
  weight?: number;
  /** Horizontal reach in % of the row width. Default 130. */
  reach?: number;
  /** Vertical bell radius in % of the row height. Default 70. */
  height?: number;
  /** Optional motion: the matrix slowly breathes in place while interacting. */
  flow?: "none" | "breathe";
  /** Breathing cycle in seconds. Default 2.8. */
  flowDuration?: number;
  /** false = smooth theme-colour wash instead of the square matrix. Default true. */
  texture?: boolean;
}

export interface ThemeFx {
  /** Ambient pattern behind the page canvas. */
  pattern?: PatternSpec;
  /** One or more washes under the pattern (gradient instead of a flat block). */
  bloom?: BloomSpec | BloomSpec[];
  /** Accent-to-charcoal style wash used by bloom layers. */
  /** Regular matrix texture for the ChipTabs selection glow (GENESIS: cyan). */
  highlight?: HighlightSpec;
  /** Optional square-matrix tint + border for hovered buttons. */
  hover?: HighlightSpec;
  /** Optional matrix used by an already-selected control on hover (e.g. the
   *  active tab); defaults to the theme accent. */
  selectedHover?: HighlightSpec;
  /** Optional focus decoration for fields: a thin border + matrix wash. */
  focus?: { color?: string; textureOpacity?: number };
  /** Sidebar hover fountain (cyan matrix spraying in from the dock edge). */
  fountain?: FountainSpec;
  /** Sidebar row fills: "tint" keeps the gray hover/selected chips, "flat"
   *  removes them so only the fountain/highlight shows. Default "tint". */
  sidebarRows?: "tint" | "flat";
  /** Large-surface tint: "accent" (default) or "neutral" gray-black chrome. */
  chrome?: "accent" | "neutral";
  /** Top-highlight strength on the chrome bands (0..1). Dark default 0.05, light 0. */
  /** Glow radius in px around accent highlights (tabs, selected cards). */
  glow?: number;
  /** Backdrop blur in px for floating panels. */
  blur?: number;
}

export interface PatternLayer {
  images: string[];
  sizes: string[];
  repeats: string[];
}

/** Variables owned by the decoration layer; cleared before each theme applies. */
export const FX_VAR_KEYS = [
  "--fx-image",
  "--fx-size",
  "--fx-repeat",
  "--fx-highlight",
  "--fx-highlight-size",
  "--fx-highlight-opacity",
  "--fx-hover-image",
  "--fx-hover-size",
  "--fx-hover-opacity",
  "--fx-hover-border",
  "--fx-selected-hover-image",
  "--fx-selected-hover-size",
  "--fx-selected-hover-opacity",
  "--fx-selected-hover-border",
  "--focus-border-color",
  "--focus-texture-opacity",
  "--fx-fountain",
  "--fx-fountain-size",
  "--fx-fountain-opacity",
  "--fx-fountain-mask",
  "--fx-fountain-rgb",
  "--fx-fountain-selected",
  "--fx-fountain-selected-rgb",
  "--fx-fountain-flow",
  "--chrome-tint",
  "--fx-glow",
  "--fx-blur",
] as const;

const SCALE_BOUNDS: Record<PatternKind, { min: number; max: number; fallback: number }> = {
  grid: { min: 2, max: 64, fallback: 8 },
  pixels: { min: 2, max: 32, fallback: 4 },
  scanlines: { min: 2, max: 32, fallback: 4 },
  waves: { min: 24, max: 320, fallback: 96 },
  contours: { min: 120, max: 800, fallback: 320 },
  matrix: { min: 2, max: 10, fallback: 4 },
};

const DEFAULT_OPACITY: Record<PatternKind, number> = {
  grid: 0.1,
  pixels: 0.12,
  scanlines: 0.12,
  waves: 0.14,
  contours: 0.1,
  matrix: 0.05,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** ASCII-only base64 (the SVG is generated from numbers and hex colors), so the
 *  same module works in the renderer and in Node without Buffer/btoa. */
function base64(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    out += BASE64[a >> 2];
    out += BASE64[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    out += Number.isNaN(b) ? "=" : BASE64[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    out += Number.isNaN(c) ? "=" : BASE64[c & 63];
  }
  return out;
}

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml;base64,${base64(svg)}")`;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** Deterministic sine wave tile: 48 segments per period so the seam matches. */
function wavesTile(ink: string, period: number, weight: number): PatternLayer {
  const amplitude = Math.max(2, Math.round(period / 8));
  const height = amplitude * 2 + weight * 2;
  const mid = amplitude + weight;
  const path = (phase: number): string => {
    const points: string[] = [];
    for (let i = 0; i <= 48; i += 1) {
      const x = (period * i) / 48;
      const y = mid + Math.sin((2 * Math.PI * i) / 48 + phase) * amplitude * 0.8;
      points.push(`${i === 0 ? "M" : "L"}${round(x)},${round(y)}`);
    }
    return points.join(" ");
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${period}" height="${height}" ` +
    `viewBox="0 0 ${period} ${height}">` +
    `<path d="${path(0)}" fill="none" stroke="${ink}" stroke-width="${weight}" stroke-linejoin="round"/>` +
    `</svg>`;
  return {
    images: [svgUrl(svg)],
    sizes: [`${period}px ${height}px`],
    repeats: ["repeat"],
  };
}

/** Closed loop through the points using midpoint quadratics (no visible facets). */
function smoothClosedPath(points: Array<[number, number]>): string {
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const count = points.length;
  const start = mid(points[count - 1], points[0]);
  let d = `M${Math.round(start[0])} ${Math.round(start[1])}`;
  for (let i = 0; i < count; i += 1) {
    const next = points[(i + 1) % count];
    const end = mid(points[i], next);
    d += `Q${Math.round(points[i][0])} ${Math.round(points[i][1])} ${Math.round(end[0])} ${Math.round(end[1])}`;
  }
  return `${d}Z`;
}

/** Topographic rings: three irregular centers, scaled to cover the viewport. */
function contoursTile(ink: string, scale: number, weight: number): PatternLayer {
  const width = 1200;
  const height = 800;
  const levels = 7;
  const pointsPerLoop = 32;
  const centers = [
    { cx: 320, cy: 280, base: scale * 0.13, drift: 1.1 },
    { cx: 880, cy: 340, base: scale * 0.11, drift: 2.4 },
    { cx: 600, cy: 660, base: scale * 0.1, drift: 3.7 },
  ];
  const paths: string[] = [];
  for (const { cx, cy, base, drift } of centers) {
    for (let level = 1; level <= levels; level += 1) {
      const radius = base * (0.75 + level * 0.55);
      const points: Array<[number, number]> = [];
      for (let i = 0; i < pointsPerLoop; i += 1) {
        const theta = (2 * Math.PI * i) / pointsPerLoop;
        const wobble =
          1 +
          0.16 * Math.sin(3 * theta + level * 0.8 + drift) +
          0.08 * Math.sin(5 * theta - level * 0.5);
        const r = radius * wobble;
        points.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r * 0.72]);
      }
      paths.push(
        `<path d="${smoothClosedPath(points)}" fill="none" stroke="${ink}" ` +
          `stroke-width="${weight}" stroke-linejoin="round"/>`,
      );
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">` +
    paths.join("") +
    `</svg>`;
  return {
    images: [svgUrl(svg)],
    sizes: ["cover"],
    repeats: ["no-repeat"],
  };
}

/** Fine pixel matrix: a dense micro-square array with sparse lit cells.
 *  The array comes from a cheap CSS checker; only the lit cells are drawn in an
 *  SVG tile, so the data URI stays around 1 KB. Lit cells are deterministic
 *  (seeded), never Math.random, so the texture is stable across launches. */
function matrixTile(ink: string, pitch: number, baseAlpha: number): PatternLayer {
  const cells = 24;
  const tile = cells * pitch;
  const cell = Math.max(1, pitch - 2);
  let seed = 0x9e3779b9;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const used = new Set<number>();
  const count = Math.round(cells * cells * 0.04);
  const rects: string[] = [];
  while (used.size < count) {
    const index = Math.floor(rand() * cells * cells);
    if (used.has(index)) continue;
    used.add(index);
    const cx = index % cells;
    const cy = Math.floor(index / cells);
    const inkAlpha = Math.round((0.2 + rand() * 0.35) * 100) / 100;
    rects.push(
      `<rect x="${cx * pitch + 1}" y="${cy * pitch + 1}" width="${cell}" height="${cell}" ` +
        `fill="${rgbaFromHex(ink, inkAlpha)}"/>`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" ` +
    `viewBox="0 0 ${tile} ${tile}">${rects.join("")}</svg>`;
  const checker =
    `repeating-conic-gradient(rgba(255, 255, 255, ${baseAlpha}) 0% 25%, transparent 0% 50%)`;
  return {
    images: [svgUrl(svg), checker],
    sizes: [`${tile}px ${tile}px`, `${pitch}px ${pitch}px`],
    repeats: ["repeat", "repeat"],
  };
}

/** One soft wash: bright at the source, gone before the far edge. */
function bloomLayer(spec: BloomSpec, accent: string): string {
  const color = spec.color ?? accent;
  const opacity = Math.round(clamp(finiteOr(spec.opacity, 0.3), 0, 0.85) * 1000) / 1000;
  const fade = clamp(finiteOr(spec.fade, 0.7), 0.15, 0.95);
  const end = Math.round(fade * 100);
  const mid = Math.round(fade * 50);
  const stop = Math.round(opacity * 0.45 * 1000) / 1000;
  const soft = Math.round(opacity * 0.4 * 1000) / 1000;
  if (spec.kind === "linear") {
    const angle = clamp(finiteOr(spec.angle, 180), 0, 360);
    return (
      `linear-gradient(${angle}deg, ${rgbaFromHex(color, opacity)} 0%, ` +
      `${rgbaFromHex(color, soft)} ${mid}%, transparent ${end}%)`
    );
  }
  const x = clamp(finiteOr(spec.x, 15), -50, 150);
  const y = clamp(finiteOr(spec.y, -20), -50, 150);
  const size = clamp(finiteOr(spec.size, 130), 20, 240);
  const aspect = clamp(finiteOr(spec.aspect, 1), 0.2, 2);
  return (
    `radial-gradient(${size}% ${Math.round(size * aspect)}% at ${x}% ${y}%, ` +
    `${rgbaFromHex(color, opacity)} 0%, ` +
    `${rgbaFromHex(color, stop)} ${mid}%, transparent ${end}%)`
  );
}

/** One square per tile: an aligned matrix. The radial falloff lives in CSS. */
function highlightTile(spec: HighlightSpec, accent: string): { image: string; size: string } {
  const pitch = clamp(finiteOr(spec.scale, 4), 2, 12);
  const square = clamp(finiteOr(spec.weight, 2), 1, pitch);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pitch}" height="${pitch}" ` +
    `viewBox="0 0 ${pitch} ${pitch}">` +
    `<rect x="0" y="0" width="${square}" height="${square}" fill="${spec.color ?? accent}"/>` +
    `</svg>`;
  return { image: svgUrl(svg), size: `${pitch}px ${pitch}px` };
}

/** Rotated-Gaussian mask: bell along the row height, decaying from the edge.
 *  The stop list is normalized so the ink reaches zero just before the row's
 *  right edge instead of being clipped there. */
// Texture-free fountain: a smooth wash fading from the dock edge inward. The
// same radial mask as the matrix shapes the vertical bell.
function fountainGlow(color: string): string {
  return (
    `linear-gradient(90deg, ${rgbaFromHex(color, 1)} 0%, ` +
    `${rgbaFromHex(color, 0.45)} 55%, ${rgbaFromHex(color, 0)} 100%)`
  );
}

function fountainMask(spec: FountainSpec): string {  const reach = clamp(finiteOr(spec.reach, 130), 40, 400);
  const height = clamp(finiteOr(spec.height, 70), 20, 200);
  const reachRatio = reach / 100;
  // The pseudo is 32px wider than the row; 94% of its width is a safe end.
  const end = clamp(0.94 / reachRatio, 0.35, 0.95);
  const at = (fraction: number): string => `${Math.round(fraction * end * 1000) / 10}%`;
  return (
    `radial-gradient(${reach}% ${height}% at -2% 50%, rgba(0, 0, 0, 1) 0%, ` +
    `rgba(0, 0, 0, 0.85) ${at(0.2)}, rgba(0, 0, 0, 0.55) ${at(0.45)}, ` +
    `rgba(0, 0, 0, 0.28) ${at(0.68)}, rgba(0, 0, 0, 0.12) ${at(0.85)}, ` +
    `transparent ${at(1)})`
  );
}

export function patternLayer(spec: PatternSpec | undefined, accent: string): PatternLayer | null {
  if (!spec) return null;
  const bounds = SCALE_BOUNDS[spec.kind];
  if (!bounds) return null;
  const scale = clamp(finiteOr(spec.scale, bounds.fallback), bounds.min, bounds.max);
  const opacity = clamp(finiteOr(spec.opacity, DEFAULT_OPACITY[spec.kind]), 0, 0.4);
  const weight = clamp(finiteOr(spec.weight, 1), 0.5, 3);
  const ink = rgbaFromHex(spec.color ?? accent, opacity);

  switch (spec.kind) {
    case "grid": {
      const step = Math.round(scale);
      const line = `${weight}px`;
      return {
        images: [
          `repeating-linear-gradient(to right, ${ink} 0 ${line}, transparent ${line} ${step}px)`,
          `repeating-linear-gradient(to bottom, ${ink} 0 ${line}, transparent ${line} ${step}px)`,
        ],
        sizes: [`${step}px ${step}px`, `${step}px ${step}px`],
        repeats: ["repeat", "repeat"],
      };
    }
    case "pixels": {
      const step = Math.round(scale);
      return {
        images: [`repeating-conic-gradient(${ink} 0% 25%, transparent 0% 50%)`],
        sizes: [`${step}px ${step}px`],
        repeats: ["repeat"],
      };
    }
    case "scanlines": {
      const step = Math.round(scale);
      return {
        images: [
          `repeating-linear-gradient(to bottom, ${ink} 0 ${weight}px, transparent ${weight}px ${step}px)`,
        ],
        sizes: [`${step}px ${step}px`],
        repeats: ["repeat"],
      };
    }
    case "waves":
      return wavesTile(ink, Math.round(scale), weight);
    case "contours":
      return contoursTile(ink, Math.round(scale), weight);
    case "matrix":
      return matrixTile(spec.color ?? accent, Math.round(scale), opacity);
    default:
      return null;
  }
}

/** Clamp one authored wash. Throws on a typo so a bad theme fails loudly. */
function normalizeBloom(spec: BloomSpec): BloomSpec {
  if (spec.color && !isHexColor(spec.color)) {
    throw new Error(`theme fx: invalid bloom color ${spec.color}`);
  }
  if (spec.kind && spec.kind !== "radial" && spec.kind !== "linear") {
    throw new Error(`theme fx: unknown bloom kind ${String(spec.kind)}`);
  }
  return {
    kind: spec.kind ?? "radial",
    color: spec.color,
    opacity: clamp(finiteOr(spec.opacity, 0.3), 0, 0.85),
    x: clamp(finiteOr(spec.x, 15), -50, 150),
    y: clamp(finiteOr(spec.y, -20), -50, 150),
    size: clamp(finiteOr(spec.size, 130), 20, 240),
    aspect: clamp(finiteOr(spec.aspect, 1), 0.2, 2),
    angle: clamp(finiteOr(spec.angle, 180), 0, 360),
    fade: clamp(finiteOr(spec.fade, 0.7), 0.15, 0.95),
  };
}

export function normalizeThemeFx(fx: ThemeFx | undefined): ThemeFx | undefined {
  if (!fx) return undefined;
  const next: ThemeFx = {};  if (fx.pattern) {
    const { kind } = fx.pattern;
    if (!(kind in SCALE_BOUNDS)) throw new Error(`theme fx: unknown pattern kind ${String(kind)}`);
    if (fx.pattern.color && !isHexColor(fx.pattern.color)) {
      throw new Error(`theme fx: invalid pattern color ${fx.pattern.color}`);
    }
    const bounds = SCALE_BOUNDS[kind];
    next.pattern = {
      kind,
      scale: clamp(finiteOr(fx.pattern.scale, bounds.fallback), bounds.min, bounds.max),
      opacity: clamp(finiteOr(fx.pattern.opacity, DEFAULT_OPACITY[kind]), 0, 0.4),
      color: fx.pattern.color,
      weight: clamp(finiteOr(fx.pattern.weight, 1), 0.5, 3),
    };
  }
  if (fx.bloom) {
    const specs = Array.isArray(fx.bloom) ? fx.bloom : [fx.bloom];
    const normalized = specs.map((spec) => normalizeBloom(spec));
    next.bloom = Array.isArray(fx.bloom) ? normalized : normalized[0];
  }
  if (fx.focus) {
    if (fx.focus.color && !isHexColor(fx.focus.color)) {
      throw new Error(`theme fx: invalid focus color ${fx.focus.color}`);
    }
    next.focus = {
      color: fx.focus.color,
      textureOpacity: clamp(finiteOr(fx.focus.textureOpacity, 0.08), 0, 0.2),
    };
  }
  if (fx.selectedHover) {
    if (fx.selectedHover.color && !isHexColor(fx.selectedHover.color)) {
      throw new Error(`theme fx: invalid selectedHover color ${fx.selectedHover.color}`);
    }
    const pitch = clamp(finiteOr(fx.selectedHover.scale, 4), 2, 12);
    next.selectedHover = {
      color: fx.selectedHover.color,
      opacity: clamp(finiteOr(fx.selectedHover.opacity, 0.35), 0, 1),
      scale: pitch,
      weight: clamp(finiteOr(fx.selectedHover.weight, 2), 1, pitch),
    };
  }
  if (fx.hover) {
    if (fx.hover.color && !isHexColor(fx.hover.color)) {
      throw new Error(`theme fx: invalid hover color ${fx.hover.color}`);
    }
    const pitch = clamp(finiteOr(fx.hover.scale, 4), 2, 12);
    next.hover = {
      color: fx.hover.color,
      opacity: clamp(finiteOr(fx.hover.opacity, 0.55), 0, 1),
      scale: pitch,
      weight: clamp(finiteOr(fx.hover.weight, 2), 1, pitch),
    };
  }
  if (fx.highlight) {
    if (fx.highlight.color && !isHexColor(fx.highlight.color)) {
      throw new Error(`theme fx: invalid highlight color ${fx.highlight.color}`);
    }
    const pitch = clamp(finiteOr(fx.highlight.scale, 4), 2, 12);
    next.highlight = {
      color: fx.highlight.color,
      opacity: clamp(finiteOr(fx.highlight.opacity, 0.6), 0, 1),
      scale: pitch,
      weight: clamp(finiteOr(fx.highlight.weight, 2), 1, pitch),
    };
  }
  if (fx.fountain) {
    if (fx.fountain.color && !isHexColor(fx.fountain.color)) {
      throw new Error(`theme fx: invalid fountain color ${fx.fountain.color}`);
    }
    if (fx.fountain.selectedColor && !isHexColor(fx.fountain.selectedColor)) {
      throw new Error(`theme fx: invalid fountain selectedColor ${fx.fountain.selectedColor}`);
    }
    if (fx.fountain.flow && fx.fountain.flow !== "none" && fx.fountain.flow !== "breathe") {
      throw new Error(`theme fx: unknown fountain flow ${String(fx.fountain.flow)}`);
    }
    const pitch = clamp(finiteOr(fx.fountain.scale, 4), 2, 12);
    next.fountain = {
      color: fx.fountain.color,
      selectedColor: fx.fountain.selectedColor,
      opacity: clamp(finiteOr(fx.fountain.opacity, 0.5), 0, 1),
      scale: pitch,
      weight: clamp(finiteOr(fx.fountain.weight, 2), 1, pitch),
      reach: clamp(finiteOr(fx.fountain.reach, 130), 40, 400),
      height: clamp(finiteOr(fx.fountain.height, 70), 20, 200),
      flow: fx.fountain.flow ?? "none",
      flowDuration: clamp(finiteOr(fx.fountain.flowDuration, 1.6), 0.5, 8),
      texture: fx.fountain.texture !== false,
    };
  }
  if (fx.chrome !== undefined) {
    if (fx.chrome !== "accent" && fx.chrome !== "neutral") {
      throw new Error(`theme fx: unknown chrome tint ${String(fx.chrome)}`);
    }
    next.chrome = fx.chrome;
  }
  if (fx.sidebarRows !== undefined) {
    if (fx.sidebarRows !== "tint" && fx.sidebarRows !== "flat") {
      throw new Error(`theme fx: unknown sidebarRows ${String(fx.sidebarRows)}`);
    }
    next.sidebarRows = fx.sidebarRows;
  }
  if (fx.glow !== undefined) next.glow = clamp(finiteOr(fx.glow, 0), 0, 64);
  if (fx.blur !== undefined) next.blur = clamp(finiteOr(fx.blur, 0), 0, 40);
  return next;
}

/** Variables to apply for a theme. Pattern keys are always present so switching
 *  back to a plain theme resets them; effect keys only appear when authored. */
export function renderThemeFx(
  fx: ThemeFx | undefined,
  accent: string,
): { vars: Record<string, string>; pattern: boolean; blur: boolean; flatRows: boolean; flow: boolean } {
  const layer = patternLayer(fx?.pattern, accent);
  const bloomSpecs = fx?.bloom ? (Array.isArray(fx.bloom) ? fx.bloom : [fx.bloom]) : [];
  const blooms = bloomSpecs.map((spec) => bloomLayer(spec, accent));
  // Every layer needs its own size/repeat entry: CSS repeats a shorter list from
  // the start, which would give the last wash a tile size instead of "auto".
  const images = [...(layer?.images ?? []), ...blooms];
  const sizes = [...(layer?.sizes ?? []), ...blooms.map(() => "auto")];
  const repeats = [...(layer?.repeats ?? []), ...blooms.map(() => "no-repeat")];
  const highlight = fx?.highlight ? highlightTile(fx.highlight, accent) : null;
  const hover = fx?.hover ? highlightTile(fx.hover, accent) : null;
  const selectedHover = fx?.selectedHover ? highlightTile(fx.selectedHover, accent) : null;
  const fountainColor = fx?.fountain?.color ?? accent;
  const fountainSelectedColor = fx?.fountain?.selectedColor ?? fountainColor;
  const fountainTextured = fx?.fountain?.texture !== false;
  const fountainTile = fx?.fountain && fountainTextured
    ? { scale: fx.fountain.scale, weight: fx.fountain.weight }
    : null;
  const fountain = fx?.fountain
    ? fountainTile
      ? highlightTile({ ...fountainTile, color: fountainColor }, accent)
      : { image: fountainGlow(fountainColor), size: "100% 100%" }
    : null;
  const fountainSelected = fx?.fountain
    ? fountainTile
      ? highlightTile({ ...fountainTile, color: fountainSelectedColor }, accent)
      : { image: fountainGlow(fountainSelectedColor), size: "100% 100%" }
    : null;
  const vars: Record<string, string> = {
    "--fx-image": images.join(", ") || "none",
    "--fx-size": sizes.join(", ") || "auto",
    "--fx-repeat": repeats.join(", ") || "repeat",
    "--fx-highlight": highlight?.image ?? "none",
    "--fx-highlight-size": highlight?.size ?? "4px 4px",
    "--fx-highlight-opacity": fx?.highlight
      ? String(clamp(finiteOr(fx.highlight.opacity, 0.6), 0, 1))
      : "0",
    "--fx-hover-image": hover?.image ?? "none",
    "--fx-hover-size": hover?.size ?? "4px 4px",
    "--fx-hover-opacity": fx?.hover
      ? String(clamp(finiteOr(fx.hover.opacity, 0.55), 0, 1))
      : "0",
    "--fx-hover-border": fx?.hover?.color ?? "transparent",
    "--fx-selected-hover-image": selectedHover?.image ?? "none",
    "--fx-selected-hover-size": selectedHover?.size ?? "4px 4px",
    "--fx-selected-hover-opacity": fx?.selectedHover
      ? String(clamp(finiteOr(fx.selectedHover.opacity, 0.35), 0, 1))
      : "0",
    "--fx-selected-hover-border": fx?.selectedHover?.color ?? "transparent",
    "--focus-border-color": fx?.focus?.color ?? "transparent",
    "--focus-texture-opacity": fx?.focus
      ? String(clamp(finiteOr(fx.focus.textureOpacity, 0.08), 0, 0.2))
      : "0",
    "--fx-fountain": fountain?.image ?? "none",
    "--fx-fountain-size": fountain?.size ?? "4px 4px",
    "--fx-fountain-opacity": fx?.fountain
      ? String(clamp(finiteOr(fx.fountain.opacity, 0.5), 0, 1))
      : "0",
    "--fx-fountain-mask": fx?.fountain ? fountainMask(fx.fountain) : "none",
    "--fx-fountain-rgb": rgbTriplet(fountainColor),
    "--fx-fountain-selected": fountainSelected?.image ?? "none",
    "--fx-fountain-selected-rgb": rgbTriplet(fountainSelectedColor),
    "--fx-fountain-flow": `${clamp(finiteOr(fx?.fountain?.flowDuration, 1.6), 0.5, 8)}s`,
  };
  // Neutral chrome uses the theme's muted text tone rather than near-white, so
  // the existing 2–12% tint ladder keeps its contrast against the surface.
  if (fx?.chrome === "neutral") vars["--chrome-tint"] = "rgb(var(--c-muted))";
  if (fx?.glow !== undefined) vars["--fx-glow"] = `${fx.glow}px`;
  if (fx?.blur !== undefined) vars["--fx-blur"] = `${fx.blur}px`;
  return {
    vars,
    pattern: Boolean(images.length),
    blur: Boolean(fx?.blur),
    flatRows: fx?.sidebarRows === "flat",
    flow: fx?.fountain?.flow === "breathe",
  };
}
