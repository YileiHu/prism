import { useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";

export interface CollectionDialogTarget<T = unknown> {
  id: string;
  name: string;
  data: T;
}

// One modal pair for every collection/tag-like list. The data payload keeps
// source-specific objects (a CollectionData, a TagInfo, …) available to the
// caller without making the dialog know about them.
export function useCollectionDialogs<T = unknown>() {
  const [renameTarget, setRenameTarget] = useState<CollectionDialogTarget<T> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionDialogTarget<T> | null>(null);
  return {
    renameTarget,
    deleteTarget,
    openRename: setRenameTarget,
    openDelete: setDeleteTarget,
    closeRename: () => setRenameTarget(null),
    closeDelete: () => setDeleteTarget(null),
  };
}

interface Props<T> {
  renameTarget: CollectionDialogTarget<T> | null;
  deleteTarget: CollectionDialogTarget<T> | null;
  renameTitle: string;
  renamePlaceholder?: string;
  deleteMessage: (target: CollectionDialogTarget<T>) => string;
  confirmLabel?: string;
  onRename: (target: CollectionDialogTarget<T>, name: string) => void | Promise<void>;
  onDelete: (target: CollectionDialogTarget<T>) => void | Promise<void>;
  onCloseRename: () => void;
  onCloseDelete: () => void;
}

export default function CollectionDialogs<T>({
  renameTarget,
  deleteTarget,
  renameTitle,
  renamePlaceholder,
  deleteMessage,
  confirmLabel,
  onRename,
  onDelete,
  onCloseRename,
  onCloseDelete,
}: Props<T>) {
  return (
    <>
      <RenameModal
        open={renameTarget !== null}
        initialValue={renameTarget?.name ?? ""}
        title={renameTitle}
        placeholder={renamePlaceholder}
        onClose={onCloseRename}
        onSubmit={(name) => {
          if (renameTarget) void onRename(renameTarget, name);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        message={deleteTarget ? deleteMessage(deleteTarget) : ""}
        confirmLabel={confirmLabel}
        onConfirm={() => {
          if (deleteTarget) void onDelete(deleteTarget);
        }}
        onClose={onCloseDelete}
      />
    </>
  );
}
