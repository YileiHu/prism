import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import zh from "./zh";
import en from "./en";
import type { Translation } from "./zh";

type Lang = "zh" | "en";

const translations: Record<Lang, Translation> = { zh, en };

export const langOptions: { value: Lang; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const LANG_STORAGE_KEY = "prism_lang";

function readStoredLang(): Lang {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  return saved === "en" || saved === "zh" ? saved : "zh";
}

const LangContext = createContext<{
  lang: Lang;
  t: Translation;
  setLang: (lang: Lang) => void;
}>({
  lang: "zh",
  t: zh,
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}
