export interface ThemeColors {
  id: string;
  name: string;
  nameEn: string;
  primary: string;
  primaryHover: string;
  primaryMuted: string;
  primaryText: string;
  primaryBorder: string;
}

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
  },
];
