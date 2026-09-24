import { useState } from "react";
import { ChevronLeft, ListTree } from "lucide-react";
import { useT } from "../../i18n";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
}

const COLLAPSED_KEY = "prism_outline_collapsed";

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
      <div className="flex-1 overflow-y-auto py-1 pr-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onJump(item.id)}
            title={item.text}
            className="block w-full text-left py-1 pr-1.5 text-xs text-muted hover:text-primary hover:bg-hover/40 rounded-r truncate"
            style={{ paddingLeft: 8 + (item.level - 1) * 11 }}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
