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
  const [lang, setLang] = useState<Lang>("zh");

  return (
    <LangContext.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}
