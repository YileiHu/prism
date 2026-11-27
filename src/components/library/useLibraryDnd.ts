import { useCallback, useState } from "react";
import {
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { VaultEntry } from "../../types";
import type { PdfDocument } from "../../shared/models";
import type { CollectionData } from "../collectionTypes";
import type { PdfCollectionData } from "../pdf/types";
import type { NoteLibrary } from "./useNoteLibrary";
import type { usePdfCollections } from "../pdf/usePdfCollections";

export type LibraryDragState =
  | { kind: "note"; title: string; paths: string[] }
  | { kind: "note-collection"; collection: CollectionData }
  | { kind: "pdf-doc"; title: string }
  | { kind: "pdf-collection"; collection: PdfCollectionData }
  | null;

interface Params {
  vaults: VaultEntry[];
  note: NoteLibrary;
  pdfDocuments: PdfDocument[];
  pdfCols: ReturnType<typeof usePdfCollections>;
}

// One DnD state machine for the library sidebar. Both the library page and the
// workspace sidebar mount it; neither needs its own sensors, drag state or
// overlay bookkeeping. The page additionally has the note/PDF content mounted,
// so it is the only place where those payloads can originate.
export function useLibraryDnd({ vaults, note, pdfDocuments, pdfCols }: Params) {
  const { t } = useT();
  const showToast = useToast();
  const [drag, setDrag] = useState<LibraryDragState>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const kind = args.active.data.current?.kind;
    if (kind === "note" || kind === "pdf-doc") return pointerWithin(args);
    return closestCenter(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.kind === "note") {
      const paths = Array.isArray(data.paths) ? data.paths as string[] : [];
      setDrag({ kind: "note", title: String(data.title ?? ""), paths });
    } else if (data?.kind === "collection") {
      const collection = note.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "note-collection", collection });
    } else if (data?.kind === "pdf-doc") {
      const doc = pdfDocuments.find((entry) => entry.id === data.id);
      if (doc) setDrag({ kind: "pdf-doc", title: doc.title });
    } else if (data?.kind === "pdf-collection") {
      const collection = pdfCols.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "pdf-collection", collection });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDrag(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;
    const overId = String(over.id);

    if (data?.kind === "note") {
      if (!overId.startsWith("coll-")) return;
      const paths = Array.isArray(data.paths) ? data.paths as string[] : [];
      if (paths.length > 0) note.handleMoveNotesToCollection(overId.slice(5), paths);
      return;
    }
    if (data?.kind === "collection") {
      if (!overId.startsWith("coll-") || active.id === over.id) return;
      const from = note.collections.findIndex((entry) => `coll-${entry.id}` === active.id);
      const to = note.collections.findIndex((entry) => `coll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) note.handleReorderCollections(from, to);
      return;
    }
    if (data?.kind === "pdf-doc") {
      if (!overId.startsWith("pdfcoll-")) return;
      const doc = pdfDocuments.find((entry) => entry.id === data.id);
      const collection = pdfCols.collections.find((entry) => entry.id === overId.slice(8));
      if (doc && collection) {
        pdfCols.movePaths(collection.id, [doc.relPath]);
        showToast(t["collections.moved"].replace("{name}", collection.name));
      }
      return;
    }
    if (data?.kind === "pdf-collection") {
      if (!overId.startsWith("pdfcoll-") || active.id === over.id) return;
      const from = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === active.id);
      const to = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) pdfCols.reorderCollections(from, to);
    }
  };

  const handleDragCancel = useCallback(() => setDrag(null), []);

  return {
    drag,
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
