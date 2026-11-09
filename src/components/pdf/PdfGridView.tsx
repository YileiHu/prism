import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "../Skeleton";
import EmptyState from "../EmptyState";
import PdfCard from "./PdfCard";
import { relKey, type PdfCollectionData, type PdfDocument } from "./types";

const COLUMN_MIN = 150;
const GAP = 16;

interface Props {
  scrollRef: RefObject<HTMLDivElement | null>;
  documents: PdfDocument[];
  collections: PdfCollectionData[];
  activeCollection: PdfCollectionData | null;
  loading: boolean;
  emptyText: string;
  onOpen: (doc: PdfDocument) => void;
  onAddToCollection: (doc: PdfDocument, collectionId: string) => void;
  onRemoveFromCollection: (doc: PdfDocument) => void;
  onDelete: (doc: PdfDocument) => void;
  onShowInFolder: (doc: PdfDocument) => void;
  onDocUpdated: (doc: PdfDocument, patch: Partial<PdfDocument>) => void;
}

export default function PdfGridView({
  scrollRef,
  documents,
  collections,
  activeCollection,
  loading,
  emptyText,
  onOpen,
  onAddToCollection,
  onRemoveFromCollection,
  onDelete,
  onShowInFolder,
  onDocUpdated,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Column count follows the same auto-fill rule as the non-virtualized grid,
  // so row chunking matches what CSS would have produced.
  const columns = Math.max(1, Math.floor((width + GAP) / (COLUMN_MIN + GAP)));
  const columnWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : COLUMN_MIN;
  const rowEstimate = Math.round((columnWidth * 4) / 3 + 92);

  const rows = useMemo(() => {
    const out: PdfDocument[][] = [];
    for (let i = 0; i < documents.length; i += columns) {
      out.push(documents.slice(i, i + columns));
    }
    return out;
  }, [documents, columns]);

  // Membership used to be recomputed per card per render; build it once.
  const memberships = useMemo(() => {
    const map = new Map<number, PdfCollectionData[]>();
    for (const doc of documents) {
      const key = relKey(doc.relPath);
      map.set(doc.id, collections.filter((c) => c.pdfPaths.some((p) => relKey(p) === key)));
    }
    return map;
  }, [documents, collections]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimate,
    overscan: 2,
  });

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, documents.length]);

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, columns]);

  if (loading && documents.length === 0) {
    return (
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>
            <Skeleton className="w-full aspect-[3/4] rounded-card" />
            <Skeleton className="h-3 w-4/5 mt-2" />
            <Skeleton className="h-2.5 w-2/5 mt-1.5" />
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return <EmptyState size="module" text={emptyText} />;
  }

  return (
    <div ref={gridRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const rowDocs = rows[virtualRow.index] ?? [];
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
              paddingBottom: GAP,
            }}
          >
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
            >
              {rowDocs.map((doc) => (
                <div key={doc.id}>
                  <PdfCard
                    doc={doc}
                    collections={collections}
                    memberCollections={memberships.get(doc.id) ?? []}
                    activeCollection={activeCollection}
                    onOpen={() => onOpen(doc)}
                    onAddToCollection={(collId) => onAddToCollection(doc, collId)}
                    onRemoveFromCollection={() => onRemoveFromCollection(doc)}
                    onDelete={() => onDelete(doc)}
                    onShowInFolder={() => onShowInFolder(doc)}
                    onDocUpdated={(patch) => onDocUpdated(doc, patch)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
