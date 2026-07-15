import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import zh from "./zh";
import en from "./en";
import type { Translation } from "./zh";

type Lang = "zh" | "en";

const translations: Record<Lang, Translation> = { zh, en };
const langNames: Record<Lang, string> = { zh: "中文", en: "English" };

const LangContext = createContext<{
  lang: Lang;
  t: Translation;
  toggleLang: () => void;
}>({
  lang: "zh",
  t: zh,
  toggleLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("zh");

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "zh" ? "en" : "zh"));
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: translations[lang], toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}

export { langNames };
