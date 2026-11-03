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
  // Full body background (multi-layer radial gradients + base color).
  aurora: string;
}

export interface ThemeColors {
  id: string;
  name: string;
  nameEn: string;
  primary: string;
  dark: ThemeVariant;
  light: ThemeVariant;
}

// Dark counterparts: same idea as light — the accent's temperature is carried
// into the charcoal neutrals. Concrete surfaces (base/surface/…) vary per
// theme; tint stays white and overlay black for the alpha-wash math.
const darkSurfacesFor = (v: Omit<SurfacePalette, "tint" | "overlay">): SurfacePalette => ({
  tint: "255 255 255",
  overlay: "0 0 0",
  ...v,
});

const violetDarkSurfaces = darkSurfacesFor({
  base: "9 7 16",
  surface: "20 16 32",
  elevated: "33 28 48",
  hover: "51 44 68",
  primary: "230 227 238",
  secondary: "207 203 218",
  tertiary: "158 153 176",
  muted: "114 109 132",
  faint: "78 74 94",
  line: "34 29 47",
  strong: "54 48 70",
});

const oceanDarkSurfaces = darkSurfacesFor({
  base: "5 9 17",
  surface: "15 23 38",
  elevated: "27 38 56",
  hover: "50 64 84",
  primary: "227 233 242",
  secondary: "204 214 227",
  tertiary: "152 167 188",
  muted: "104 121 143",
  faint: "72 88 108",
  line: "27 38 55",
  strong: "50 65 84",
});

const emeraldDarkSurfaces = darkSurfacesFor({
  base: "5 11 8",
  surface: "15 26 20",
  elevated: "26 41 33",
  hover: "43 62 51",
  primary: "226 235 229",
  secondary: "202 214 206",
  tertiary: "155 171 161",
  muted: "110 127 117",
  faint: "74 90 80",
  line: "27 42 34",
  strong: "45 64 53",
});

const sunsetDarkSurfaces = darkSurfacesFor({
  base: "12 8 5",
  surface: "26 19 13",
  elevated: "42 33 25",
  hover: "66 55 44",
  primary: "235 230 225",
  secondary: "214 206 198",
  tertiary: "168 158 148",
  muted: "124 114 103",
  faint: "88 78 68",
  line: "43 35 27",
  strong: "66 55 44",
});

const roseDarkSurfaces = darkSurfacesFor({
  base: "14 7 9",
  surface: "28 16 19",
  elevated: "44 29 33",
  hover: "68 49 54",
  primary: "238 227 230",
  secondary: "214 199 203",
  tertiary: "170 154 159",
  muted: "126 110 115",
  faint: "90 75 80",
  line: "45 31 35",
  strong: "68 51 56",
});

const amberDarkSurfaces = darkSurfacesFor({
  base: "12 10 5",
  surface: "27 23 13",
  elevated: "43 37 24",
  hover: "66 58 42",
  primary: "236 232 222",
  secondary: "214 208 194",
  tertiary: "168 160 143",
  muted: "124 117 100",
  faint: "88 82 68",
  line: "44 38 25",
  strong: "67 59 44",
});

// Neutral gray — no blue cast (Slate theme)
const neutralDarkSurfaces = darkSurfacesFor({
  base: "8 8 9",
  surface: "24 24 26",
  elevated: "38 38 41",
  hover: "58 58 62",
  primary: "232 232 234",
  secondary: "210 210 213",
  tertiary: "162 162 167",
  muted: "118 118 124",
  faint: "83 83 88",
  line: "39 39 43",
  strong: "59 59 64",
});

// Light counterparts are per-theme: the accent's temperature is carried into
// the neutrals so warm themes sit on warm paper instead of a blue-tinted white.
// tint/overlay flip to a dark triplet so the same alpha-wash math darkens.
const lightSurfacesFor = (v: Omit<SurfacePalette, "surface" | "elevated" | "overlay">): SurfacePalette => ({
  surface: "255 255 255",
  elevated: "255 255 255",
  overlay: v.tint,
  ...v,
});

// Neutral gray (Slate theme and generic fallback)
export const lightSurfaces: SurfacePalette = lightSurfacesFor({
  base: "246 246 247",
  hover: "240 240 241",
  tint: "24 24 27",
  primary: "27 27 30",
  secondary: "65 65 70",
  tertiary: "94 94 100",
  muted: "122 122 128",
  faint: "170 170 176",
  line: "231 231 234",
  strong: "211 211 216",
});

const violetLightSurfaces = lightSurfacesFor({
  base: "246 245 251",
  hover: "240 238 249",
  tint: "26 22 38",
  primary: "29 27 46",
  secondary: "66 63 91",
  tertiary: "93 89 120",
  muted: "120 116 145",
  faint: "168 165 186",
  line: "232 229 242",
  strong: "212 207 228",
});

const oceanLightSurfaces = lightSurfacesFor({
  base: "240 246 252",
  hover: "233 241 250",
  tint: "18 30 43",
  primary: "20 35 50",
  secondary: "55 75 96",
  tertiary: "84 104 126",
  muted: "112 132 154",
  faint: "158 176 196",
  line: "224 234 244",
  strong: "202 217 233",
});

const emeraldLightSurfaces = lightSurfacesFor({
  base: "242 248 244",
  hover: "234 244 238",
  tint: "18 36 26",
  primary: "20 38 28",
  secondary: "50 78 62",
  tertiary: "80 108 91",
  muted: "110 134 119",
  faint: "156 180 164",
  line: "224 238 229",
  strong: "203 223 210",
});

const sunsetLightSurfaces = lightSurfacesFor({
  base: "250 246 241",
  hover: "245 238 230",
  tint: "48 30 16",
  primary: "45 32 22",
  secondary: "82 65 51",
  tertiary: "110 92 76",
  muted: "136 118 101",
  faint: "176 160 145",
  line: "236 226 215",
  strong: "217 203 188",
});

const roseLightSurfaces = lightSurfacesFor({
  base: "252 246 247",
  hover: "248 236 239",
  tint: "46 24 30",
  primary: "48 28 34",
  secondary: "84 60 67",
  tertiary: "110 85 92",
  muted: "138 113 121",
  faint: "178 156 163",
  line: "238 226 229",
  strong: "220 202 206",
});

const amberLightSurfaces = lightSurfacesFor({
  base: "251 248 240",
  hover: "246 240 226",
  tint: "46 36 14",
  primary: "45 36 18",
  secondary: "82 69 44",
  tertiary: "110 96 68",
  muted: "137 122 92",
  faint: "177 164 136",
  line: "237 230 214",
  strong: "219 208 185",
});

// Dark-navy palette for the Frutiger Aero theme
const aeroSurfaces: SurfacePalette = {
  base: "5 11 24", // #050b18 deep navy
  surface: "10 20 40", // #0a1428
  elevated: "18 32 58", // #12203a
  hover: "27 44 77", // #1b2c4d
  tint: "200 235 255", // icy white for toolbar washes
  overlay: "2 6 18", // navy backdrop
  primary: "230 240 255", // #e6f0ff
  secondary: "184 199 224", // #b8c7e0
  tertiary: "143 163 196", // #8fa3c4
  muted: "100 120 156", // #64789c
  faint: "71 88 122", // #47587a
  line: "26 40 68", // #1a2844
  strong: "51 72 110", // #33486e
};

const aeroLightSurfaces: SurfacePalette = {
  base: "238 246 252",
  surface: "255 255 255",
  elevated: "248 252 255",
  hover: "226 240 250",
  tint: "8 47 73",
  overlay: "8 30 45",
  primary: "12 32 48",
  secondary: "45 70 90",
  tertiary: "74 101 123",
  muted: "108 133 153",
  faint: "148 172 190",
  line: "206 226 240",
  strong: "176 204 224",
};

// Accent-tinted aurora tuned for light surfaces (lower alpha than dark, but
// strong enough that the background isn't washed out)
const lightAurora = (accent: string) =>
  `radial-gradient(85% 60% at 10% -10%, rgba(${accent}, 0.18), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(${accent}, 0.13), transparent 65%), radial-gradient(50% 40% at 68% 28%, rgba(${accent}, 0.07), transparent 70%), rgb(var(--c-base))`;

export const themes: ThemeColors[] = [
  {
    id: "violet",
    name: "紫罗兰",
    nameEn: "Violet",
    primary: "#8b5cf6",
    dark: {
      primaryHover: "#7c3aed",
      primaryMuted: "rgba(139, 92, 246, 0.15)",
      primaryText: "#c4b5fd",
      primaryBorder: "rgba(139, 92, 246, 0.3)",
      surfaces: violetDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 10% -10%, rgba(139, 92, 246, 0.16), transparent 60%), radial-gradient(65% 50% at 90% 110%, rgba(99, 102, 241, 0.13), transparent 65%), radial-gradient(50% 40% at 70% 25%, rgba(168, 85, 247, 0.08), transparent 70%), radial-gradient(40% 35% at 18% 90%, rgba(217, 70, 239, 0.05), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#7c3aed",
      primaryMuted: "rgba(139, 92, 246, 0.12)",
      primaryText: "#6d28d9",
      primaryBorder: "rgba(124, 58, 237, 0.35)",
      surfaces: violetLightSurfaces,
      aurora: lightAurora("139, 92, 246"),
    },
  },
  {
    id: "ocean",
    name: "海洋蓝",
    nameEn: "Ocean",
    primary: "#3b82f6",
    dark: {
      primaryHover: "#2563eb",
      primaryMuted: "rgba(59, 130, 246, 0.15)",
      primaryText: "#93c5fd",
      primaryBorder: "rgba(59, 130, 246, 0.3)",
      surfaces: oceanDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 12% -10%, rgba(59, 130, 246, 0.16), transparent 60%), radial-gradient(65% 50% at 88% 112%, rgba(6, 182, 212, 0.13), transparent 65%), radial-gradient(55% 45% at 68% 30%, rgba(14, 165, 233, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(99, 102, 241, 0.06), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#2563eb",
      primaryMuted: "rgba(59, 130, 246, 0.12)",
      primaryText: "#1d4ed8",
      primaryBorder: "rgba(37, 99, 235, 0.35)",
      surfaces: oceanLightSurfaces,
      aurora: lightAurora("59, 130, 246"),
    },
  },
  {
    id: "emerald",
    name: "翡翠绿",
    nameEn: "Emerald",
    primary: "#10b981",
    dark: {
      primaryHover: "#059669",
      primaryMuted: "rgba(16, 185, 129, 0.15)",
      primaryText: "#6ee7b7",
      primaryBorder: "rgba(16, 185, 129, 0.3)",
      surfaces: emeraldDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 10% -10%, rgba(16, 185, 129, 0.15), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(20, 184, 166, 0.12), transparent 65%), radial-gradient(55% 45% at 68% 28%, rgba(34, 197, 94, 0.07), transparent 70%), radial-gradient(40% 35% at 22% 88%, rgba(45, 212, 191, 0.05), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#059669",
      primaryMuted: "rgba(16, 185, 129, 0.12)",
      primaryText: "#047857",
      primaryBorder: "rgba(5, 150, 105, 0.35)",
      surfaces: emeraldLightSurfaces,
      aurora: lightAurora("16, 185, 129"),
    },
  },
  {
    id: "sunset",
    name: "日落橙",
    nameEn: "Sunset",
    primary: "#f97316",
    dark: {
      primaryHover: "#ea580c",
      primaryMuted: "rgba(249, 115, 22, 0.15)",
      primaryText: "#fdba74",
      primaryBorder: "rgba(249, 115, 22, 0.3)",
      surfaces: sunsetDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 12% -10%, rgba(249, 115, 22, 0.16), transparent 60%), radial-gradient(65% 50% at 88% 110%, rgba(239, 68, 68, 0.12), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(245, 158, 11, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 90%, rgba(251, 146, 60, 0.06), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#ea580c",
      primaryMuted: "rgba(249, 115, 22, 0.12)",
      primaryText: "#c2410c",
      primaryBorder: "rgba(234, 88, 12, 0.35)",
      surfaces: sunsetLightSurfaces,
      aurora: lightAurora("249, 115, 22"),
    },
  },
  {
    id: "rose",
    name: "玫瑰粉",
    nameEn: "Rose",
    primary: "#f43f5e",
    dark: {
      primaryHover: "#e11d48",
      primaryMuted: "rgba(244, 63, 94, 0.15)",
      primaryText: "#fda4af",
      primaryBorder: "rgba(244, 63, 94, 0.3)",
      surfaces: roseDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 10% -10%, rgba(244, 63, 94, 0.16), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(236, 72, 153, 0.13), transparent 65%), radial-gradient(50% 40% at 68% 28%, rgba(217, 70, 239, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(251, 113, 133, 0.06), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#e11d48",
      primaryMuted: "rgba(244, 63, 94, 0.12)",
      primaryText: "#be123c",
      primaryBorder: "rgba(225, 29, 72, 0.35)",
      surfaces: roseLightSurfaces,
      aurora: lightAurora("244, 63, 94"),
    },
  },
  {
    id: "amber",
    name: "琥珀金",
    nameEn: "Amber",
    primary: "#f59e0b",
    dark: {
      primaryHover: "#d97706",
      primaryMuted: "rgba(245, 158, 11, 0.15)",
      primaryText: "#fcd34d",
      primaryBorder: "rgba(245, 158, 11, 0.3)",
      surfaces: amberDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 12% -10%, rgba(245, 158, 11, 0.15), transparent 60%), radial-gradient(65% 50% at 88% 110%, rgba(234, 179, 8, 0.12), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(251, 146, 60, 0.08), transparent 70%), radial-gradient(40% 35% at 22% 90%, rgba(250, 204, 21, 0.05), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#d97706",
      primaryMuted: "rgba(245, 158, 11, 0.12)",
      primaryText: "#b45309",
      primaryBorder: "rgba(217, 119, 6, 0.35)",
      surfaces: amberLightSurfaces,
      aurora: lightAurora("245, 158, 11"),
    },
  },
  {
    id: "slate",
    name: "岩板灰",
    nameEn: "Slate",
    primary: "#64748b",
    dark: {
      primaryHover: "#475569",
      primaryMuted: "rgba(100, 116, 139, 0.15)",
      primaryText: "#94a3b8",
      primaryBorder: "rgba(100, 116, 139, 0.3)",
      surfaces: neutralDarkSurfaces,
      aurora: `radial-gradient(85% 60% at 10% -10%, rgba(100, 116, 139, 0.18), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(56, 189, 248, 0.10), transparent 65%), radial-gradient(55% 45% at 68% 28%, rgba(129, 140, 248, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(148, 163, 184, 0.06), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#475569",
      primaryMuted: "rgba(100, 116, 139, 0.12)",
      primaryText: "#475569",
      primaryBorder: "rgba(71, 85, 105, 0.35)",
      surfaces: lightSurfaces,
      aurora: lightAurora("100, 116, 139"),
    },
  },
  {
    id: "aero",
    name: "碧空",
    nameEn: "Aero",
    primary: "#22d3ee",
    dark: {
      primaryHover: "#06b6d4",
      primaryMuted: "rgba(34, 211, 238, 0.16)",
      primaryText: "#a5f3fc",
      primaryBorder: "rgba(34, 211, 238, 0.35)",
      surfaces: aeroSurfaces,
      aurora: `radial-gradient(85% 60% at 12% -10%, rgba(34, 211, 238, 0.18), transparent 60%), radial-gradient(65% 50% at 88% 112%, rgba(99, 102, 241, 0.16), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(56, 189, 248, 0.09), transparent 70%), radial-gradient(40% 35% at 22% 88%, rgba(45, 212, 191, 0.08), transparent 70%), rgb(var(--c-base))`,
    },
    light: {
      primaryHover: "#0891b2",
      primaryMuted: "rgba(34, 211, 238, 0.14)",
      primaryText: "#0e7490",
      primaryBorder: "rgba(8, 145, 178, 0.35)",
      surfaces: aeroLightSurfaces,
      aurora: lightAurora("8, 145, 178"),
    },
  },
];
