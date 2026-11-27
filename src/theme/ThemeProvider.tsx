import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  DEFAULT_THEME_ID,
  resolveAppearance,
  themes,
  type ColorModeName,
  type ResolvedAppearance,
  type ThemeDef,
} from "../shared/themes";
import { rgbTriplet } from "../shared/themeColor";
import { FX_VAR_KEYS, renderThemeFx } from "../shared/themeEffects";
import { DEFAULT_SETTINGS, decodeSetting, type ColorMode } from "../shared/settings";

const ThemeContext = createContext<{
  theme: ThemeDef;
  setTheme: (id: string) => void;
  themeId: string;
  mode: ColorMode;
  /** The mode that actually applies (a single-mode theme pins this). */
  resolvedMode: ColorModeName;
  /** True when the theme forced a mode because the requested one is unsupported. */
  pinned: boolean;
  setMode: (mode: ColorMode) => void;
}>({
  theme: themes.find((t) => t.id === DEFAULT_THEME_ID)!,
  setTheme: () => {},
  themeId: DEFAULT_THEME_ID,
  mode: "dark",
  resolvedMode: "dark",
  pinned: false,
  setMode: () => {},
});

const THEME_STORAGE_KEY = "prism_theme";
const MODE_STORAGE_KEY = "prism_mode";
// First-paint mirror: index.html reads this snapshot before React mounts so a
// dark-only theme never flashes the system's light palette.
const APPEARANCE_STORAGE_KEY = "prism_appearance";

function readStoredTheme(): string {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved && themes.some((t) => t.id === saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function readStoredMode(): ColorMode {
  try {
    return decodeSetting("color_mode", localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS.color_mode;
  }
}

function applyAppearance(appearance: ResolvedAppearance): void {
  const { theme, variant, mode } = appearance;
  const root = document.documentElement;
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-hover", variant.primaryHover);
  root.style.setProperty("--accent-muted", variant.primaryMuted);
  root.style.setProperty("--accent-text", variant.primaryText);
  root.style.setProperty("--primary-button-text", theme.primaryButtonText ?? variant.primaryText);
  root.style.setProperty("--primary-button-hover-text", theme.primaryButtonHoverText ?? theme.primaryButtonText ?? variant.primaryText);
  root.style.setProperty("--accent-border", variant.primaryBorder);
  root.style.setProperty("--accent-rgb", rgbTriplet(theme.accent));
  // Second accent: available to decorative highlights; falls back to the main
  // accent so a consumer never has to branch on the theme.
  const accent2 = theme.accent2 ?? theme.accent;
  root.style.setProperty("--accent-2", accent2);
  root.style.setProperty("--accent-2-rgb", rgbTriplet(accent2));
  // Emphasis colour: selected-row glow + data-viz reference lines. Exposed for any shared
  // control that needs "selected, but not the accent" semantics.
  root.style.setProperty("--emphasis", theme.emphasis);
  root.style.setProperty("--emphasis-rgb", rgbTriplet(theme.emphasis));
  for (const [key, value] of Object.entries(variant.surfaces)) {
    root.style.setProperty(`--c-${key}`, value);
  }
  for (const [key, value] of Object.entries(variant.chrome)) {
    root.style.setProperty(`--c-chrome-${key}`, value);
  }
  // Corner-shape tokens (Tailwind rounded-chip/control/card/pill). Always
  // written so switching back to a rounded theme restores the defaults.
  root.style.setProperty("--radius-chip", `${theme.radius.chip}px`);
  root.style.setProperty("--radius-control", `${theme.radius.control}px`);
  root.style.setProperty("--radius-card", `${theme.radius.card}px`);
  root.style.setProperty("--radius-pill", `${theme.radius.pill}px`);
  root.style.setProperty("--radius-segment", `${theme.radius.segment}px`);
  // ChipTabs selection glow: a theme with a highlight texture uses it,
  // otherwise a soft radial wash of the accent. Always rewritten so switching
  // themes never leaves the previous glow behind.
  const glowTexture = Boolean(theme.fx?.highlight);
  root.style.setProperty(
    "--chip-glow-image",
    glowTexture
      ? "var(--fx-highlight)"
      : "radial-gradient(ellipse at 50% 52%, rgb(var(--accent-rgb) / 0.8) 0%, rgb(var(--accent-rgb) / 0.35) 55%, transparent 78%)",
  );
  root.style.setProperty("--chip-glow-size", glowTexture ? "var(--fx-highlight-size)" : "100% 100%");
  root.style.setProperty(
    "--chip-glow-opacity",
    glowTexture ? "var(--fx-highlight-opacity)" : "0.6",
  );
  root.style.setProperty("--chip-glow-blur", glowTexture ? "0px" : "3px");

  // Decoration layer: always clear first so switching back to a flat theme
  // removes every pattern/glow/blur the previous one left inline.
  for (const key of FX_VAR_KEYS) root.style.removeProperty(key);
  const fx = renderThemeFx(theme.fx, theme.accent);
  for (const [key, value] of Object.entries(fx.vars)) root.style.setProperty(key, value);
  if (fx.pattern) root.dataset.fx = "pattern";
  else delete root.dataset.fx;
  if (fx.blur) root.dataset.fxBlur = "on";
  else delete root.dataset.fxBlur;
  if (fx.flatRows) root.dataset.flatRows = "true";
  else delete root.dataset.flatRows;
  if (fx.flow) root.dataset.fxFlow = "breathe";
  else delete root.dataset.fxFlow;
  if (theme.fx?.hover) root.dataset.themeHover = "on";
  else delete root.dataset.themeHover;
  if (theme.fx?.focus) root.dataset.focusFx = "on";
  else delete root.dataset.focusFx;
  root.dataset.theme = theme.id;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(readStoredTheme);
  const [mode, setModeState] = useState<ColorMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );

  const appearance = useMemo(
    () => resolveAppearance(themeId, mode, systemDark),
    [themeId, mode, systemDark],
  );
  const resolvedMode = appearance.mode;
  const pinned = appearance.pinned;

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The DB is the durable home for both keys (main reads them before creating
  // the window); localStorage is only a first-paint mirror.
  useEffect(() => {
    void window.prism.getSetting("theme").then((raw) => {
      if (raw === null) {
        // First run after the upgrade — seed the DB from the first-paint mirror
        void window.prism.setSetting("theme", readStoredTheme());
        return;
      }
      const stored = decodeSetting("theme", raw);
      setThemeIdState((current) => (current === stored ? current : stored));
    });
  }, []);

  useEffect(() => {
    void window.prism.getSetting("color_mode").then((raw) => {
      if (raw === null) {
        void window.prism.setSetting("color_mode", readStoredMode());
        return;
      }
      const stored = decodeSetting("color_mode", raw);
      setModeState((current) => (current === stored ? current : stored));
    });
  }, []);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
      localStorage.setItem(MODE_STORAGE_KEY, mode);
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        // `base` is the CSS triplet form so index.html can set --c-base before paint.
        JSON.stringify({
          themeId,
          mode,
          resolvedMode,
          base: appearance.variant.surfaces.base,
        }),
      );
    } catch { /* ignore */ }
  }, [themeId, mode, resolvedMode, appearance]);

  const setTheme = useCallback((id: string) => {
    if (!themes.some((t) => t.id === id)) return;
    setThemeIdState(id);
    void window.prism.setSetting("theme", id);
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    void window.prism.setSetting("color_mode", next);
  }, []);

  const theme = appearance.theme;
  const value = useMemo(
    () => ({ theme, setTheme, themeId, mode, resolvedMode, pinned, setMode }),
    [theme, setTheme, themeId, mode, resolvedMode, pinned, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
