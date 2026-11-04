import type { LucideIcon } from "lucide-react";
import { useT } from "../i18n";
import PromptModal from "./PromptModal";

interface Props {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (title: string) => void | Promise<void>;
  title?: string;
  icon?: LucideIcon;
  placeholder?: string;
  multiline?: boolean;
}

export default function RenameModal({ open, initialValue, onClose, onSubmit, title, icon, placeholder, multiline }: Props) {
  const { t } = useT();

  return (
    <PromptModal
      open={open}
      title={title ?? t["menu.rename"]}
      icon={icon}
      initialValue={initialValue}
      placeholder={placeholder}
      multiline={multiline}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
