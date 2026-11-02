import { useState } from "react";
import { ChevronLeft, ListTree } from "lucide-react";
import { useT } from "../../i18n";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

const COLLAPSED_KEY = "prism_outline_collapsed";

// Hierarchy through type scale, color tier and spacing only — indentation is
// the sole horizontal cue, so narrow cards keep as much text width as possible
function outlineItemClass(level: number): string {
  const base =
    "block w-full text-left pr-1.5 rounded truncate transition-colors hover:text-primary";
  if (level === 1) {
    return `${base} mt-1.5 first:mt-0 py-[5px] text-[12.5px] font-semibold text-primary bg-[rgb(var(--accent-rgb)/0.11)] hover:bg-[rgb(var(--accent-rgb)/0.18)]`;
  }
  if (level === 2) return `${base} py-1 text-[12px] font-medium text-secondary hover:bg-hover/40`;
  return `${base} py-[3px] text-[12px] text-muted hover:bg-hover/40`;
}

// Floating outline card shown to the left of the reading view. Clicking an
// entry smooth-scrolls to the heading; the card itself can be collapsed to a
// small pill (state persisted to localStorage).
export default function OutlineCard({ items, onJump }: { items: OutlineItem[]; onJump: (id: string) => void }) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");

  const setCollapsedPersisted = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  };

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsedPersisted(false)}
        title={t["editor.outline"]}
        className="absolute left-3 top-3 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-line/60 bg-surface/85 glass text-muted hover:text-primary shadow-lg"
      >
        <ListTree size={13} />
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-3 bottom-6 z-20 w-52 flex flex-col rounded-lg border border-line/60 bg-surface/85 glass shadow-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-line/50 flex-shrink-0">
        <ListTree size={13} className="text-muted flex-shrink-0" />
        <span className="text-xs font-medium text-secondary flex-1 truncate">{t["editor.outline"]}</span>
        <button
          onClick={() => setCollapsedPersisted(true)}
          className="p-0.5 rounded text-muted hover:text-primary hover:bg-hover/50"
          title={t["editor.foldCard"]}
        >
          <ChevronLeft size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1 pl-1 pr-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onJump(item.id)}
            title={item.text}
            className={outlineItemClass(item.level)}
            style={{ paddingLeft: 8 + Math.min(item.level - 1, 3) * 10 }}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
