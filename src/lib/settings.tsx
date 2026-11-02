import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  decodeSetting,
  normalizeSetting,
  serializeSetting,
  type AppSettings,
  type SettingKey,
} from "../shared/settings";

interface SettingsContextValue {
  values: AppSettings;
  ready: boolean;
  get: <K extends SettingKey>(key: K) => AppSettings[K];
  set: <K extends SettingKey>(key: K, value: AppSettings[K]) => void;
  reset: () => Promise<void>;
}

// Note heading/bold colors are exposed as --md-{hN,bold}-{dark,light}; the
// stylesheet aliases the active one to --md-hN / --md-bold by data-mode.
const MD_COLOR_KEYS = [
  "md_h1_dark", "md_h2_dark", "md_h3_dark", "md_h4_dark", "md_h5_dark", "md_h6_dark", "md_bold_dark",
  "md_h1_light", "md_h2_light", "md_h3_light", "md_h4_light", "md_h5_light", "md_h6_light", "md_bold_light",
] as const;

const SettingsContext = createContext<SettingsContextValue>({
  values: DEFAULT_SETTINGS,
  ready: false,
  get: (key) => DEFAULT_SETTINGS[key],
  set: () => {},
  reset: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  // Stable accessor for callbacks that must not be re-created when any
  // setting changes (editor lifecycle, autosave scheduling, …)
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getAllSettings()
      .then((raw) => {
        if (cancelled) return;
        setValues((prev) => {
          const next = { ...prev };
          for (const key of SETTING_KEYS) {
            next[key] = decodeSetting(key, raw[key] ?? null) as never;
          }
          return next;
        });
      })
      .catch(() => { /* fall back to defaults */ })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  const set = useCallback(<K extends SettingKey>(key: K, value: AppSettings[K]) => {
    const next = normalizeSetting(key, value);
    setValues((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
    void window.prism
      .setSetting(key, serializeSetting(key, next))
      .then(() => window.dispatchEvent(new Event("settings-saved")))
      .catch(() => { /* keep the in-memory value; it retries on the next edit */ });
  }, []);

  const reset = useCallback(async () => {
    setValues(DEFAULT_SETTINGS);
    await Promise.all(SETTING_KEYS.map((key) => window.prism.setSetting(key, serializeSetting(key, DEFAULT_SETTINGS[key]))));
  }, []);

  const get = useCallback(<K extends SettingKey>(key: K) => valuesRef.current[key], []);

  // Typography lives in CSS variables so every mounted editor/preview pane —
  // including hidden vault tabs — updates without rebuilding CodeMirror.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--content-font-size", `${values.content_font_size}px`);
    root.style.setProperty("--content-line-height", String(values.content_line_height));
    root.style.setProperty("--content-width", `${values.content_width}px`);
    for (const key of MD_COLOR_KEYS) {
      root.style.setProperty(`--${key.replace(/_/g, "-")}`, values[key]);
    }
  }, [values]);

  const value = useMemo(
    () => ({ values, ready, get, set, reset }),
    [values, ready, get, set, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
