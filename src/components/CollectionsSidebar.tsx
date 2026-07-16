import { useState, useCallback, useMemo } from "react";
import { Plus, GripVertical, MoreVertical, FileText, FolderOpen, RefreshCw, Home } from "lucide-react";
import { useT } from "../i18n";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  notePaths: string[];
  groups?: NoteGroup[];
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

function makeCollId(id: string) { return `coll-${id}`; }

function SortableCollectionItem({
  coll,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  onDropNote,
}: {
  coll: CollectionData;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropNote: (collectionId: string, notePaths: string[]) => void;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeCollId(coll.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const totalNotes = coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center gap-1.5 mx-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
      }`}
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("text/x-note-paths")) {
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const noteData = e.dataTransfer.getData("text/x-note-paths");
        if (noteData) {
          try {
            const paths: string[] = JSON.parse(noteData);
            onDropNote(coll.id, paths);
          } catch { /* ignore */ }
        }
      }}
    >
      <button
        className="opacity-30 flex-shrink-0 cursor-grab active:cursor-grabbing hover:opacity-70"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <FileText size={14} className="flex-shrink-0" />
      <span className="flex-1 text-sm truncate">{coll.name}</span>
      <span className="text-xs text-gray-600 flex-shrink-0">{totalNotes}</span>

      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-all"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
              <button
                onClick={(e) => { e.stopPropagation(); onRename(); closeMenu(); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
              >
                {t["collections.rename"]}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); closeMenu(); }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
              >
                {t["collections.delete"]}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DragOverlayCollection({ coll }: { coll: CollectionData }) {
  const totalNotes = coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0);
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-[var(--accent)] shadow-xl opacity-90">
      <GripVertical size={14} className="text-gray-500" />
      <FileText size={14} className="text-gray-400" />
      <span className="flex-1 text-sm text-gray-200">{coll.name}</span>
      <span className="text-xs text-gray-500">{totalNotes}</span>
    </div>
  );
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
  const [vaultDropdownOpen, setVaultDropdownOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<CollectionData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const collIds = useMemo(() => collections.map((c) => makeCollId(c.id)), [collections]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = (event.active.id as string).slice(5); // remove "coll-" prefix
    const coll = collections.find((c) => c.id === id);
    if (coll) setActiveDrag(coll);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = collections.findIndex((c) => makeCollId(c.id) === active.id);
    const toIdx = collections.findIndex((c) => makeCollId(c.id) === over.id);
    if (fromIdx !== -1 && toIdx !== -1) {
      onReorder(fromIdx, toIdx);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <aside className="min-w-48 w-52 flex-shrink-0 border-r border-gray-800 flex flex-col select-none">
        {/* Collection list */}
        <SortableContext items={collIds} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-y-auto py-1 pt-2">
            {collections.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-gray-500 leading-relaxed">
                {t["collections.emptyHint"] ?? "点击下方 + 按钮创建第一个收藏集"}
              </p>
            )}

            {collections.map((coll) => (
              <SortableCollectionItem
                key={coll.id}
                coll={coll}
                isSelected={selectedId === coll.id}
                onSelect={() => onSelect(coll.id)}
                onRename={() => onRename(coll.id)}
                onDelete={() => onDelete(coll.id)}
                onDropNote={onDropNote}
              />
            ))}
          </div>
        </SortableContext>

        {/* Bottom toolbar */}
        <div className="border-t border-gray-800 px-2 py-2 flex items-center justify-center gap-1">
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

          <button
            onClick={onRefresh}
            disabled={scanning}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50"
            title={t["obsidian.refresh"]}
          >
            <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
          </button>

          <button
            onClick={onCreate}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-colors"
            title={t["collections.new"]}
          >
            <Plus size={16} />
          </button>

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

      <DragOverlay dropAnimation={null}>
        {activeDrag && <DragOverlayCollection coll={activeDrag} />}
      </DragOverlay>
    </DndContext>
  );
}
