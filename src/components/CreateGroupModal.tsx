import { useState } from "react";
import { useT } from "../i18n";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import { ColorSwatchPicker } from "./ColorPicker";

interface Props {
  title: string;
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}

export default function CreateGroupModal({ title, onSave, onClose }: Props) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, color);
  };

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>{t["resources.cancel"]}</Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={!name.trim()}>{t["resources.save"]}</Button>
        </>
      }
    >
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        placeholder={t["collections.groupNamePlaceholder"]}
        autoFocus
        className="w-full"
      />
      <ColorSwatchPicker name={name} value={color} onChange={setColor} />
    </Modal>
  );
}
