import { useState } from "react";
import { X, FilePlus } from "lucide-react";
import { useT } from "../i18n";
import type { CollectionData, NoteGroup } from "./CollectionsSidebar";
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[420px] p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FilePlus size={18} className="text-[var(--accent-text)]" />
            <h2 className="text-base font-semibold text-gray-200">{t["obsidian.newNote"]}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded">
            <X size={18} />
          </button>
        </div>

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
            <select
              value={collectionId}
              onChange={(e) => handleCollectionChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
            >
              <option value="">{t["obsidian.newNoteNoCollection"]}</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {collectionId && groups.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t["obsidian.newNoteGroup"]}</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
              >
                <option value="">{t["obsidian.newNoteNoGroup"]}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {t["resources.cancel"]}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || creating}
            className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
          >
            {t["resources.save"]}
          </button>
        </div>
      </div>
    </div>
  );
}
