import { contextBridge, ipcRenderer } from "electron";

const api = {
  // Resources
  addResource: (url: string, title: string, notes: string, tags: string[]) =>
    ipcRenderer.invoke("resources:add", url, title, notes, tags),
  getResources: () => ipcRenderer.invoke("resources:list"),
  updateResource: (id: number, url: string, title: string, notes: string, tags: string[]) =>
    ipcRenderer.invoke("resources:update", id, url, title, notes, tags),
  deleteResource: (id: number) => ipcRenderer.invoke("resources:delete", id),
  searchResources: (query: string) => ipcRenderer.invoke("resources:search", query),
  fetchPageTitle: (url: string) => ipcRenderer.invoke("fetch:title", url),
  openUrl: (url: string) => ipcRenderer.invoke("resources:open-url", url),

  // Obsidian
  setVaultPath: (vaultPath: string) => ipcRenderer.invoke("obsidian:set-path", vaultPath),
  getNotes: () => ipcRenderer.invoke("obsidian:list"),
  getNoteList: () => ipcRenderer.invoke("obsidian:list-brief"),
  searchNotes: (query: string) => ipcRenderer.invoke("obsidian:search", query),
  openInObsidian: (filePath: string) => ipcRenderer.invoke("obsidian:open", filePath),
  createNote: (vaultPath: string, title: string) => ipcRenderer.invoke("obsidian:create-note", vaultPath, title),
  renameNote: (oldPath: string, newTitle: string) => ipcRenderer.invoke("obsidian:rename-note", oldPath, newTitle),

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
