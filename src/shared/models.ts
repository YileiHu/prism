// IPC-facing domain models shared by the Electron main process and the
// renderer. Keep this file type-only: database rows are mapped to these
// shapes at the IPC boundary so the renderer never sees snake_case columns
// or 0/1 flags.

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

export type GtdStatus = "inbox" | "someday" | "waiting" | "project" | "archived";

export interface GtdItem {
  id: number;
  title: string;
  status: GtdStatus;
  isNext: boolean;
  description: string;
  color: string;
  dueDate: string | null;
  createdAt: string;
  archivedAt: string | null;
  actionCount: number;
  doneActionCount: number;
}

export interface GtdAction {
  id: number;
  projectId: number;
  title: string;
  isDone: boolean;
  isNext: boolean;
  sortOrder: number;
  dueDate: string | null;
  createdAt: string;
  doneAt: string | null;
}

export interface GtdNextList {
  waiting: GtdItem[];
  projects: { project: GtdItem; action: GtdAction }[];
}

export interface FavoriteNote extends NoteRef {
  createdAt: string;
  missing?: boolean;
}

export interface RecentNote extends NoteRef {
  openedAt: string;
  missing?: boolean;
}
