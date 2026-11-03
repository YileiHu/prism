import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VaultEntry } from "../../types";
import { normalizePath, type LibraryRef } from "../../lib/workspace/types";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import { usePdfCollections } from "../pdf/usePdfCollections";
import { useNoteLibrary, type NoteLibrary } from "./useNoteLibrary";

interface LibraryData {
  vaults: VaultEntry[];
  library: LibraryRef;
  pdfMode: boolean;
  note: NoteLibrary;
  pdf: ReturnType<typeof usePdfDocuments>;
  pdfCols: ReturnType<typeof usePdfCollections>;
}

const LibraryDataContext = createContext<LibraryData | null>(null);

export function LibraryDataProvider({ vaults, children }: { vaults: VaultEntry[]; children: ReactNode }) {
  const { state, setLibrary } = useWorkspace();
  const pdf = usePdfDocuments();
  const [noteVaultPath, setNoteVaultPath] = useState(() =>
    state.library.kind === "note" ? state.library.vaultPath : vaults[0]?.path ?? "",
  );

  // Keep the last note vault around while the PDF library is selected, so
  // switching back does not rescan from scratch.
  useEffect(() => {
    if (state.library.kind === "note" && state.library.vaultPath) {
      setNoteVaultPath(state.library.vaultPath);
    }
  }, [state.library]);

  useEffect(() => {
    if (vaults.length === 0) return;
    if (noteVaultPath && vaults.some((vault) => normalizePath(vault.path) === normalizePath(noteVaultPath))) {
      return;
    }
    if (state.library.kind === "note") {
      const vaultPath = state.library.vaultPath;
      if (vaults.some((vault) => normalizePath(vault.path) === normalizePath(vaultPath))) {
        setNoteVaultPath(vaultPath);
        return;
      }
    }
    setNoteVaultPath(vaults[0].path);
  }, [vaults, noteVaultPath, state.library]);

  const libraryRepoPath = state.library.kind === "pdf" ? state.library.repoPath : "";
  useEffect(() => {
    if (state.library.kind !== "pdf" || !pdf.repoPath) return;
    if (normalizePath(libraryRepoPath) === normalizePath(pdf.repoPath)) return;
    setLibrary({ kind: "pdf", repoPath: pdf.repoPath });
  }, [state.library.kind, libraryRepoPath, pdf.repoPath, setLibrary]);

  const note = useNoteLibrary(noteVaultPath);
  const pdfCols = usePdfCollections(pdf.repoPath);
  const pdfMode = state.library.kind === "pdf";

  const value = useMemo<LibraryData>(
    () => ({ vaults, library: state.library, pdfMode, note, pdf, pdfCols }),
    [vaults, state.library, pdfMode, note, pdf, pdfCols],
  );

  return <LibraryDataContext.Provider value={value}>{children}</LibraryDataContext.Provider>;
}

export function useLibraryData(): LibraryData {
  const value = useContext(LibraryDataContext);
  if (!value) throw new Error("useLibraryData must be used inside LibraryDataProvider");
  return value;
}
