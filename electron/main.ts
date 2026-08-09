import { app, BrowserWindow, ipcMain, dialog, shell, net, Menu, screen } from "electron";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import {
  initDatabase,
  addResource,
  getResources,
  updateResource,
  deleteResource,
  searchResources,
  syncVaultNotes,
  insertNote,
  renameNoteInDb,
  deleteNotesByPaths,
  getNoteMtimes,
  getNoteList,
  searchNotes,
  getSetting,
  setSetting,
  getAllTags,
  addGtdItem,
  getGtdItems,
  getGtdCounts,
  setGtdItemStatus,
  renameGtdItem,
  deleteGtdItem,
  setGtdItemNext,
  getGtdActions,
  addGtdAction,
  renameGtdAction,
  toggleGtdAction,
  deleteGtdAction,
  setGtdActionNext,
  getGtdNextList,
  listScheduleBlocks,
  addScheduleBlock,
  updateScheduleBlock,
  deleteScheduleBlock,
  toggleFavoriteNote,
  getFavoriteNotes,
  getFavoriteStatus,
  getRecentNotes,
  recordRecentOpen,
  renameNoteEntry,
  type GtdStatus,
  type ScheduleBlockInput,
} from "./database";

let mainWindow: BrowserWindow | null = null;

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

function createWindow(): void {
  const isWindows = process.platform === "win32";
  const saved = loadWindowState();

  const options: Electron.BrowserWindowConstructorOptions = {
    width: saved?.width ?? 1200,
    height: saved?.height ?? 800,
    minWidth: 900,
    minHeight: 600,
    title: "Prism",
    icon: path.join(__dirname, "../public/icon.png"),
    ...(isWindows
      ? { frame: false, backgroundColor: "#030712" }
      : { backgroundColor: "#030712" }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (saved && isVisibleOnSomeDisplay(saved)) {
    options.x = saved.x;
    options.y = saved.y;
  }

  mainWindow = new BrowserWindow(options);
  if (saved?.maximized) mainWindow.maximize();

  // Must be registered here — mainWindow is still null while registerIpcHandlers runs
  mainWindow.on("maximize", () => mainWindow?.webContents.send("window:maximize-change", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window:maximize-change", false));
  mainWindow.on("closed", () => { mainWindow = null; });

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
  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("maximize", scheduleSave);
  mainWindow.on("unmaximize", scheduleSave);
  mainWindow.on("close", () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    saveBounds();
  });

  // Focus-triggered incremental scan (throttled per vault). Catches everything
  // fs.watch can silently miss: unplugged/reconnected drives, dead watchers,
  // network drives, change-buffer overflows, new dirs on Linux.
  mainWindow.on("focus", () => {
    const now = Date.now();
    for (const vp of watchedVaults) {
      if (now - (focusScanAt.get(vp) ?? 0) < FOCUS_SCAN_INTERVAL) continue;
      focusScanAt.set(vp, now);
      rescanAndNotify(vp);
    }
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
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

// ---- Scan Obsidian vault ----

function extractTags(content: string): Set<string> {
  const tagSet = new Set<string>();
  // Obsidian files on Windows are often CRLF; the regexes below assume \n
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

async function scanVaultIncremental(vaultPath: string): Promise<{
  upsert: { path: string; title: string; content: string; tags: string; modified_at: string }[];
  deletePaths: string[];
  totalCount: number;
}> {
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
        if (!entry.name.startsWith(".")) subdirs.push(fullPath);
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

const FOCUS_SCAN_INTERVAL = 30_000;
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
    const { upsert, deletePaths } = await scanVaultIncremental(vaultPath);
    // Only notify when the index actually changed (e.g. ignore .prism/collections.json writes)
    if (upsert.length === 0 && deletePaths.length === 0) return;
    syncVaultNotes(vaultPath, upsert, deletePaths);
    mainWindow?.webContents.send("obsidian:vault-updated", vaultPath);
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
      if (!filename.toLowerCase().endsWith(".md")) return;
    }
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

// ---- IPC Handlers ----

function registerIpcHandlers(): void {
  // Resources
  ipcMain.handle("resources:add", (_e, url: string, title: string, tags: string[]) => {
    return addResource(url, title, tags);
  });

  ipcMain.handle("resources:list", () => getResources());

  ipcMain.handle("resources:update", (_e, id: number, url: string, title: string, tags: string[]) => {
    return updateResource(id, url, title, tags);
  });

  ipcMain.handle("resources:delete", (_e, id: number) => deleteResource(id));

  ipcMain.handle("resources:search", (_e, query: string) => searchResources(query));

  ipcMain.handle("fetch:title", async (_e, url: string) => fetchPageTitle(url));

  // Obsidian
  ipcMain.handle("obsidian:set-path", async (_e, vaultPath: string) => {
    // Refuse to scan a missing/unreadable path — the empty walk would
    // otherwise wipe this vault's entire index from the DB
    if (!isValidVaultDir(vaultPath)) {
      throw new Error("VAULT_NOT_FOUND");
    }
    watchedVaults.add(vaultPath);
    watchVault(vaultPath);
    const { upsert, deletePaths, totalCount } = await scanVaultIncremental(vaultPath);
    syncVaultNotes(vaultPath, upsert, deletePaths);
    return totalCount;
  });

  ipcMain.handle("obsidian:unwatch-path", (_e, vaultPath: string) => {
    watchedVaults.delete(vaultPath);
    unwatchVault(vaultPath);
  });

  ipcMain.handle("obsidian:list-brief", (_e, vaultPath: string) => getNoteList(vaultPath));

  ipcMain.handle("obsidian:search", (_e, vaultPath: string, query: string) => searchNotes(vaultPath, query));

  ipcMain.handle("obsidian:delete-notes", (_e, paths: string[]) => {
    deleteNotesByPaths(paths);
  });

  ipcMain.handle("obsidian:create-note", (_e, vaultPath: string, title: string) => {
    const safeName = title.trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
    const defaultDir = getSetting("default_notes_dir") || "";
    const targetDir = defaultDir ? path.join(vaultPath, defaultDir) : vaultPath;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
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
    const now = new Date().toISOString();
    fs.writeFileSync(filePath, content, "utf-8");
    const tags = Array.from(extractTags(content)).join(" ");
    return insertNote({ vault_path: vaultPath, path: filePath, title: finalTitle, content, tags, modified_at: now });
  });

  ipcMain.handle("obsidian:rename-note", (_e, vaultPath: string, oldPath: string, newTitle: string) => {
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
    const updated = renameNoteInDb(oldPath, newPath, finalTitle);
    renameNoteEntry(oldPath, newPath, finalTitle);
    if (updated) return updated;
    // Note wasn't indexed yet (e.g. created externally) — index it now
    const content = fs.readFileSync(newPath, "utf-8");
    const tags = Array.from(extractTags(content)).join(" ");
    const stat = fs.statSync(newPath);
    return insertNote({ vault_path: vaultPath, path: newPath, title: finalTitle, content, tags, modified_at: stat.mtime.toISOString() });
  });

  ipcMain.handle("obsidian:open", (_e, filePath: string) => {
    recordRecentOpen(filePath);
    const uri = `obsidian://open?path=${encodeURIComponent(filePath)}&paneType=tab`;
    const obsidianPath = getSetting("obsidian_path");
    if (obsidianPath && fs.existsSync(obsidianPath)) {
      spawn(obsidianPath, [uri], { detached: true, stdio: "ignore" }).unref();
    } else {
      shell.openExternal(uri);
    }
  });

  // Launch Obsidian without a target file (Settings "test" button)
  ipcMain.handle("obsidian:launch", () => {
    const obsidianPath = getSetting("obsidian_path");
    if (obsidianPath && fs.existsSync(obsidianPath)) {
      spawn(obsidianPath, [], { detached: true, stdio: "ignore" }).unref();
    } else {
      shell.openExternal("obsidian://");
    }
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
  ipcMain.handle("settings:set", (_e, key: string, value: string) => setSetting(key, value));

  // Tags
  ipcMain.handle("tags:list", () => getAllTags());

  // GTD
  ipcMain.handle("gtd:add", (_e, title: string) => addGtdItem(title));
  ipcMain.handle("gtd:list", (_e, status: GtdStatus) => getGtdItems(status));
  ipcMain.handle("gtd:counts", () => getGtdCounts());
  ipcMain.handle("gtd:set-status", (_e, id: number, status: GtdStatus) => setGtdItemStatus(id, status));
  ipcMain.handle("gtd:rename", (_e, id: number, title: string) => renameGtdItem(id, title));
  ipcMain.handle("gtd:delete", (_e, id: number) => deleteGtdItem(id));
  ipcMain.handle("gtd:set-next", (_e, id: number, isNext: boolean) => setGtdItemNext(id, isNext));
  ipcMain.handle("gtd:list-actions", (_e, projectId: number) => getGtdActions(projectId));
  ipcMain.handle("gtd:add-action", (_e, projectId: number, title: string) => addGtdAction(projectId, title));
  ipcMain.handle("gtd:rename-action", (_e, id: number, title: string) => renameGtdAction(id, title));
  ipcMain.handle("gtd:toggle-action", (_e, id: number) => toggleGtdAction(id));
  ipcMain.handle("gtd:delete-action", (_e, id: number) => deleteGtdAction(id));
  ipcMain.handle("gtd:set-action-next", (_e, projectId: number, actionId: number | null) => setGtdActionNext(projectId, actionId));
  ipcMain.handle("gtd:next-list", () => getGtdNextList());

  // Schedule template (one-day time-block division)
  const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s) && +s.slice(0, 2) <= 23 && +s.slice(3) <= 59;
  const validateBlock = (block: ScheduleBlockInput, excludeId?: number): { error?: string } => {
    if (!isTime(block.start) || !isTime(block.end)) return { error: "format" };
    if (block.start >= block.end) return { error: "order" };
    const overlap = listScheduleBlocks().some((b) => b.id !== excludeId && block.start < b.end && b.start < block.end);
    if (overlap) return { error: "overlap" };
    return {};
  };

  ipcMain.handle("schedule:list", () => listScheduleBlocks());

  ipcMain.handle("schedule:add", (_e, block: ScheduleBlockInput) => {
    const v = validateBlock(block);
    if (v.error) return v;
    return { block: addScheduleBlock(block) };
  });

  ipcMain.handle("schedule:update", (_e, id: number, block: ScheduleBlockInput) => {
    const v = validateBlock(block, id);
    if (v.error) return v;
    return { block: updateScheduleBlock(id, block) };
  });

  ipcMain.handle("schedule:delete", (_e, id: number) => deleteScheduleBlock(id));

  // Favorite / recent notes
  ipcMain.handle("notes:toggle-favorite", (_e, notePath: string, title: string) => toggleFavoriteNote(notePath, title));
  ipcMain.handle("notes:favorites", () => getFavoriteNotes().map((n) => ({ ...n, missing: !fs.existsSync(n.path) })));
  ipcMain.handle("notes:favorite-status", (_e, paths: string[]) => getFavoriteStatus(paths));
  ipcMain.handle("notes:recents", (_e, limit?: number) => getRecentNotes(limit).map((n) => ({ ...n, missing: !fs.existsSync(n.path) })));

  // Collections
  ipcMain.handle("collections:load", (_e, vaultPath: string) => {
    const dir = path.join(vaultPath, ".prism");
    const file = path.join(dir, "collections.json");
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      // Backup corrupted file
      const bak = file + ".bak";
      try { fs.copyFileSync(file, bak); } catch { /* ignore */ }
      return null;
    }
  });

  ipcMain.handle("collections:save", (_e, vaultPath: string, data: any) => {
    const dir = path.join(vaultPath, ".prism");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "collections.json"), JSON.stringify(data, null, 2), "utf-8");
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initDatabase();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  for (const vaultPath of Array.from(watchedVaults)) unwatchVault(vaultPath);
});
