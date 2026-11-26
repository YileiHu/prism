import type { ReactNode } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import EmptyState from "../EmptyState";

/** Sidebar frame for a sortable collection list (notes, PDF, web resources). */
export default function CollectionSection({
  ids,
  emptyText,
  children,
}: {
  ids: string[];
  emptyText: string;
  children: ReactNode;
}) {
  if (ids.length === 0) return <EmptyState size="card" text={emptyText} />;
  return (
    <div className="sidebar-group">
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}
