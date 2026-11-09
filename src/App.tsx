import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Columns3,
  Copy,
  FileText,
  Frame,
  Globe,
  House,
  Library,
  ListChecks,
  Minus,
  PartyPopper,
  Settings2,
  Square,
  X,
} from "lucide-react";
import WebResources from "./components/WebResources";
import Settings from "./components/Settings";
import GtdView from "./components/gtd/GtdView";
import HomeView from "./components/home/HomeView";
import LibraryView from "./components/library/LibraryView";
import DocumentWorkspace from "./components/workspace/DocumentWorkspace";
import { LibraryDataProvider } from "./components/library/LibraryDataProvider";
import AppToolbar from "./components/toolbar/AppToolbar";
import { AppSidebarSlotProvider } from "./components/AppSidebarSlot";
import type { ToolbarContribution } from "./components/toolbar/ToolbarProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Button from "./components/Button";
import ChangelogModal from "./components/ChangelogModal";
import SplashScreen from "./components/SplashScreen";
import TabStrip from "./components/TabStrip";
import ThemeQuickMenu from "./components/ThemeQuickMenu";
import { useContextMenu } from "./lib/useContextMenu";
import { useGlobalShortcuts } from "./lib/useShortcuts";
import { useVaultLock } from "./lib/vaultLock";
import { ToastProvider } from "./lib/toast";
import { useT } from "./i18n";
import type { Translation } from "./i18n/zh";
import { useWorkspace } from "./lib/workspace/WorkspaceProvider";
import { toggleSidebarCollapsed, useSidebarCollapsed } from "./lib/sidebarState";
import { makeNoteDoc, normalizePath, type ModuleId } from "./lib/workspace/types";
import { usePdfDocuments } from "./components/pdf/PdfDocumentsProvider";
import { type VaultEntry } from "./types";
import type { GtdFocus, GtdFocusRequest } from "./components/gtd/types";
import { type MenuItem } from "./components/ContextMenu";
import "./lib/api";

const MODULES: { id: ModuleId; icon: typeof House; labelKey: keyof Translation }[] = [
  { id: "home", icon: House, labelKey: "nav.home" },
  { id: "library", icon: Library, labelKey: "nav.library" },
  { id: "gtd", icon: ListChecks, labelKey: "nav.gtd" },
  { id: "resources", icon: Globe, labelKey: "nav.resources" },
];

// `private` is a hint derived from marker files, not part of the stored list.
function vaultsSignature(list: VaultEntry[]): string {
  return JSON.stringify(
    list.map((vault) => [normalizePath(vault.path), vault.name, vault.icon ?? ""]),
  );
}

export default function App() {
  const { t } = useT();
  const workspace = useWorkspace();
  const { state, hydrate, showModule, activateDoc, openDoc, closeDoc, closeOthers, closeAll, openInSplit, closeSplit, closeVaultDocs, closePdfDocsExcept, setLibrary } = workspace;
  const pdf = usePdfDocuments();
  const vaultLock = useVaultLock();
  const { onContextMenu } = useContextMenu();
  const sidebarCollapsed = useSidebarCollapsed();

  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [maximized, setMaximized] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const [gtdFocus, setGtdFocus] = useState<GtdFocus | null>(null);
  const splashHidden = useRef(false);
  const vaultsRef = useRef(vaults);
  vaultsRef.current = vaults;
  const libraryRef = useRef(state.library);
  libraryRef.current = state.library;
  const pendingNotesRef = useRef<{ path: string; title?: string }[]>([]);

  const dismissSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    setSplashFadeOut(true);
    setTimeout(() => setSplashVisible(false), 500);
  }, []);

  useEffect(() => {
    window.prism.isMaximized().then(setMaximized);
    return window.prism.onMaximizeChange(setMaximized);
  }, []);

  // A vault lock closes its document tabs — the files are unreadable again.
  useEffect(() => {
    const handler = (event: Event) => {
      const vaultPath = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (vaultPath) closeVaultDocs(vaultPath);
    };
    window.addEventListener("prism:vault-locked", handler);
    return () => window.removeEventListener("prism:vault-locked", handler);
  }, [closeVaultDocs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = await window.prism.getSetting("vault_paths");
      let parsed: VaultEntry[] = [];
      if (raw) {
        try { parsed = JSON.parse(raw) as VaultEntry[]; } catch { parsed = []; }
      }
      // The marker file is authoritative; the stored flag is only a hint.
      const statuses = await window.prism.getVaultPrivacyStatuses().catch(() => []);
      const privatePaths = new Set(
        statuses.filter((status) => status.private).map((status) => normalizePath(status.path)),
      );
      parsed = parsed.map((vault) => privatePaths.has(normalizePath(vault.path))
        ? { ...vault, private: true }
        : { ...vault, private: undefined });
      if (cancelled) return;
      setVaults(parsed);
      try {
        await hydrate(parsed);
      } finally {
        if (!cancelled) dismissSplash();
      }
    })();
    return () => { cancelled = true; };
  }, [hydrate, dismissSplash]);

  // Keep the vault list in sync with Settings, stop watchers for removed
  // vaults and drop their document tabs.
  const syncVaults = useCallback(async () => {
    const raw = await window.prism.getSetting("vault_paths");
    let parsed: VaultEntry[] = [];
    if (raw) {
      try { parsed = JSON.parse(raw) as VaultEntry[]; } catch { return; }
    }
    // Focus fires on every window activation; skip state updates (and the
    // full-panel re-render they cause) when nothing actually changed.
    if (vaultsSignature(parsed) === vaultsSignature(vaultsRef.current)) return;

    for (const removed of vaultsRef.current) {
      if (parsed.some((vault) => normalizePath(vault.path) === normalizePath(removed.path))) continue;
      void window.prism.unwatchVault(removed.path);
      closeVaultDocs(removed.path);
    }
    for (const added of parsed) {
      if (vaultsRef.current.some((vault) => normalizePath(vault.path) === normalizePath(added.path))) continue;
      void window.prism.setVaultPath(added.path).catch(() => {});
    }
    setVaults(parsed);
    const library = libraryRef.current;
    const notePath = library.kind === "pdf" ? "" : library.vaultPath;
    if (notePath && !parsed.some((vault) => normalizePath(vault.path) === normalizePath(notePath))) {
      if (parsed.length > 0) setLibrary({ kind: "note", vaultPath: parsed[0].path });
      else if (pdf.repoPath) setLibrary({ kind: "pdf", repoPath: pdf.repoPath });
    }
  }, [closeVaultDocs, pdf.repoPath, setLibrary]);

  useEffect(() => {
    window.addEventListener("focus", syncVaults);
    window.addEventListener("vaults-changed", syncVaults);
    return () => {
      window.removeEventListener("focus", syncVaults);
      window.removeEventListener("vaults-changed", syncVaults);
    };
  }, [syncVaults]);

  // A repository switch invalidates every PDF tab from the previous library.
  useEffect(() => {
    if (!pdf.repoPath) return;
    closePdfDocsExcept(pdf.repoPath);
  }, [closePdfDocsExcept, pdf.repoPath]);

  const focusedDoc = useMemo(
    () => (state.activeId ? state.tabs.find((tab) => tab.id === state.activeId) ?? null : null),
    [state.activeId, state.tabs],
  );

  const shortcutVault = focusedDoc
    ? focusedDoc.kind === "note" ? focusedDoc.vaultPath : ""
    : !state.activeId && state.module === "library" && state.library.kind === "note"
      ? state.library.vaultPath
      : "";

  useGlobalShortcuts(shortcutVault, shortcutVault !== "");

  const handleNavigateToGtd = (request: GtdFocusRequest) => {
    setGtdFocus({ ...request, seq: Date.now() });
    showModule("gtd");
  };

  const openLinkedNote = useCallback((detail: { path: string; title?: string }) => {
    const target = vaultsRef.current.find((vault) => {
      const vaultPath = normalizePath(vault.path);
      const notePath = normalizePath(detail.path);
      return notePath === vaultPath || notePath.startsWith(`${vaultPath}/`);
    });
    if (!target) return false;
    const fallbackTitle = detail.path.split(/[\\/]/).pop()?.replace(/\.md$/i, "") ?? detail.path;
    const doc = makeNoteDoc(target.path, detail.path, detail.title || fallbackTitle);
    if (vaultLock.isLocked(target.path)) {
      vaultLock.requestUnlock(target.path, () => openDoc(doc));
    } else {
      openDoc(doc);
    }
    return true;
  }, [openDoc, vaultLock]);

  // Deep links land before or after hydration; WorkspaceProvider merges both.
  // A link that arrives before the vault list is known waits for it.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; title?: string }>).detail;
      if (!detail?.path) return;
      if (vaultsRef.current.length === 0) {
        pendingNotesRef.current.push(detail);
        return;
      }
      openLinkedNote(detail);
    };
    window.addEventListener("prism:open-note", handler);
    return () => window.removeEventListener("prism:open-note", handler);
  }, [openLinkedNote]);

  useEffect(() => {
    if (vaults.length === 0) return;
    const pending = pendingNotesRef.current;
    pendingNotesRef.current = [];
    for (const detail of pending) openLinkedNote(detail);
  }, [vaults, openLinkedNote]);

  const workspaceActive = state.activeId !== null;
  const moduleActive = workspaceActive ? null : state.module;

  const paneStyle = (active: boolean): React.CSSProperties =>
    active
      ? { height: "100%" }
      : { position: "absolute", inset: 0, height: "100%", visibility: "hidden", overflow: "hidden" };

  const tabItems = useMemo(
    () => state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      icon: tab.kind === "note"
        ? <FileText size={12} />
        : tab.kind === "canvas"
          ? <Frame size={12} />
          : <BookOpen size={12} />,
    })),
    [state.tabs],
  );

  const handleTabContextMenu = useCallback((id: string, event: React.MouseEvent) => {
    const items: MenuItem[] = [
      { label: t["workspace.closeTab"], icon: <X size={14} />, onClick: () => closeDoc(id) },
      { label: t["workspace.closeOthers"], onClick: () => closeOthers(id) },
      { label: t["workspace.closeAll"], onClick: closeAll },
      { label: t["workspace.openSplit"], icon: <Columns3 size={14} />, onClick: () => openInSplit(id) },
    ];
    if (state.split) {
      items.push({ label: t["workspace.closeSplit"], onClick: closeSplit });
    }
    onContextMenu(event, items);
  }, [t, closeDoc, closeOthers, closeAll, openInSplit, state.split, closeSplit, onContextMenu]);

  const toolbarScope = workspaceActive
    ? state.split ? `doc:${state.split.focused}` : "doc:single"
    : `module:${state.module}`;

  const fallbackToolbar: ToolbarContribution = {
    title: (
      <span className="text-body font-medium text-primary">
        {t[MODULES.find((module) => module.id === state.module)?.labelKey ?? "nav.settings"]}
      </span>
    ),
  };

  return (
    <ErrorBoundary>
      <LibraryDataProvider vaults={vaults}>
        <ToastProvider>
          <div
            className="h-screen flex flex-col app-shell text-primary select-none"
            style={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 0 0 1px var(--window-ring)" }}
          >
            <header
              className="relative z-20 flex items-center h-12 app-header border-b border-strong/60 flex-shrink-0"
              style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            >
              <nav
                className="flex items-center gap-0.5 pl-2 pr-1 h-full flex-shrink-0"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                {MODULES.map(({ id, icon: Icon, labelKey }) => (
                  <Button
                    key={id}
                    variant="ghost"
                    size="icon-sm"
                    active={!workspaceActive && state.module === id}
                    className={!workspaceActive && state.module === id ? "chrome-pill-active" : ""}
                    onClick={() => showModule(id)}
                    title={t[labelKey]}
                  >
                    <Icon size={17} strokeWidth={1.6} />
                  </Button>
                ))}
              </nav>

              <TabStrip
                variant="chrome"
                items={tabItems}
                activeId={state.activeId}
                closeLabel={t["workspace.closeTab"]}
                onSelect={activateDoc}
                onClose={closeDoc}
                onReorder={workspace.reorderDocs}
                onTabContextMenu={handleTabContextMenu}
                rightActions={
                  <>
                    <ThemeQuickMenu />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowChangelog(true)}
                      title={t["changelog.title"]}
                    >
                      <PartyPopper size={16} strokeWidth={1.5} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      active={!workspaceActive && state.module === "settings"}
                      onClick={() => showModule("settings")}
                      title={t["nav.settings"]}
                      className={`mx-1 ${
                        !workspaceActive && state.module === "settings" ? "chrome-pill-active" : ""
                      }`}
                    >
                      <Settings2 size={16} strokeWidth={1.5} />
                    </Button>
                    <div className="w-px h-5 bg-line/70" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => window.prism.minimizeWindow()}
                      title={t["window.minimize"]}
                      aria-label={t["window.minimize"]}
                    >
                      <Minus size={14} strokeWidth={1.5} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => window.prism.maximizeWindow()}
                      title={maximized ? t["window.restore"] : t["window.maximize"]}
                      aria-label={maximized ? t["window.restore"] : t["window.maximize"]}
                    >
                      {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
                    </Button>
                    <button
                      onClick={() => window.prism.closeWindow()}
                      title={t["window.close"]}
                      aria-label={t["window.close"]}
                      className="w-8 h-8 flex items-center justify-center rounded-control text-muted hover:text-on-accent hover:bg-danger/70 transition-colors"
                    >
                      <X size={15} strokeWidth={1.5} />
                    </button>
                  </>
                }
              />
            </header>

            <AppSidebarSlotProvider>
              <AppToolbar
                scopeKey={toolbarScope}
                fallback={fallbackToolbar}
                sidebar={workspaceActive
                  || state.module === "library"
                  || state.module === "resources"
                  || state.module === "gtd"
                  || state.module === "settings"
                  ? { collapsed: sidebarCollapsed, onToggle: toggleSidebarCollapsed }
                  : undefined}
              />

              <main className="flex-1 overflow-hidden relative app-main">
                <div style={paneStyle(moduleActive === "home")} className={moduleActive === "home" ? "pane-enter" : ""}>
                  <HomeView active={moduleActive === "home"} vaults={vaults} onNavigateToGtd={handleNavigateToGtd} />
                </div>
                <div style={paneStyle(moduleActive === "resources")} className={moduleActive === "resources" ? "pane-enter" : ""}>
                  <WebResources active={moduleActive === "resources"} />
                </div>
                <div style={paneStyle(moduleActive === "gtd")} className={moduleActive === "gtd" ? "pane-enter" : ""}>
                  <GtdView active={moduleActive === "gtd"} focus={gtdFocus} />
                </div>
                <div style={paneStyle(moduleActive === "library")} className={moduleActive === "library" ? "pane-enter" : ""}>
                  <LibraryView active={moduleActive === "library"} onOpenSettings={() => showModule("settings")} />
                </div>
                <div style={paneStyle(moduleActive === "settings")} className={moduleActive === "settings" ? "pane-enter" : ""}>
                  <Settings active={moduleActive === "settings"} />
                </div>

                <div style={paneStyle(workspaceActive)}>
                  <DocumentWorkspace active={workspaceActive} />
                </div>
              </main>
            </AppSidebarSlotProvider>

            <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />
            {splashVisible && <SplashScreen fadeOut={splashFadeOut} />}
          </div>
        </ToastProvider>
      </LibraryDataProvider>
    </ErrorBoundary>
  );
}
