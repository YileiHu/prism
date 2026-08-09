import Modal from "./Modal";
import Button from "./Button";
import { useT } from "../i18n";

interface Props {
  open: boolean;
  message: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({ open, message, title, confirmLabel, onConfirm, onClose }: Props) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      position="center"
      title={title ?? t["common.confirmDelete"]}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t["menu.delete"]}
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary">{message}</p>
    </Modal>
  );
}
