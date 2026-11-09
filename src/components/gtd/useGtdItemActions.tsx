import { useState } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import GtdDueDateModal from "./GtdDueDateModal";

interface Target {
  id: number;
  title: string;
  dueDate?: string | null;
}

interface Options {
  /** Which IPC family owns the entity: GTD items (incl. projects) or project actions. */
  kind: "item" | "action";
  onChanged: () => void;
  /** Overrides the default delete confirmation text (e.g. project deletion). */
  deleteMessage?: string;
  /** Item renames are usually multi-line; project rows are not. */
  renameMultiline?: boolean;
}

/** Rename / delete / due-date dialogs for a GTD item or project action. */
export function useGtdItemActions({
  kind,
  onChanged,
  deleteMessage,
  renameMultiline = true,
}: Options) {
  const { t } = useT();
  const showToast = useToast();
  const [renaming, setRenaming] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [dueEditing, setDueEditing] = useState<Target | null>(null);

  const submitRename = async (target: Target, title: string) => {
    try {
      if (kind === "action") await window.prism.renameGtdAction(target.id, title);
      else await window.prism.renameGtdItem(target.id, title);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      if (kind === "action") await window.prism.deleteGtdAction(deleting.id);
      else await window.prism.deleteGtdItem(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setDeleting(null);
    showToast(t["common.deleted"]);
    onChanged();
  };

  const saveDue = async (date: string | null) => {
    if (!dueEditing) return;
    try {
      if (kind === "action") await window.prism.setGtdActionDueDate(dueEditing.id, date);
      else await window.prism.setGtdItemDueDate(dueEditing.id, date);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDueEditing(null);
    onChanged();
  };

  const modals = (
    <>
      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        multiline={renameMultiline}
        onClose={() => setRenaming(null)}
        onSubmit={(title) => (renaming ? submitRename(renaming, title) : undefined)}
      />
      <ConfirmDialog
        open={deleting !== null}
        message={deleteMessage
          ?? (kind === "action" ? t["gtd.deleteActionConfirm"] : t["gtd.deleteItemConfirm"])}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
      <GtdDueDateModal
        open={dueEditing !== null}
        title={dueEditing?.title ?? ""}
        value={dueEditing?.dueDate ?? null}
        onClose={() => setDueEditing(null)}
        onSave={(date) => { void saveDue(date); }}
      />
    </>
  );

  return {
    requestRename: setRenaming,
    requestDelete: setDeleting,
    requestDue: setDueEditing,
    modals,
  };
}
