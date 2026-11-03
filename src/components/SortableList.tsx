import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDragClickGuard } from "../lib/useDragClickGuard";

interface Props<T> {
  items: T[];
  itemId: (item: T) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  renderOverlay: (item: T) => ReactNode;
  className?: string;
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const clickGuard = useDragClickGuard(isDragging);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      {...clickGuard}
    >
      {children}
    </div>
  );
}

// Vertical pointer-driven sortable list (same feel as the collections page):
// siblings slide out of the way while a floating overlay follows the cursor.
export default function SortableList<T>({ items, itemId, onReorder, renderItem, renderOverlay, className = "" }: Props<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = items.map(itemId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  const activeItem = activeId === null ? undefined : items.find((item) => itemId(item) === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow key={itemId(item)} id={itemId(item)}>
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
      {/* Portal to body: a transformed ancestor becomes the containing block
          for position:fixed and would offset the overlay */}
      {createPortal(
        <DragOverlay>
          {activeItem !== undefined && (
            <div className="rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
              {renderOverlay(activeItem)}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
