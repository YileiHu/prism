import { useState, useEffect, useRef, useCallback } from "react";
import WebResources from "./components/WebResources";
import ObsidianVault from "./components/ObsidianVault";
import Settings from "./components/Settings";
import { Globe, FolderSearch, Settings2, Minus, Square, X, Copy, Megaphone } from "lucide-react";

import { useT } from "./i18n";
import ErrorBoundary from "./components/ErrorBoundary";
import SplashScreen from "./components/SplashScreen";
import { ContextMenuProvider } from "./lib/useContextMenu";
import ChangelogModal from "./components/ChangelogModal";
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
  const [changelogOpen, setChangelogOpen] = useState(false);
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
      let parsed: VaultEntry[] = [];
      if (raw) {
        try { parsed = JSON.parse(raw); } catch { parsed = []; }
      }
      setVaults(parsed);
      const last = lastPath ? parsed.find((v) => v.path === lastPath) : undefined;
      const initial = last?.path ?? parsed[0]?.path ?? "resources";
      setActiveTab(initial);
      // WebResources may have finished loading while settings were being read
      if (initial === "resources" && contentReadyRef.current) dismissSplash();
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
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const contentReadyRef = useRef(false);

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
    const a = activeTabRef.current;
    const next = v.find((vault) => !m.has(vault.path) && vault.path !== a);
    if (next) {
      setMountedVaults((prev) => new Set([...prev, next.path]));
    }
  }, []);

  const handleContentReady = useCallback(() => {
    contentReadyRef.current = true;
    // Only the resources tab reports readiness; vault tabs report scan completion
    if (activeTabRef.current === "resources" || activeTabRef.current === "settings") {
      dismissSplash();
    }
  }, []);

  // Sync vault list from Settings (focus + custom event)
  useEffect(() => {
    const syncVaults = async () => {
      const raw = await window.prism.getSetting("vault_paths");
      let parsed: VaultEntry[] = [];
      if (raw) {
        try { parsed = JSON.parse(raw); } catch { return; }
      }
      // Stop file watchers for removed vaults
      const removed = vaultsRef.current.filter((p) => !parsed.some((v) => v.path === p.path));
      for (const r of removed) window.prism.unwatchVault(r.path);
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

  // Inactive panes stay laid out (visibility instead of display:none) so scroll
  // positions and virtualizer measurements survive tab switches without flashes
  const paneStyle = (active: boolean): React.CSSProperties =>
    active
      ? { height: "100%" }
      : { position: "absolute", inset: 0, height: "100%", visibility: "hidden" };

  return (
    <ErrorBoundary>
    <ContextMenuProvider>
    <div
      className="h-screen flex flex-col app-shell text-primary select-none"
      style={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 0 0 1px var(--window-ring)" }}
    >
      <header
        className="flex items-center pl-2 pr-2 h-12 glass bg-surface/70 border-b border-line flex-shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <nav
          className="flex items-center h-full flex-1 min-w-0 overflow-x-auto scrollbar-none"
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}
        >
          {allTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabClick(key)}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              className={`relative h-full flex items-center gap-1.5 px-3 text-[13px] font-medium transition-colors flex-shrink-0 ${
                activeTab === key
                  ? "text-[var(--accent-text)]"
                  : "text-muted hover:text-secondary"
              }`}
            >
              <Icon size={15} className="flex-shrink-0" />
              <span className="max-w-[140px] truncate">{label}</span>
              {activeTab === key && (
                <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setChangelogOpen(true)}
          title={t["changelog.button"]}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-secondary hover:bg-hover transition-colors mr-1 flex-shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Megaphone size={15} strokeWidth={1.5} />
        </button>
        <div
          className="flex items-center gap-1 flex-shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            onClick={() => window.prism.minimizeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-secondary hover:bg-hover transition-colors"
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => window.prism.maximizeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-secondary hover:bg-hover transition-colors"
          >
            {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => window.prism.closeWindow()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-white hover:bg-red-500/65 transition-colors"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div style={paneStyle(activeTab === "resources")} className={activeTab === "resources" ? "pane-enter" : ""}>
          <WebResources onReady={handleContentReady} />
        </div>
        <div style={paneStyle(activeTab === "settings")} className={activeTab === "settings" ? "pane-enter" : ""}>
          <Settings />
        </div>
        {vaults.map((v) => {
          const isMounted = mountedVaults.has(v.path) || activeTab === v.path;
          if (!isMounted) return null;
          return (
            <div key={v.path} style={paneStyle(activeTab === v.path)} className={activeTab === v.path ? "pane-enter" : ""}>
              <ObsidianVault
                vaultPath={v.path}
                onScanComplete={handleScanComplete}
              />
            </div>
          );
        })}
      </main>
      {splashVisible && <SplashScreen fadeOut={splashFadeOut} />}
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
    </ContextMenuProvider>
    </ErrorBoundary>
  );
}
