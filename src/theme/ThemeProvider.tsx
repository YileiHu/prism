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

  const applyTheme = (id: string) => {
    const t = themes.find((th) => th.id === id) || themes[0];
    const root = document.documentElement;
    root.style.setProperty("--accent", t.primary);
    root.style.setProperty("--accent-hover", t.primaryHover);
    root.style.setProperty("--accent-muted", t.primaryMuted);
    root.style.setProperty("--accent-text", t.primaryText);
    root.style.setProperty("--accent-border", t.primaryBorder);
  };

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
