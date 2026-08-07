import { useState, useEffect } from "react";
import { Star, Check, ListChecks, Trash2, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import GtdRenameModal from "./GtdRenameModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  status: "waiting" | "someday" | "done";
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
}

export default function GtdItemList({ status, version, onProcess, onChanged }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);

  useEffect(() => {
    window.prism.getGtdItems(status).then(setItems);
  }, [status, version]);

  const toggleNext = async (item: GtdItem) => {
    await window.prism.setGtdItemNext(item.id, !item.is_next);
    onChanged();
  };

  const markDone = async (item: GtdItem) => {
    await window.prism.setGtdItemStatus(item.id, "done");
    onChanged();
  };

  const handleDelete = async (item: GtdItem) => {
    await window.prism.deleteGtdItem(item.id);
    onChanged();
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto">
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 mt-20 anim-fade-in">
          <p className="text-center text-muted text-sm">{t["gtd.emptyList"]}</p>
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          onContextMenu={(e) => {
            if (status === "waiting") {
              onContextMenu(e, [
                {
                  label: item.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"],
                  icon: <Star size={14} />,
                  onClick: () => toggleNext(item),
                },
                { label: t["gtd.markDone"], icon: <Check size={14} />, onClick: () => markDone(item) },
                { label: t["gtd.reprocess"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(item) },
              ]);
            } else if (status === "someday") {
              onContextMenu(e, [
                { label: t["gtd.reprocess"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(item) },
              ]);
            } else {
              onContextMenu(e, [
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(item) },
              ]);
            }
          }}
          className="group flex items-center gap-2 px-4 py-2.5 border-b border-line/30 hover:bg-elevated/40 transition-colors"
        >
          {status === "waiting" && (
            <button
              onClick={() => toggleNext(item)}
              title={item.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"]}
              className={`flex-shrink-0 transition-colors ${
                item.is_next ? "text-[var(--accent-text)]" : "text-faint hover:text-tertiary"
              }`}
            >
              <Star size={15} fill={item.is_next ? "currentColor" : "none"} />
            </button>
          )}
          <span className={`flex-1 text-sm truncate ${status === "done" ? "text-muted line-through" : "text-primary"}`}>
            {item.title}
          </span>
          <span className="text-xs text-faint flex-shrink-0">
            {formatGtdDate(status === "done" && item.done_at ? item.done_at : item.created_at)}
          </span>
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
