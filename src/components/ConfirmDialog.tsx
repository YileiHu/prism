import { useCallback, useRef, useState } from "react";
import Modal from "./Modal";
import Spinner from "./Spinner";
import Button from "./Button";
import { useT } from "../i18n";

interface Props {
  open: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  message,
  title,
  confirmLabel,
  variant = "danger",
  onConfirm,
  onClose,
}: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Keep the dialog open so the user can retry.
    } finally {
      setBusy(false);
    }
  }, [busy, onConfirm, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      position="center"
      title={title ?? t["common.confirmDelete"]}
      closeOnBackdrop={false}
      closeOnEscape={!busy}
      initialFocusRef={confirmRef}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === "default" ? "primary" : "danger"}
            size="sm"
            aria-busy={busy}
            onClick={() => void confirm()}
          >
            {busy && <Spinner size={14} />}
            {confirmLabel ?? t["menu.delete"]}
          </Button>
        </>
      }
    >
      <p className="text-body text-primary">{message}</p>
    </Modal>
  );
}
