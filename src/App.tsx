import { useState, useEffect } from "react";
import WebResources from "./components/WebResources";
import ObsidianVault from "./components/ObsidianVault";
import Settings from "./components/Settings";
import { Globe, FolderSearch, Settings2, Minus, Square, X, Copy } from "lucide-react";

import { useT } from "./i18n";
import "./lib/api";

type Tab = "resources" | "obsidian" | "settings";

export default function App() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("obsidian");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.prism.isMaximized().then(setMaximized);
    return window.prism.onMaximizeChange(setMaximized);
  }, []);

  const tabs: { key: Tab; label: string; icon: typeof Globe }[] = [
    { key: "obsidian", label: t["nav.obsidian"], icon: FolderSearch },
    { key: "resources", label: t["nav.resources"], icon: Globe },
    { key: "settings", label: t["nav.settings"], icon: Settings2 },
  ];

  return (
    <div
      className="h-screen flex flex-col bg-gray-950 text-gray-100 select-none"
      style={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}
    >
      <header
        className="flex items-center pl-2 pr-2 h-12 bg-gray-900 border-b border-gray-800 flex-shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <nav
          className="flex items-center h-full"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative h-full flex items-center gap-1.5 px-3 text-[13px] font-medium transition-colors ${
                tab === key
                  ? "text-[var(--accent-text)]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon size={15} />
              {label}
              {tab === key && (
                <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            onClick={() => window.prism.minimizeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => window.prism.maximizeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => window.prism.closeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-red-500/65 transition-colors"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div style={{ height: "100%", display: tab === "resources" ? "block" : "none" }}><WebResources /></div>
        <div style={{ height: "100%", display: tab === "obsidian" ? "block" : "none" }}><ObsidianVault /></div>
        <div style={{ height: "100%", display: tab === "settings" ? "block" : "none" }}><Settings /></div>
      </main>
    </div>
  );
}
