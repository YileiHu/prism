import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import type { LibraryRef } from "../../lib/workspace/types";
import { persistVaultOrder } from "../../lib/vaultOrder";
import { useLibraryData } from "../library/LibraryDataProvider";
import CollectionDragPreview from "../library/CollectionDragPreview";
import VaultDragPreview from "../library/VaultDragPreview";
import LibrarySidebar from "../library/LibrarySidebar";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import type { CollectionData } from "../collectionTypes";
import type { PdfCollectionData } from "../pdf/types";
import type { VaultEntry } from "../../types";

type DragState =
  | { kind: "vault"; vault: VaultEntry }
  | { kind: "note-collection"; collection: CollectionData }
  | { kind: "pdf-collection"; collection: PdfCollectionData }
  | null;

export default function DocumentSidebar() {
  const { t } = useT();
  const showToast = useToast();
  const { setLibrary, showModule } = useWorkspace();
  const { vaults, library, note, pdf, pdfCols } = useLibraryData();
  const [drag, setDrag] = useState<DragState>(null);
  const [noteRenameTarget, setNoteRenameTarget] = useState<CollectionData | null>(null);
  const [noteDeleteTarget, setNoteDeleteTarget] = useState<CollectionData | null>(null);
  const [pdfRenameTarget, setPdfRenameTarget] = useState<PdfCollectionData | null>(null);
  const [pdfDeleteTarget, setPdfDeleteTarget] = useState<PdfCollectionData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.kind === "vault") {
      const vault = vaults.find((entry) => entry.path === data.id);
      if (vault) setDrag({ kind: "vault", vault });
    } else if (data?.kind === "collection") {
      const collection = note.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "note-collection", collection });
    } else if (data?.kind === "pdf-collection") {
      const collection = pdfCols.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "pdf-collection", collection });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const data = active.data.current;
    const overId = String(over.id);
    if (data?.kind === "vault") {
      if (!overId.startsWith("vault-")) return;
      const from = vaults.findIndex((entry) => `vault-${entry.path}` === active.id);
      const to = vaults.findIndex((entry) => `vault-${entry.path}` === overId);
      if (from !== -1 && to !== -1) {
        void persistVaultOrder(vaults, from, to).catch(() => {
          showToast(t["common.saveFailed"], "error");
        });
      }
      return;
    }
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
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

      <DragOverlay dropAnimation={null}>
        {drag?.kind === "vault" && <VaultDragPreview vault={drag.vault} />}
        {drag?.kind === "note-collection" && (
          <CollectionDragPreview
            name={drag.collection.name}
            color={drag.collection.color}
            count={drag.collection.notePaths.length}
          />
        )}
        {drag?.kind === "pdf-collection" && (
          <CollectionDragPreview
            name={drag.collection.name}
            color={drag.collection.color}
            count={drag.collection.pdfPaths.length}
          />
        )}
      </DragOverlay>

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
