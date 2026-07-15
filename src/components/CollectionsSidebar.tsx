import { useState, useRef, useCallback } from "react";
import { Plus, GripVertical, MoreVertical, FileText, FolderOpen, RefreshCw, Home } from "lucide-react";
import { useT } from "../i18n";

interface VaultEntry {
  name: string;
  path: string;
}

export interface NoteGroup {
  id: string;
  name: string;
  notePaths: string[];
}

export interface CollectionData {
  id: string;
  name: string;
  notePaths: string[];   // ungrouped notes
  groups?: NoteGroup[];  // v2: optional groups
}

interface Props {
  collections: CollectionData[];
  selectedId: string | null;
  allNotesCount: number;
  vaults: VaultEntry[];
  selectedVault: VaultEntry | null;
  scanning: boolean;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDropNote: (collectionId: string, notePaths: string[]) => void;
  onSelectVault: (vault: VaultEntry) => void;
  onRefresh: () => void;
}

export default function CollectionsSidebar({
  collections,
  selectedId,
  allNotesCount,
  vaults,
  selectedVault,
  scanning,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onDropNote,
  onSelectVault,
  onRefresh,
}: Props) {
  const { t } = useT();
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [vaultDropdownOpen, setVaultDropdownOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpenId(null), []);

  // Close menu on outside click
  const handleMenuToggle = (id: string) => {
    setMenuOpenId(menuOpenId === id ? null : id);
  };

  // Collection drag reorder
  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    // Check if this is a collection reorder drag (not a note drop)
    if (e.dataTransfer.types.includes("text/x-collection-index")) {
      setDragOverIndex(index);
    } else {
      // Note drop - highlight as drop target
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    // Collection reorder
    if (e.dataTransfer.types.includes("text/x-collection-index")) {
      const from = dragIndex.current;
      if (from !== null && from !== index) {
        onReorder(from, index);
      }
      dragIndex.current = null;
      return;
    }

    // Note drop - add to collection
    const noteData = e.dataTransfer.getData("text/x-note-paths");
    if (noteData) {
      try {
        const paths: string[] = JSON.parse(noteData);
        const collection = collections[index];
        if (collection) onDropNote(collection.id, paths);
      } catch { /* ignore */ }
    }
  };

  const handleCollectionDragStart = (e: React.DragEvent, index: number) => {
    dragIndex.current = index;
    e.dataTransfer.setData("text/x-collection-index", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="min-w-48 w-52 flex-shrink-0 border-r border-gray-800 flex flex-col select-none">
      {/* Collection list */}
      <div className="flex-1 overflow-y-auto py-1 pt-2">
        {collections.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-gray-500 leading-relaxed">
            {t["collections.emptyHint"] ?? "点击下方 + 按钮创建第一个收藏集"}
          </p>
        )}

        {collections.map((coll, i) => (
          <div
            key={coll.id}
            draggable
            onDragStart={(e) => handleCollectionDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, i)}
            className={`group relative flex items-center gap-1.5 mx-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
              selectedId === coll.id
                ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            } ${dragOverIndex === i ? "border-t-2 border-[var(--accent)]" : ""}`}
            onClick={() => onSelect(coll.id)}
          >
            <GripVertical size={14} className="opacity-30 flex-shrink-0" />
            <FileText size={14} className="flex-shrink-0" />
            <span className="flex-1 text-sm truncate">{coll.name}</span>
            <span className="text-xs text-gray-600 flex-shrink-0">
              {coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0)}
            </span>

            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleMenuToggle(coll.id); }}
                className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-all"
              >
                <MoreVertical size={14} />
              </button>
              {menuOpenId === coll.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRename(coll.id); closeMenu(); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                    >
                      {t["collections.rename"]}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(coll.id); closeMenu(); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
                    >
                      {t["collections.delete"]}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom toolbar */}
      <div className="border-t border-gray-800 px-2 py-2 flex items-center justify-center gap-1">
        {/* Vault selector */}
        <div className="relative">
          <button
            onClick={() => setVaultDropdownOpen(!vaultDropdownOpen)}
            className="p-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
            title={selectedVault?.name ?? t["obsidian.chooseVault"]}
          >
            <FolderOpen size={16} />
          </button>
          {vaultDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setVaultDropdownOpen(false)} />
              <div className="absolute bottom-full mb-1 left-0 z-20 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                {vaults.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => { onSelectVault(v); setVaultDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-700/50 transition-colors ${
                      selectedVault?.path === v.path ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-gray-300"
                    }`}
                  >
                    <FolderOpen size={14} className={selectedVault?.path === v.path ? "text-[var(--accent-text)]" : "text-amber-500"} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-gray-500 truncate text-[10px]">{v.path}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={scanning}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50"
          title={t["obsidian.refresh"]}
        >
          <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
        </button>

        {/* Add collection */}
        <button
          onClick={onCreate}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-colors"
          title={t["collections.new"]}
        >
          <Plus size={16} />
        </button>

        {/* Home / All notes */}
        <button
          onClick={() => onSelect(null)}
          className={`p-2 rounded-lg transition-colors ${
            selectedId === null
              ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
          }`}
          title={`${t["collections.allNotes"]} (${allNotesCount})`}
        >
          <Home size={16} />
        </button>
      </div>
    </aside>
  );
}
