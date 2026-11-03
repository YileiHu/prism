import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import type { LibraryRef } from "../../lib/workspace/types";
import { useLibraryData } from "../library/LibraryDataProvider";
import LibrarySidebar from "../library/LibrarySidebar";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import type { CollectionData } from "../collectionTypes";
import type { PdfCollectionData } from "../pdf/types";

export default function DocumentSidebar() {
  const { t } = useT();
  const showToast = useToast();
  const { setLibrary, showModule } = useWorkspace();
  const { vaults, library, note, pdf, pdfCols } = useLibraryData();
  const [noteRenameTarget, setNoteRenameTarget] = useState<CollectionData | null>(null);
  const [noteDeleteTarget, setNoteDeleteTarget] = useState<CollectionData | null>(null);
  const [pdfRenameTarget, setPdfRenameTarget] = useState<PdfCollectionData | null>(null);
  const [pdfDeleteTarget, setPdfDeleteTarget] = useState<PdfCollectionData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    if (active.id.toString().startsWith("coll-") && overId.startsWith("coll-")) {
      const from = note.collections.findIndex((entry) => `coll-${entry.id}` === active.id);
      const to = note.collections.findIndex((entry) => `coll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) note.handleReorderCollections(from, to);
      return;
    }
    if (active.id.toString().startsWith("pdfcoll-") && overId.startsWith("pdfcoll-")) {
      const from = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === active.id);
      const to = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) pdfCols.reorderCollections(from, to);
    }
  };

  const selectLibrary = (next: LibraryRef) => setLibrary(next);

  const confirmDeleteNoteCollection = () => {
    if (!noteDeleteTarget) return;
    const target = noteDeleteTarget;
    setNoteDeleteTarget(null);
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <LibrarySidebar
        vaults={vaults}
        library={library}
        note={note}
        pdfCols={pdfCols}
        pdfAllCount={pdf.documents.length}
        onSelectLibrary={selectLibrary}
        onRenameNoteCollection={setNoteRenameTarget}
        onDeleteNoteCollection={setNoteDeleteTarget}
        onRenamePdfCollection={setPdfRenameTarget}
        onDeletePdfCollection={setPdfDeleteTarget}
        onOpenCollections={() => showModule("library")}
      />

      <RenameModal
        open={noteRenameTarget !== null}
        initialValue={noteRenameTarget?.name ?? ""}
        title={t["collections.rename"]}
        placeholder={t["collections.namePlaceholder"]}
        onClose={() => setNoteRenameTarget(null)}
        onSubmit={(name) => {
          if (noteRenameTarget) {
            note.handleRenameCollection(noteRenameTarget, name);
            setNoteRenameTarget(null);
            showToast(t["collections.renamed"]);
          }
        }}
      />
      <ConfirmDialog
        open={noteDeleteTarget !== null}
        message={t["collections.deleteConfirm"]}
        confirmLabel={t["collections.delete"]}
        onConfirm={confirmDeleteNoteCollection}
        onClose={() => setNoteDeleteTarget(null)}
      />
      <RenameModal
        open={pdfRenameTarget !== null}
        initialValue={pdfRenameTarget?.name ?? ""}
        title={t["collections.rename"]}
        placeholder={t["collections.namePlaceholder"]}
        onClose={() => setPdfRenameTarget(null)}
        onSubmit={(name) => {
          if (pdfRenameTarget) pdfCols.renameCollection(pdfRenameTarget.id, name);
        }}
      />
      <ConfirmDialog
        open={pdfDeleteTarget !== null}
        message={t["pdf.deleteCollectionConfirm"].replace("{name}", pdfDeleteTarget?.name ?? "")}
        confirmLabel={t["collections.delete"]}
        onConfirm={() => {
          if (pdfDeleteTarget) pdfCols.deleteCollection(pdfDeleteTarget.id);
        }}
        onClose={() => setPdfDeleteTarget(null)}
      />
    </DndContext>
  );
}
