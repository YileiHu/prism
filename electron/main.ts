import { app, BrowserWindow, ipcMain, dialog, shell, net, Menu } from "electron";
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
  setVaultNotes,
  getNotes,
  searchNotes,
  unifiedSearch,
  getSetting,
  setSetting,
  getAllTags,
} from "./database";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Prism",
    backgroundColor: "#030712",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ---- Fetch page title ----

async function fetchPageTitle(url: string): Promise<string> {
  try {
    const response = await net.fetch(url);
    const html = await response.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : url;
  } catch {
    return url;
  }
}

// ---- Scan Obsidian vault ----

function scanVault(vaultPath: string): { path: string; title: string; content: string; tags: string; modified_at: string }[] {
  const notes: { path: string; title: string; content: string; tags: string; modified_at: string }[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const stat = fs.statSync(fullPath);
          const title = entry.name.replace(/\.md$/, "");
          const tagSet = new Set<string>();

          // 1. Parse YAML frontmatter tags
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
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
          let body = content.slice(bodyStart);
          // Remove fenced code blocks
          body = body.replace(/```[\s\S]*?```/g, "");
          // Remove inline code
          body = body.replace(/`[^`]+`/g, "");
          const bodyTags = body.match(/(?:^|\s)#([\w一-鿿\p{L}-]+)/gu) || [];
          bodyTags.forEach((t) => {
            const tag = t.trim().replace(/^#/, "");
            // Must contain at least one letter/CJK char, not purely digits
            if (tag && /[\p{L}]/u.test(tag) && !/^\d+$/.test(tag)) tagSet.add(tag);
          });

          notes.push({
            path: fullPath,
            title,
            content,
            tags: Array.from(tagSet).join(" "),
            modified_at: stat.mtime.toISOString(),
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(vaultPath);
  return notes;
}

// ---- IPC Handlers ----

function registerIpcHandlers(): void {
  // Resources
  ipcMain.handle("resources:add", (_e, url: string, title: string, notes: string, tags: string[]) => {
    return addResource(url, title, notes, tags);
  });

  ipcMain.handle("resources:list", () => getResources());

  ipcMain.handle("resources:update", (_e, id: number, title: string, notes: string, tags: string[]) => {
    return updateResource(id, title, notes, tags);
  });

  ipcMain.handle("resources:delete", (_e, id: number) => deleteResource(id));

  ipcMain.handle("resources:search", (_e, query: string) => searchResources(query));

  ipcMain.handle("fetch:title", async (_e, url: string) => fetchPageTitle(url));

  // Obsidian
  ipcMain.handle("obsidian:set-path", (_e, vaultPath: string) => {
    const notes = scanVault(vaultPath);
    setVaultNotes(notes);
    return notes.length;
  });

  ipcMain.handle("obsidian:list", () => getNotes());

  ipcMain.handle("obsidian:search", (_e, query: string) => searchNotes(query));

  ipcMain.handle("obsidian:open", (_e, filePath: string) => {
    const uri = `obsidian://open?path=${encodeURIComponent(filePath)}&paneType=tab`;
    const obsidianPath = getSetting("obsidian_path");
    if (obsidianPath && fs.existsSync(obsidianPath)) {
      spawn(obsidianPath, [uri], { detached: true, stdio: "ignore" }).unref();
    } else {
      shell.openExternal(uri);
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

  // Unified search
  ipcMain.handle("search:unified", (_e, query: string) => unifiedSearch(query));

  // Settings
  ipcMain.handle("settings:get", (_e, key: string) => getSetting(key));
  ipcMain.handle("settings:set", (_e, key: string, value: string) => setSetting(key, value));

  // Tags
  ipcMain.handle("tags:list", () => getAllTags());

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
