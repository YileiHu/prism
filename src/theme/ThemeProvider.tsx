import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { themes, type ThemeColors } from "./themes";
import { DEFAULT_SETTINGS, decodeSetting, type ColorMode } from "../shared/settings";

type ResolvedMode = "dark" | "light";

const ThemeContext = createContext<{
  theme: ThemeColors;
  setTheme: (id: string) => void;
  themeId: string;
  mode: ColorMode;
  resolvedMode: ResolvedMode;
  setMode: (mode: ColorMode) => void;
}>({
  theme: themes[0],
  setTheme: () => {},
  themeId: "violet",
  mode: "dark",
  resolvedMode: "dark",
  setMode: () => {},
});

const THEME_STORAGE_KEY = "prism_theme";
const MODE_STORAGE_KEY = "prism_mode";

function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function hexToRgba(hex: string, alpha: number): string {
  return `rgba(${hexToRgbTriplet(hex)}, ${alpha})`;
}

function readStoredMode(): ColorMode {
  try {
    return decodeSetting("color_mode", localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS.color_mode;
  }
}

function applyTheme(id: string, mode: ResolvedMode): void {
  const theme = themes.find((th) => th.id === id) || themes[0];
  const variant = theme[mode];
  const root = document.documentElement;
  root.style.setProperty("--accent", theme.primary);
  root.style.setProperty("--accent-hover", variant.primaryHover);
  root.style.setProperty("--accent-muted", variant.primaryMuted);
  root.style.setProperty("--accent-text", variant.primaryText);
  root.style.setProperty("--accent-border", variant.primaryBorder);
  root.style.setProperty("--accent-rgb", hexToRgbTriplet(theme.primary));
  for (const [key, value] of Object.entries(variant.surfaces)) {
    root.style.setProperty(`--c-${key}`, value);
  }
  root.style.setProperty("--glass-blur", "10px");
  root.style.setProperty("--glass-saturate", "130%");
  root.style.setProperty("--glow", hexToRgba(theme.primary, mode === "dark" ? 0.25 : 0.16));
  root.style.setProperty("--aurora", variant.aurora);
  root.dataset.theme = id;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved && themes.some((t) => t.id === saved) ? saved : "violet";
    } catch {
      return "violet";
    }
  });
  const [mode, setModeState] = useState<ColorMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );

  const resolvedMode: ResolvedMode = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The DB is the durable home for color_mode (main process reads it before
  // creating the window); localStorage is only a first-paint mirror.
  useEffect(() => {
    void window.prism.getSetting("color_mode").then((raw) => {
      if (raw === null) {
        // First run after the upgrade — seed the DB from the first-paint mirror
        void window.prism.setSetting("color_mode", readStoredMode());
        return;
      }
      const stored = decodeSetting("color_mode", raw);
      setModeState((current) => (current === stored ? current : stored));
    });
  }, []);

  useEffect(() => {
    applyTheme(themeId, resolvedMode);
  }, [themeId, resolvedMode]);

  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, themeId); } catch { /* ignore */ }
  }, [themeId]);

  useEffect(() => {
    try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    void window.prism.setColorMode(mode);
  }, [mode]);

  const setTheme = useCallback((id: string) => {
    setThemeId(id);
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    void window.prism.setSetting("color_mode", next);
  }, []);

  const theme = themes.find((t) => t.id === themeId) || themes[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeId, mode, resolvedMode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
