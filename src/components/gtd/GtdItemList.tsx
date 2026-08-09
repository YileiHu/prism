import { useState, useEffect } from "react";
import { Star, Check, ListChecks, Trash2, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { type MenuItem } from "../ContextMenu";
import ItemRow from "../ItemRow";
import EmptyState from "../EmptyState";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  status: "waiting" | "someday" | "done";
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
}

export default function GtdItemList({ status, version, onProcess, onChanged }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [deleting, setDeleting] = useState<GtdItem | null>(null);

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

  const handleDelete = async () => {
    if (!deleting) return;
    await window.prism.deleteGtdItem(deleting.id);
    showToast(t["common.deleted"]);
    onChanged();
  };

  const menuFor = (item: GtdItem): MenuItem[] => {
    const moduleActions: MenuItem[] =
      status === "waiting"
        ? [
            { label: item.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"], icon: <Star size={14} />, onClick: () => toggleNext(item) },
            { label: t["gtd.markDone"], icon: <Check size={14} />, onClick: () => markDone(item) },
            { label: t["gtd.reprocess"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
          ]
        : status === "someday"
          ? [{ label: t["gtd.reprocess"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) }]
          : [];
    return [
      ...moduleActions,
      ...(moduleActions.length > 0 ? [{ label: "", divider: true } as MenuItem] : []),
      { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
      { label: "", divider: true },
      { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(item) },
    ];
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto">
      {items.length === 0 && <EmptyState size="module" text={t["gtd.emptyList"]} />}
      {items.map((item) => (
        <ItemRow
          key={item.id}
          variant="list"
          className="border-b border-line/30"
          menuItems={menuFor(item)}
          leading={
            status === "waiting" ? (
              <button
                onClick={() => toggleNext(item)}
                title={item.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"]}
                className={`flex-shrink-0 transition-colors ${
                  item.is_next ? "text-[var(--accent-text)]" : "text-faint hover:text-tertiary"
                }`}
              >
                <Star size={15} fill={item.is_next ? "currentColor" : "none"} />
              </button>
            ) : undefined
          }
          title={
            status === "done"
              ? <span className="text-muted line-through">{item.title}</span>
              : item.title
          }
          meta={
            <span className="text-xs text-faint flex-shrink-0">
              {formatGtdDate(status === "done" && item.done_at ? item.done_at : item.created_at)}
            </span>
          }
        />
      ))}
    </div>

    <RenameModal
      open={renaming !== null}
      initialValue={renaming?.title ?? ""}
      onClose={() => setRenaming(null)}
      onSubmit={async (title) => {
        if (renaming) await window.prism.renameGtdItem(renaming.id, title);
        onChanged();
      }}
    />

    <ConfirmDialog
      open={deleting !== null}
      message={t["gtd.deleteItemConfirm"]}
      onConfirm={handleDelete}
      onClose={() => setDeleting(null)}
    />
    </>
  );
}
