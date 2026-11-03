import { Skeleton } from "../Skeleton";
import EmptyState from "../EmptyState";
import PdfCard from "./PdfCard";
import type { PdfCollectionData, PdfDocument } from "./types";

interface Props {
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
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
    >
      {documents.map((doc, index) => (
        <div key={doc.id} className="stagger-in" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
          <PdfCard
            doc={doc}
            collections={collections}
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
  );
}
