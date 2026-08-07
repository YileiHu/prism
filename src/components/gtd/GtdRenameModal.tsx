import { useState, useEffect } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { useT } from "../../i18n";

interface Props {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (title: string) => void | Promise<void>;
}

export default function GtdRenameModal({ open, initialValue, onClose, onSubmit }: Props) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (open) setDraft(initialValue);
  }, [open, initialValue]);

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    await onSubmit(title);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["menu.rename"]}
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
        autoFocus
        className="w-full bg-elevated border border-strong rounded-lg px-3 py-2 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </Modal>
  );
}
