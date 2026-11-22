import { DndContext } from "@dnd-kit/core";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import type { LibraryRef } from "../../lib/workspace/types";
import { useLibraryData } from "../library/LibraryDataProvider";
import CollectionDialogs from "../library/CollectionDialogs";
import LibraryDragOverlay from "../library/LibraryDragOverlay";
import LibrarySidebar from "../library/LibrarySidebar";
import { useLibraryDnd } from "../library/useLibraryDnd";
import { useNotePdfDialogs } from "../library/useNotePdfDialogs";

export default function DocumentSidebar() {
  const { setLibrary, showModule } = useWorkspace();
  const { vaults, library, note, pdf, pdfCols } = useLibraryData();
  const dnd = useLibraryDnd({
    vaults,
    note,
    pdfDocuments: pdf.documents,
    pdfCols,
  });
  const {
    openNoteRename,
    openNoteDelete,
    openPdfRename,
    openPdfDelete,
    noteDialogProps,
    pdfDialogProps,
  } = useNotePdfDialogs(note, pdfCols);

  const selectLibrary = (next: LibraryRef) => setLibrary(next);

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={dnd.handleDragStart}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <LibrarySidebar
        vaults={vaults}
        library={library}
        note={note}
        pdfCols={pdfCols}
        pdfAllCount={pdf.documents.length}
        onSelectLibrary={selectLibrary}
        onRenameNoteCollection={openNoteRename}
        onDeleteNoteCollection={openNoteDelete}
        onRenamePdfCollection={openPdfRename}
        onDeletePdfCollection={openPdfDelete}
        onOpenCollections={() => showModule("library")}
      />

      <LibraryDragOverlay drag={dnd.drag} />

      <CollectionDialogs {...noteDialogProps} />
      <CollectionDialogs {...pdfDialogProps} />
    </DndContext>
  );
}
