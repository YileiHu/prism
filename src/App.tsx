import { useState, useEffect, useRef, useCallback } from "react";
import WebResources from "./components/WebResources";
import ObsidianVault from "./components/ObsidianVault";
import Settings from "./components/Settings";
import { Globe, FolderSearch, Settings2, Minus, Square, X, Copy } from "lucide-react";

import { useT } from "./i18n";
import ErrorBoundary from "./components/ErrorBoundary";
import SplashScreen from "./components/SplashScreen";
import { ContextMenuProvider } from "./lib/useContextMenu";
import { type VaultEntry } from "./types";
import "./lib/api";

type SpecialTab = "resources" | "settings";

export default function App() {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<string>("resources");
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [maximized, setMaximized] = useState(false);
  const [mountedVaults, setMountedVaults] = useState<Set<string>>(new Set());
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    window.prism.isMaximized().then(setMaximized);
    return window.prism.onMaximizeChange(setMaximized);
  }, []);

  // Load vaults + select initial tab
  useEffect(() => {
    (async () => {
      const [raw, lastPath] = await Promise.all([
        window.prism.getSetting("vault_paths"),
        window.prism.getSetting("last_vault_path"),
      ]);
      if (!raw) { setActiveTab("resources"); return; }
      let parsed: VaultEntry[] = [];
      try { parsed = JSON.parse(raw); } catch { setActiveTab("resources"); return; }
      setVaults(parsed);
      if (parsed.length === 0) { setActiveTab("resources"); return; }
      if (lastPath) {
        const last = parsed.find((v) => v.path === lastPath);
        if (last) { setActiveTab(last.path); return; }
      }
      setActiveTab(parsed[0].path);
    })();
  }, []);

  // Track mounted vaults so switching tabs doesn't unmount
  useEffect(() => {
    if (activeTab !== "resources" && activeTab !== "settings") {
      setMountedVaults((prev) => {
        if (prev.has(activeTab)) return prev;
        return new Set([...prev, activeTab]);
      });
    }
  }, [activeTab]);

  // Preload: chain vault loads one at a time so setVaultPath doesn't conflict
  const vaultsRef = useRef(vaults);
  vaultsRef.current = vaults;
  const mountedRef = useRef(mountedVaults);
  mountedRef.current = mountedVaults;
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

  const dismissSplash = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    setSplashFadeOut(true);
    setTimeout(() => setSplashVisible(false), 500);
  };

  const handleScanComplete = useCallback(() => {
    dismissSplash();
    const v = vaultsRef.current;
    const m = mountedRef.current;
    const a = activeRef.current;
    const next = v.find((vault) => !m.has(vault.path) && vault.path !== a);
    if (next) {
      setMountedVaults((prev) => new Set([...prev, next.path]));
    }
  }, []);

  const handleContentReady = useCallback(() => {
    dismissSplash();
  }, []);

  // Keep a ref to avoid stale closures in event listeners
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Sync vault list from Settings (focus + custom event)
  useEffect(() => {
    const syncVaults = async () => {
      const raw = await window.prism.getSetting("vault_paths");
      if (!raw) { setVaults([]); return; }
      let parsed: VaultEntry[] = [];
      try { parsed = JSON.parse(raw); } catch { return; }
      setVaults(parsed);

      const current = activeTabRef.current;
      if (current !== "resources" && current !== "settings") {
        const stillExists = parsed.some((v) => v.path === current);
        if (!stillExists) {
          const lastPath = await window.prism.getSetting("last_vault_path");
          if (lastPath) {
            const fallback = parsed.find((v) => v.path === lastPath);
            if (fallback) { setActiveTab(fallback.path); return; }
          }
          if (parsed.length > 0) setActiveTab(parsed[0].path);
          else setActiveTab("resources");
        }
      }
    };
    window.addEventListener("focus", syncVaults);
    window.addEventListener("vaults-changed", syncVaults);
    return () => {
      window.removeEventListener("focus", syncVaults);
      window.removeEventListener("vaults-changed", syncVaults);
    };
  }, []);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== "resources" && tabId !== "settings") {
      window.prism.setSetting("last_vault_path", tabId);
    }
  };

  const vaultTabs = vaults.map((v) => ({
    key: v.path,
    label: v.name,
    icon: FolderSearch,
  }));
  const specialTabs: { key: SpecialTab; label: string; icon: typeof Globe }[] = [
    { key: "resources", label: t["nav.resources"], icon: Globe },
    { key: "settings", label: t["nav.settings"], icon: Settings2 },
  ];
  const allTabs = [...vaultTabs, ...specialTabs];

  return (
    <ErrorBoundary>
    <ContextMenuProvider>
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
          {allTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabClick(key)}
              className={`relative h-full flex items-center gap-1.5 px-3 text-[13px] font-medium transition-colors ${
                activeTab === key
                  ? "text-[var(--accent-text)]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Icon size={15} />
              {label}
              {activeTab === key && (
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
        <div style={{ height: "100%", display: activeTab === "resources" ? "" : "none" }}>
          <WebResources onReady={handleContentReady} />
        </div>
        <div style={{ height: "100%", display: activeTab === "settings" ? "" : "none" }}>
          <Settings />
        </div>
        {vaults.map((v) => {
          const isMounted = mountedVaults.has(v.path) || activeTab === v.path;
          if (!isMounted) return null;
          return (
            <div key={v.path} style={{ height: "100%", display: activeTab === v.path ? "" : "none" }}>
              <ObsidianVault
                vaultPath={v.path}
                vaultName={v.name}
                onScanComplete={handleScanComplete}
              />
            </div>
          );
        })}
      </main>
      {splashVisible && <SplashScreen fadeOut={splashFadeOut} />}
    </div>
    </ContextMenuProvider>
    </ErrorBoundary>
  );
}
