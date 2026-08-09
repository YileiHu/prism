import { useState, useEffect, type ReactNode } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { useT } from "../i18n";

interface Props {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (title: string) => void | Promise<void>;
  title?: string;
  icon?: ReactNode;
  placeholder?: string;
}

export default function RenameModal({ open, initialValue, onClose, onSubmit, title, icon, placeholder }: Props) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (open) setDraft(initialValue);
  }, [open, initialValue]);

  const submit = async () => {
    const value = draft.trim();
    if (!value) return;
    await onSubmit(value);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t["menu.rename"]}
      icon={icon}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!draft.trim()}>
            {t["resources.save"]}
          </Button>
        </>
      }
    >
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder}
        autoFocus
        className="w-full bg-elevated border border-strong rounded-lg px-3 py-2 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </Modal>
  );
}
