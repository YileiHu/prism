import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Button from "./Button";
import { useDragClickGuard } from "../lib/useDragClickGuard";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TabStripItem {
  id: string;
  title: string;
  icon: ReactNode;
}

interface Props {
  items: TabStripItem[];
  activeId: string | null;
  closeLabel: string;
  rightActions?: ReactNode;
  variant?: "default" | "chrome";
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
  onTabContextMenu?: (id: string, event: React.MouseEvent) => void;
}

function SortableTab({
  item,
  active,
  chrome,
  closeLabel,
  onSelect,
  onClose,
  onContextMenu,
}: {
  item: TabStripItem;
  active: boolean;
  chrome: boolean;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const clickGuard = useDragClickGuard(isDragging);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, WebkitAppRegion: "no-drag" } as React.CSSProperties}
      {...attributes}
      {...listeners}
      {...clickGuard}
      data-tab-active={active ? "true" : undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onAuxClick={(e) => {
        if (e.button === 1) onClose();
      }}
      title={item.id}
      className={`group relative flex items-center gap-1.5 pl-3 pr-1.5 text-caption cursor-pointer select-none whitespace-nowrap flex-shrink-0 rounded-full border transition-colors ${
        chrome ? "h-8" : "h-7"
      } ${
        active
          ? "chrome-pill-active border-transparent font-medium"
          : "border-transparent text-muted hover:text-secondary hover:bg-tint/[0.05]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {item.icon}
      <span className="max-w-[160px] truncate">{item.title}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={closeLabel}
        className={active ? "" : "opacity-70"}
      >
        <X size={11} />
      </Button>
    </div>
  );
}

function TabOverlay({ item }: { item: TabStripItem }) {
  return (
    <div className="flex items-center gap-1.5 pl-3 pr-2 h-7 text-caption whitespace-nowrap rounded-full bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
      {item.icon}
      <span className="max-w-[160px] truncate">{item.title}</span>
      <X size={11} className="ml-1 text-muted" />
    </div>
  );
}

export default function TabStrip({
  items,
  activeId,
  closeLabel,
  rightActions,
  variant = "default",
  onSelect,
  onClose,
  onReorder,
  onTabContextMenu,
}: Props) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which edges are clipped, for the fade hints
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const updateOverflow = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  // Vertical wheel scrolls the tab strip sideways (React's onWheel is passive,
  // so the listener must be attached natively to call preventDefault)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateOverflow();
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(el);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(updateOverflow, [items]);

  // Keep the active tab visible when it changes via sidebar or deep link
  useEffect(() => {
    if (!activeId) return;
    scrollRef.current
      ?.querySelector<HTMLElement>('[data-tab-active="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from !== -1 && to !== -1) onReorder(String(active.id), to);
  };

  const activeDragItem = activeDragId ? items.find((item) => item.id === activeDragId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div
        className={
          variant === "chrome"
            ? "h-full flex-1 min-w-0 flex items-stretch"
            : "h-9 flex-shrink-0 flex items-stretch border-b border-line/50 bg-surface"
        }
      >
        <div className="relative flex-1 min-w-0 flex">
          <div
            ref={scrollRef}
            onScroll={updateOverflow}
            className="flex-1 flex items-center gap-1.5 px-2 overflow-x-auto scrollbar-none"
          >
            <SortableContext items={items.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
              {items.map((item) => (
                <SortableTab
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  chrome={variant === "chrome"}
                  closeLabel={closeLabel}
                  onSelect={() => onSelect(item.id)}
                  onClose={() => onClose(item.id)}
                  onContextMenu={
                    onTabContextMenu
                      ? (event) => {
                          event.preventDefault();
                          onTabContextMenu(item.id, event);
                        }
                      : undefined
                  }
                />
              ))}
            </SortableContext>
          </div>
          {overflow.left && <div className="tab-fade-left" />}
          {overflow.right && <div className="tab-fade-right" />}
        </div>
        {/* Right-side actions: always visible, even with no open tabs */}
        {rightActions && (
          <div
            className="flex items-center flex-shrink-0 border-l border-line/30 pl-1 pr-1.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {rightActions}
          </div>
        )}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeDragItem ? <TabOverlay item={activeDragItem} /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
