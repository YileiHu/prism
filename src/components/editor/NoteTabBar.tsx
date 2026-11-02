import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
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
import type { NoteTab } from "./useNoteTabs";

interface Props {
  tabs: NoteTab[];
  activePath: string | null;
  newLabel: string;
  closeLabel: string;
  sidebarCollapsed: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewNote: () => void;
  onNewCollection: () => void;
  onToggleSidebar: () => void;
  onReorder: (path: string, toIndex: number) => void;
}

function SortableTab({
  tab,
  active,
  closeLabel,
  onSelect,
  onClose,
}: {
  tab: NoteTab;
  active: boolean;
  closeLabel: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.path });

  const clickGuard = useDragClickGuard(isDragging);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      {...clickGuard}
      data-tab-active={active ? "true" : undefined}
      onClick={onSelect}
      onAuxClick={(e) => {
        if (e.button === 1) onClose();
      }}
      title={tab.path}
      className={`group relative flex items-center gap-1.5 pl-3 pr-1.5 h-7 text-caption cursor-pointer select-none whitespace-nowrap flex-shrink-0 rounded-full transition-colors ${
        active
          ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium accent-frame"
          : "text-muted hover:text-secondary hover:bg-tint/[0.04]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <FileText size={12} className={active ? "text-[var(--accent-text)]" : ""} />
      <span className="max-w-[160px] truncate">{tab.title}</span>
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

function TabOverlay({ tab }: { tab: NoteTab }) {
  return (
    <div className="flex items-center gap-1.5 pl-3 pr-2 h-7 text-caption whitespace-nowrap rounded-full bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
      <FileText size={12} />
      <span className="max-w-[160px] truncate">{tab.title}</span>
      <X size={11} className="ml-1 text-muted" />
    </div>
  );
}

export default function NoteTabBar({ tabs, activePath, newLabel, closeLabel, sidebarCollapsed, onSelect, onClose, onNewNote, onNewCollection, onToggleSidebar, onReorder }: Props) {
  const { t } = useT();
  const [activeDragPath, setActiveDragPath] = useState<string | null>(null);
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

  useEffect(updateOverflow, [tabs]);

  // Keep the active tab visible when it changes via sidebar or deep link
  useEffect(() => {
    if (!activePath) return;
    scrollRef.current
      ?.querySelector<HTMLElement>('[data-tab-active="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activePath]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragPath(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragPath(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = tabs.findIndex((tab) => tab.path === active.id);
    const to = tabs.findIndex((tab) => tab.path === over.id);
    if (from !== -1 && to !== -1) onReorder(String(active.id), to);
  };

  const activeDragTab = activeDragPath ? tabs.find((tab) => tab.path === activeDragPath) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragPath(null)}
    >
      <div className="h-9 flex-shrink-0 flex items-stretch border-b border-line/50 glass bg-tint/[0.04]">
        <div className="relative flex-1 min-w-0 flex">
          <div
            ref={scrollRef}
            onScroll={updateOverflow}
            className="flex-1 flex items-center gap-1.5 px-2 overflow-x-auto scrollbar-none"
          >
            <SortableContext items={tabs.map((tab) => tab.path)} strategy={horizontalListSortingStrategy}>
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.path}
                  tab={tab}
                  active={tab.path === activePath}
                  closeLabel={closeLabel}
                  onSelect={() => onSelect(tab.path)}
                  onClose={() => onClose(tab.path)}
                />
              ))}
            </SortableContext>
          </div>
          {overflow.left && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-base/75 to-transparent" />
          )}
          {overflow.right && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-base/75 to-transparent" />
          )}
        </div>
        {/* Right-side actions: always visible, even with no open tabs */}
        <div className="flex items-center flex-shrink-0 border-l border-line/30">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewNote}
            title={newLabel}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            <Plus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewCollection}
            title={t["collections.new"]}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            <FolderPlus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? t["collections.expandSidebar"] : t["collections.collapseSidebar"]}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </Button>
        </div>
      </div>

      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeDragTab ? <TabOverlay tab={activeDragTab} /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
