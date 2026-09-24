import { FileText, Plus, X } from "lucide-react";
import type { NoteTab } from "./useNoteTabs";

interface Props {
  tabs: NoteTab[];
  activePath: string | null;
  newLabel: string;
  closeLabel: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewNote: () => void;
}

export default function NoteTabBar({ tabs, activePath, newLabel, closeLabel, onSelect, onClose, onNewNote }: Props) {
  return (
    <div className="h-9 flex-shrink-0 flex items-stretch border-b border-line/50 glass bg-tint/[0.03]">
      <div className="flex-1 flex items-stretch overflow-x-auto scrollbar-none min-w-0">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              onClick={() => onSelect(tab.path)}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(tab.path);
              }}
              title={tab.path}
              className={`group relative flex items-center gap-1.5 pl-3 pr-2 text-xs cursor-pointer select-none whitespace-nowrap flex-shrink-0 border-r border-line/40 transition-colors ${
                active ? "text-primary bg-tint/[0.06]" : "text-muted hover:text-secondary hover:bg-tint/[0.03]"
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
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-hover/60 text-muted hover:text-primary transition-opacity"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          onClick={onNewNote}
          title={newLabel}
          className="px-2.5 text-muted hover:text-primary transition-colors flex-shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
