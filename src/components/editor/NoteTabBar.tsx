import { useEffect, useRef, useState } from "react";
import { FileText, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { useT } from "../../i18n";
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

// Distinct from "text/x-note-paths" (note-list drags) so tab reorders never
// land on collection drop targets and vice versa
const TAB_MIME = "text/x-tab-path";

export default function NoteTabBar({ tabs, activePath, newLabel, closeLabel, sidebarCollapsed, onSelect, onClose, onNewNote, onNewCollection, onToggleSidebar, onReorder }: Props) {
  const { t } = useT();
  const [dragPath, setDragPath] = useState<string | null>(null);
  // Insertion line: shown at the left/right edge of the hovered tab
  const [indicator, setIndicator] = useState<{ path: string; before: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which edges are clipped, for the fade hints
  const [overflow, setOverflow] = useState({ left: false, right: false });

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

  return (
    <div className="h-9 flex-shrink-0 flex items-stretch border-b border-line/50 glass bg-tint/[0.03]">
      <div className="relative flex-1 min-w-0 flex">
        <div
          ref={scrollRef}
          onScroll={updateOverflow}
          className="flex-1 flex items-stretch overflow-x-auto scrollbar-none"
        >
          {tabs.map((tab) => {
            const active = tab.path === activePath;
            const showBefore = indicator?.path === tab.path && indicator.before;
            const showAfter = indicator?.path === tab.path && !indicator.before;
            return (
              <div
                key={tab.path}
                data-tab-active={active ? "true" : undefined}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_MIME, tab.path);
                  e.dataTransfer.effectAllowed = "move";
                  setDragPath(tab.path);
                }}
                onDragEnd={() => {
                  setDragPath(null);
                  setIndicator(null);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(TAB_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const before = e.clientX < rect.left + rect.width / 2;
                  setIndicator((prev) => (prev?.path === tab.path && prev.before === before ? prev : { path: tab.path, before }));
                }}
                onDrop={(e) => {
                  const path = e.dataTransfer.getData(TAB_MIME);
                  if (!path) return;
                  e.preventDefault();
                  setIndicator(null);
                  const from = tabs.findIndex((t) => t.path === path);
                  if (from === -1) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const before = e.clientX < rect.left + rect.width / 2;
                  let to = tabs.findIndex((t) => t.path === tab.path) + (before ? 0 : 1);
                  if (from < to) to -= 1;
                  if (to !== from) onReorder(path, to);
                }}
                onClick={() => onSelect(tab.path)}
                onAuxClick={(e) => {
                  if (e.button === 1) onClose(tab.path);
                }}
                title={tab.path}
                className={`group relative flex items-center gap-1.5 pl-3 pr-2 text-xs cursor-pointer select-none whitespace-nowrap flex-shrink-0 border-r border-line/40 transition-colors ${
                  active ? "text-primary bg-tint/[0.06]" : "text-muted hover:text-secondary hover:bg-tint/[0.03]"
                } ${dragPath === tab.path ? "opacity-40" : ""} ${
                  showBefore || showAfter
                    ? `before:absolute before:top-1 before:bottom-1 before:w-0.5 before:bg-[var(--accent)] before:content-[''] ${showBefore ? "before:-left-px" : "before:-right-px"}`
                    : ""
                } after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-[var(--accent)] after:transition-opacity ${active ? "after:opacity-100" : "after:opacity-0"}`}
              >
                <FileText size={12} className={active ? "text-[var(--accent-text)]" : ""} />
                <span className="max-w-[160px] truncate">{tab.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.path);
                  }}
                  title={closeLabel}
                  className={`p-0.5 rounded transition-colors hover:bg-hover/60 ${
                    active ? "text-muted hover:text-primary" : "text-faint hover:text-primary"
                  }`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
        {overflow.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-base/75 to-transparent" />
        )}
        {overflow.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-base/75 to-transparent" />
        )}
      </div>
      {/* Right-side actions: always visible, even with no open tabs */}
      <div className="flex items-center flex-shrink-0 border-l border-line/40">
        <button
          onClick={onNewNote}
          title={newLabel}
          className="h-full px-2.5 text-muted hover:text-primary transition-colors"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={onNewCollection}
          title={t["collections.new"]}
          className="h-full px-2.5 text-muted hover:text-primary transition-colors"
        >
          <FolderPlus size={14} />
        </button>
        <button
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t["collections.expandSidebar"] : t["collections.collapseSidebar"]}
          className="h-full px-2.5 text-muted hover:text-primary transition-colors"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>
    </div>
  );
}
