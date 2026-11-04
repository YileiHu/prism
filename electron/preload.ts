import { contextBridge, ipcRenderer } from "electron";
import type { NoteBrief, NoteContentHit, PdfDocument } from "../src/shared/models";

const api = {
  // Resources
  addResource: (url: string, title: string, tags: string[], notes: string) =>
    ipcRenderer.invoke("resources:add", url, title, tags, notes),
  getResources: () => ipcRenderer.invoke("resources:list"),
  updateResource: (id: number, url: string, title: string, tags: string[], notes: string) =>
    ipcRenderer.invoke("resources:update", id, url, title, tags, notes),
  deleteResource: (id: number) => ipcRenderer.invoke("resources:delete", id),
  searchResources: (query: string) => ipcRenderer.invoke("resources:search", query),
  reorderResources: (orderedIds: number[]) => ipcRenderer.invoke("resources:reorder", orderedIds),
  fetchPageTitle: (url: string) => ipcRenderer.invoke("fetch:title", url),
  openUrl: (url: string) => ipcRenderer.invoke("resources:open-url", url),

  // Vault notes
  setVaultPath: (vaultPath: string) => ipcRenderer.invoke("vault:set-path", vaultPath),
  unwatchVault: (vaultPath: string) => ipcRenderer.invoke("vault:unwatch-path", vaultPath),
  getNoteList: (vaultPath: string) => ipcRenderer.invoke("vault:list-brief", vaultPath) as Promise<NoteBrief[]>,
  searchNotes: (vaultPath: string, query: string) => ipcRenderer.invoke("vault:search", vaultPath, query) as Promise<NoteBrief[]>,
  searchNoteContents: (vaultPath: string, query: string) =>
    ipcRenderer.invoke("vault:search-content", vaultPath, query) as Promise<NoteContentHit[]>,
  deleteNotes: (notePaths: string[]) => ipcRenderer.invoke("vault:delete-notes", notePaths),
  readNote: (notePath: string) => ipcRenderer.invoke("vault:read-note", notePath),
  saveNote: (notePath: string, content: string) => ipcRenderer.invoke("vault:save-note", notePath, content),
  saveAttachment: (vaultPath: string, ext: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("vault:save-attachment", vaultPath, ext, new Uint8Array(data)) as Promise<string>,
  createNote: (vaultPath: string, title: string) => ipcRenderer.invoke("vault:create-note", vaultPath, title),
  renameNote: (vaultPath: string, oldPath: string, newTitle: string) =>
    ipcRenderer.invoke("vault:rename-note", vaultPath, oldPath, newTitle),
  onVaultUpdated: (callback: (vaultPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, vaultPath: string) => callback(vaultPath);
    ipcRenderer.on("vault:updated", handler);
    return () => { ipcRenderer.removeListener("vault:updated", handler); };
  },

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),
  getAllSettings: () => ipcRenderer.invoke("settings:get-all") as Promise<Record<string, string>>,

  // Tags
  getAllTags: () => ipcRenderer.invoke("tags:list"),
  reorderTags: (orderedNames: string[]) => ipcRenderer.invoke("tags:reorder", orderedNames),
  setTagColor: (name: string, color: string) => ipcRenderer.invoke("tags:set-color", name, color),
  renameTag: (oldName: string, newName: string) => ipcRenderer.invoke("tags:rename", oldName, newName),
  deleteTag: (name: string) => ipcRenderer.invoke("tags:delete", name),

  // GTD
  addGtdItem: (title: string) => ipcRenderer.invoke("gtd:add", title),
  getGtdItems: (status: string) => ipcRenderer.invoke("gtd:list", status),
  getGtdCounts: () => ipcRenderer.invoke("gtd:counts"),
  setGtdItemStatus: (id: number, status: string) => ipcRenderer.invoke("gtd:set-status", id, status),
  setGtdItemArchived: (id: number, archived: boolean) => ipcRenderer.invoke("gtd:set-archived", id, archived),
  renameGtdItem: (id: number, title: string) => ipcRenderer.invoke("gtd:rename", id, title),
  setGtdItemDescription: (id: number, description: string) => ipcRenderer.invoke("gtd:set-description", id, description),
  setGtdItemColor: (id: number, color: string) => ipcRenderer.invoke("gtd:set-color", id, color),
  setGtdItemDueDate: (id: number, dueDate: string | null) => ipcRenderer.invoke("gtd:set-due-date", id, dueDate),
  deleteGtdItem: (id: number) => ipcRenderer.invoke("gtd:delete", id),
  setGtdItemNext: (id: number, isNext: boolean) => ipcRenderer.invoke("gtd:set-next", id, isNext),
  getGtdActions: (projectId: number) => ipcRenderer.invoke("gtd:list-actions", projectId),
  addGtdAction: (projectId: number, title: string) => ipcRenderer.invoke("gtd:add-action", projectId, title),
  renameGtdAction: (id: number, title: string) => ipcRenderer.invoke("gtd:rename-action", id, title),
  toggleGtdAction: (id: number) => ipcRenderer.invoke("gtd:toggle-action", id),
  reorderGtdActions: (projectId: number, orderedIds: number[]) => ipcRenderer.invoke("gtd:reorder-actions", projectId, orderedIds),
  deleteGtdAction: (id: number) => ipcRenderer.invoke("gtd:delete-action", id),
  setGtdActionNext: (projectId: number, actionId: number | null) => ipcRenderer.invoke("gtd:set-action-next", projectId, actionId),
  setGtdActionDueDate: (id: number, dueDate: string | null) => ipcRenderer.invoke("gtd:set-action-due-date", id, dueDate),
  getGtdNextList: () => ipcRenderer.invoke("gtd:next-list"),

  // Favorite / recent notes
  toggleFavoriteNote: (notePath: string, title: string) => ipcRenderer.invoke("notes:toggle-favorite", notePath, title),
  getFavoriteNotes: () => ipcRenderer.invoke("notes:favorites"),
  getFavoriteStatus: (notePaths: string[]) => ipcRenderer.invoke("notes:favorite-status", notePaths),
  getRecentNotes: (limit?: number) => ipcRenderer.invoke("notes:recents", limit),

  // Dialog
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  selectFile: () => ipcRenderer.invoke("dialog:select-file"),

  // Note collections
  loadNoteCollections: (vaultPath: string) => ipcRenderer.invoke("note-collections:load", vaultPath),
  saveNoteCollections: (vaultPath: string, data: any) => ipcRenderer.invoke("note-collections:save", vaultPath, data),

  // PDF library
  getPdfState: () => ipcRenderer.invoke("pdf:get-state") as Promise<{ repoPath: string; exists: boolean; count: number }>,
  choosePdfRepo: () => ipcRenderer.invoke("pdf:choose-repo") as Promise<string | null>,
  openPdfRepo: (repoPath: string) => ipcRenderer.invoke("pdf:open-repo", repoPath),
  rescanPdfs: () => ipcRenderer.invoke("pdf:rescan") as Promise<{ total: number; changed: number }>,
  listPdfs: () => ipcRenderer.invoke("pdf:list") as Promise<PdfDocument[]>,
  savePdfCover: (id: number, jpeg: Uint8Array, pageCount: number | null) =>
    ipcRenderer.invoke("pdf:save-cover", id, jpeg, pageCount) as Promise<{ coverVersion: number }>,
  choosePdfCover: (id: number) => ipcRenderer.invoke("pdf:choose-cover", id) as Promise<{ coverVersion: number } | null>,
  resetPdfCover: (id: number) => ipcRenderer.invoke("pdf:reset-cover", id) as Promise<{ coverVersion: number }>,
  setPdfPageCount: (id: number, pageCount: number) => ipcRenderer.invoke("pdf:set-page-count", id, pageCount),
  deletePdfDocuments: (ids: number[]) => ipcRenderer.invoke("pdf:delete-documents", ids) as Promise<{
    results: { id: number; success: boolean; error?: string }[];
    allSuccess: boolean;
  }>,
  showPdfInFolder: (id: number) => ipcRenderer.invoke("pdf:show-in-folder", id),
  loadPdfCollections: () => ipcRenderer.invoke("pdf-collections:load"),
  savePdfCollections: (repoPath: string, data: any) => ipcRenderer.invoke("pdf-collections:save", repoPath, data),
  onPdfUpdated: (callback: (repoPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, repoPath: string) => callback(repoPath);
    ipcRenderer.on("pdf:updated", handler);
    return () => { ipcRenderer.removeListener("pdf:updated", handler); };
  },

  // Shell
  showItemInFolder: (filePath: string) => ipcRenderer.invoke("shell:show-item-in-folder", filePath),
  trashFile: (filePath: string) => ipcRenderer.invoke("shell:trash-file", filePath),
  trashFiles: (filePaths: string[]) => ipcRenderer.invoke("shell:trash-files", filePaths),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  setColorMode: (mode: string) => ipcRenderer.invoke("app:set-color-mode", mode),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximize-change", handler);
    return () => { ipcRenderer.removeListener("window:maximize-change", handler); };
  },
};

contextBridge.exposeInMainWorld("prism", api);

export type PrismAPI = typeof api;
