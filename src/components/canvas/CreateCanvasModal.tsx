import { useState } from "react";
import { Frame } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { createCanvasDoc, serializeCanvas } from "../../lib/canvas/model";
import PromptModal from "../PromptModal";
import { notifyCanvasChanged } from "./useCanvasLibrary";

interface Props {
  vaultPath: string;
  onCreated: (path: string, title: string) => void;
  onClose: () => void;
}

export default function CreateCanvasModal({ vaultPath, onCreated, onClose }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [creating, setCreating] = useState(false);

  const handleSave = async (title: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const file = await window.prism.createCanvas(vaultPath, title, serializeCanvas(createCanvasDoc()));
      notifyCanvasChanged(vaultPath, { created: file.path });
      onCreated(file.path, file.title);
    } catch {
      showToast(t["canvas.createFailed"], "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <PromptModal
      open
      title={t["canvas.new"]}
      icon={Frame}
      placeholder={t["canvas.newPlaceholder"]}
      submitting={creating}
      onSubmit={handleSave}
      onClose={onClose}
    />
  );
}
