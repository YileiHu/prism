import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { CollectionData } from "../collectionTypes";
import type { PdfCollectionData } from "../pdf/types";
import type { usePdfCollections } from "../pdf/usePdfCollections";
import { useCollectionDialogs } from "./CollectionDialogs";
import type { NoteLibrary } from "./useNoteLibrary";

// Shared rename/delete wiring for note and PDF collections. The two sidebar
// hosts render the returned dialog props; the handlers (including the note
// deletion undo snapshot) stay identical.
export function useNotePdfDialogs(
  note: NoteLibrary,
  pdfCols: ReturnType<typeof usePdfCollections>,
) {
  const { t } = useT();
  const showToast = useToast();
  const noteDialogs = useCollectionDialogs<CollectionData>();
  const pdfDialogs = useCollectionDialogs<PdfCollectionData>();

  const openNoteRename = (collection: CollectionData) => {
    noteDialogs.openRename({ id: collection.id, name: collection.name, data: collection });
  };
  const openNoteDelete = (collection: CollectionData) => {
    noteDialogs.openDelete({ id: collection.id, name: collection.name, data: collection });
  };
  const openPdfRename = (collection: PdfCollectionData) => {
    pdfDialogs.openRename({ id: collection.id, name: collection.name, data: collection });
  };
  const openPdfDelete = (collection: PdfCollectionData) => {
    pdfDialogs.openDelete({ id: collection.id, name: collection.name, data: collection });
  };

  const confirmDeleteNoteCollection = (target: CollectionData) => {
    noteDialogs.closeDelete();
    const snapshot = note.collections;
    const previousSelected = note.selectedCollectionId;
    const { collName, onConfirm } = note.handleDeleteCollection(target.id);
    onConfirm();
    showToast(t["collections.deleted"].replace("{name}", collName), {
      action: {
        label: t["common.undo"],
        onClick: () => note.restoreCollections(snapshot, previousSelected),
      },
    });
  };

  const noteDialogProps = {
    renameTarget: noteDialogs.renameTarget,
    deleteTarget: noteDialogs.deleteTarget,
    renameTitle: t["collections.rename"],
    renamePlaceholder: t["collections.namePlaceholder"],
    deleteMessage: () => t["collections.deleteConfirm"],
    confirmLabel: t["collections.delete"],
    onRename: (target: { id: string; name: string; data: CollectionData }, name: string) => {
      note.handleRenameCollection(target.data, name);
      noteDialogs.closeRename();
      showToast(t["collections.renamed"]);
    },
    onDelete: (target: { id: string; name: string; data: CollectionData }) => {
      confirmDeleteNoteCollection(target.data);
    },
    onCloseRename: noteDialogs.closeRename,
    onCloseDelete: noteDialogs.closeDelete,
  };

  const pdfDialogProps = {
    renameTarget: pdfDialogs.renameTarget,
    deleteTarget: pdfDialogs.deleteTarget,
    renameTitle: t["collections.rename"],
    renamePlaceholder: t["collections.namePlaceholder"],
    deleteMessage: (target: { id: string; name: string; data: PdfCollectionData }) =>
      t["pdf.deleteCollectionConfirm"].replace("{name}", target.name),
    confirmLabel: t["collections.delete"],
    onRename: (target: { id: string; name: string; data: PdfCollectionData }, name: string) => {
      pdfCols.renameCollection(target.id, name);
      pdfDialogs.closeRename();
    },
    onDelete: (target: { id: string; name: string; data: PdfCollectionData }) => {
      pdfCols.deleteCollection(target.id);
      pdfDialogs.closeDelete();
    },
    onCloseRename: pdfDialogs.closeRename,
    onCloseDelete: pdfDialogs.closeDelete,
  };

  return {
    openNoteRename,
    openNoteDelete,
    openPdfRename,
    openPdfDelete,
    noteDialogProps,
    pdfDialogProps,
  };
}
