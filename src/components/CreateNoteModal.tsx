import { useState } from "react";
import { FilePlus, ChevronDown } from "lucide-react";
import { useT } from "../i18n";
import type { CollectionData } from "./CollectionsSidebar";
import Button from "./Button";
import Modal from "./Modal";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import "../lib/api";

interface Props {
  vaultPath: string;
  collections: CollectionData[];
  onCreated: (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => void;
  onClose: () => void;
}

export default function CreateNoteModal({ vaultPath, collections, onCreated, onClose }: Props) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [creating, setCreating] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const selectedCollection = collections.find((c) => c.id === collectionId);
  const groups = selectedCollection?.groups ?? [];

  const handleCollectionChange = (id: string) => {
    setCollectionId(id);
    setGroupId("");
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const note = await window.prism.createNote(vaultPath, trimmed);
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
    <Modal
      open
      title={t["obsidian.newNote"]}
      icon={<FilePlus size={18} className="text-[var(--accent-text)]" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>{t["resources.cancel"]}</Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={!title.trim() || creating}>{t["resources.save"]}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder={t["obsidian.newNoteTitle"]}
            autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t["obsidian.newNoteCollection"]}</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCollectionOpen(!collectionOpen)}
              className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm transition-colors hover:border-gray-600"
            >
              <span className={collectionId ? "text-gray-200" : "text-gray-500"}>
                {collectionId ? selectedCollection?.name : t["obsidian.newNoteNoCollection"]}
              </span>
              <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
            </button>
            <DropdownMenu open={collectionOpen} onClose={() => setCollectionOpen(false)} className="left-0 top-full mt-1 w-full">
              <DropdownMenuItem
                onClick={() => { handleCollectionChange(""); setCollectionOpen(false); }}
                active={collectionId === ""}
              >
                {t["obsidian.newNoteNoCollection"]}
              </DropdownMenuItem>
              {collections.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => { handleCollectionChange(c.id); setCollectionOpen(false); }}
                  active={collectionId === c.id}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </div>
        </div>

        {collectionId && groups.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t["obsidian.newNoteGroup"]}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setGroupOpen(!groupOpen)}
                className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm transition-colors hover:border-gray-600"
              >
                <span className={groupId ? "text-gray-200" : "text-gray-500"}>
                  {groupId ? groups.find((g) => g.id === groupId)?.name : t["obsidian.newNoteNoGroup"]}
                </span>
                <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
              </button>
              <DropdownMenu open={groupOpen} onClose={() => setGroupOpen(false)} className="left-0 top-full mt-1 w-full">
                <DropdownMenuItem
                  onClick={() => { setGroupId(""); setGroupOpen(false); }}
                  active={groupId === ""}
                >
                  {t["obsidian.newNoteNoGroup"]}
                </DropdownMenuItem>
                {groups.map((g) => (
                  <DropdownMenuItem
                    key={g.id}
                    onClick={() => { setGroupId(g.id); setGroupOpen(false); }}
                    active={groupId === g.id}
                  >
                    {g.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
