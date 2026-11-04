import { useState, useEffect, useRef, useMemo } from "react";
import { Star, Check, ListChecks, Trash2, Pencil, CalendarDays } from "lucide-react";
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
import DueDateChip from "./DueDateChip";
import GtdDueDateModal from "./GtdDueDateModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  status: "waiting" | "someday";
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
  const [dueEditing, setDueEditing] = useState<GtdItem | null>(null);
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
      await window.prism.setGtdItemNext(item.id, !item.isNext);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const completeItem = async (item: GtdItem) => {
    try {
      await window.prism.deleteGtdItem(item.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
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

  const titleKey = status === "waiting" ? "gtd.waiting" : "gtd.someday";
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
            { label: item.isNext ? t["gtd.unsetNext"] : t["gtd.setNext"], icon: <Star size={14} />, onClick: () => toggleNext(item) },
            {
              label: item.dueDate ? t["gtd.dueDate.change"] : t["gtd.dueDate.set"],
              icon: <CalendarDays size={14} />,
              onClick: () => setDueEditing(item),
            },
            { label: t["gtd.markDone"], icon: <Check size={14} />, onClick: () => completeItem(item) },
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
          multiline
          className={`border-b border-line/30 ${highlightId === item.id ? "bg-[var(--accent-muted)]" : ""}`}
          menuItems={menuFor(item)}
          leading={
            status === "waiting" ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggleNext(item)}
                title={item.isNext ? t["gtd.unsetNext"] : t["gtd.setNext"]}
                className={item.isNext ? "!text-[var(--accent-text)]" : "!text-faint hover:!text-tertiary"}
              >
                <Star size={15} fill={item.isNext ? "currentColor" : "none"} />
              </Button>
            ) : undefined
          }
          title={item.title}
          meta={
            <span className="flex flex-shrink-0 items-center gap-2">
              {status === "waiting" && (
                <DueDateChip dueDate={item.dueDate} onClick={() => setDueEditing(item)} />
              )}
              <span className="text-caption text-faint">{formatGtdDate(item.createdAt)}</span>
            </span>
          }
        />
      ))}
    </div>

    <RenameModal
      open={renaming !== null}
      initialValue={renaming?.title ?? ""}
      multiline
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

    <GtdDueDateModal
      open={dueEditing !== null}
      title={dueEditing?.title ?? ""}
      value={dueEditing?.dueDate ?? null}
      onClose={() => setDueEditing(null)}
      onSave={async (date) => {
        if (!dueEditing) return;
        try {
          await window.prism.setGtdItemDueDate(dueEditing.id, date);
        } catch {
          showToast(t["common.saveFailed"], "error");
          return;
        }
        setDueEditing(null);
        onChanged();
      }}
    />
    </>
  );
}
