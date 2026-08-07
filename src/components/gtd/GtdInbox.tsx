import { useState, useEffect, useCallback, useRef } from "react";
import { ListChecks, Trash2, Inbox, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import Button from "../Button";
import GtdRenameModal from "./GtdRenameModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
}

export default function GtdInbox({ version, onProcess, onChanged }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.prism.getGtdItems("inbox").then(setItems);
  }, [version]);

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    await window.prism.addGtdItem(title);
    setDraft("");
    onChanged();
    inputRef.current?.focus();
  };

  const handleDelete = useCallback(
    async (id: number) => {
      await window.prism.deleteGtdItem(id);
      onChanged();
    },
    [onChanged],
  );

  return (
    <>
      <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
        <div className="relative flex-1">
          <Inbox size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={t["gtd.quickAdd"]}
            autoFocus
            className="w-full bg-elevated border border-strong rounded-full pl-8 pr-3 py-1 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-3 mt-20 anim-fade-in">
            <p className="text-center text-muted text-sm">{t["gtd.emptyInbox"]}</p>
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            onContextMenu={(e) =>
              onContextMenu(e, [
                { label: t["gtd.process"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(item.id) },
              ])
            }
            className="group flex items-center gap-2 px-4 py-2.5 border-b border-line/30 hover:bg-elevated/40 transition-colors"
          >
            <span className="flex-1 text-sm text-primary truncate">{item.title}</span>
            <span className="text-xs text-faint flex-shrink-0">{formatGtdDate(item.created_at)}</span>
            <Button
              variant="secondary"
              size="xs"
              className="flex-shrink-0"
              onClick={() => onProcess(item)}
            >
              <ListChecks size={13} />
              {t["gtd.process"]}
            </Button>
          </div>
        ))}
      </div>

      <GtdRenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) await window.prism.renameGtdItem(renaming.id, title);
          onChanged();
        }}
      />
    </>
  );
}
