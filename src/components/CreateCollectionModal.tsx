import { useT } from "../i18n";
import PromptModal from "./PromptModal";

interface Props {
  title: string;
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function CreateCollectionModal({ title, initialName = "", onSave, onClose }: Props) {
  const { t } = useT();

  return (
    <PromptModal
      open
      title={title}
      initialValue={initialName}
      placeholder={t["collections.namePlaceholder"]}
      onSubmit={onSave}
      onClose={onClose}
    />
  );
}
