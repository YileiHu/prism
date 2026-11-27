// Small, dependency-free color math shared by the theme authoring factory and
// the main process (which needs the same base color for the native window).
//
// Everything here works in OKLCH: unlike HSL, a fixed lightness step keeps
// perceived brightness steady, so one ramp table can drive any accent hue
// without a neutral palette collapsing into muddy gray.

export interface Oklch {
  /** 0..1 perceived lightness */
  l: number;
  /** 0..~0.37 chroma (0 = neutral) */
  c: number;
  /** hue angle in degrees, 0..360 */
  h: number;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/** "#rrggbb" → [r, g, b] in 0..255. Throws on malformed input: theme data is
 *  static, so a typo should fail loudly instead of shipping a wrong color. */
export function parseHex(hex: string): [number, number, number] {
  const match = HEX_RE.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#rrggbb" → "r g b" (the triplet form our CSS variables use). */
export function rgbTriplet(hex: string): string {
  return parseHex(hex).join(" ");
}

/** "#rrggbb" → "rgba(r, g, b, alpha)". */
export function rgbaFromHex(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const toLinear = (channel: number): number => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
  const v = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, v)) * 255;
};

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lc = Math.cbrt(l);
  const mc = Math.cbrt(m);
  const sc = Math.cbrt(s);
  const okL = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  const okA = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  const okB = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
  const hue = (Math.atan2(okB, okA) * 180) / Math.PI;
  return {
    l: okL,
    c: Math.hypot(okA, okB),
    h: (hue + 360) % 360,
  };
}

function oklchToRgbRaw(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const lc = l + 0.3963377774 * a + 0.2158037573 * b;
  const mc = l - 0.1055613458 * a - 0.0638541728 * b;
  const sc = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lc ** 3;
  const m3 = mc ** 3;
  const s3 = sc ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

const inGamut = (l: number, c: number, h: number): boolean =>
  oklchToRgbRaw(l, c, h).every((v) => v >= -0.0005 && v <= 1.0005);

const toHex = (l: number, c: number, h: number): string => {
  const [r, g, b] = oklchToRgbRaw(l, c, h);
  const hex = [r, g, b]
    .map((v) => Math.round(fromLinear(v)).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
};

/** OKLCH → "#rrggbb", reducing chroma until the color fits sRGB. */
export function oklchToHex(l: number, c: number, h: number): string {
  const lightness = Math.max(0, Math.min(1, l));
  if (inGamut(lightness, c, h)) return toHex(lightness, c, h);
  let low = 0;
  let high = c;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(lightness, mid, h)) low = mid;
    else high = mid;
  }
  return toHex(lightness, low, h);
}

/** Move a color along the lightness axis, keeping hue. */
export function shiftLightness(hex: string, delta: number, chromaScale = 1): string {
  const { l, c, h } = hexToOklch(hex);
  return oklchToHex(l + delta, c * chromaScale, h);
}

/** WCAG 2.x contrast ratio (1..21). */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const [r, g, bl] = parseHex(hex).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
