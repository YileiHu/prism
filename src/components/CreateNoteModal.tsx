import { useState } from "react";
import { FilePlus } from "lucide-react";
import { useT } from "../i18n";
import type { CollectionData } from "./collectionTypes";
import PromptModal from "./PromptModal";
import SelectButton from "./SelectButton";

interface Props {
  vaultPath: string;
  collections: CollectionData[];
  onCreated: (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => void;
  onClose: () => void;
}

export default function CreateNoteModal({ vaultPath, collections, onCreated, onClose }: Props) {
  const { t } = useT();
  const [collectionId, setCollectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedCollection = collections.find((c) => c.id === collectionId);
  const groups = selectedCollection?.groups ?? [];

  const handleCollectionChange = (id: string) => {
    setCollectionId(id);
    setGroupId("");
  };

  const handleSave = async (title: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await window.prism.createNote(vaultPath, title);
      onCreated(
        { id: note.id, path: note.path, title: note.title },
        collectionId || undefined,
        groupId || undefined,
      );
    } catch {
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <PromptModal
      open
      title={t["vault.newNote"]}
      icon={FilePlus}
      placeholder={t["vault.newNoteTitle"]}
      submitting={creating}
      onSubmit={handleSave}
      onClose={onClose}
    >
      <div className="space-y-4 mt-4">
        <div>
          <label className="block text-caption text-muted mb-1.5">{t["vault.newNoteCollection"]}</label>
          <SelectButton
            value={collectionId}
            onChange={handleCollectionChange}
            className="w-full"
            options={[
              { value: "", label: t["vault.newNoteNoCollection"] },
              ...collections.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        {collectionId && groups.length > 0 && (
          <div>
            <label className="block text-caption text-muted mb-1.5">{t["vault.newNoteGroup"]}</label>
            <SelectButton
              value={groupId}
              onChange={setGroupId}
              className="w-full"
              options={[
                { value: "", label: t["vault.newNoteNoGroup"] },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          </div>
        )}
      </div>
    </PromptModal>
  );
}
