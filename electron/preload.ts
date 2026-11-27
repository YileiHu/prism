import { contextBridge, ipcRenderer } from "electron";
import type {
  AppLaunchState,
  CanvasContent,
  CanvasFile,
  CanvasGroupsFile,
  CanvasSaveResult,
  GlobalShortcutStatus,
  GrowthAnnualNote,
  GrowthAnnualNoteInput,
  GrowthArtifact,
  GrowthArtifactInput,
  GrowthArtifactPatch,
  GrowthBackupExportResult,
  GrowthBackupImportResult,
  GrowthBackupPreview,
  GrowthCapability,
  GrowthCapabilityInput,
  GrowthCapabilityPatch,
  GrowthChallenge,
  GrowthChallengeInput,
  GrowthChallengePatch,
  GrowthDomain,
  GrowthEvidence,
  GrowthEvidenceInput,
  GrowthFeedback,
  GrowthFeedbackInput,
  GrowthPrediction,
  GrowthPredictionInput,
  GrowthResolveInput,
  GrowthResolveResult,
  GrowthReviewInput,
  GrowthReviewResult,
  GrowthSeason,
  GrowthSeasonInput,
  GrowthSeasonPatch,
  GrowthSelfModelEntry,
  GrowthSelfModelInput,
  GrowthSelfModelPatch,
  GrowthSnapshot,
  GrowthState,
  GrowthTask,
  GrowthTaskInput,
  GrowthTaskPatch,
  GrowthTasksPayload,
  NoteBrief,
  NoteCollectionsFile,
  NoteContentHit,
  NoteListChanges,
  PdfDocument,
  PdfListChanges,
  ResourceCollection,
  VaultLibrarySummary,
  VaultMigrationProgress,
  VaultMigrationResult,
  VaultPrivacyStatus,
} from "../src/shared/models";

const api = {
  // Resources (single-assignment collections)
  addResource: (url: string, title: string, notes: string, collectionId: number | null) =>
    ipcRenderer.invoke("resources:add", url, title, notes, collectionId),
  getResources: () => ipcRenderer.invoke("resources:list"),
  updateResource: (id: number, url: string, title: string, notes: string, collectionId: number | null) =>
    ipcRenderer.invoke("resources:update", id, url, title, notes, collectionId),
  deleteResource: (id: number) => ipcRenderer.invoke("resources:delete", id),
  moveResourcesToCollection: (ids: number[], collectionId: number | null) =>
    ipcRenderer.invoke("resources:move-to-collection", ids, collectionId) as Promise<number>,
  searchResources: (query: string) => ipcRenderer.invoke("resources:search", query),
  reorderResources: (orderedIds: number[]) => ipcRenderer.invoke("resources:reorder", orderedIds),
  getResourceCollections: () => ipcRenderer.invoke("resource-collections:list"),
  createResourceCollection: (name: string, icon = "") =>
    ipcRenderer.invoke("resource-collections:create", name, icon) as Promise<ResourceCollection>,
  renameResourceCollection: (id: number, name: string) =>
    ipcRenderer.invoke("resource-collections:rename", id, name),
  setResourceCollectionIcon: (id: number, icon: string) =>
    ipcRenderer.invoke("resource-collections:set-icon", id, icon),
  reorderResourceCollections: (orderedIds: number[]) =>
    ipcRenderer.invoke("resource-collections:reorder", orderedIds),
  deleteResourceCollection: (id: number) => ipcRenderer.invoke("resource-collections:delete", id),
  fetchPageTitle: (url: string) => ipcRenderer.invoke("fetch:title", url),
  openUrl: (url: string) => ipcRenderer.invoke("resources:open-url", url),

  // Vault notes
  setVaultPath: (vaultPath: string) => ipcRenderer.invoke("vault:set-path", vaultPath),
  unwatchVault: (vaultPath: string) => ipcRenderer.invoke("vault:unwatch-path", vaultPath),
  getNoteList: (vaultPath: string) => ipcRenderer.invoke("vault:list-brief", vaultPath) as Promise<NoteBrief[]>,
  getVaultLibrarySummary: (vaultPath: string) =>
    ipcRenderer.invoke("vault:library-summary", vaultPath) as Promise<VaultLibrarySummary>,
  searchNotes: (vaultPath: string, query: string) => ipcRenderer.invoke("vault:search", vaultPath, query) as Promise<NoteBrief[]>,
  searchNoteContents: (vaultPath: string, query: string) =>
    ipcRenderer.invoke("vault:search-content", vaultPath, query) as Promise<NoteContentHit[]>,
  deleteNotes: (notePaths: string[]) => ipcRenderer.invoke("vault:delete-notes", notePaths),
  readNote: (notePath: string) => ipcRenderer.invoke("vault:read-note", notePath),
  saveNote: (notePath: string, content: string) => ipcRenderer.invoke("vault:save-note", notePath, content),
  saveAttachment: (vaultPath: string, ext: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("vault:save-attachment", vaultPath, ext, new Uint8Array(data)) as Promise<string>,
  pickAttachment: (vaultPath: string) =>
    ipcRenderer.invoke("vault:pick-attachment", vaultPath) as Promise<string | null>,
  createNote: (vaultPath: string, title: string) => ipcRenderer.invoke("vault:create-note", vaultPath, title),
  renameNote: (vaultPath: string, oldPath: string, newTitle: string) =>
    ipcRenderer.invoke("vault:rename-note", vaultPath, oldPath, newTitle),
  onVaultUpdated: (callback: (vaultPath: string, changes?: NoteListChanges) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, vaultPath: string, changes?: NoteListChanges) =>
      callback(vaultPath, changes);
    ipcRenderer.on("vault:updated", handler);
    return () => { ipcRenderer.removeListener("vault:updated", handler); };
  },

  // Private vaults
  getVaultPrivacyStatuses: () =>
    ipcRenderer.invoke("vault:privacy-statuses") as Promise<VaultPrivacyStatus[]>,
  unlockVault: (vaultPath: string, password: string) =>
    ipcRenderer.invoke("vault:unlock", vaultPath, password),
  lockVault: (vaultPath: string) => ipcRenderer.invoke("vault:lock", vaultPath),
  touchVaults: () => ipcRenderer.invoke("vault:touch"),
  updateVaultMeta: (vaultPath: string, patch: { private?: boolean }) =>
    ipcRenderer.invoke("vaults:update-meta", vaultPath, patch),
  makeVaultPrivate: (vaultPath: string, password: string) =>
    ipcRenderer.invoke("vault:make-private", vaultPath, password) as Promise<VaultMigrationResult & { resumed: boolean }>,
  makeVaultPublic: (vaultPath: string) =>
    ipcRenderer.invoke("vault:make-public", vaultPath) as Promise<{ files: number }>,
  changeVaultPassword: (vaultPath: string, currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke("vault:change-password", vaultPath, currentPassword, newPassword),
  onVaultLocked: (callback: (vaultPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, vaultPath: string) => callback(vaultPath);
    ipcRenderer.on("vault:locked", handler);
    return () => { ipcRenderer.removeListener("vault:locked", handler); };
  },
  onVaultUnlocked: (callback: (vaultPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, vaultPath: string) => callback(vaultPath);
    ipcRenderer.on("vault:unlocked", handler);
    return () => { ipcRenderer.removeListener("vault:unlocked", handler); };
  },
  onVaultPrivacyChanged: (callback: (status: VaultPrivacyStatus) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: VaultPrivacyStatus) => callback(status);
    ipcRenderer.on("vault:privacy-changed", handler);
    return () => { ipcRenderer.removeListener("vault:privacy-changed", handler); };
  },
  onVaultMigrationProgress: (callback: (progress: VaultMigrationProgress) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: VaultMigrationProgress) => callback(progress);
    ipcRenderer.on("vault:migration-progress", handler);
    return () => { ipcRenderer.removeListener("vault:migration-progress", handler); };
  },

  // Mind-map / canvas documents
  listCanvases: (vaultPath: string) => ipcRenderer.invoke("canvas:list", vaultPath) as Promise<CanvasFile[]>,
  readCanvas: (canvasPath: string) => ipcRenderer.invoke("canvas:read", canvasPath) as Promise<CanvasContent>,
  saveCanvas: (canvasPath: string, json: string, expectedModifiedAt: number | null) =>
    ipcRenderer.invoke("canvas:save", canvasPath, json, expectedModifiedAt) as Promise<CanvasSaveResult>,
  createCanvas: (vaultPath: string, title: string, templateJson: string) =>
    ipcRenderer.invoke("canvas:create", vaultPath, title, templateJson) as Promise<CanvasFile>,
  renameCanvas: (canvasPath: string, title: string) =>
    ipcRenderer.invoke("canvas:rename", canvasPath, title) as Promise<CanvasFile>,

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),
  getAllSettings: () => ipcRenderer.invoke("settings:get-all") as Promise<Record<string, string>>,

  // Growth tasks
  getGrowthTasks: () => ipcRenderer.invoke("growth:tasks") as Promise<GrowthTasksPayload>,
  addGrowthTask: (input: GrowthTaskInput) =>
    ipcRenderer.invoke("growth:add-task", input) as Promise<GrowthTask>,
  updateGrowthTask: (id: number, patch: GrowthTaskPatch) =>
    ipcRenderer.invoke("growth:update-task", id, patch) as Promise<GrowthTask>,
  completeGrowthTask: (id: number) =>
    ipcRenderer.invoke("growth:complete-task", id) as Promise<GrowthTask>,
  reopenGrowthTask: (id: number) =>
    ipcRenderer.invoke("growth:reopen-task", id) as Promise<GrowthTask>,
  deleteGrowthTask: (id: number) => ipcRenderer.invoke("growth:delete-task", id),
  clearCompletedGrowthTasks: () =>
    ipcRenderer.invoke("growth:clear-completed-tasks") as Promise<number>,

  // Growth (养成)
  getGrowthState: () => ipcRenderer.invoke("growth:state") as Promise<GrowthState>,
  createGrowthDomain: (name: string, weight: number, theme?: string) =>
    ipcRenderer.invoke("growth:create-domain", name, weight, theme) as Promise<GrowthDomain>,
  updateGrowthDomain: (id: number, patch: { name?: string; weight?: number; theme?: string }) =>
    ipcRenderer.invoke("growth:update-domain", id, patch) as Promise<GrowthDomain>,
  createGrowthCapability: (input: GrowthCapabilityInput) =>
    ipcRenderer.invoke("growth:create-capability", input) as Promise<GrowthCapability>,
  updateGrowthCapability: (id: number, patch: GrowthCapabilityPatch) =>
    ipcRenderer.invoke("growth:update-capability", id, patch) as Promise<GrowthCapability>,
  reviewGrowthCapability: (id: number, input: GrowthReviewInput) =>
    ipcRenderer.invoke("growth:review-capability", id, input) as Promise<GrowthReviewResult>,
  deleteGrowthCapability: (id: number) => ipcRenderer.invoke("growth:delete-capability", id),
  listGrowthEvidence: (capabilityId: number) =>
    ipcRenderer.invoke("growth:list-evidence", capabilityId) as Promise<GrowthEvidence[]>,
  addGrowthEvidence: (capabilityId: number, input: GrowthEvidenceInput) =>
    ipcRenderer.invoke("growth:add-evidence", capabilityId, input) as Promise<GrowthEvidence>,
  deleteGrowthEvidence: (id: number) => ipcRenderer.invoke("growth:delete-evidence", id),
  listGrowthSnapshots: (capabilityId: number) =>
    ipcRenderer.invoke("growth:list-snapshots", capabilityId) as Promise<GrowthSnapshot[]>,
  createGrowthSeason: (input: GrowthSeasonInput) =>
    ipcRenderer.invoke("growth:create-season", input) as Promise<GrowthSeason>,
  updateGrowthSeason: (id: number, patch: GrowthSeasonPatch) =>
    ipcRenderer.invoke("growth:update-season", id, patch) as Promise<GrowthSeason>,
  closeGrowthSeason: (id: number, outcome: string) =>
    ipcRenderer.invoke("growth:close-season", id, outcome) as Promise<GrowthSeason>,
  deleteGrowthSeason: (id: number) => ipcRenderer.invoke("growth:delete-season", id),
  pickGrowthCover: (title?: string) =>
    ipcRenderer.invoke("growth:pick-cover", title) as Promise<string | null>,
  deleteGrowthCover: (name: string) => ipcRenderer.invoke("growth:delete-cover", name),
  createGrowthChallenge: (input: GrowthChallengeInput) =>
    ipcRenderer.invoke("growth:create-challenge", input) as Promise<GrowthChallenge>,
  updateGrowthChallenge: (id: number, patch: GrowthChallengePatch) =>
    ipcRenderer.invoke("growth:update-challenge", id, patch) as Promise<GrowthChallenge>,
  deleteGrowthChallenge: (id: number) => ipcRenderer.invoke("growth:delete-challenge", id),
  resolveGrowthChallenge: (id: number, input: GrowthResolveInput) =>
    ipcRenderer.invoke("growth:resolve-challenge", id, input) as Promise<GrowthResolveResult>,
  createGrowthArtifact: (input: GrowthArtifactInput) =>
    ipcRenderer.invoke("growth:create-artifact", input) as Promise<GrowthArtifact>,
  updateGrowthArtifact: (id: number, patch: GrowthArtifactPatch) =>
    ipcRenderer.invoke("growth:update-artifact", id, patch) as Promise<GrowthArtifact>,
  deleteGrowthArtifact: (id: number) => ipcRenderer.invoke("growth:delete-artifact", id),
  addGrowthPrediction: (input: GrowthPredictionInput) =>
    ipcRenderer.invoke("growth:add-prediction", input) as Promise<GrowthPrediction>,
  settleGrowthPrediction: (id: number, actual: number) =>
    ipcRenderer.invoke("growth:settle-prediction", id, actual) as Promise<GrowthPrediction>,
  deleteGrowthPrediction: (id: number) => ipcRenderer.invoke("growth:delete-prediction", id),
  addGrowthSelfModel: (input: GrowthSelfModelInput) =>
    ipcRenderer.invoke("growth:add-self-model", input) as Promise<GrowthSelfModelEntry>,
  updateGrowthSelfModel: (id: number, patch: GrowthSelfModelPatch) =>
    ipcRenderer.invoke("growth:update-self-model", id, patch) as Promise<GrowthSelfModelEntry>,
  deleteGrowthSelfModel: (id: number) => ipcRenderer.invoke("growth:delete-self-model", id),
  addGrowthFeedback: (input: GrowthFeedbackInput) =>
    ipcRenderer.invoke("growth:add-feedback", input) as Promise<GrowthFeedback>,
  updateGrowthFeedback: (id: number, input: GrowthFeedbackInput) =>
    ipcRenderer.invoke("growth:update-feedback", id, input) as Promise<GrowthFeedback>,
  deleteGrowthFeedback: (id: number) => ipcRenderer.invoke("growth:delete-feedback", id),
  getGrowthTimeline: () => ipcRenderer.invoke("growth:timeline") as Promise<GrowthSnapshot[]>,
  exportGrowthData: (title: string) =>
    ipcRenderer.invoke("growth:export-data", title) as Promise<GrowthBackupExportResult>,
  previewGrowthImport: (title: string) =>
    ipcRenderer.invoke("growth:preview-import", title) as Promise<GrowthBackupPreview | null>,
  commitGrowthImport: (token: string) =>
    ipcRenderer.invoke("growth:commit-import", token) as Promise<GrowthBackupImportResult>,
  saveGrowthAnnualNote: (input: GrowthAnnualNoteInput) =>
    ipcRenderer.invoke("growth:save-annual", input) as Promise<GrowthAnnualNote>,
  deleteGrowthAnnualNote: (year: number) => ipcRenderer.invoke("growth:delete-annual", year),

  // Global shortcuts
  getGlobalShortcutStatus: () =>
    ipcRenderer.invoke("shortcuts:get-global-status") as Promise<GlobalShortcutStatus>,

  // Quick capture
  openQuickCapture: () => ipcRenderer.invoke("quick-capture:open"),
  closeQuickCapture: () => ipcRenderer.invoke("quick-capture:close"),
  quickCaptureSaved: () => ipcRenderer.invoke("quick-capture:submit"),
  onQuickCaptureSaved: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("quick-capture:saved", handler);
    return () => { ipcRenderer.removeListener("quick-capture:saved", handler); };
  },

  // Dialog
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  selectFile: () => ipcRenderer.invoke("dialog:select-file"),

  // Note collections
  loadNoteCollections: (vaultPath: string) =>
    ipcRenderer.invoke("note-collections:load", vaultPath) as Promise<NoteCollectionsFile | null>,
  saveNoteCollections: (vaultPath: string, data: any) => ipcRenderer.invoke("note-collections:save", vaultPath, data),

  // Canvas groups
  loadCanvasGroups: (vaultPath: string) =>
    ipcRenderer.invoke("canvas-groups:load", vaultPath) as Promise<CanvasGroupsFile | null>,
  saveCanvasGroups: (vaultPath: string, data: CanvasGroupsFile) =>
    ipcRenderer.invoke("canvas-groups:save", vaultPath, data),

  // PDF library
  getPdfState: () => ipcRenderer.invoke("pdf:get-state") as Promise<{ repoPath: string; exists: boolean; count: number }>,
  choosePdfRepo: () => ipcRenderer.invoke("pdf:choose-repo") as Promise<string | null>,
  openPdfRepo: (repoPath: string) => ipcRenderer.invoke("pdf:open-repo", repoPath),
  rescanPdfs: () => ipcRenderer.invoke("pdf:rescan") as Promise<{ total: number; changed: number }>,
  listPdfs: () => ipcRenderer.invoke("pdf:list") as Promise<PdfDocument[]>,
  resolvePdfEmbed: (target: string) => ipcRenderer.invoke("pdf:resolve-embed", target) as Promise<PdfDocument | null>,
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
  onPdfUpdated: (callback: (repoPath: string, changes?: PdfListChanges) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, repoPath: string, changes?: PdfListChanges) =>
      callback(repoPath, changes);
    ipcRenderer.on("pdf:updated", handler);
    return () => { ipcRenderer.removeListener("pdf:updated", handler); };
  },

  // Shell
  showItemInFolder: (filePath: string) => ipcRenderer.invoke("shell:show-item-in-folder", filePath),
  trashFile: (filePath: string) => ipcRenderer.invoke("shell:trash-file", filePath),
  trashFiles: (filePaths: string[]) => ipcRenderer.invoke("shell:trash-files", filePaths),

  // App
  getLaunchState: () => ipcRenderer.invoke("app:get-launch-state") as Promise<AppLaunchState>,

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
