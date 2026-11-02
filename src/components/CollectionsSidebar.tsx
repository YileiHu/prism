import { useMemo } from "react";
import { useT } from "../i18n";
import Sidebar from "./Sidebar";
import NavItem from "./NavItem";
import EmptyState from "./EmptyState";
import { type MenuItem } from "./ContextMenu";
import { useContextMenu } from "../lib/useContextMenu";
import { Pencil, Trash2 } from "lucide-react";
import { resolveTagColor } from "../lib/colors";
import { buildColorMenuItem } from "./ColorPicker";
import { useDndContext } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDragClickGuard } from "../lib/useDragClickGuard";

export interface NoteGroup {
  id: string;
  name: string;
  notePaths: string[];
  // Palette `bar` hex from TAG_COLORS; empty/undefined falls back to hashColor(name)
  color?: string;
}

export interface CollectionData {
  id: string;
  name: string;
  notePaths: string[];
  groups?: NoteGroup[];
  // Palette `bar` hex from TAG_COLORS; empty/undefined falls back to hashColor(name)
  color?: string;
}

interface Props {
  collections: CollectionData[];
  selectedId: string | null;
  allNotesCount: number;
  onSelect: (id: string | null) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSetColor: (id: string, color: string) => void;
}

export function makeCollId(id: string) { return `coll-${id}`; }

function SortableCollectionItem({
  coll,
  isSelected,
  staggerIndex,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: {
  coll: CollectionData;
  isSelected: boolean;
  staggerIndex: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (id: string, color: string) => void;
}) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const { active, over } = useDndContext();
  const isDropTarget = active?.data.current?.kind === "note" && over?.id === makeCollId(coll.id);

  const menuItems: MenuItem[] = [
    buildColorMenuItem(t, {
      label: t["collections.color"],
      autoLabel: t["collections.colorAuto"],
      autoSource: coll.name,
      current: coll.color,
      onSelect: (color) => onSetColor(coll.id, color),
    }),
    { label: t["collections.rename"], icon: <Pencil size={14} />, onClick: onRename },
    { label: t["collections.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeCollId(coll.id), data: { kind: "collection", id: coll.id } });

  const clickGuard = useDragClickGuard(isDragging);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    "--i": Math.min(staggerIndex, 10),
  } as React.CSSProperties;

  const totalNotes = coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0);

  return (
    <NavItem
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...clickGuard}
      active={isSelected}
      className={`group cursor-pointer stagger-in ${
        isDropTarget ? "ring-1 ring-[var(--accent)] bg-[var(--accent-muted)]" : ""
      }`}
      onClick={onSelect}
      onContextMenu={(e) => onContextMenu(e, menuItems)}
      leading={
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: resolveTagColor(coll.name, coll.color).bar }}
        />
      }
      label={coll.name}
      trailing={totalNotes}
    />
  );
}

export function CollectionDragOverlay({ coll }: { coll: CollectionData }) {
  const totalNotes = coll.notePaths.length + (coll.groups?.reduce((s, g) => s + g.notePaths.length, 0) ?? 0);
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: resolveTagColor(coll.name, coll.color).bar }}
      />
      <span className="flex-1 text-body text-primary">{coll.name}</span>
      <span className="text-caption text-muted">{totalNotes}</span>
    </div>
  );
}

export default function CollectionsSidebar({
  collections,
  selectedId,
  allNotesCount,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: Props) {
  const { t } = useT();

  const collIds = useMemo(() => collections.map((c) => makeCollId(c.id)), [collections]);

  return (
    <Sidebar storageKey="vault">
      <div
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-1.5 px-3 py-2 text-body transition-colors rounded-control cursor-pointer mb-1 pb-2 border-b border-line/50 ${
          selectedId === null
            ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium active-bar"
            : "text-secondary hover:text-primary hover:bg-elevated/50 font-medium"
        }`}
      >
        <span className="flex-1 text-body truncate text-left">{t["collections.allNotes"]}</span>
        <span className="text-caption text-faint flex-shrink-0">{allNotesCount}</span>
      </div>

      <SortableContext items={collIds} strategy={verticalListSortingStrategy}>
        {collections.length === 0 && <EmptyState size="card" text={t["collections.emptyHint"]} />}

        {collections.map((coll, i) => (
          <SortableCollectionItem
            key={coll.id}
            coll={coll}
            isSelected={selectedId === coll.id}
            staggerIndex={i}
            onSelect={() => onSelect(coll.id)}
            onRename={() => onRename(coll.id)}
            onDelete={() => onDelete(coll.id)}
            onSetColor={onSetColor}
          />
        ))}
      </SortableContext>
    </Sidebar>
  );
}
