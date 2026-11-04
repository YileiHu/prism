import { useState } from "react";
import { useT } from "../i18n";
import PromptModal from "./PromptModal";
import { ColorSwatchPicker } from "./ColorPicker";

interface Props {
  title: string;
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}

export default function CreateGroupModal({ title, onSave, onClose }: Props) {
  const { t } = useT();
  const [color, setColor] = useState("");

  return (
    <PromptModal
      open
      title={title}
      placeholder={t["collections.groupNamePlaceholder"]}
      onSubmit={(name) => onSave(name, color)}
      onClose={onClose}
    >
      {(name) => <ColorSwatchPicker name={name} value={color} onChange={setColor} />}
    </PromptModal>
  );
}
