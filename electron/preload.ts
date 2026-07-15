import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Resources
  addResource: (url: string, title: string, notes: string, tags: string[]) =>
    ipcRenderer.invoke("resources:add", url, title, notes, tags),
  getResources: () => ipcRenderer.invoke("resources:list"),
  updateResource: (id: number, title: string, notes: string, tags: string[]) =>
    ipcRenderer.invoke("resources:update", id, title, notes, tags),
  deleteResource: (id: number) => ipcRenderer.invoke("resources:delete", id),
  searchResources: (query: string) => ipcRenderer.invoke("resources:search", query),
  fetchPageTitle: (url: string) => ipcRenderer.invoke("fetch:title", url),
  openUrl: (url: string) => ipcRenderer.invoke("resources:open-url", url),

  // Obsidian
  setVaultPath: (vaultPath: string) => ipcRenderer.invoke("obsidian:set-path", vaultPath),
  getNotes: () => ipcRenderer.invoke("obsidian:list"),
  searchNotes: (query: string) => ipcRenderer.invoke("obsidian:search", query),
  openInObsidian: (filePath: string) => ipcRenderer.invoke("obsidian:open", filePath),

  // Unified search
  unifiedSearch: (query: string) => ipcRenderer.invoke("search:unified", query),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),

  // Tags
  getAllTags: () => ipcRenderer.invoke("tags:list"),

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
};

contextBridge.exposeInMainWorld("prism", api);

export type PrismAPI = typeof api;
