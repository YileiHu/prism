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

export interface ThemeColors {
  id: string;
  name: string;
  nameEn: string;
  primary: string;
  primaryHover: string;
  primaryMuted: string;
  primaryText: string;
  primaryBorder: string;
  scheme: "dark";
  surfaces: SurfacePalette;
  glass?: { blur: string; saturate: string };
  glow?: string;
  // Full body background (multi-layer radial gradients + base color).
  // When omitted, ThemeProvider auto-generates one from the accent color.
  aurora?: string;
}

// Exact replica of the previous hardcoded Tailwind gray scale —
// the 7 original themes render pixel-identical with these.
export const darkSurfaces: SurfacePalette = {
  base: "3 7 18", // gray-950
  surface: "17 24 39", // gray-900
  elevated: "31 41 55", // gray-800
  hover: "55 65 81", // gray-700
  tint: "255 255 255",
  overlay: "0 0 0",
  primary: "229 231 235", // gray-200
  secondary: "209 213 219", // gray-300
  tertiary: "156 163 175", // gray-400
  muted: "107 114 128", // gray-500
  faint: "75 85 99", // gray-600
  line: "31 41 55", // gray-800 borders
  strong: "55 65 81", // gray-700 borders
};

// Dark-navy glass palette for the Frutiger Aero theme
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

export const themes: ThemeColors[] = [
  {
    id: "violet",
    name: "紫罗兰",
    nameEn: "Violet",
    primary: "#8b5cf6",
    primaryHover: "#7c3aed",
    primaryMuted: "rgba(139, 92, 246, 0.15)",
    primaryText: "#c4b5fd",
    primaryBorder: "rgba(139, 92, 246, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 10% -10%, rgba(139, 92, 246, 0.16), transparent 60%), radial-gradient(65% 50% at 90% 110%, rgba(99, 102, 241, 0.13), transparent 65%), radial-gradient(50% 40% at 70% 25%, rgba(168, 85, 247, 0.08), transparent 70%), radial-gradient(40% 35% at 18% 90%, rgba(217, 70, 239, 0.05), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "ocean",
    name: "海洋蓝",
    nameEn: "Ocean",
    primary: "#3b82f6",
    primaryHover: "#2563eb",
    primaryMuted: "rgba(59, 130, 246, 0.15)",
    primaryText: "#93c5fd",
    primaryBorder: "rgba(59, 130, 246, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 12% -10%, rgba(59, 130, 246, 0.16), transparent 60%), radial-gradient(65% 50% at 88% 112%, rgba(6, 182, 212, 0.13), transparent 65%), radial-gradient(55% 45% at 68% 30%, rgba(14, 165, 233, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(99, 102, 241, 0.06), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "emerald",
    name: "翡翠绿",
    nameEn: "Emerald",
    primary: "#10b981",
    primaryHover: "#059669",
    primaryMuted: "rgba(16, 185, 129, 0.15)",
    primaryText: "#6ee7b7",
    primaryBorder: "rgba(16, 185, 129, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 10% -10%, rgba(16, 185, 129, 0.15), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(20, 184, 166, 0.12), transparent 65%), radial-gradient(55% 45% at 68% 28%, rgba(34, 197, 94, 0.07), transparent 70%), radial-gradient(40% 35% at 22% 88%, rgba(45, 212, 191, 0.05), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "sunset",
    name: "日落橙",
    nameEn: "Sunset",
    primary: "#f97316",
    primaryHover: "#ea580c",
    primaryMuted: "rgba(249, 115, 22, 0.15)",
    primaryText: "#fdba74",
    primaryBorder: "rgba(249, 115, 22, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 12% -10%, rgba(249, 115, 22, 0.16), transparent 60%), radial-gradient(65% 50% at 88% 110%, rgba(239, 68, 68, 0.12), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(245, 158, 11, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 90%, rgba(251, 146, 60, 0.06), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "rose",
    name: "玫瑰粉",
    nameEn: "Rose",
    primary: "#f43f5e",
    primaryHover: "#e11d48",
    primaryMuted: "rgba(244, 63, 94, 0.15)",
    primaryText: "#fda4af",
    primaryBorder: "rgba(244, 63, 94, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 10% -10%, rgba(244, 63, 94, 0.16), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(236, 72, 153, 0.13), transparent 65%), radial-gradient(50% 40% at 68% 28%, rgba(217, 70, 239, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(251, 113, 133, 0.06), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "amber",
    name: "琥珀金",
    nameEn: "Amber",
    primary: "#f59e0b",
    primaryHover: "#d97706",
    primaryMuted: "rgba(245, 158, 11, 0.15)",
    primaryText: "#fcd34d",
    primaryBorder: "rgba(245, 158, 11, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 12% -10%, rgba(245, 158, 11, 0.15), transparent 60%), radial-gradient(65% 50% at 88% 110%, rgba(234, 179, 8, 0.12), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(251, 146, 60, 0.08), transparent 70%), radial-gradient(40% 35% at 22% 90%, rgba(250, 204, 21, 0.05), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "slate",
    name: "岩板灰",
    nameEn: "Slate",
    primary: "#64748b",
    primaryHover: "#475569",
    primaryMuted: "rgba(100, 116, 139, 0.15)",
    primaryText: "#94a3b8",
    primaryBorder: "rgba(100, 116, 139, 0.3)",
    scheme: "dark",
    surfaces: darkSurfaces,
    aurora: `radial-gradient(85% 60% at 10% -10%, rgba(100, 116, 139, 0.18), transparent 60%), radial-gradient(65% 50% at 90% 112%, rgba(56, 189, 248, 0.10), transparent 65%), radial-gradient(55% 45% at 68% 28%, rgba(129, 140, 248, 0.08), transparent 70%), radial-gradient(40% 35% at 20% 88%, rgba(148, 163, 184, 0.06), transparent 70%), rgb(var(--c-base))`,
  },
  {
    id: "aero",
    name: "碧空",
    nameEn: "Aero",
    primary: "#22d3ee",
    primaryHover: "#06b6d4",
    primaryMuted: "rgba(34, 211, 238, 0.16)",
    primaryText: "#a5f3fc",
    primaryBorder: "rgba(34, 211, 238, 0.35)",
    scheme: "dark",
    surfaces: aeroSurfaces,
    glass: { blur: "18px", saturate: "150%" },
    glow: "rgba(34, 211, 238, 0.45)",
    aurora: `radial-gradient(85% 60% at 12% -10%, rgba(34, 211, 238, 0.18), transparent 60%), radial-gradient(65% 50% at 88% 112%, rgba(99, 102, 241, 0.16), transparent 65%), radial-gradient(55% 45% at 70% 30%, rgba(56, 189, 248, 0.09), transparent 70%), radial-gradient(40% 35% at 22% 88%, rgba(45, 212, 191, 0.08), transparent 70%), rgb(var(--c-base))`,
  },
];
