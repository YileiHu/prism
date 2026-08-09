import { useState, useEffect, useRef } from "react";
import { ListChecks, Trash2, Inbox, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import ItemRow from "../ItemRow";
import SearchInput from "../SearchInput";
import EmptyState from "../EmptyState";
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
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [deleting, setDeleting] = useState<GtdItem | null>(null);
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

  const handleDelete = async () => {
    if (!deleting) return;
    await window.prism.deleteGtdItem(deleting.id);
    showToast(t["common.deleted"]);
    onChanged();
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
        <SearchInput
          ref={inputRef}
          value={draft}
          onChange={setDraft}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={t["gtd.quickAdd"]}
          autoFocus
          icon={Inbox}
          wrapperClassName="flex-1"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && <EmptyState size="module" text={t["gtd.emptyInbox"]} />}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            variant="list"
            className="border-b border-line/30"
            onPrimaryClick={() => onProcess(item)}
            menuItems={[
              { label: t["gtd.process"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
              { label: "", divider: true },
              { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
              { label: "", divider: true },
              { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(item) },
            ]}
            title={item.title}
            meta={<span className="text-xs text-faint flex-shrink-0">{formatGtdDate(item.created_at)}</span>}
            hoverActions={[{ icon: <ListChecks size={13} />, label: t["gtd.process"], onClick: () => onProcess(item) }]}
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
