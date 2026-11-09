export type ModuleId = "home" | "resources" | "gtd" | "library" | "settings";

export type PaneSide = "left" | "right";

export interface NoteDocTab {
  id: string;
  kind: "note";
  vaultPath: string;
  path: string;
  title: string;
}

export interface PdfDocTab {
  id: string;
  kind: "pdf";
  repoPath: string;
  relPath: string;
  title: string;
}

export interface CanvasDocTab {
  id: string;
  kind: "canvas";
  vaultPath: string;
  path: string;
  title: string;
}

export type DocTab = NoteDocTab | PdfDocTab | CanvasDocTab;

export type LibraryRef =
  | { kind: "note"; vaultPath: string }
  | { kind: "canvas"; vaultPath: string }
  | { kind: "pdf"; repoPath: string };

export interface SplitState {
  leftId: string;
  rightId: string;
  focused: PaneSide;
}

export interface WorkspaceState {
  module: ModuleId;
  tabs: DocTab[];
  activeId: string | null;
  split: SplitState | null;
  library: LibraryRef;
  hydrated: boolean;
}

import { normalizePath } from "../paths";

export { normalizePath, noteKey } from "../paths";

export function noteDocId(notePath: string): string {
  return `note::${normalizePath(notePath)}`;
}

export function pdfDocId(repoPath: string, relPath: string): string {
  return `pdf::${normalizePath(repoPath)}::${normalizePath(relPath)}`;
}

export function canvasDocId(canvasPath: string): string {
  return `canvas::${normalizePath(canvasPath)}`;
}

export function makeNoteDoc(vaultPath: string, notePath: string, title: string): NoteDocTab {
  return { id: noteDocId(notePath), kind: "note", vaultPath, path: notePath, title };
}

export function makePdfDoc(repoPath: string, relPath: string, title: string): PdfDocTab {
  return { id: pdfDocId(repoPath, relPath), kind: "pdf", repoPath, relPath, title };
}

export function makeCanvasDoc(vaultPath: string, canvasPath: string, title: string): CanvasDocTab {
  return { id: canvasDocId(canvasPath), kind: "canvas", vaultPath, path: canvasPath, title };
}

export function initialWorkspaceState(): WorkspaceState {
  return {
    module: "home",
    tabs: [],
    activeId: null,
    split: null,
    library: { kind: "note", vaultPath: "" },
    hydrated: false,
  };
}
