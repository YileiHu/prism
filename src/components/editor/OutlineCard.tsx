import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ListTree } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

const COLLAPSED_KEY = "prism_outline_collapsed";

// Hierarchy through type scale, color tier and spacing only — indentation is
// the sole horizontal cue, so narrow cards keep as much text width as possible
function outlineItemClass(level: number, active: boolean): string {
  const base = "block w-full text-left pr-1.5 rounded-chip truncate transition-colors";
  // The active row uses the neutral tint instead of the theme accent — it must
  // read as "you are here" even in themes whose accent already tints level-1
  // rows, so theme color alone is too subtle
  const activeCls = "active-bar-neutral text-primary bg-tint/[0.16]";
  if (level === 1) {
    return `${base} mt-1.5 first:mt-0 py-[5px] text-control font-semibold ${
      active
        ? activeCls
        : "text-primary bg-[rgb(var(--accent-rgb)/0.11)] hover:bg-[rgb(var(--accent-rgb)/0.18)]"
    }`;
  }
  if (level === 2) {
    return `${base} py-1 text-caption font-medium ${
      active ? activeCls : "text-secondary hover:text-primary hover:bg-hover/50"
    }`;
  }
  return `${base} py-[3px] text-caption ${
    active ? activeCls : "text-muted hover:text-primary hover:bg-hover/50"
  }`;
}

// Floating outline card shown to the left of the reading view. Clicking an
// entry smooth-scrolls to the heading; the card itself can be collapsed to a
// small pill (state persisted to localStorage). The entry matching the
// viewport's current section is highlighted and kept in view.
export default function OutlineCard({
  items,
  onJump,
  activeId,
}: {
  items: OutlineItem[];
  onJump: (id: string) => void;
  activeId?: string | null;
}) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const listRef = useRef<HTMLDivElement>(null);

  const setCollapsedPersisted = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  };

  // Keep the active entry visible inside the outline's own scroll box. Only
  // nudges when it leaves the viewport, so scrolling the note doesn't fight
  // with the user reading the outline. Layout effect so a mode switch (which
  // remounts this card) positions the list before the first paint.
  useLayoutEffect(() => {
    if (!activeId || collapsed) return;
    const list = listRef.current;
    if (!list) return;
    const el = Array.from(list.querySelectorAll<HTMLElement>("[data-outline-id]"))
      .find((node) => node.dataset.outlineId === activeId);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top) list.scrollTop -= listRect.top - elRect.top;
    else if (elRect.bottom > listRect.bottom) list.scrollTop += elRect.bottom - listRect.bottom;
  }, [activeId, collapsed]);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsedPersisted(false)}
        title={t["editor.outline"]}
        className="absolute left-3 top-3 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-control border border-line/50 bg-surface/85 glass text-muted hover:text-primary shadow-popover"
      >
        <ListTree size={13} />
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-3 bottom-6 z-20 w-52 flex flex-col rounded-control border border-line/50 bg-surface/85 glass shadow-popover overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-line/50 flex-shrink-0">
        <ListTree size={13} className="text-muted flex-shrink-0" />
        <span className="text-caption font-medium text-secondary flex-1 truncate">{t["editor.outline"]}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setCollapsedPersisted(true)}
          title={t["editor.foldCard"]}
        >
          <ChevronLeft size={13} />
        </Button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto py-1 pl-1 pr-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              data-outline-id={item.id}
              onClick={() => onJump(item.id)}
              title={item.text}
              aria-current={active ? "location" : undefined}
              className={outlineItemClass(item.level, active)}
              style={{ paddingLeft: 8 + Math.min(item.level - 1, 3) * 10 }}
            >
              {item.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
