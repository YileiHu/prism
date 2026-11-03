import { useState, useEffect, useRef, useMemo } from "react";
import { Star, Check, ListChecks, Trash2, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { type MenuItem } from "../ContextMenu";
import ItemRow from "../ItemRow";
import Button from "../Button";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  status: "waiting" | "someday" | "done";
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
  focusItem?: { id: number; seq: number } | null;
}

export default function GtdItemList({ status, version, onProcess, onChanged, focusItem }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [deleting, setDeleting] = useState<GtdItem | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const handledSeqRef = useRef<number | null>(null);

  useEffect(() => {
    setLoaded(false);
    window.prism.getGtdItems(status).then(setItems).finally(() => setLoaded(true));
  }, [status, version]);

  // Scroll to and flash the item targeted by a Home navigation once it's loaded
  useEffect(() => {
    if (!focusItem || handledSeqRef.current === focusItem.seq) return;
    if (!items.some((i) => i.id === focusItem.id)) return;
    handledSeqRef.current = focusItem.seq;
    document.getElementById(`gtd-item-${focusItem.id}`)?.scrollIntoView({ block: "center" });
    setHighlightId(focusItem.id);
    // No cleanup: items reloads (version bump) would cancel the timer and leave
    // the highlight stuck; a late setState after unmount is a harmless no-op
    setTimeout(() => setHighlightId(null), 1600);
  }, [focusItem, items]);

  const toggleNext = async (item: GtdItem) => {
    try {
      await window.prism.setGtdItemNext(item.id, !item.is_next);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const markDone = async (item: GtdItem) => {
    try {
      await window.prism.setGtdItemStatus(item.id, "done");
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await window.prism.deleteGtdItem(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["common.deleted"]);
    onChanged();
  };

  const titleKey = status === "waiting"
    ? "gtd.waiting"
    : status === "someday" ? "gtd.someday" : "gtd.done";
  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="min-w-0 text-body font-medium text-primary truncate">
        {t[titleKey]}
        {loaded && <span className="ml-2 text-caption text-muted">{items.length}</span>}
      </span>
    ),
  }), [items.length, loaded, t, titleKey]);

  useToolbarContribution("module:gtd", toolbar);

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
      { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
      { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(item) },
    ];
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto">
      {!loaded && items.length === 0 && <SkeletonRows count={6} />}
      {loaded && items.length === 0 && <EmptyState size="module" text={t["gtd.emptyList"]} />}
      {items.map((item) => (
        <ItemRow
          key={item.id}
          id={`gtd-item-${item.id}`}
          variant="list"
          className={`border-b border-line/30 ${highlightId === item.id ? "bg-[var(--accent-muted)]" : ""}`}
          menuItems={menuFor(item)}
          leading={
            status === "waiting" ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggleNext(item)}
                title={item.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"]}
                className={item.is_next ? "!text-[var(--accent-text)]" : "!text-faint hover:!text-tertiary"}
              >
                <Star size={15} fill={item.is_next ? "currentColor" : "none"} />
              </Button>
            ) : undefined
          }
          title={
            status === "done"
              ? <span className="text-muted line-through">{item.title}</span>
              : item.title
          }
          meta={
            <span className="text-caption text-faint flex-shrink-0">
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
        try {
          if (renaming) await window.prism.renameGtdItem(renaming.id, title);
        } catch {
          showToast(t["common.saveFailed"], "error");
          return;
        }
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
