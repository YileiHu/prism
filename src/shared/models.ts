// IPC-facing domain models shared by the Electron main process and the
// renderer. Keep this file type-only: database rows are mapped to these
// shapes at the IPC boundary so the renderer never sees snake_case columns
// or 0/1 flags.

import type { GlobalShortcutAction } from "./shortcuts";

export interface NoteRef {
  path: string;
  title: string;
}

export interface NoteBrief extends NoteRef {
  id: number;
  tags: string;
  modifiedAt: string;
}

export interface NoteContentHit extends NoteRef {
  snippet: string;
}

export interface Resource {
  id: number;
  url: string;
  title: string;
  notes: string;
  createdAt: string;
  tags: string[];
}

export interface TagInfo {
  name: string;
  count: number;
  color: string;
}

export interface PdfDocument {
  id: number;
  repoPath: string;
  path: string;
  relPath: string;
  title: string;
  pageCount: number | null;
  fileSize: number;
  modifiedAt: string;
  coverPath: string;
  coverVersion: number;
  coverCustom: boolean;
  coverDirty: boolean;
  addedAt: string;
}

export interface GtdTaskProjectRef {
  id: number;
  title: string;
  color: string;
  archived: boolean;
}

export interface GtdTask {
  id: number;
  title: string;
  notes: string;
  project: GtdTaskProjectRef | null;
  /** Local calendar date (YYYY-MM-DD): the day the user plans to work on it. */
  scheduledDate: string | null;
  /** Local calendar date (YYYY-MM-DD): a hard deadline. */
  dueDate: string | null;
  /** SQLite UTC timestamp; null means the task is still open. */
  completedAt: string | null;
  createdAt: string;
  /** Manual order inside a project. */
  sortOrder: number;
}

export interface GtdTaskPatch {
  title?: string;
  notes?: string;
  projectId?: number | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
}

export interface GtdProject {
  id: number;
  title: string;
  description: string;
  color: string;
  createdAt: string;
  archivedAt: string | null;
  taskCount: number;
  doneTaskCount: number;
}

export type GtdViewKey = "calendar" | "completed" | "project";

export type GtdProjectLinkKind = "note" | "canvas";

export interface GtdProjectLink {
  id: number;
  kind: GtdProjectLinkKind;
  vaultPath: string;
  filePath: string;
  title: string;
  missing: boolean;
}

export interface GtdProjectFolder {
  projectId: number;
  vaultPath: string;
  folderPath: string;
  missing: boolean;
}

export interface GtdProjectDocsPayload {
  folder: GtdProjectFolder | null;
  links: GtdProjectLink[];
}

export interface GlobalShortcutState {
  shortcut: string;
  registered: boolean;
}

// OS-level registration result keyed by the global shortcut actions.
export type GlobalShortcutStatus = Record<GlobalShortcutAction, GlobalShortcutState>;

// Capabilities behind the "close behavior / launch at login" settings. The
// renderer uses it to disable unsupported rows and to explain that login items
// are only written by packaged builds.
export interface AppLaunchState {
  packaged: boolean;
  loginItemSupported: boolean;
  hiddenStartSupported: boolean;
}

export interface CanvasFile {
  path: string;
  title: string;
  modifiedAt: number;
}

export interface CanvasContent extends CanvasFile {
  json: string;
}

export type CanvasSaveResult =
  | { modifiedAt: number }
  | { conflict: true; modifiedAt: number };

export interface NoteGroupData {
  id: string;
  name: string;
  notePaths: string[];
  color?: string;
}

export interface NoteCollectionData {
  id: string;
  name: string;
  notePaths: string[];
  groups?: NoteGroupData[];
  color?: string;
}

export interface NoteCollectionsFile {
  version?: number;
  collections: NoteCollectionData[];
}

/** One IPC round-trip for the startup path: notes, collections, canvases. */
export interface VaultLibrarySummary {
  notes: NoteBrief[];
  collections: NoteCollectionsFile | null;
  canvases: CanvasFile[];
}

/** Incremental note-list patch pushed by the vault watcher scan. */
export interface NoteListChanges {
  upserted: NoteBrief[];
  deleted: string[];
}

/** Incremental PDF-list patch pushed by the repo watcher scan. */
export interface PdfListChanges {
  upserted: PdfDocument[];
  deleted: string[];
}

export interface CanvasGroup {
  id: string;
  name: string;
  color?: string;
  paths: string[];
}

export interface CanvasGroupsFile {
  version: number;
  groups: CanvasGroup[];
  paths: string[];
}

export interface VaultPrivacyStatus {
  path: string;
  private: boolean;
  locked: boolean;
}

export interface VaultMigrationProgress {
  vaultPath: string;
  done: number;
  total: number;
}

export interface VaultMigrationResult {
  vaultPath: string;
  files: number;
}
