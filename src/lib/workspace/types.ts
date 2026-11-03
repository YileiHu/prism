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

export type DocTab = NoteDocTab | PdfDocTab;

export type LibraryRef =
  | { kind: "note"; vaultPath: string }
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

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function noteDocId(path: string): string {
  return `note::${normalizePath(path)}`;
}

export function pdfDocId(repoPath: string, relPath: string): string {
  return `pdf::${normalizePath(repoPath)}::${normalizePath(relPath)}`;
}

export function makeNoteDoc(vaultPath: string, path: string, title: string): NoteDocTab {
  return { id: noteDocId(path), kind: "note", vaultPath, path, title };
}

export function makePdfDoc(repoPath: string, relPath: string, title: string): PdfDocTab {
  return { id: pdfDocId(repoPath, relPath), kind: "pdf", repoPath, relPath, title };
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
