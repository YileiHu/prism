import { useState } from "react";
import WebResources from "./components/WebResources";
import ObsidianVault from "./components/ObsidianVault";
import UnifiedSearch from "./components/UnifiedSearch";
import Settings from "./components/Settings";
import { Globe, FolderSearch, BookOpen, Languages, Settings2 } from "lucide-react";
import { useT } from "./i18n";

type Tab = "resources" | "obsidian" | "search" | "settings";

export default function App() {
  const { t, toggleLang } = useT();
  const [tab, setTab] = useState<Tab>("resources");

  const tabs: { key: Tab; label: string; icon: typeof Globe }[] = [
    { key: "resources", label: t["nav.resources"], icon: Globe },
    { key: "obsidian", label: t["nav.obsidian"], icon: FolderSearch },
    { key: "search", label: t["nav.search"], icon: BookOpen },
    { key: "settings", label: t["nav.settings"], icon: Settings2 },
  ];

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-2 px-6 py-3 bg-gray-900 border-b border-gray-800 select-none">
        <div className="text-lg font-bold tracking-wide mr-4 text-[var(--accent-text)]">{t["app.title"]}</div>
        <nav className="flex gap-1 flex-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                tab === key
                  ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Languages size={14} />
          {t["lang.switch"]}
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === "resources" && <WebResources />}
        {tab === "obsidian" && <ObsidianVault />}
        {tab === "search" && <UnifiedSearch />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
