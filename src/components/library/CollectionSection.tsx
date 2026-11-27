import type { ReactNode } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import EmptyState from "../EmptyState";

/** Sortable collection list separated from the "all" rows by a hairline. */
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
    <div className="mt-2 border-t border-line/60 pt-1">
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}
