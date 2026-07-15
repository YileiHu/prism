import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useT } from "../i18n";

interface Props {
  selectedCount: number;
  collections: { id: string; name: string }[];
  onAddToCollection: (collectionId: string) => void;
  onDelete: () => void;
}

export default function BatchActionBar({ selectedCount, collections, onAddToCollection, onDelete }: Props) {
  const { t } = useT();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-gray-800 border-t border-gray-700 shadow-lg z-20">
      <span className="text-sm text-gray-300 font-medium">
        {t["batch.selected"].replace("{count}", String(selectedCount))}
      </span>

      {/* Add to collection dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg text-sm text-white transition-colors"
        >
          {t["batch.addToCollection"]}
          <ChevronDown size={14} />
        </button>
        {dropdownOpen && (
          <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]">
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => { onAddToCollection(c.id); setDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-400/10 hover:bg-red-400/20 text-red-400 rounded-lg text-sm transition-colors"
      >
        {t["batch.delete"]}
      </button>
    </div>
  );
}
