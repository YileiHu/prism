import { useState, useMemo } from "react";
import { Plus, FolderOpen, RefreshCw } from "lucide-react";
import { useT } from "../i18n";
import Button from "./Button";
import Sidebar from "./Sidebar";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import ContextMenu, { type MenuItem } from "./ContextMenu";
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
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);

  const menuItems: MenuItem[] = [
    { label: t["collections.rename"], onClick: onRename },
    { label: t["collections.delete"], onClick: onDelete, danger: true },
  ];

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
      {...attributes}
      {...listeners}
      className={`group relative flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
        isSelected
          ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium"
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
      onContextMenu={(e) => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
    >
      <span className="flex-1 text-sm truncate">{coll.name}</span>
      <span className="text-xs text-gray-600 flex-shrink-0">{totalNotes}</span>

      {ctxPos && (
        <ContextMenu items={menuItems} position={ctxPos} onClose={() => setCtxPos(null)} />
      )}
    </div>
  );
}

function DragOverlayCollection({ coll }: { coll: CollectionData }) {
  const totalNotes = coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0);
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-[var(--accent)] shadow-xl opacity-90">
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
      <Sidebar
        footer={
          <div className="flex items-center gap-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-md"
                onClick={() => setVaultDropdownOpen(!vaultDropdownOpen)}
                className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                title={selectedVault?.name ?? t["obsidian.chooseVault"]}
              >
                <FolderOpen size={16} />
              </Button>
              <DropdownMenu open={vaultDropdownOpen} onClose={() => setVaultDropdownOpen(false)} className="bottom-full mb-1 left-0 w-64">
                {vaults.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => { onSelectVault(v); setVaultDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors rounded-md ${
                      selectedVault?.path === v.path ? "bg-[var(--accent-muted)] text-[var(--accent-text)]" : "text-gray-300 hover:bg-gray-700/50"
                    }`}
                  >
                    <FolderOpen size={14} className={selectedVault?.path === v.path ? "text-[var(--accent-text)]" : "text-amber-500"} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-gray-500 truncate text-[10px]">{v.path}</div>
                    </div>
                  </button>
                ))}
              </DropdownMenu>
            </div>

            <Button
              variant="ghost"
              size="icon-md"
              onClick={onRefresh}
              disabled={scanning}
              title={t["obsidian.refresh"]}
            >
              <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
            </Button>

            <Button
              variant="ghost"
              size="icon-md"
              onClick={onCreate}
              title={t["collections.new"]}
            >
              <Plus size={16} />
            </Button>

          </div>
        }
      >
        <div
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-1.5 px-3 py-2 text-sm transition-colors rounded-lg cursor-pointer mb-1 pb-2 border-b border-gray-800/50 ${
            selectedId === null
              ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium"
              : "text-gray-300 hover:text-gray-200 hover:bg-gray-800/50 font-medium"
          }`}
        >
          <span className="flex-1 text-sm truncate text-left">{t["collections.allNotes"]}</span>
          <span className="text-xs text-gray-600 flex-shrink-0">{allNotesCount}</span>
        </div>

        <SortableContext items={collIds} strategy={verticalListSortingStrategy}>
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
        </SortableContext>
      </Sidebar>

      <DragOverlay dropAnimation={null}>
        {activeDrag && <DragOverlayCollection coll={activeDrag} />}
      </DragOverlay>
    </DndContext>
  );
}
