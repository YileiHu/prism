import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";

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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[400px] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-200">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded">
            <X size={18} />
          </button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder={t["collections.namePlaceholder"]}
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            {t["resources.cancel"]}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
          >
            {t["resources.save"]}
          </button>
        </div>
      </div>
    </div>
  );
}
