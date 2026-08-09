import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Resources
  addResource: (url: string, title: string, tags: string[]) =>
    ipcRenderer.invoke("resources:add", url, title, tags),
  getResources: () => ipcRenderer.invoke("resources:list"),
  updateResource: (id: number, url: string, title: string, tags: string[]) =>
    ipcRenderer.invoke("resources:update", id, url, title, tags),
  deleteResource: (id: number) => ipcRenderer.invoke("resources:delete", id),
  searchResources: (query: string) => ipcRenderer.invoke("resources:search", query),
  fetchPageTitle: (url: string) => ipcRenderer.invoke("fetch:title", url),
  openUrl: (url: string) => ipcRenderer.invoke("resources:open-url", url),

  // Obsidian
  setVaultPath: (vaultPath: string) => ipcRenderer.invoke("obsidian:set-path", vaultPath),
  unwatchVault: (vaultPath: string) => ipcRenderer.invoke("obsidian:unwatch-path", vaultPath),
  getNoteList: (vaultPath: string) => ipcRenderer.invoke("obsidian:list-brief", vaultPath),
  searchNotes: (vaultPath: string, query: string) => ipcRenderer.invoke("obsidian:search", vaultPath, query),
  deleteNotes: (paths: string[]) => ipcRenderer.invoke("obsidian:delete-notes", paths),
  openInObsidian: (filePath: string) => ipcRenderer.invoke("obsidian:open", filePath),
  launchObsidian: () => ipcRenderer.invoke("obsidian:launch"),
  createNote: (vaultPath: string, title: string) => ipcRenderer.invoke("obsidian:create-note", vaultPath, title),
  renameNote: (vaultPath: string, oldPath: string, newTitle: string) =>
    ipcRenderer.invoke("obsidian:rename-note", vaultPath, oldPath, newTitle),
  onVaultUpdated: (callback: (vaultPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, vaultPath: string) => callback(vaultPath);
    ipcRenderer.on("obsidian:vault-updated", handler);
    return () => { ipcRenderer.removeListener("obsidian:vault-updated", handler); };
  },

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),

  // Tags
  getAllTags: () => ipcRenderer.invoke("tags:list"),

  // GTD
  addGtdItem: (title: string) => ipcRenderer.invoke("gtd:add", title),
  getGtdItems: (status: string) => ipcRenderer.invoke("gtd:list", status),
  getGtdCounts: () => ipcRenderer.invoke("gtd:counts"),
  setGtdItemStatus: (id: number, status: string) => ipcRenderer.invoke("gtd:set-status", id, status),
  renameGtdItem: (id: number, title: string) => ipcRenderer.invoke("gtd:rename", id, title),
  deleteGtdItem: (id: number) => ipcRenderer.invoke("gtd:delete", id),
  setGtdItemNext: (id: number, isNext: boolean) => ipcRenderer.invoke("gtd:set-next", id, isNext),
  getGtdActions: (projectId: number) => ipcRenderer.invoke("gtd:list-actions", projectId),
  addGtdAction: (projectId: number, title: string) => ipcRenderer.invoke("gtd:add-action", projectId, title),
  renameGtdAction: (id: number, title: string) => ipcRenderer.invoke("gtd:rename-action", id, title),
  toggleGtdAction: (id: number) => ipcRenderer.invoke("gtd:toggle-action", id),
  deleteGtdAction: (id: number) => ipcRenderer.invoke("gtd:delete-action", id),
  setGtdActionNext: (projectId: number, actionId: number | null) => ipcRenderer.invoke("gtd:set-action-next", projectId, actionId),
  getGtdNextList: () => ipcRenderer.invoke("gtd:next-list"),

  // Schedule template
  getScheduleBlocks: () => ipcRenderer.invoke("schedule:list"),
  addScheduleBlock: (block: { label: string; start: string; end: string; color: string }) =>
    ipcRenderer.invoke("schedule:add", block),
  updateScheduleBlock: (id: number, block: { label: string; start: string; end: string; color: string }) =>
    ipcRenderer.invoke("schedule:update", id, block),
  deleteScheduleBlock: (id: number) => ipcRenderer.invoke("schedule:delete", id),

  // Favorite / recent notes
  toggleFavoriteNote: (notePath: string, title: string) => ipcRenderer.invoke("notes:toggle-favorite", notePath, title),
  getFavoriteNotes: () => ipcRenderer.invoke("notes:favorites"),
  getFavoriteStatus: (paths: string[]) => ipcRenderer.invoke("notes:favorite-status", paths),
  getRecentNotes: (limit?: number) => ipcRenderer.invoke("notes:recents", limit),

  // Dialog
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  selectFile: () => ipcRenderer.invoke("dialog:select-file"),

  // Collections
  loadCollections: (vaultPath: string) => ipcRenderer.invoke("collections:load", vaultPath),
  saveCollections: (vaultPath: string, data: any) => ipcRenderer.invoke("collections:save", vaultPath, data),

  // Shell
  showItemInFolder: (filePath: string) => ipcRenderer.invoke("shell:show-item-in-folder", filePath),
  trashFile: (filePath: string) => ipcRenderer.invoke("shell:trash-file", filePath),
  trashFiles: (filePaths: string[]) => ipcRenderer.invoke("shell:trash-files", filePaths),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximize-change", handler);
    return () => { ipcRenderer.removeListener("window:maximize-change", handler); };
  },
};

contextBridge.exposeInMainWorld("prism", api);

export type PrismAPI = typeof api;
