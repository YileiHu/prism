import { useState } from "react";
import { useT } from "../i18n";
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  title: string;
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function CreateCollectionModal({ title, initialName = "", onSave, onClose }: Props) {
  const { t } = useT();
  const [name, setName] = useState(initialName);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Modal open title={title} onClose={onClose} width="400px"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>{t["resources.cancel"]}</Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={!name.trim()}>{t["resources.save"]}</Button>
        </>
      }
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        placeholder={t["collections.namePlaceholder"]}
        autoFocus
        className="w-full bg-elevated border border-strong rounded-lg px-4 py-2.5 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
    </Modal>
  );
}
