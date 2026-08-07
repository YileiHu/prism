import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { themes, type ThemeColors } from "./themes";

const ThemeContext = createContext<{
  theme: ThemeColors;
  setTheme: (id: string) => void;
  themeId: string;
}>({
  theme: themes[0],
  setTheme: () => {},
  themeId: "violet",
});

const THEME_STORAGE_KEY = "prism_theme";

function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgbTriplet(hex)}, ${alpha})`;
}

function applyTheme(id: string): void {
  const t = themes.find((th) => th.id === id) || themes[0];
  const root = document.documentElement;
  root.style.setProperty("--accent", t.primary);
  root.style.setProperty("--accent-hover", t.primaryHover);
  root.style.setProperty("--accent-muted", t.primaryMuted);
  root.style.setProperty("--accent-text", t.primaryText);
  root.style.setProperty("--accent-border", t.primaryBorder);
  root.style.setProperty("--accent-rgb", hexToRgbTriplet(t.primary));
  for (const [key, value] of Object.entries(t.surfaces)) {
    root.style.setProperty(`--c-${key}`, value);
  }
  root.style.setProperty("--glass-blur", t.glass?.blur ?? "10px");
  root.style.setProperty("--glass-saturate", t.glass?.saturate ?? "130%");
  root.style.setProperty("--glow", t.glow ?? hexToRgba(t.primary, 0.25));
  root.style.setProperty("--aurora", t.aurora ?? "rgb(var(--c-base))");
  root.dataset.theme = id;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState("violet");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && themes.some((t) => t.id === saved)) {
      applyTheme(saved);
      setThemeId(saved);
    } else {
      applyTheme("violet");
    }
  }, []);

  const setTheme = useCallback((id: string) => {
    applyTheme(id);
    setThemeId(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
  }, []);

  const theme = themes.find((t) => t.id === themeId) || themes[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
