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
