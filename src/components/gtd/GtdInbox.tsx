import { useState, useEffect, useRef, useMemo } from "react";
import { ListChecks, Trash2, Inbox, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import ItemRow from "../ItemRow";
import SearchInput from "../SearchInput";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
}

export default function GtdInbox({ version, onProcess, onChanged }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [deleting, setDeleting] = useState<GtdItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.prism.getGtdItems("inbox").then(setItems).finally(() => setLoaded(true));
  }, [version]);

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    try {
      await window.prism.addGtdItem(title);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDraft("");
    onChanged();
    inputRef.current?.focus();
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

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="min-w-0 text-body font-medium text-primary truncate">{t["gtd.inbox"]}</span>
    ),
    controls: (
      <SearchInput
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={t["gtd.quickAdd"]}
        autoFocus
        icon={Inbox}
        wrapperClassName="w-96 max-w-[45vw]"
      />
    ),
    // draft must stay in the deps so the registered input reflects typing
  }), [draft, t]);

  useToolbarContribution("module:gtd", toolbar);

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {!loaded && items.length === 0 && <SkeletonRows count={6} />}
        {loaded && items.length === 0 && <EmptyState size="module" text={t["gtd.emptyInbox"]} />}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            variant="list"
            className="border-b border-line/30"
            onPrimaryClick={() => onProcess(item)}
            menuItems={[
              { label: t["gtd.process"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
              { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
              { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(item) },
            ]}
            title={item.title}
            meta={<span className="text-caption text-faint flex-shrink-0">{formatGtdDate(item.created_at)}</span>}
            hoverActions={[{ icon: <ListChecks size={13} />, label: t["gtd.process"], onClick: () => onProcess(item) }]}
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
