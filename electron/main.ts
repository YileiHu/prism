import { app, BrowserWindow, ipcMain, dialog, shell, net, Menu, screen, protocol, nativeTheme, nativeImage, powerMonitor, globalShortcut, Tray } from "electron";
import path from "path";
import fs from "fs";
import { isPathInside, pathKey as normalizePathKey } from "./paths";
import { Readable } from "stream";
import { spawn } from "child_process";
import {
  initDatabase,
  addResource,
  getResources,
  updateResource,
  deleteResource,
  reorderResources,
  searchResources,
  syncVaultNotes,
  insertNote,
  renameNoteInDb,
  deleteNotesByPaths,
  getNoteMtimes,
  getNoteList,
  getNoteBriefsByPaths,
  searchNotes,
  searchNoteContents,
  getSetting,
  setSetting,
  getAllSettings,
  getAllTags,
  reorderTags,
  setTagColor,
  renameTag,
  deleteTag,
  addGtdTask,
  getGtdOpenTasks,
  getGtdCompletedTasks,
  getGtdProjectTasks,
  getGtdProjects,
  updateGtdTask,
  completeGtdTask,
  reopenGtdTask,
  deleteGtdTask,
  clearCompletedGtdTasks,
  reorderGtdProjectTasks,
  reorderGtdInboxTasks,
  reorderGtdProjects,
  addGtdProject,
  updateGtdProject,
  setGtdProjectArchived,
  deleteGtdProject,
  getGtdProject,
  getGtdProjectLinkIndex,
  getGtdProjectLinks,
  setGtdProjectLink,
  removeGtdProjectLink,
  renameGtdProjectLinkPath,
  type GtdProjectLinkRow,
  type VaultNote,
  renameNoteEntry,
  purgeVaultNotes,
  listPdfDocuments,
  getPdfDocumentsByPaths,
  syncPdfDocuments,
  getPdfDocument,
  findPdfDocumentByRelPath,
  findPdfDocumentByTitle,
  updatePdfCover,
  setPdfCustomCover,
  resetPdfCover,
  setPdfPageCount,
  deletePdfDocuments,
  type PdfUpsertRow,
} from "./database";
import type {
  AppLaunchState,
  CanvasFile,
  CanvasSaveResult,
  GlobalShortcutStatus,
  GtdProjectDocsPayload,
  GtdProjectLink,
  GtdProjectLinkKind,
  GtdTaskPatch,
  NoteBrief,
} from "../src/shared/models";
import {
  DEFAULT_SHORTCUTS,
  GLOBAL_SHORTCUT_ACTIONS,
  normalizeShortcuts,
  type GlobalShortcutAction,
  type ShortcutMap,
} from "../src/shared/shortcuts";
import {
  DEFAULT_SETTINGS,
  decodeSetting,
  type AppSettings,
  type SettingKey,
} from "../src/shared/settings";
import zh from "../src/i18n/zh";
import en from "../src/i18n/en";
import {
  changeVaultPassword,
  dropSession,
  isPrivateVault,
  isUnlocked,
  listNoteFiles,
  lockAllVaults,
  lockVault,
  makeVaultPrivate,
  makeVaultPublic,
  privacyStatus,
  readAssetBytes,
  readEncryptedText,
  refreshIdleTimers,
  setIdleMinutesProvider,
  setLockListener,
  setUnlockListener,
  touchAllVaults,
  unlockVault,
  withVaultKey,
  writeEncryptedFile,
  normalizeVaultPath,
} from "./privateVault";
import { readSidecar, writeSidecar } from "./sidecar";

let mainWindow: BrowserWindow | null = null;
let quickCaptureWindow: BrowserWindow | null = null;
let quickCaptureReady = false;

// OS-level registration state, surfaced to the shortcuts settings page.
let registeredGlobalShortcuts: GlobalShortcutStatus = {
  quickCapture: { shortcut: "", registered: false },
  showMain: { shortcut: "", registered: false },
};

function readShortcutMap(): ShortcutMap {
  try {
    const raw = getSetting("shortcuts");
    return raw ? normalizeShortcuts(JSON.parse(raw)) : { ...DEFAULT_SHORTCUTS };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

// ---- Tray, close behavior & launch at login ----

let tray: Tray | null = null;
let isQuitting = false;
// Set by the login item args (`--hidden`): start with no main window at all,
// so the background instance never spawns a renderer.
const startedHidden = process.argv.includes("--hidden");
let pdfRepoRestored = false;

function readAppSetting<K extends SettingKey>(key: K): AppSettings[K] {
  try {
    return decodeSetting(key, getSetting(key));
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}

function loginItemSupported(): boolean {
  return process.platform === "win32" || process.platform === "darwin";
}

// Hiding the window at boot is Windows-only: it relies on login-item `args`,
// while macOS's `openAsHidden` is deprecated in current Electron.
function hiddenStartSupported(): boolean {
  return process.platform === "win32";
}

// Native menus cannot use the renderer's useT(); the labels come from the same
// zh/en sources, picked by system locale (anything non-English falls back to
// the app's default language).
function nativeLabels() {
  return app.getLocale().toLowerCase().startsWith("en") ? en : zh;
}

function trayNeeded(): boolean {
  return startedHidden
    || readAppSetting("close_behavior") === "tray"
    || (readAppSetting("auto_launch") && readAppSetting("auto_launch_hidden"));
}

function trayIcon() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../public/icon-16.png"));
  const large = nativeImage.createFromPath(path.join(__dirname, "../public/icon-32.png"));
  if (icon.isEmpty()) return nativeImage.createFromPath(path.join(__dirname, "../public/icon.png"));
  // A 2x representation keeps the tray icon crisp on scaled displays.
  if (!large.isEmpty()) icon.addRepresentation({ scaleFactor: 2, dataURL: large.toDataURL() });
  return icon;
}

function trayMenu(): Menu {
  const labels = nativeLabels();
  return Menu.buildFromTemplate([
    { label: labels["tray.show"], click: () => revealMainWindow() },
    { label: labels["tray.quickCapture"], click: () => showQuickCaptureWindow() },
    { type: "separator" },
    { label: labels["tray.quit"], click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function ensureTray(): void {
  if (tray) {
    tray.setContextMenu(trayMenu());
    return;
  }
  try {
    const created = new Tray(trayIcon());
    created.setToolTip("Prism");
    created.setContextMenu(trayMenu());
    if (process.platform !== "darwin") {
      // macOS shows the context menu on click; Windows/Linux toggle the window.
      created.on("click", () => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide();
        else revealMainWindow();
      });
      created.on("double-click", () => revealMainWindow());
    }
    tray = created;
  } catch (error) {
    console.error("tray: failed to create", error);
    tray = null;
  }
}

function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

function syncTray(): void {
  if (trayNeeded()) {
    ensureTray();
    return;
  }
  if (!tray) return;
  // Defensive: never remove the only way back to a hidden window.
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) revealMainWindow();
  destroyTray();
}

// Writes (or removes) the OS login item. Only packaged builds touch the system
// startup entry — in development this would register electron.exe instead.
// Called once at startup to heal the path/args after a reinstall and again
// whenever the related settings change.
function applyAutoLaunch(): void {
  if (!loginItemSupported() || !app.isPackaged) return;
  const openAtLogin = readAppSetting("auto_launch");
  const hidden = readAppSetting("auto_launch_hidden");
  try {
    if (process.platform === "win32") {
      app.setLoginItemSettings({ openAtLogin, args: hidden ? ["--hidden"] : [] });
    } else if (process.platform === "darwin") {
      app.setLoginItemSettings({ openAtLogin });
    }
  } catch (error) {
    console.error("auto launch: failed to update login item", error);
  }
}

function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    // The app already ran (tray/hidden startup): resume the persisted
    // workspace instead of treating this as a cold start.
    createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  // A monitor may have been unplugged while the window sat in the tray.
  if (!isVisibleOnSomeDisplay(mainWindow.getBounds())) mainWindow.center();
  mainWindow.show();
  mainWindow.focus();
}

// The PDF library is restored lazily: a tray-only background instance must not
// scan the PDF folder at login. First main window creation does it once.
function ensurePdfRepoRestored(): void {
  if (pdfRepoRestored) return;
  pdfRepoRestored = true;
  void applyPdfRepo(getSetting("pdf_repo_path") ?? "").catch(() => { /* state surfaces in the UI */ });
}

function launchState(): AppLaunchState {
  return {
    packaged: app.isPackaged,
    loginItemSupported: loginItemSupported(),
    hiddenStartSupported: hiddenStartSupported(),
  };
}

function closeQuickCaptureWindow(): void {
  const win = quickCaptureWindow;
  quickCaptureWindow = null;
  quickCaptureReady = false;
  if (win && !win.isDestroyed()) win.close();
}

// The global shortcut must not show the main window. It opens a small,
// frameless, always-on-top capture popup instead; closing/saving it leaves the
// main app exactly where it was.
function showQuickCaptureWindow(): void {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    if (!quickCaptureReady) return;
    quickCaptureWindow.show();
    quickCaptureWindow.focus();
    return;
  }

  const colorMode = resolveColorScheme(getSetting("color_mode"));
  const dark = colorMode === "dark"
    || (colorMode === "system" && nativeTheme.shouldUseDarkColors);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = 560;
  const height = 200;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: "Prism Quick Capture",
    frame: false,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: dark ? DARK_BG : LIGHT_BG,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  quickCaptureWindow = win;
  quickCaptureReady = false;
  win.setAlwaysOnTop(true, "floating");

  win.on("blur", () => {
    if (quickCaptureWindow === win) closeQuickCaptureWindow();
  });
  win.on("closed", () => {
    if (quickCaptureWindow !== win) return;
    quickCaptureWindow = null;
    quickCaptureReady = false;
  });
  win.once("ready-to-show", () => {
    if (quickCaptureWindow !== win || win.isDestroyed()) return;
    quickCaptureReady = true;
    win.show();
    win.focus();
  });

  const mode = dark ? "dark" : "light";
  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    void win.loadURL(`http://localhost:5173/quick-capture.html?mode=${mode}`);
  } else {
    void win.loadFile(path.join(__dirname, "../dist/quick-capture.html"), { query: { mode } });
  }
}

// Global actions register with the OS so they also work while Prism is
// unfocused or only lives in the tray. Everything else stays renderer-side.
const GLOBAL_SHORTCUT_HANDLERS: Record<GlobalShortcutAction, () => void> = {
  quickCapture: () => showQuickCaptureWindow(),
  showMain: () => revealMainWindow(),
};

// Registers the OS-level shortcuts. Called once at startup (the app may have no
// main window when it was launched hidden) and again whenever the `shortcuts`
// setting changes.
function applyGlobalShortcuts(): void {
  const accelerators = readShortcutMap();
  // Release every previous registration before acquiring new ones: combos can
  // be swapped between actions, and registering before releasing would fail.
  for (const action of GLOBAL_SHORTCUT_ACTIONS) {
    const previous = registeredGlobalShortcuts[action].shortcut;
    if (previous) globalShortcut.unregister(previous);
  }
  for (const action of GLOBAL_SHORTCUT_ACTIONS) {
    const accelerator = accelerators[action];
    let registered = false;
    if (accelerator) {
      try {
        registered = globalShortcut.register(accelerator, GLOBAL_SHORTCUT_HANDLERS[action]);
      } catch (error) {
        console.error(`global shortcut: failed to register ${action}`, error);
      }
    }
    registeredGlobalShortcuts[action] = { shortcut: accelerator, registered };
  }
}

// Must run before app ready — lets <img src="prism-file://..."> work from the
// renderer for markdown note images (the renderer can't fetch file:// directly)
protocol.registerSchemesAsPrivileged([
  { scheme: "prism-file", privileges: { supportFetchAPI: true, stream: true } },
  { scheme: "prism-cover", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: "prism-pdf", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: "prism-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---- Window state persistence ----

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function loadWindowState(): WindowState | null {
  try {
    const raw = getSetting("window_bounds");
    if (!raw) return null;
    const s = JSON.parse(raw) as WindowState;
    if (typeof s.width !== "number" || typeof s.height !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

// Saved coordinates are useless if the display they were on is gone —
// require a meaningful chunk of the window to be visible somewhere
function isVisibleOnSomeDisplay(s: WindowState): boolean {
  if (typeof s.x !== "number" || typeof s.y !== "number") return false;
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const overlapX = Math.max(0, Math.min(s.x! + s.width, wa.x + wa.width) - Math.max(s.x!, wa.x));
    const overlapY = Math.max(0, Math.min(s.y! + s.height, wa.y + wa.height) - Math.max(s.y!, wa.y));
    return overlapX >= 100 && overlapY >= 100;
  });
}

// Keep the native window surface in sync with the renderer's color mode so
// startup/repaint never flashes the opposite scheme.
const DARK_BG = "#030712";
const LIGHT_BG = "#f6f8fb";

function resolveColorScheme(mode: string | null): "dark" | "light" | "system" {
  return mode === "light" || mode === "dark" ? mode : "system";
}

function applyNativeColorMode(mode: string): void {
  const scheme = resolveColorScheme(mode);
  nativeTheme.themeSource = scheme;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const dark = scheme === "dark" || (scheme === "system" && nativeTheme.shouldUseDarkColors);
  mainWindow.setBackgroundColor(dark ? DARK_BG : LIGHT_BG);
}

function createWindow(reopen = false): void {
  const isWindows = process.platform === "win32";
  const saved = loadWindowState();
  const colorMode = resolveColorScheme(getSetting("color_mode"));
  nativeTheme.themeSource = colorMode;
  const windowDark = colorMode === "dark" || (colorMode === "system" && nativeTheme.shouldUseDarkColors);

  const options: Electron.BrowserWindowConstructorOptions = {
    width: saved?.width ?? 1200,
    height: saved?.height ?? 800,
    minWidth: 900,
    minHeight: 600,
    title: "Prism",
    icon: path.join(__dirname, "../public/icon.png"),
    ...(isWindows
      ? { frame: false, backgroundColor: windowDark ? DARK_BG : LIGHT_BG }
      : { backgroundColor: windowDark ? DARK_BG : LIGHT_BG }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden-to-tray windows stay alive; Chromium's throttling keeps their
      // timers idle instead of burning CPU in the background.
      backgroundThrottling: true,
    },
  };
  if (saved && isVisibleOnSomeDisplay(saved)) {
    options.x = saved.x;
    options.y = saved.y;
  }

  mainWindow = new BrowserWindow(options);
  const win = mainWindow;
  if (saved?.maximized) win.maximize();

  // Must be registered here — mainWindow is still null while registerIpcHandlers runs
  win.on("maximize", () => win.webContents.send("window:maximize-change", true));
  win.on("unmaximize", () => win.webContents.send("window:maximize-change", false));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    if (isQuitting || process.platform === "darwin") return;
    // "关闭即退出" must win even when a tray exists for hidden login startup.
    if (readAppSetting("close_behavior") === "quit") app.quit();
  });
  // Windows logoff/shutdown must never be blocked by the close-to-tray handler.
  win.on("query-session-end", () => { isQuitting = true; });
  win.on("session-end", () => { isQuitting = true; });
  win.once("ready-to-show", () => {
    if (mainWindow === win && !win.isDestroyed()) win.focus();
  });

  // Persist bounds (debounced; always store the non-maximized rect so restore works)
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getNormalBounds();
    setSetting("window_bounds", JSON.stringify({ ...b, maximized: mainWindow.isMaximized() }));
  };
  const scheduleSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(saveBounds, 500);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);
  win.on("close", (event) => {
    if (boundsTimer) clearTimeout(boundsTimer);
    saveBounds();
    // Only hide when a tray actually exists — otherwise closing would leave an
    // unreachable background process.
    if (!isQuitting && tray && readAppSetting("close_behavior") === "tray") {
      event.preventDefault();
      if (!win.isDestroyed()) win.hide();
    }
  });

  // Focus-triggered incremental scan (throttled per vault). Catches everything
  // fs.watch can silently miss: unplugged/reconnected drives, dead watchers,
  // network drives, change-buffer overflows, new dirs on Linux.
  win.on("focus", () => {
    const now = Date.now();
    for (const vp of watchedVaults) {
      const interval = vaultWatchers.has(vp) ? FOCUS_SAFETY_INTERVAL : FOCUS_SCAN_INTERVAL;
      if (now - (focusScanAt.get(vp) ?? 0) < interval) continue;
      focusScanAt.set(vp, now);
      rescanAndNotify(vp);
    }
    if (pdfRepoPath) {
      const interval = pdfWatchers.length > 0 ? FOCUS_SAFETY_INTERVAL : FOCUS_SCAN_INTERVAL;
      if (now - pdfFocusScanAt >= interval) {
        pdfFocusScanAt = now;
        rescanPdfRepoAndNotify();
      }
    }
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    win.loadURL(`http://localhost:5173${reopen ? "?restore-workspace=1" : ""}`);
  } else {
    win.loadFile(
      path.join(__dirname, "../dist/index.html"),
      reopen ? { query: { "restore-workspace": "1" } } : undefined,
    );
  }

  // Restored on the first main window, not at boot: a tray-only instance must
  // not scan the PDF library.
  ensurePdfRepoRestored();
}

// ---- Fetch page title ----

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, entity: string) => {
    if (entity.startsWith("#")) {
      const code = entity[1]?.toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m;
    }
    return HTML_ENTITIES[entity] ?? m;
  });
}

const MAX_TITLE_HTML_BYTES = 512 * 1024;

async function fetchPageTitle(url: string): Promise<string> {
  try {
    const response = await net.fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.body) return url;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let matched: RegExpMatchArray | null = null;
    try {
      let received = 0;
      // Stream only until the </title> tag (with a hard cap) instead of the whole page
      while (received < MAX_TITLE_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (matched) break;
      }
    } finally {
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const title = matched ? decodeHtmlEntities(matched[1]).trim() : "";
    return title || url;
  } catch {
    return url;
  }
}

// ---- Vault scanning ----

function extractTags(content: string): Set<string> {
  const tagSet = new Set<string>();
  // Note files on Windows are often CRLF; the regexes below assume \n
  const normalized = content.replace(/\r\n/g, "\n");

  // 1. Parse YAML frontmatter tags
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    // tags: [a, b, c]
    const inlineList = fm.match(/^tags:\s*\[(.+?)\]\s*$/m);
    if (inlineList) {
      inlineList[1].split(",").forEach((t) => {
        const tag = t.trim().replace(/^["']|["']$/g, "");
        if (tag) tagSet.add(tag);
      });
    }
    // tags:\n  - a\n  - b
    const listMatch = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
    if (listMatch) {
      const items = listMatch[1].match(/-\s*(.+)/g);
      if (items) {
        items.forEach((t) => {
          const tag = t.replace(/^-\s*/, "").trim().replace(/^["']|["']$/g, "");
          if (tag) tagSet.add(tag);
        });
      }
    }
  }

  // 2. Inline #tags from body (strip code blocks first)
  const bodyStart = fmMatch ? fmMatch[0].length : 0;
  let body = normalized.slice(bodyStart);
  body = body.replace(/```[\s\S]*?```/g, "");
  body = body.replace(/`[^`]+`/g, "");
  const bodyTags = body.match(/(?:^|\s)#([\w\p{L}\/-]+)/gu) || [];
  bodyTags.forEach((t) => {
    const tag = t.trim().replace(/^#/, "").replace(/\/+$/, "");
    if (tag && /[\p{L}]/u.test(tag) && !/^\d+$/.test(tag)) tagSet.add(tag);
  });

  return tagSet;
}

async function scanVaultIncremental(vaultPath: string, excludedRoots: string[] = []): Promise<{
  upsert: { path: string; title: string; content: string; tags: string; modified_at: string }[];
  deletePaths: string[];
  totalCount: number;
}> {
  // Nested private vaults must never be read as plaintext by a public parent.
  const excluded = new Set(excludedRoots.map(normalizeVaultPath));

  // 1. Walk directory with async I/O — collect paths + mtimes
  async function walk(dir: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return result; }

    const subdirs: string[] = [];
    const statPromises: Promise<void>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !excluded.has(normalizeVaultPath(fullPath))) {
          subdirs.push(fullPath);
        }
      } else if (entry.name.endsWith(".md")) {
        statPromises.push(
          fs.promises.stat(fullPath).then(
            (stat) => { result.set(fullPath, stat.mtime.toISOString()); },
            () => {},
          ),
        );
      }
    }

    await Promise.all(statPromises);

    const subResults = await Promise.all(subdirs.map((s) => walk(s)));
    for (const subResult of subResults) {
      for (const [k, v] of subResult) result.set(k, v);
    }

    return result;
  }

  const diskFiles = await walk(vaultPath);

  // 2. Get DB state for diff — scoped to this vault only
  const dbNotes = getNoteMtimes(vaultPath);
  const dbMap = new Map(dbNotes.map((n) => [n.path, n.modified_at]));

  // 3. Collect files that need processing (no content read yet)
  const toProcess: { filePath: string; mtime: string }[] = [];
  for (const [filePath, mtime] of diskFiles) {
    if (dbMap.get(filePath) !== mtime) {
      toProcess.push({ filePath, mtime });
    }
  }

  // 4. Read content in parallel batches
  const BATCH_SIZE = 30;
  const upsert: { path: string; title: string; content: string; tags: string; modified_at: string }[] = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ filePath, mtime }) => {
        try {
          const content = await fs.promises.readFile(filePath, "utf-8");
          const title = path.basename(filePath).replace(/\.md$/, "");
          const tags = Array.from(extractTags(content)).join(" ");
          return { path: filePath, title, content, tags, modified_at: mtime };
        } catch {
          return null;
        }
      }),
    );
    for (const item of batchResults) {
      if (item) upsert.push(item);
    }
  }

  // 5. Files in this vault's DB rows but gone from disk
  const deletePaths: string[] = [];
  for (const [filePath] of dbMap) {
    if (!diskFiles.has(filePath)) deletePaths.push(filePath);
  }

  return { upsert, deletePaths, totalCount: diskFiles.size };
}

// Case-insensitive filesystems (Windows, default macOS) treat "Note.md" and
// "note.md" as the same file, so a case-only rename must not trigger the
// "already exists" suffix logic.
function isSamePath(a: string, b: string): boolean {
  return process.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase();
}

function isValidVaultDir(vaultPath: string): boolean {
  try {
    return fs.statSync(vaultPath).isDirectory();
  } catch {
    return false;
  }
}

// ---- Vault file watchers ----

const watchedVaults = new Set<string>(); // vaults we intend to keep watching
const vaultWatchers = new Map<string, fs.FSWatcher[]>(); // live watchers (may be gone after errors)
const watcherRebuildTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingScanVaults = new Set<string>();
let vaultScanTimer: ReturnType<typeof setTimeout> | null = null;
// First scan per vault is shared between the concurrent startup callers; the
// watcher keeps the index current after that.
const vaultScanDone = new Map<string, number>();
const vaultScanInFlight = new Map<string, Promise<number>>();

// The fs watcher is the primary change channel. A healthy watcher only needs
// an occasional safety-net scan; a missing one (unplugged drive, network share,
// buffer overflow) catches up on every focus.
const FOCUS_SCAN_INTERVAL = 30_000;
const FOCUS_SAFETY_INTERVAL = 5 * 60_000;
const focusScanAt = new Map<string, number>();

function unwatchVault(vaultPath: string): void {
  const watchers = vaultWatchers.get(vaultPath);
  if (watchers) {
    for (const w of watchers) w.close();
    vaultWatchers.delete(vaultPath);
  }
  const timer = watcherRebuildTimers.get(vaultPath);
  if (timer) {
    clearTimeout(timer);
    watcherRebuildTimers.delete(vaultPath);
  }
}

function scheduleVaultScan(vaultPath: string): void {
  pendingScanVaults.add(vaultPath);
  if (vaultScanTimer) clearTimeout(vaultScanTimer);
  vaultScanTimer = setTimeout(() => {
    vaultScanTimer = null;
    const toScan = Array.from(pendingScanVaults);
    pendingScanVaults.clear();
    for (const vp of toScan) rescanAndNotify(vp);
  }, 800);
}

async function rescanAndNotify(vaultPath: string): Promise<void> {
  try {
    if (!isValidVaultDir(vaultPath)) return;
    // Re-arm a dead watcher (e.g. after the drive was unplugged and came back)
    if (!vaultWatchers.has(vaultPath) && watchedVaults.has(vaultPath)) watchVault(vaultPath);
    if (isPrivateVault(vaultPath)) {
      schedulePrivateNotify(vaultPath);
      return;
    }
    const { upsert, deletePaths } = await scanVaultIncremental(vaultPath, privateVaultRoots());
    // Only notify when the index actually changed (e.g. ignore .prism/collections.json writes)
    if (upsert.length === 0 && deletePaths.length === 0) return;
    syncVaultNotes(vaultPath, upsert, deletePaths);
    const changes = {
      upserted: getNoteBriefsByPaths(vaultPath, upsert.map((note) => note.path)),
      deleted: deletePaths,
    };
    mainWindow?.webContents.send("vault:updated", vaultPath, changes);
  } catch { /* watcher-triggered scans are best-effort */ }
}

function handleWatcherError(vaultPath: string): void {
  unwatchVault(vaultPath); // close the dead watcher; intent stays in watchedVaults
  if (watcherRebuildTimers.has(vaultPath)) return;
  watcherRebuildTimers.set(vaultPath, setTimeout(() => {
    watcherRebuildTimers.delete(vaultPath);
    // Directory gone (drive unplugged): stay unwatched — a later focus scan re-arms
    if (!isValidVaultDir(vaultPath)) return;
    watchVault(vaultPath);
    rescanAndNotify(vaultPath);
  }, 2000));
}

function watchVault(vaultPath: string): void {
  unwatchVault(vaultPath);
  const onChange = (_event: string, filename: string | null) => {
    if (filename) {
      const segments = filename.split(/[\\/]/);
      // Ignore dot-directories (.obsidian, .prism, .git) and non-markdown files
      if (segments.some((s) => s.startsWith("."))) return;
    }
    // Private vaults are never indexed — a change only refreshes the file list
    if (isPrivateVault(vaultPath)) {
      schedulePrivateNotify(vaultPath);
      return;
    }
    if (filename && !filename.toLowerCase().endsWith(".md")) return;
    scheduleVaultScan(vaultPath);
  };
  const onError = () => handleWatcherError(vaultPath);

  const watchers: fs.FSWatcher[] = [];
  const addWatcher = (dir: string, recursive: boolean) => {
    try {
      const w = recursive ? fs.watch(dir, { recursive: true }, onChange) : fs.watch(dir, onChange);
      w.on("error", onError);
      watchers.push(w);
    } catch { /* ignore */ }
  };

  // recursive works on Windows/macOS; Linux needs one watcher per directory
  addWatcher(vaultPath, true);
  if (watchers.length === 0) {
    const dirs: string[] = [vaultPath];
    const queue = [vaultPath];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".")) {
          const sub = path.join(dir, e.name);
          dirs.push(sub);
          queue.push(sub);
        }
      }
    }
    for (const dir of dirs) addWatcher(dir, false);
  }
  vaultWatchers.set(vaultPath, watchers);
}

// Resolve which registered vault contains filePath. Longest prefix wins so
// nested vault roots resolve to the tighter scope. Returns null when the file
// is outside every registered vault — read/write IPC must refuse such paths.
function findOwningVault(filePath: string): string | null {
  const owned = registeredVaultPaths().filter((vaultPath) => isPathInside(vaultPath, filePath));
  if (owned.length === 0) return null;
  return owned.sort((a, b) => b.length - a.length)[0];
}

// ---- Private vaults ----

// Cached because findOwningVault runs on every protocol/IPC path check. Any
// write to `vault_paths` (settings:set or privacy toggles) clears it.
let vaultPathsCache: string[] | null = null;

function registeredVaultPaths(): string[] {
  if (vaultPathsCache) return vaultPathsCache;
  try {
    const raw = getSetting("vault_paths");
    if (!raw) return (vaultPathsCache = []);
    const parsed = JSON.parse(raw);
    vaultPathsCache = Array.isArray(parsed)
      ? parsed.map((v: { path?: string }) => v?.path).filter((p): p is string => Boolean(p))
      : [];
    return vaultPathsCache;
  } catch {
    return (vaultPathsCache = []);
  }
}

// Normalized roots whose contents must never be indexed or read as plaintext.
function privateVaultRoots(): string[] {
  return registeredVaultPaths().filter(isPrivateVault);
}

function requireUnlocked(vaultPath: string): void {
  if (isPrivateVault(vaultPath) && !isUnlocked(vaultPath)) throw new Error("VAULT_LOCKED");
}

// Synthetic stable ids for private-vault notes — they live outside SQLite.
function syntheticNoteId(filePath: string): number {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) hash = (hash * 31 + filePath.charCodeAt(i)) | 0;
  return hash >= 0 ? -(hash + 1) : hash;
}

function setVaultPrivateFlag(vaultPath: string, isPrivateVaultFlag: boolean): void {
  let entries: { path: string; [key: string]: unknown }[] = [];
  try {
    const raw = getSetting("vault_paths");
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) entries = parsed;
  } catch { return; }
  const key = normalizeVaultPath(vaultPath);
  const next = entries.map((entry) => {
    if (!entry || typeof entry.path !== "string" || normalizeVaultPath(entry.path) !== key) return entry;
    if (isPrivateVaultFlag) return { ...entry, private: true };
    const { private: _omit, ...rest } = entry;
    return rest;
  });
  setSetting("vault_paths", JSON.stringify(next));
  vaultPathsCache = null;
}

function privacyStatuses(): { path: string; private: boolean; locked: boolean }[] {
  return registeredVaultPaths().map((vaultPath) => ({ path: vaultPath, ...privacyStatus(vaultPath) }));
}

// Watcher-driven notifications for private vaults: file contents stay
// encrypted, so a change just tells the renderer to re-list names.
const PRIVATE_NOTIFY_DEBOUNCE = 800;
const PRIVATE_ECHO_SUPPRESS = 1000;
const privateNotifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const privateSelfWriteAt = new Map<string, number>();

function markPrivateWrite(vaultPath: string): void {
  privateSelfWriteAt.set(normalizeVaultPath(vaultPath), Date.now());
}

function schedulePrivateNotify(vaultPath: string): void {
  const existing = privateNotifyTimers.get(vaultPath);
  if (existing) clearTimeout(existing);
  privateNotifyTimers.set(vaultPath, setTimeout(() => {
    privateNotifyTimers.delete(vaultPath);
    const lastWrite = privateSelfWriteAt.get(normalizeVaultPath(vaultPath)) ?? 0;
    if (Date.now() - lastWrite < PRIVATE_ECHO_SUPPRESS) return;
    mainWindow?.webContents.send("vault:updated", vaultPath);
  }, PRIVATE_NOTIFY_DEBOUNCE));
}

function privateNoteBriefs(vaultPath: string): NoteBrief[] {
  return listNoteFiles(vaultPath, privateVaultRoots())
    .map((note) => ({
      id: syntheticNoteId(note.path),
      path: note.path,
      title: note.title,
      tags: "",
      modifiedAt: note.modifiedAt,
    }))
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0));
}

// ---- PDF library scanning ----

let pdfRepoPath: string | null = null;
let pdfWatchers: fs.FSWatcher[] = [];
let pdfWatcherRebuildTimer: ReturnType<typeof setTimeout> | null = null;
let pdfScanTimer: ReturnType<typeof setTimeout> | null = null;
let pdfScanPending = false;
let pdfFocusScanAt = 0;

// .prism sidecar metadata belongs to a vault root; a nested note path is not
// allowed to address it.
function requireVaultRoot(vaultPath: string): void {
  const owner = findOwningVault(vaultPath);
  if (!owner || normalizePathKey(owner) !== normalizePathKey(vaultPath)) {
    throw new Error("OUTSIDE_VAULT");
  }
}

function currentPdfRepo(): string | null {
  const raw = (getSetting("pdf_repo_path") ?? "").trim();
  return raw || null;
}

function pdfCoverDir(): string {
  const dir = path.join(app.getPath("userData"), "pdf-covers");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pdfCoverFile(id: number): string {
  return path.join(pdfCoverDir(), `${id}.jpg`);
}

function removePdfCoverFile(id: number): void {
  try { fs.unlinkSync(pdfCoverFile(id)); } catch { /* already gone */ }
}

function resolvePdfDocument(id: number): { path: string; title: string; pageCount: number | null } | null {
  const row = getPdfDocument(id);
  if (!row) return null;
  const repo = pdfRepoPath ?? currentPdfRepo();
  if (!repo || !isPathInside(repo, row.path)) return null;
  return { path: row.path, title: row.title, pageCount: row.pageCount };
}

// `complete` is false when any directory or file could not be read; callers
// must not infer deletions from an incomplete walk.
async function walkPdfFiles(repoPath: string): Promise<{
  files: Map<string, { mtime: string; size: number }>;
  complete: boolean;
}> {
  const files = new Map<string, { mtime: string; size: number }>();
  let complete = true;

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch {
      complete = false;
      return;
    }

    const subdirs: string[] = [];
    const stats: Promise<void>[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) subdirs.push(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".pdf")) {
        stats.push(
          fs.promises.stat(fullPath).then(
            (stat) => { files.set(fullPath, { mtime: stat.mtime.toISOString(), size: stat.size }); },
            () => { complete = false; },
          ),
        );
      }
    }
    await Promise.all(stats);
    await Promise.all(subdirs.map((sub) => walk(sub)));
  }

  await walk(repoPath);
  return { files, complete };
}

async function scanPdfRepoIncremental(repoPath: string): Promise<{
  upsert: PdfUpsertRow[];
  deletePaths: string[];
  totalCount: number;
  deletedRows: { id: number }[];
}> {
  const { files: diskFiles, complete } = await walkPdfFiles(repoPath);
  const dbRows = listPdfDocuments(repoPath);
  const dbMap = new Map(dbRows.map((row) => [row.path, row.modifiedAt]));

  const upsert: PdfUpsertRow[] = [];
  for (const [filePath, info] of diskFiles) {
    if (dbMap.get(filePath) === info.mtime) continue;
    upsert.push({
      path: filePath,
      rel_path: path.relative(repoPath, filePath).split(path.sep).join("/"),
      title: path.basename(filePath).replace(/\.pdf$/i, ""),
      file_size: info.size,
      modified_at: info.mtime,
    });
  }

  const deletedRows: { id: number }[] = [];
  const deletePaths: string[] = [];
  if (complete) {
    for (const row of dbRows) {
      if (!diskFiles.has(row.path)) {
        deletePaths.push(row.path);
        deletedRows.push({ id: row.id });
      }
    }
  }

  return { upsert, deletePaths, totalCount: diskFiles.size, deletedRows };
}

function unwatchPdfRepo(): void {
  for (const w of pdfWatchers) {
    try { w.close(); } catch { /* ignore */ }
  }
  pdfWatchers = [];
  if (pdfWatcherRebuildTimer) {
    clearTimeout(pdfWatcherRebuildTimer);
    pdfWatcherRebuildTimer = null;
  }
}

function schedulePdfScan(): void {
  pdfScanPending = true;
  if (pdfScanTimer) clearTimeout(pdfScanTimer);
  pdfScanTimer = setTimeout(() => {
    pdfScanTimer = null;
    if (!pdfScanPending) return;
    pdfScanPending = false;
    rescanPdfRepoAndNotify();
  }, 800);
}

async function rescanPdfRepoAndNotify(): Promise<void> {
  const repo = pdfRepoPath;
  if (!repo) return;
  try {
    if (!isValidVaultDir(repo)) return;
    if (pdfWatchers.length === 0) watchPdfRepo(repo);
    const { upsert, deletePaths, deletedRows } = await scanPdfRepoIncremental(repo);
    if (upsert.length === 0 && deletePaths.length === 0) return;
    syncPdfDocuments(repo, upsert, deletePaths);
    for (const row of deletedRows) removePdfCoverFile(row.id);
    const changes = {
      upserted: getPdfDocumentsByPaths(repo, upsert.map((doc) => doc.path)),
      deleted: deletePaths,
    };
    mainWindow?.webContents.send("pdf:updated", repo, changes);
  } catch { /* watcher-triggered scans are best-effort */ }
}

function handlePdfWatcherError(repoPath: string): void {
  unwatchPdfRepo();
  if (pdfWatcherRebuildTimer) return;
  pdfWatcherRebuildTimer = setTimeout(() => {
    pdfWatcherRebuildTimer = null;
    if (!isValidVaultDir(repoPath)) return;
    watchPdfRepo(repoPath);
    rescanPdfRepoAndNotify();
  }, 2000);
}

function watchPdfRepo(repoPath: string): void {
  unwatchPdfRepo();
  const onChange = (_event: string, filename: string | null) => {
    if (filename) {
      const segments = filename.split(/[\\/]/);
      if (segments.some((s) => s.startsWith("."))) return;
      if (!filename.toLowerCase().endsWith(".pdf")) return;
    }
    schedulePdfScan();
  };
  const onError = () => handlePdfWatcherError(repoPath);

  const watchers: fs.FSWatcher[] = [];
  const addWatcher = (dir: string, recursive: boolean) => {
    try {
      const w = recursive ? fs.watch(dir, { recursive: true }, onChange) : fs.watch(dir, onChange);
      w.on("error", onError);
      watchers.push(w);
    } catch { /* ignore */ }
  };

  addWatcher(repoPath, true);
  if (watchers.length === 0) {
    const dirs: string[] = [repoPath];
    const queue = [repoPath];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".")) {
          const sub = path.join(dir, e.name);
          dirs.push(sub);
          queue.push(sub);
        }
      }
    }
    for (const dir of dirs) addWatcher(dir, false);
  }
  pdfWatchers = watchers;
}

async function applyPdfRepo(repoPath: string): Promise<{ ok: boolean; exists: boolean; count: number; changed: number }> {
  const repo = repoPath.trim();
  if (!repo) {
    pdfRepoPath = null;
    unwatchPdfRepo();
    return { ok: true, exists: false, count: 0, changed: 0 };
  }
  if (!isValidVaultDir(repo)) {
    pdfRepoPath = null;
    unwatchPdfRepo();
    return { ok: false, exists: false, count: 0, changed: 0 };
  }

  pdfRepoPath = path.resolve(repo);
  watchPdfRepo(pdfRepoPath);
  const { upsert, deletePaths, totalCount, deletedRows } = await scanPdfRepoIncremental(pdfRepoPath);
  syncPdfDocuments(pdfRepoPath, upsert, deletePaths);
  for (const row of deletedRows) removePdfCoverFile(row.id);
  mainWindow?.webContents.send("pdf:updated", pdfRepoPath);
  return { ok: true, exists: true, count: totalCount, changed: upsert.length + deletePaths.length };
}

// ---- IPC Handlers ----

function searchResultLimit(): number {
  const n = Number(getSetting("search_result_limit"));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
}

// Vault-relative attachment folder. Rejects absolute paths and ".." segments
// so a bad setting can never write outside the vault.
function resolveAttachmentsDir(): string {
  const raw = (getSetting("attachments_dir") ?? "").replace(/\\/g, "/").trim();
  const segs = raw.split("/").filter((s) => s && s !== ".");
  if (segs.length === 0 || segs.includes("..") || path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    return "attachments";
  }
  return segs.join("/");
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function attachmentTarget(vaultPath: string, safeExt: string): { filePath: string; ref: string } {
  const relDir = resolveAttachmentsDir();
  const dir = path.join(vaultPath, ...relDir.split("/"));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let name = `${stamp}.${safeExt}`;
  let filePath = path.join(dir, name);
  let counter = 2;
  while (fs.existsSync(filePath)) {
    name = `${stamp}-${counter}.${safeExt}`;
    filePath = path.join(dir, name);
    counter++;
  }
  return { filePath, ref: `${relDir}/${name}` };
}

// Writes one attachment into the vault's attachment folder and returns the
// vault-relative ref (forward slashes).
function persistAttachment(vaultPath: string, safeExt: string, data: Buffer): string {
  const { filePath, ref } = attachmentTarget(vaultPath, safeExt);
  fs.writeFileSync(filePath, data);
  return ref;
}

function persistPrivateAttachment(vaultPath: string, safeExt: string, data: Buffer): Promise<string> {
  markPrivateWrite(vaultPath);
  return withVaultKey(vaultPath, async (dek) => {
    const { filePath, ref } = attachmentTarget(vaultPath, safeExt);
    await writeEncryptedFile(filePath, dek, data);
    return ref;
  });
}

// Legacy project docs used to live under <vault>/Projects/<project>/. New
// project links point at regular library files, but those folders stay readable
// so existing canvases keep working (and survive project deletion).
const LEGACY_PROJECT_DIR = "Projects";

// Mind-map documents live in a vault-relative folder (default "canvases") as
// plain JSON. The same sanitizing rules as attachments keep a bad setting from
// escaping the vault.
function resolveCanvasDir(vaultPath: string): string {
  const raw = (getSetting("canvas_dir") ?? "").replace(/\\/g, "/").trim();
  const segs = raw.split("/").filter((s) => s && s !== ".");
  if (segs.length === 0 || segs.includes("..") || path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    return path.join(vaultPath, "canvases");
  }
  return path.join(vaultPath, ...segs);
}

function legacyProjectDocsDir(vaultPath: string): string {
  return path.join(vaultPath, LEGACY_PROJECT_DIR);
}

function isAllowedCanvasPath(vaultPath: string, filePath: string): boolean {
  return (
    isPathInside(resolveCanvasDir(vaultPath), filePath) ||
    isPathInside(legacyProjectDocsDir(vaultPath), filePath)
  );
}

function canvasTitle(filePath: string): string {
  return path.basename(filePath).replace(/\.json$/i, "");
}

// Every canvas read/write must resolve to a .json file inside the owning
// vault's canvas folder or the legacy Projects/ tree.
function assertCanvasFile(filePath: string): string {
  const vaultPath = findOwningVault(filePath);
  if (!vaultPath) throw new Error("CANVAS_OUTSIDE_VAULT");
  if (!filePath.toLowerCase().endsWith(".json")) throw new Error("CANVAS_INVALID");
  if (!isAllowedCanvasPath(vaultPath, filePath)) {
    throw new Error("CANVAS_OUTSIDE_VAULT");
  }
  return vaultPath;
}

function listCanvasFiles(vaultPath: string): CanvasFile[] {
  const files = new Map<string, CanvasFile>();
  const addDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      const filePath = path.join(dir, entry.name);
      files.set(normalizePathKey(filePath), {
        path: filePath,
        title: canvasTitle(filePath),
        modifiedAt: fs.statSync(filePath).mtimeMs,
      });
    }
  };

  addDir(resolveCanvasDir(vaultPath));
  // Legacy project folders are discovered from disk, not from a DB mapping, so
  // they remain visible after the project row is gone.
  const legacyRoot = legacyProjectDocsDir(vaultPath);
  if (fs.existsSync(legacyRoot)) {
    for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) addDir(path.join(legacyRoot, entry.name));
    }
  }
  return Array.from(files.values()).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

function uniqueCanvasName(dir: string, title: string): { path: string; title: string } {
  const safeName = title.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
  let fileName = `${safeName}.json`;
  let filePath = path.join(dir, fileName);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    fileName = `${safeName} ${counter}.json`;
    filePath = path.join(dir, fileName);
    counter++;
  }
  return { path: filePath, title: counter > 1 ? `${safeName} ${counter - 1}` : safeName };
}

// Index a vault at most once per app run; concurrent callers share the scan.
// Private vaults are never indexed, so this only counts their files.
async function ensureVaultIndex(vaultPath: string): Promise<number> {
  // Refuse to scan a missing/unreadable path — the empty walk would
  // otherwise wipe this vault's entire index from the DB
  if (!isValidVaultDir(vaultPath)) {
    throw new Error("VAULT_NOT_FOUND");
  }
  watchedVaults.add(vaultPath);
  if (!vaultWatchers.has(vaultPath)) watchVault(vaultPath);
  // Private vaults are never indexed. Return a file count so the workspace
  // can finish hydrating whether the vault is locked or unlocked.
  if (isPrivateVault(vaultPath)) {
    return listNoteFiles(vaultPath, privateVaultRoots()).length;
  }
  const key = normalizePathKey(vaultPath);
  const pending = vaultScanInFlight.get(key);
  if (pending) return pending;
  const cached = vaultScanDone.get(key);
  if (cached !== undefined) return cached;
  const scan = (async () => {
    const { upsert, deletePaths, totalCount } = await scanVaultIncremental(vaultPath, privateVaultRoots());
    syncVaultNotes(vaultPath, upsert, deletePaths);
    vaultScanDone.set(key, totalCount);
    return totalCount;
  })();
  vaultScanInFlight.set(key, scan);
  try {
    return await scan;
  } finally {
    vaultScanInFlight.delete(key);
  }
}

async function createNoteFile(
  vaultPath: string,
  targetDir: string,
  title: string,
): Promise<VaultNote> {
  const isPrivate = isPrivateVault(vaultPath);
  if (isPrivate) requireUnlocked(vaultPath);
  if (!isPathInside(vaultPath, targetDir)) throw new Error("NOTE_OUTSIDE_VAULT");
  const safeName = title.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  let fileName = `${safeName}.md`;
  let filePath = path.join(targetDir, fileName);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    fileName = `${safeName} ${counter}.md`;
    filePath = path.join(targetDir, fileName);
    counter++;
  }
  const finalTitle = counter > 1 ? `${safeName} ${counter - 1}` : safeName;
  const content = `# ${finalTitle}\n\n`;
  if (isPrivate) {
    markPrivateWrite(vaultPath);
    return withVaultKey(vaultPath, async (dek) => {
      const { modified_at } = await writeEncryptedFile(filePath, dek, content);
      return {
        id: syntheticNoteId(filePath),
        vault_path: vaultPath,
        path: filePath,
        title: finalTitle,
        content,
        tags: "",
        modified_at,
      };
    });
  }
  const now = new Date().toISOString();
  fs.writeFileSync(filePath, content, "utf-8");
  const tags = Array.from(extractTags(content)).join(" ");
  const note = insertNote({
    vault_path: vaultPath,
    path: filePath,
    title: finalTitle,
    content,
    tags,
    modified_at: now,
  });
  // The note library is frequently mounted (hidden) while another module creates
  // a note (project docs, link creation). Without this push its cached list stays
  // stale until the folder is rescanned.
  const upserted = getNoteBriefsByPaths(vaultPath, [note.path]);
  if (upserted.length > 0) {
    mainWindow?.webContents.send("vault:updated", vaultPath, { upserted, deleted: [] });
  }
  return note;
}

async function createCanvasFile(
  vaultPath: string,
  dir: string,
  title: string,
  templateJson: string,
): Promise<CanvasFile> {
  if (!isPathInside(vaultPath, dir)) throw new Error("CANVAS_OUTSIDE_VAULT");
  if (isPrivateVault(vaultPath)) {
    requireUnlocked(vaultPath);
    markPrivateWrite(vaultPath);
    return withVaultKey(vaultPath, async (dek) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const target = uniqueCanvasName(dir, title);
      const { mtimeMs } = await writeEncryptedFile(target.path, dek, templateJson);
      return { path: target.path, title: target.title, modifiedAt: mtimeMs };
    });
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = uniqueCanvasName(dir, title);
  fs.writeFileSync(target.path, templateJson, "utf-8");
  const stat = fs.statSync(target.path);
  return { path: target.path, title: target.title, modifiedAt: stat.mtimeMs };
}

function toGtdProjectLink(row: GtdProjectLinkRow): GtdProjectLink {
  const owner = findOwningVault(row.file_path);
  const exists = fs.existsSync(row.file_path);
  const validKind =
    row.kind === "note"
      ? row.file_path.toLowerCase().endsWith(".md")
      : row.file_path.toLowerCase().endsWith(".json") &&
        !!owner &&
        isAllowedCanvasPath(owner, row.file_path);
  return {
    id: row.id,
    kind: row.kind,
    vaultPath: owner ?? row.vault_path,
    filePath: row.file_path,
    title: row.title,
    missing: !exists || !owner || !validKind,
  };
}

function getGtdProjectDocsPayload(projectId: number): GtdProjectDocsPayload {
  return {
    links: getGtdProjectLinks(projectId).map(toGtdProjectLink),
  };
}

function registerIpcHandlers(): void {
  // Resources
  ipcMain.handle("resources:add", (_e, url: string, title: string, tags: string[], notes: string) => {
    return addResource(url, title, tags, notes);
  });

  ipcMain.handle("resources:list", () => getResources());

  ipcMain.handle("resources:update", (_e, id: number, url: string, title: string, tags: string[], notes: string) => {
    return updateResource(id, url, title, tags, notes);
  });

  ipcMain.handle("resources:delete", (_e, id: number) => deleteResource(id));

  ipcMain.handle("resources:search", (_e, query: string) => searchResources(query, searchResultLimit()));

  ipcMain.handle("resources:reorder", (_e, orderedIds: number[]) => reorderResources(orderedIds));

  ipcMain.handle("fetch:title", async (_e, url: string) => fetchPageTitle(url));

  // Vault notes
  ipcMain.handle("vault:set-path", (_e, vaultPath: string) => ensureVaultIndex(vaultPath));

  // One round-trip for the startup path: index (if needed), then the note
  // briefs, collection sidecar and canvas list for a single vault.
  ipcMain.handle("vault:library-summary", async (_e, vaultPath: string) => {
    await ensureVaultIndex(vaultPath);
    if (isPrivateVault(vaultPath)) requireUnlocked(vaultPath);
    return {
      notes: isPrivateVault(vaultPath) ? privateNoteBriefs(vaultPath) : getNoteList(vaultPath),
      collections: readSidecar(path.join(vaultPath, ".prism"), "collections.json"),
      canvases: listCanvasFiles(vaultPath),
    };
  });

  ipcMain.handle("vault:unwatch-path", (_e, vaultPath: string) => {
    watchedVaults.delete(vaultPath);
    unwatchVault(vaultPath);
    vaultScanDone.delete(normalizePathKey(vaultPath));
    vaultScanInFlight.delete(normalizePathKey(vaultPath));
  });

  ipcMain.handle("vault:list-brief", (_e, vaultPath: string) => {
    if (isPrivateVault(vaultPath)) {
      requireUnlocked(vaultPath);
      return privateNoteBriefs(vaultPath);
    }
    return getNoteList(vaultPath);
  });

  // Search never touches private vaults — no index, no plaintext, no titles.
  ipcMain.handle("vault:search", (_e, vaultPath: string, query: string) => {
    if (isPrivateVault(vaultPath)) return [];
    return searchNotes(vaultPath, query, searchResultLimit());
  });

  ipcMain.handle("vault:search-content", (_e, vaultPath: string, query: string) => {
    if (isPrivateVault(vaultPath)) return [];
    return searchNoteContents(vaultPath, query, searchResultLimit());
  });

  ipcMain.handle("vault:delete-notes", (_e, paths: string[]) => {
    for (const p of paths) {
      const owner = findOwningVault(p);
      if (owner) requireUnlocked(owner);
    }
    deleteNotesByPaths(paths);
  });

  ipcMain.handle("vault:create-note", async (_e, vaultPath: string, title: string) => {
    const defaultDir = getSetting("default_notes_dir") || "";
    const targetDir = defaultDir ? path.join(vaultPath, defaultDir) : vaultPath;
    return createNoteFile(vaultPath, targetDir, title);
  });

  ipcMain.handle("vault:rename-note", async (_e, vaultPath: string, oldPath: string, newTitle: string) => {
    const isPrivate = isPrivateVault(vaultPath);
    if (isPrivate) requireUnlocked(vaultPath);
    const safeName = newTitle.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
    const dir = path.dirname(oldPath);
    let newPath = path.join(dir, `${safeName}.md`);
    let counter = 1;
    while (fs.existsSync(newPath) && !isSamePath(newPath, oldPath)) {
      newPath = path.join(dir, `${safeName} ${counter}.md`);
      counter++;
    }
    const finalTitle = counter > 1 ? `${safeName} ${counter - 1}` : safeName;
    if (newPath !== oldPath) {
      fs.renameSync(oldPath, newPath);
    }
    if (isPrivate) {
      // Not indexed, but project links may point at this path — keep them in sync.
      markPrivateWrite(vaultPath);
      renameNoteEntry(oldPath, newPath, finalTitle);
      const stat = await fs.promises.stat(newPath);
      return {
        id: syntheticNoteId(newPath),
        vault_path: vaultPath,
        path: newPath,
        title: finalTitle,
        content: "",
        tags: "",
        modified_at: stat.mtime.toISOString(),
      };
    }
    const updated = renameNoteInDb(oldPath, newPath, finalTitle);
    renameNoteEntry(oldPath, newPath, finalTitle);
    if (updated) return updated;
    // Note wasn't indexed yet (e.g. created externally) — index it now
    const content = fs.readFileSync(newPath, "utf-8");
    const tags = Array.from(extractTags(content)).join(" ");
    const stat = fs.statSync(newPath);
    return insertNote({ vault_path: vaultPath, path: newPath, title: finalTitle, content, tags, modified_at: stat.mtime.toISOString() });
  });

  ipcMain.handle("vault:read-note", async (_e, filePath: string) => {
    const vaultPath = findOwningVault(filePath);
    if (!vaultPath) throw new Error("NOTE_OUTSIDE_VAULT");
    if (isPrivateVault(vaultPath)) {
      return withVaultKey(vaultPath, async (dek) => {
        const content = await readEncryptedText(filePath, dek);
        const stat = await fs.promises.stat(filePath);
        return {
          path: filePath,
          title: path.basename(filePath).replace(/\.md$/i, ""),
          content,
          modified_at: stat.mtime.toISOString(),
        };
      });
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    const stat = await fs.promises.stat(filePath);
    return {
      path: filePath,
      title: path.basename(filePath).replace(/\.md$/i, ""),
      content,
      modified_at: stat.mtime.toISOString(),
    };
  });

  ipcMain.handle("vault:save-note", async (_e, filePath: string, content: string) => {
    const vaultPath = findOwningVault(filePath);
    if (!vaultPath) throw new Error("NOTE_OUTSIDE_VAULT");
    if (isPrivateVault(vaultPath)) {
      markPrivateWrite(vaultPath);
      return withVaultKey(vaultPath, async (dek) => {
        const { modified_at } = await writeEncryptedFile(filePath, dek, content);
        return { modified_at };
      });
    }
    await fs.promises.writeFile(filePath, content, "utf-8");
    // Store the file's real mtime so the watcher's incremental scan compares
    // equal and skips re-reading — no save→rescan→vault-updated loop
    const stat = await fs.promises.stat(filePath);
    const modified_at = stat.mtime.toISOString();
    const tags = Array.from(extractTags(content)).join(" ");
    syncVaultNotes(vaultPath, [{
      path: filePath,
      title: path.basename(filePath).replace(/\.md$/i, ""),
      content,
      tags,
      modified_at,
    }], []);
    return { modified_at };
  });

  // Pasted editor images → <vault>/<attachments_dir>/<YYYY-MM-DD-HHmmss>.<ext>.
  // Space-free names keep standard ![](path) links clean (no <> wrapping).
  // Returns the vault-relative ref (forward slashes).
  ipcMain.handle("vault:save-attachment", async (_e, vaultPath: string, ext: string, data: Uint8Array) => {
    if (!findOwningVault(vaultPath)) throw new Error("NOTE_OUTSIDE_VAULT");
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ASSET_MIME[safeExt]) throw new Error("UNSUPPORTED_TYPE");
    const bytes = Buffer.from(data);
    if (isPrivateVault(vaultPath)) {
      requireUnlocked(vaultPath);
      return persistPrivateAttachment(vaultPath, safeExt, bytes);
    }
    return persistAttachment(vaultPath, safeExt, bytes);
  });

  // "Insert image" picks a file from disk and copies it into the vault, so the
  // note gets the same ![[...]] ref a paste would produce.
  ipcMain.handle("vault:pick-attachment", async (_e, vaultPath: string) => {
    if (!findOwningVault(vaultPath)) throw new Error("NOTE_OUTSIDE_VAULT");
    if (isPrivateVault(vaultPath)) requireUnlocked(vaultPath);
    if (!mainWindow) return null;
    const imageExts = Object.keys(ASSET_MIME).filter((ext) => ASSET_MIME[ext].startsWith("image/"));
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      title: "Select Image",
      filters: [{ name: "Images", extensions: imageExts }],
    });
    const source = result.canceled ? null : result.filePaths[0];
    if (!source) return null;
    const ext = path.extname(source).slice(1).toLowerCase();
    if (!ASSET_MIME[ext] || !ASSET_MIME[ext].startsWith("image/")) throw new Error("UNSUPPORTED_TYPE");
    const stat = await fs.promises.stat(source);
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error("FILE_TOO_LARGE");
    const bytes = await fs.promises.readFile(source);
    if (isPrivateVault(vaultPath)) return persistPrivateAttachment(vaultPath, ext, bytes);
    return persistAttachment(vaultPath, ext, bytes);
  });

  // Mind-map / canvas documents (plain JSON, no database index)
  ipcMain.handle("canvas:list", (_e, vaultPath: string) => {
    if (!findOwningVault(vaultPath)) throw new Error("CANVAS_OUTSIDE_VAULT");
    return listCanvasFiles(vaultPath);
  });

  ipcMain.handle("canvas:read", async (_e, canvasPath: string) => {
    const vaultPath = assertCanvasFile(canvasPath);
    if (isPrivateVault(vaultPath)) {
      return withVaultKey(vaultPath, async (dek) => {
        const json = await readEncryptedText(canvasPath, dek);
        const stat = await fs.promises.stat(canvasPath);
        return { path: canvasPath, title: canvasTitle(canvasPath), json, modifiedAt: stat.mtimeMs };
      });
    }
    const json = await fs.promises.readFile(canvasPath, "utf-8");
    const stat = await fs.promises.stat(canvasPath);
    return { path: canvasPath, title: canvasTitle(canvasPath), json, modifiedAt: stat.mtimeMs };
  });

  ipcMain.handle("canvas:save", async (_e, canvasPath: string, json: string, expectedModifiedAt: number | null) => {
    const vaultPath = assertCanvasFile(canvasPath);
    if (isPrivateVault(vaultPath)) {
      if (!fs.existsSync(canvasPath)) throw new Error("CANVAS_MISSING");
      return withVaultKey(vaultPath, async (dek) => {
        const stat = await fs.promises.stat(canvasPath);
        if (expectedModifiedAt !== null && Math.abs(stat.mtimeMs - expectedModifiedAt) > 0.5) {
          return { conflict: true, modifiedAt: stat.mtimeMs } satisfies CanvasSaveResult;
        }
        markPrivateWrite(vaultPath);
        const { mtimeMs } = await writeEncryptedFile(canvasPath, dek, json);
        return { modifiedAt: mtimeMs } satisfies CanvasSaveResult;
      });
    }
    if (!fs.existsSync(canvasPath)) throw new Error("CANVAS_MISSING");
    const stat = await fs.promises.stat(canvasPath);
    if (expectedModifiedAt !== null && Math.abs(stat.mtimeMs - expectedModifiedAt) > 0.5) {
      return { conflict: true, modifiedAt: stat.mtimeMs } satisfies CanvasSaveResult;
    }
    // Write to a unique sibling temp file first so a crash mid-write cannot
    // leave a truncated document behind, and two saves racing (autosave plus
    // an unmount flush) never write the same temp path.
    const tempPath = `${canvasPath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await fs.promises.writeFile(tempPath, json, "utf-8");
      await fs.promises.rename(tempPath, canvasPath);
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw error;
    }
    const next = await fs.promises.stat(canvasPath);
    return { modifiedAt: next.mtimeMs } satisfies CanvasSaveResult;
  });

  ipcMain.handle("canvas:create", async (_e, vaultPath: string, title: string, templateJson: string) => {
    if (!findOwningVault(vaultPath)) throw new Error("CANVAS_OUTSIDE_VAULT");
    return createCanvasFile(vaultPath, resolveCanvasDir(vaultPath), title, templateJson);
  });

  ipcMain.handle("canvas:rename", (_e, canvasPath: string, newTitle: string) => {
    assertCanvasFile(canvasPath);
    const dir = path.dirname(canvasPath);
    const safeName = newTitle.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
    let newPath = path.join(dir, `${safeName}.json`);
    let counter = 1;
    while (fs.existsSync(newPath) && !isSamePath(newPath, canvasPath)) {
      newPath = path.join(dir, `${safeName} ${counter}.json`);
      counter++;
    }
    const finalTitle = counter > 1 ? `${safeName} ${counter - 1}` : safeName;
    if (!isSamePath(newPath, canvasPath)) {
      fs.renameSync(canvasPath, newPath);
    }
    renameGtdProjectLinkPath(canvasPath, newPath, finalTitle);
    const stat = fs.statSync(newPath);
    return { path: newPath, title: finalTitle, modifiedAt: stat.mtimeMs };
  });

  // Open URL
  ipcMain.handle("resources:open-url", (_e, url: string) => {
    const browserPath = getSetting("browser_path");
    if (browserPath && fs.existsSync(browserPath)) {
      spawn(browserPath, [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      shell.openExternal(url);
    }
  });

  // Settings
  ipcMain.handle("settings:get", (_e, key: string) => getSetting(key));
  ipcMain.handle("settings:set", (_e, key: string, value: string) => {
    setSetting(key, value);
    if (key === "vault_paths") vaultPathsCache = null;
    // Repo changes must re-arm the watcher and rescan; do it after persisting
    // so a crash mid-scan still leaves the user's choice saved.
    if (key === "pdf_repo_path") {
      void applyPdfRepo(value).catch(() => { /* surfaced via pdf:get-state */ });
    }
    if (key === "private_lock_minutes") refreshIdleTimers();
    if (key === "shortcuts") applyGlobalShortcuts();
    if (key === "auto_launch" || key === "auto_launch_hidden") applyAutoLaunch();
    if (key === "close_behavior" || key === "auto_launch" || key === "auto_launch_hidden") syncTray();
  });
  ipcMain.handle("settings:get-all", () => getAllSettings());
  ipcMain.handle("app:get-launch-state", (): AppLaunchState => launchState());
  ipcMain.handle("app:set-color-mode", (_e, mode: string) => applyNativeColorMode(mode));
  nativeTheme.on("updated", () => {
    if (resolveColorScheme(getSetting("color_mode")) === "system") applyNativeColorMode("system");
  });

  // Tags
  ipcMain.handle("tags:list", () => getAllTags());
  ipcMain.handle("tags:reorder", (_e, orderedNames: string[]) => reorderTags(orderedNames));
  ipcMain.handle("tags:set-color", (_e, name: string, color: string) => setTagColor(name, color));
  ipcMain.handle("tags:rename", (_e, oldName: string, newName: string) => renameTag(oldName, newName));
  ipcMain.handle("tags:delete", (_e, name: string) => deleteTag(name));

  // GTD
  ipcMain.handle("gtd:open-tasks", () => getGtdOpenTasks());
  ipcMain.handle("gtd:completed-tasks", (_e, limit?: number) => getGtdCompletedTasks(limit ?? 200));
  ipcMain.handle("gtd:project-tasks", (_e, projectId: number) => getGtdProjectTasks(projectId));
  ipcMain.handle("gtd:projects", (_e, archived: boolean) => getGtdProjects(archived));
  ipcMain.handle(
    "gtd:add-task",
    (_e, title: string, projectId: number | null = null, scheduledDate: string | null = null) =>
      addGtdTask(title, projectId, scheduledDate),
  );
  ipcMain.handle("gtd:update-task", (_e, id: number, patch: GtdTaskPatch) => updateGtdTask(id, patch));
  ipcMain.handle("gtd:complete-task", (_e, id: number) => completeGtdTask(id));
  ipcMain.handle("gtd:reopen-task", (_e, id: number) => reopenGtdTask(id));
  ipcMain.handle("gtd:delete-task", (_e, id: number) => deleteGtdTask(id));
  ipcMain.handle("gtd:clear-completed", () => clearCompletedGtdTasks());
  ipcMain.handle("gtd:reorder-project-tasks", (_e, projectId: number, orderedIds: number[]) => reorderGtdProjectTasks(projectId, orderedIds));
  ipcMain.handle("gtd:reorder-inbox", (_e, orderedIds: number[]) =>
    reorderGtdInboxTasks(Array.isArray(orderedIds) ? orderedIds.map(Number) : []),
  );
  ipcMain.handle("gtd:reorder-projects", (_e, orderedIds: number[]) =>
    reorderGtdProjects(Array.isArray(orderedIds) ? orderedIds.map(Number) : []),
  );
  ipcMain.handle("gtd:add-project", (_e, title: string) => addGtdProject(title));
  ipcMain.handle("gtd:update-project", (_e, id: number, patch: { title?: string; description?: string; color?: string }) => updateGtdProject(id, patch));
  ipcMain.handle("gtd:archive-project", (_e, id: number, archived: boolean) => setGtdProjectArchived(id, archived));
  ipcMain.handle("gtd:delete-project", (_e, id: number) => deleteGtdProject(id));

  ipcMain.handle("gtd:project-docs", (_e, projectId: number) => getGtdProjectDocsPayload(projectId));
  ipcMain.handle("gtd:project-link-index", () => getGtdProjectLinkIndex());

  ipcMain.handle(
    "gtd:set-project-link",
    (_e, projectId: number, kind: GtdProjectLinkKind, filePath: string, title: string) => {
      if (kind !== "note" && kind !== "canvas") throw new Error("INVALID_PROJECT_LINK_KIND");
      const project = getGtdProject(projectId);
      if (project.archivedAt) throw new Error("GTD project is archived");
      const vaultPath = findOwningVault(filePath);
      if (!vaultPath) throw new Error("FILE_OUTSIDE_VAULT");
      if (!fs.existsSync(filePath)) throw new Error("FILE_MISSING");
      if (kind === "note") {
        if (!filePath.toLowerCase().endsWith(".md")) throw new Error("INVALID_NOTE_FILE");
      } else {
        assertCanvasFile(filePath);
      }
      const cleanTitle = title?.trim() || path.basename(filePath, path.extname(filePath));
      return toGtdProjectLink(
        setGtdProjectLink(projectId, kind, vaultPath, filePath, cleanTitle),
      );
    },
  );

  ipcMain.handle("gtd:remove-project-link", (_e, linkId: number) => removeGtdProjectLink(linkId));

  // Global shortcuts: registration state feeds the "could not register"
  // warning in the shortcuts settings. The capture popup itself is opened by
  // the OS shortcut or by the renderer fallback below.
  ipcMain.handle("shortcuts:get-global-status", (): GlobalShortcutStatus => ({
    ...registeredGlobalShortcuts,
  }));
  ipcMain.handle("quick-capture:open", () => showQuickCaptureWindow());
  // Let the invoke reply reach the popup before destroying its window.
  ipcMain.handle("quick-capture:close", () => {
    setImmediate(() => closeQuickCaptureWindow());
  });
  ipcMain.handle("quick-capture:submit", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("quick-capture:saved");
    }
    setImmediate(() => closeQuickCaptureWindow());
  });

  // Private vaults
  ipcMain.handle("vault:privacy-statuses", () => privacyStatuses());

  ipcMain.handle("vault:unlock", async (_e, vaultPath: string, password: string) => {
    await unlockVault(vaultPath, String(password ?? ""));
  });

  ipcMain.handle("vault:lock", async (_e, vaultPath: string) => {
    await lockVault(vaultPath);
  });

  ipcMain.handle("vault:touch", () => touchAllVaults());

  ipcMain.handle("vaults:update-meta", (_e, vaultPath: string, patch: { private?: boolean }) => {
    if (!findOwningVault(vaultPath)) throw new Error("VAULT_NOT_FOUND");
    if (typeof patch?.private === "boolean") setVaultPrivateFlag(vaultPath, patch.private);
  });

  const migrationProgress = (vaultPath: string) => (done: number, total: number) => {
    mainWindow?.webContents.send("vault:migration-progress", { vaultPath, done, total });
  };

  // Nested private vaults keep their own keys — skip them when (en|de)crypting
  // this vault so their files are never mixed into this vault's format.
  const nestedPrivateRoots = (vaultPath: string) => {
    const self = normalizeVaultPath(vaultPath);
    return privateVaultRoots().filter((root) => normalizeVaultPath(root) !== self);
  };

  ipcMain.handle("vault:make-private", async (_e, vaultPath: string, password: string) => {
    if (!isValidVaultDir(vaultPath)) throw new Error("VAULT_NOT_FOUND");
    const result = await makeVaultPrivate(
      vaultPath,
      String(password ?? ""),
      resolveAttachmentsDir(),
      resolveCanvasDir(vaultPath),
      nestedPrivateRoots(vaultPath),
      migrationProgress(vaultPath),
    );
    purgeVaultNotes(vaultPath);
    setVaultPrivateFlag(vaultPath, true);
    await dropSession(vaultPath);
    mainWindow?.webContents.send("vault:privacy-changed", { path: vaultPath, ...privacyStatus(vaultPath) });
    return result;
  });

  ipcMain.handle("vault:make-public", async (_e, vaultPath: string) => {
    if (!isPrivateVault(vaultPath)) throw new Error("NOT_PRIVATE");
    const result = await makeVaultPublic(
      vaultPath,
      resolveAttachmentsDir(),
      resolveCanvasDir(vaultPath),
      nestedPrivateRoots(vaultPath),
      migrationProgress(vaultPath),
    );
    await dropSession(vaultPath);
    setVaultPrivateFlag(vaultPath, false);
    // Contents are readable again — rebuild the search index.
    const { upsert, deletePaths } = await scanVaultIncremental(vaultPath, privateVaultRoots());
    syncVaultNotes(vaultPath, upsert, deletePaths);
    mainWindow?.webContents.send("vault:privacy-changed", { path: vaultPath, ...privacyStatus(vaultPath) });
    mainWindow?.webContents.send("vault:updated", vaultPath);
    return result;
  });

  ipcMain.handle("vault:change-password", async (_e, vaultPath: string, currentPassword: string, newPassword: string) => {
    await changeVaultPassword(vaultPath, String(currentPassword ?? ""), String(newPassword ?? ""));
  });

  // Note collections
  ipcMain.handle("note-collections:load", (_e, vaultPath: string) => {
    requireVaultRoot(vaultPath);
    return readSidecar(path.join(vaultPath, ".prism"), "collections.json");
  });

  ipcMain.handle("note-collections:save", (_e, vaultPath: string, data: any) => {
    requireVaultRoot(vaultPath);
    writeSidecar(path.join(vaultPath, ".prism"), "collections.json", data);
  });

  // Canvas groups — one virtual "mind maps" collection per vault.
  ipcMain.handle("canvas-groups:load", (_e, vaultPath: string) => {
    requireVaultRoot(vaultPath);
    return readSidecar(path.join(vaultPath, ".prism"), "canvas-groups.json");
  });

  ipcMain.handle("canvas-groups:save", (_e, vaultPath: string, data: any) => {
    requireVaultRoot(vaultPath);
    writeSidecar(path.join(vaultPath, ".prism"), "canvas-groups.json", data);
  });

  // PDF library
  ipcMain.handle("pdf:get-state", () => {
    const repoPath = currentPdfRepo();
    const exists = repoPath ? isValidVaultDir(repoPath) : false;
    const count = repoPath && exists ? listPdfDocuments(path.resolve(repoPath)).length : 0;
    return { repoPath: repoPath ?? "", exists, count };
  });

  ipcMain.handle("pdf:choose-repo", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select PDF Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("pdf:open-repo", async (_e, repoPath: string) => {
    const repo = (repoPath || currentPdfRepo() || "").trim();
    if (!repo || !isValidVaultDir(repo)) return;
    await shell.openPath(path.resolve(repo));
  });

  ipcMain.handle("pdf:rescan", async () => {
    const repo = currentPdfRepo();
    if (!repo) return { total: 0, changed: 0 };
    const result = await applyPdfRepo(repo);
    return { total: result.count, changed: result.changed };
  });

  ipcMain.handle("pdf:list", () => {
    return pdfRepoPath ? listPdfDocuments(pdfRepoPath) : [];
  });

  // Note embeds resolve one target at a time — a repo-wide list would ship
  // every PDF row over IPC just to render one cover card.
  ipcMain.handle("pdf:resolve-embed", (_e, target: string) => {
    if (!pdfRepoPath || typeof target !== "string") return null;
    const rel = target.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel) return null;
    const withExt = /\.pdf$/i.test(rel) ? rel : `${rel}.pdf`;
    return findPdfDocumentByRelPath(pdfRepoPath, rel)
      ?? findPdfDocumentByRelPath(pdfRepoPath, withExt)
      ?? findPdfDocumentByTitle(pdfRepoPath, rel.replace(/\.pdf$/i, ""));
  });

  ipcMain.handle("pdf:save-cover", (_e, id: number, jpeg: Uint8Array, pageCount: number | null) => {
    const doc = resolvePdfDocument(id);
    if (!doc) throw new Error("PDF_NOT_FOUND");
    const file = pdfCoverFile(id);
    fs.writeFileSync(file, Buffer.from(jpeg));
    return { coverVersion: updatePdfCover(id, file, pageCount) };
  });

  ipcMain.handle("pdf:choose-cover", async (_e, id: number) => {
    const doc = resolvePdfDocument(id);
    if (!doc || !mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      title: "Select Cover Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const image = nativeImage.createFromPath(result.filePaths[0]);
    if (image.isEmpty()) return null;
    const resized = image.resize({ width: 480 });
    const file = pdfCoverFile(id);
    fs.writeFileSync(file, resized.toJPEG(85));
    return { coverVersion: setPdfCustomCover(id, file) };
  });

  ipcMain.handle("pdf:reset-cover", (_e, id: number) => {
    if (!resolvePdfDocument(id)) throw new Error("PDF_NOT_FOUND");
    return { coverVersion: resetPdfCover(id) };
  });

  ipcMain.handle("pdf:set-page-count", (_e, id: number, pageCount: number) => {
    if (!resolvePdfDocument(id) || !Number.isFinite(pageCount) || pageCount < 0) return;
    setPdfPageCount(id, Math.floor(pageCount));
  });

  ipcMain.handle("pdf:delete-documents", async (_e, ids: number[]) => {
    const results: { id: number; success: boolean; error?: string }[] = [];
    for (const id of ids) {
      const doc = resolvePdfDocument(id);
      if (!doc) {
        results.push({ id, success: false, error: "PDF_NOT_FOUND" });
        continue;
      }
      try {
        await shell.trashItem(doc.path);
        deletePdfDocuments([id]);
        removePdfCoverFile(id);
        results.push({ id, success: true });
      } catch (e: any) {
        results.push({ id, success: false, error: e?.message ?? String(e) });
      }
    }
    return { results, allSuccess: results.every((r) => r.success) };
  });

  ipcMain.handle("pdf:show-in-folder", (_e, id: number) => {
    const doc = resolvePdfDocument(id);
    if (doc) shell.showItemInFolder(doc.path);
  });

  ipcMain.handle("pdf-collections:load", () => {
    const repo = pdfRepoPath;
    if (!repo) return null;
    return readSidecar(path.join(repo, ".prism"), "pdf-collections.json");
  });

  ipcMain.handle("pdf-collections:save", (_e, repoPath: string, data: any) => {
    // Use the caller's repo: the renderer may still be finishing a save for the
    // previous repo when the active one changes.
    const repo = (repoPath || pdfRepoPath || "").trim();
    if (!repo) throw new Error("PDF_REPO_NOT_SET");
    writeSidecar(path.join(repo, ".prism"), "pdf-collections.json", data);
  });

  // Shell
  ipcMain.handle("shell:show-item-in-folder", (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:trash-file", async (_e, filePath: string) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("shell:trash-files", async (_e, filePaths: string[]) => {
    const results: { path: string; success: boolean; error?: string }[] = [];
    for (const fp of filePaths) {
      try {
        await shell.trashItem(fp);
        results.push({ path: fp, success: true });
      } catch (e: any) {
        results.push({ path: fp, success: false, error: e.message });
      }
    }
    return { results, allSuccess: results.every((r) => r.success) };
  });

  // Window controls
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

  // Dialog
  ipcMain.handle("dialog:select-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("dialog:select-file", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      title: "Select Executable",
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

// ---- App lifecycle ----

const ASSET_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
  wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
};

async function findAssetByBasename(
  vaultPath: string,
  basename: string,
  excludedRoots: string[] = [],
): Promise<string | null> {
  const wanted = basename.toLowerCase();
  const excluded = new Set(excludedRoots.map(normalizeVaultPath));
  const queue: string[] = [vaultPath];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !excluded.has(normalizeVaultPath(full))) queue.push(full);
      } else if (entry.name.toLowerCase() === wanted) {
        return full;
      }
    }
  }
  return null;
}

// prism-file:///asset?vault=<vault>&ref=<image ref>&dir=<note folder> —
// resolves the ref like a markdown wiki: note-relative, then vault-root,
// then (bare filenames only) a basename scan of the vault. Only registered
// vaults and known media extensions are served.
function registerAssetProtocol(): void {
  protocol.handle("prism-file", async (request) => {
    try {
      const url = new URL(request.url);
      // searchParams already percent-decodes — decoding again would throw on
      // filenames containing a literal "%"
      const vault = url.searchParams.get("vault") ?? "";
      const ref = url.searchParams.get("ref") ?? "";
      const dir = url.searchParams.get("dir") ?? "";
      const owner = vault ? findOwningVault(vault) : null;
      if (!vault || !ref || !owner) {
        return new Response("forbidden", { status: 403 });
      }
      const ext = path.extname(ref).replace(".", "").toLowerCase();
      const mime = ASSET_MIME[ext];
      if (!mime) return new Response("unsupported type", { status: 415 });

      const cleanRef = ref.replace(/^[\\/]+/, "");
      const inside = (p: string) => isPathInside(vault, p);

      const candidates = [
        // dir arrives absolute from the renderer, but accept vault-relative too
        dir ? path.join(path.isAbsolute(dir) ? dir : path.join(vault, dir), cleanRef) : null,
        path.join(vault, cleanRef),
      ].filter((p): p is string => Boolean(p));
      let target = candidates.find((p) => {
        try { return inside(p) && fs.statSync(p).isFile(); } catch { return false; }
      });

      // Exact paths failed — fall back to a basename scan (wiki-style
      // "shortest path" resolution, so a moved attachment folder won't 404)
      if (!target) {
        const found = await findAssetByBasename(vault, path.basename(cleanRef), privateVaultRoots());
        if (found && inside(found)) target = found;
      }
      if (!target) return new Response("not found", { status: 404 });

      if (isPrivateVault(owner)) {
        if (!isUnlocked(owner)) return new Response("locked", { status: 423 });
        const data = await withVaultKey(owner, (dek) => readAssetBytes(target!, dek));
        // Decrypted bytes must never sit in Chromium's disk cache after a lock.
        return new Response(new Uint8Array(data), {
          headers: { "content-type": mime, "cache-control": "no-store" },
        });
      }

      const data = await fs.promises.readFile(target);
      return new Response(new Uint8Array(data), { headers: { "content-type": mime } });
    } catch {
      return new Response("error", { status: 500 });
    }
  });
}

function pdfCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Range",
    "access-control-expose-headers": "content-range, content-length, accept-ranges",
  };
}

// prism-pdf://doc/<docId> — streams a PDF from disk with HTTP range support so
// pdf.js can page through large files without loading them into memory.
function registerPdfProtocol(): void {
  protocol.handle("prism-pdf", async (request) => {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: pdfCorsHeaders() });
      }
      const id = Number(new URL(request.url).pathname.replace(/^\/+/, ""));
      if (!Number.isInteger(id) || id <= 0) {
        return new Response("bad request", { status: 400, headers: pdfCorsHeaders() });
      }
      const doc = resolvePdfDocument(id);
      if (!doc) return new Response("not found", { status: 404, headers: pdfCorsHeaders() });

      const stat = await fs.promises.stat(doc.path);
      if (!stat.isFile()) return new Response("not found", { status: 404, headers: pdfCorsHeaders() });
      const size = stat.size;
      if (size === 0) {
        return new Response(new Uint8Array(0), {
          status: 200,
          headers: { ...pdfCorsHeaders(), "content-type": "application/pdf", "content-length": "0" },
        });
      }

      let start = 0;
      let end = size - 1;
      let partial = false;
      const range = request.headers.get("range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (!match || (match[1] === "" && match[2] === "")) {
          return new Response("range not satisfiable", {
            status: 416,
            headers: { ...pdfCorsHeaders(), "content-range": `bytes */${size}` },
          });
        }
        if (match[1] === "") {
          start = Math.max(0, size - Number(match[2]));
        } else {
          start = Number(match[1]);
          if (match[2] !== "") end = Math.min(size - 1, Number(match[2]));
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
          return new Response("range not satisfiable", {
            status: 416,
            headers: { ...pdfCorsHeaders(), "content-range": `bytes */${size}` },
          });
        }
        partial = true;
      }

      const headers: Record<string, string> = {
        ...pdfCorsHeaders(),
        "content-type": "application/pdf",
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-length": String(end - start + 1),
      };
      if (partial) headers["content-range"] = `bytes ${start}-${end}/${size}`;

      const stream = Readable.toWeb(fs.createReadStream(doc.path, { start, end })) as unknown as ReadableStream<Uint8Array>;
      return new Response(stream, { status: partial ? 206 : 200, headers });
    } catch {
      return new Response("error", { status: 500, headers: pdfCorsHeaders() });
    }
  });
}

// prism-cover://cover?id=<docId>&v=<version> — serves cached PDF cover JPEGs.
// Only rows in pdf_documents and files under userData/pdf-covers are reachable.
function registerCoverProtocol(): void {
  protocol.handle("prism-cover", async (request) => {
    try {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!Number.isInteger(id) || id <= 0) return new Response("bad request", { status: 400 });
      const row = getPdfDocument(id);
      if (!row || !row.coverPath) return new Response("not found", { status: 404 });
      const file = pdfCoverFile(id);
      if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
      const data = await fs.promises.readFile(file);
      return new Response(new Uint8Array(data), {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return new Response("error", { status: 500 });
    }
  });
}

// prism-asset://pdfjs/<cmaps|standard_fonts|wasm>/<file> — pdf.js needs
// predefined CMaps for non-embedded CJK fonts (otherwise glyphs silently render
// blank), standard font data for base-14 fonts, and its WASM decoders for
// scanned-image codecs (JBIG2/JPX) plus the JS fallbacks beside them. Served
// from the bundled dependency.
const PDFJS_ASSET_TYPES: Record<string, string> = {
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
};

function registerPdfjsAssetProtocol(): void {
  const root = path.join(app.getAppPath(), "node_modules", "pdfjs-dist");
  protocol.handle("prism-asset", async (request) => {
    try {
      const [kind, file] = new URL(request.url).pathname.split("/").filter(Boolean);
      if (
        (kind !== "cmaps" && kind !== "standard_fonts" && kind !== "wasm") ||
        !file ||
        file !== path.basename(file)
      ) {
        return new Response("not found", { status: 404 });
      }
      const data = await fs.promises.readFile(path.join(root, kind, file));
      const contentType = PDFJS_ASSET_TYPES[path.extname(file)] ?? "application/octet-stream";
      return new Response(new Uint8Array(data), {
        headers: { "content-type": contentType, "access-control-allow-origin": "*" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}

// ---- App lifecycle ----

// A packaged app can be started twice (login item + manual launch). One
// instance owns the tray and global shortcut; the second one reports back and
// quits. Development is exempt so `electron:dev` never fights the installed
// build over the lock.
const hasSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true;

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  if (app.isPackaged) {
    app.on("second-instance", (_event, argv) => {
      // A hidden login-start relaunch must not steal focus.
      if (argv.includes("--hidden")) return;
      revealMainWindow();
    });
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    initDatabase();
    setIdleMinutesProvider(() => Number(getSetting("private_lock_minutes")) || 10);
    setLockListener((vaultPath) => mainWindow?.webContents.send("vault:locked", vaultPath));
    setUnlockListener((vaultPath) => mainWindow?.webContents.send("vault:unlocked", vaultPath));
    // Walking away or suspending must not leave decrypted content on screen.
    powerMonitor.on("lock-screen", () => { void lockAllVaults(); });
    powerMonitor.on("suspend", () => { void lockAllVaults(); });
    // Never let the close-to-tray handler block an OS shutdown/logoff.
    powerMonitor.on("shutdown", () => { isQuitting = true; });
    registerAssetProtocol();
    registerCoverProtocol();
    registerPdfProtocol();
    registerPdfjsAssetProtocol();
    registerIpcHandlers();
    // Heal the login item (path/args) so a reinstalled/moved build keeps
    // starting at login exactly as the settings say.
    applyAutoLaunch();
    // Hidden startup deliberately creates no window: no renderer, no vault
    // watchers, no PDF scan. The tray and hotkey bring it back on demand.
    if (!startedHidden) createWindow();
    syncTray();
    applyGlobalShortcuts();

    app.on("activate", () => revealMainWindow());
  });

  app.on("before-quit", () => { isQuitting = true; });

  // Closing the capture popup is the last window in a tray-only session; that
  // must keep the app (and its hotkey) alive.
  app.on("window-all-closed", () => {
    if (isQuitting || process.platform === "darwin") return;
    if (tray || startedHidden) return;
    app.quit();
  });

  app.on("will-quit", () => {
    destroyTray();
    globalShortcut.unregisterAll();
    for (const vaultPath of Array.from(watchedVaults)) unwatchVault(vaultPath);
    unwatchPdfRepo();
    // Zero every session key (process memory disappears right after anyway).
    void lockAllVaults();
  });
}
