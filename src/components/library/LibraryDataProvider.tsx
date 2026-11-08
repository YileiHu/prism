import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VaultEntry } from "../../types";
import { normalizePath, type LibraryRef } from "../../lib/workspace/types";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import { usePdfCollections } from "../pdf/usePdfCollections";
import { useCanvasLibrary } from "../canvas/useCanvasLibrary";
import { CANVAS_VIEW_ID, useNoteLibrary, type NoteLibrary } from "./useNoteLibrary";

interface LibraryData {
  vaults: VaultEntry[];
  library: LibraryRef;
  pdfMode: boolean;
  canvasMode: boolean;
  note: NoteLibrary;
  pdf: ReturnType<typeof usePdfDocuments>;
  pdfCols: ReturnType<typeof usePdfCollections>;
  canvas: ReturnType<typeof useCanvasLibrary>;
}

const LibraryDataContext = createContext<LibraryData | null>(null);

export function LibraryDataProvider({ vaults, children }: { vaults: VaultEntry[]; children: ReactNode }) {
  const { state, setLibrary } = useWorkspace();
  const pdf = usePdfDocuments();
  const [noteVaultPath, setNoteVaultPath] = useState(() =>
    state.library.kind !== "pdf" ? state.library.vaultPath : vaults[0]?.path ?? "",
  );

  // Keep the last vault around while the PDF library is selected, so switching
  // back does not rescan from scratch.
  useEffect(() => {
    if (state.library.kind !== "pdf" && state.library.vaultPath) {
      setNoteVaultPath(state.library.vaultPath);
    }
  }, [state.library]);

  useEffect(() => {
    if (vaults.length === 0) return;
    if (noteVaultPath && vaults.some((vault) => normalizePath(vault.path) === normalizePath(noteVaultPath))) {
      return;
    }
    if (state.library.kind !== "pdf") {
      const vaultPath = state.library.vaultPath;
      if (vaults.some((vault) => normalizePath(vault.path) === normalizePath(vaultPath))) {
        setNoteVaultPath(vaultPath);
        return;
      }
    }
    setNoteVaultPath(vaults[0].path);
  }, [vaults, noteVaultPath, state.library]);

  // Any route into the whiteboard view (sidebar, restored/opened canvas tab)
  // updates the per-vault selection memory, mirroring collection selection.
  const canvasVaultPath = state.library.kind === "canvas" ? state.library.vaultPath : "";
  useEffect(() => {
    if (!canvasVaultPath) return;
    void window.prism.setSetting(`last_coll_${canvasVaultPath}`, CANVAS_VIEW_ID);
  }, [canvasVaultPath]);

  const libraryRepoPath = state.library.kind === "pdf" ? state.library.repoPath : "";
  useEffect(() => {
    if (state.library.kind !== "pdf" || !pdf.repoPath) return;
    if (normalizePath(libraryRepoPath) === normalizePath(pdf.repoPath)) return;
    setLibrary({ kind: "pdf", repoPath: pdf.repoPath });
  }, [state.library.kind, libraryRepoPath, pdf.repoPath, setLibrary]);

  const note = useNoteLibrary(noteVaultPath);
  const pdfCols = usePdfCollections(pdf.repoPath);
  const canvas = useCanvasLibrary(noteVaultPath);
  const pdfMode = state.library.kind === "pdf";
  const canvasMode = state.library.kind === "canvas";

  const value = useMemo<LibraryData>(
    () => ({ vaults, library: state.library, pdfMode, canvasMode, note, pdf, pdfCols, canvas }),
    [vaults, state.library, pdfMode, canvasMode, note, pdf, pdfCols, canvas],
  );

  return <LibraryDataContext.Provider value={value}>{children}</LibraryDataContext.Provider>;
}

export function useLibraryData(): LibraryData {
  const value = useContext(LibraryDataContext);
  if (!value) throw new Error("useLibraryData must be used inside LibraryDataProvider");
  return value;
}
