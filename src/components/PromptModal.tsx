import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Input, { Textarea } from "./Input";
import { useT } from "../i18n";

interface PromptModalProps {
  open: boolean;
  title: string;
  icon?: LucideIcon;
  initialValue?: string;
  placeholder?: string;
  multiline?: boolean;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode | ((value: string) => ReactNode);
}

export default function PromptModal({
  open,
  title,
  icon,
  initialValue = "",
  placeholder,
  multiline = false,
  submitLabel,
  submitting = false,
  onSubmit,
  onClose,
  children,
}: PromptModalProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    if (open) setDraft(initialValue);
  }, [open, initialValue]);

  const submit = async () => {
    const value = draft.trim();
    if (!value || submitting) return;
    await onSubmit(value);
    onClose();
  };

  const extra = typeof children === "function" ? children(draft) : children;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!draft.trim() || submitting}>
            {submitLabel ?? t["resources.save"]}
          </Button>
        </>
      }
    >
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          autoFocus
          rows={4}
          className="w-full max-h-[50vh] min-h-[96px] resize-y overflow-y-auto"
        />
      ) : (
        <Input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={placeholder}
          autoFocus
          className="w-full"
        />
      )}
      {extra}
    </Modal>
  );
}
