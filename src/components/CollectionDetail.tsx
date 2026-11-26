import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import DragPreview from "./DragPreview";
import EmptyState from "./EmptyState";
import ItemRow from "./ItemRow";
import SectionCard from "./SectionCard";
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
import { resolveTagColor, type PaletteColor } from "../lib/colors";
import { selectionEdgeAt, type SelectionEdge } from "../lib/selectionEdge";
import { useDragClickGuard } from "../lib/useDragClickGuard";
import type { NoteRef } from "../shared/models";

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export interface NoteInfo extends NoteRef {
  relPath: string;
  missing: boolean;
}

interface GroupView {
  id: string;
  name: string;
  color?: string;
  notes: NoteInfo[];
}

interface Props {
  groups: GroupView[];
  ungroupedNotes: NoteInfo[];
  collapsedGroups: Set<string>;
  ungroupedCollapsed: boolean;
  onToggleGroup: (id: string) => void;
  onToggleUngrouped: () => void;
  onGroupContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onReorderGroups: (fromIndex: number, toIndex: number) => void;
  onMoveNote: (noteRelPath: string, fromGroupId: string | null, toGroupId: string | null, toIndex?: number) => void;
  onRemoveNote: (noteRelPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
  onOpenNote: (note: NoteInfo) => void;
  emptyGroupText?: string;
  /** Scroll container ref, so the owning list can bind Ctrl/Cmd+A and focus it. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  selecting?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleItem?: (relPath: string, event: React.MouseEvent<HTMLDivElement>) => void;
}

// Returns the group containing the note, null for ungrouped, undefined when absent
function findNoteGroupId(relPath: string, groups: GroupView[], ungrouped: NoteInfo[]): string | null | undefined {
  for (const g of groups) {
    if (g.notes.some((n) => n.relPath === relPath)) return g.id;
  }
  if (ungrouped.some((n) => n.relPath === relPath)) return null;
  return undefined;
}

function makeGroupId(id: string) { return `group-${id}`; }
function makeNoteId(relPath: string) { return `note-${relPath}`; }
function parseGroupId(dndId: string) { return dndId.startsWith("group-") ? dndId.slice(6) : null; }
function parseNoteRelPath(dndId: string) { return dndId.startsWith("note-") ? dndId.slice(5) : null; }

// ---- Sortable Group Card ----

function SortableGroupCard({
  group,
  collapsed,
  color,
  isOverlay,
  emptyText,
  selecting,
  selectedKeys,
  onToggle,
  onGroupContextMenu,
  onNoteContextMenu,
  onOpenNote,
  onToggleItem,
}: {
  group: GroupView;
  collapsed: boolean;
  color: PaletteColor;
  isOverlay?: boolean;
  emptyText: string;
  selecting?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggle: () => void;
  onGroupContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
  onOpenNote: (note: NoteInfo) => void;
  onToggleItem?: (relPath: string, event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeGroupId(group.id) });

  const clickGuard = useDragClickGuard(isDragging);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const noteIds = useMemo(() => group.notes.map((n) => makeNoteId(n.relPath)), [group.notes]);
  const noteKeys = useMemo(() => group.notes.map((note) => note.relPath), [group.notes]);
  const selection = selectedKeys ?? EMPTY_SELECTION;

  return (
    <SectionCard
      cardRef={setNodeRef}
      style={style}
      className="mb-3"
      overlay={isOverlay}
      tintColor={color}
      title={group.name}
      count={group.notes.length}
      collapsed={collapsed}
      onToggle={onToggle}
      headerClickToggles={false}
      headerProps={{ ...attributes, ...listeners, ...clickGuard }}
      onHeaderContextMenu={(event) => onGroupContextMenu(event, group.id)}
      bodyClassName="p-2"
    >
      {group.notes.length === 0 ? (
        <p className="text-caption text-faint text-center py-3">
          {emptyText}
        </p>
      ) : (
        <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
          {group.notes.map((note, index) => (
            <SortableNoteRow
              key={note.relPath}
              note={note}
              groupId={group.id}
              selecting={selecting}
              selected={selection.has(note.relPath)}
              selectionEdge={selectionEdgeAt(noteKeys, index, selection) ?? undefined}
              onNoteContextMenu={onNoteContextMenu}
              onOpenNote={onOpenNote}
              onToggleItem={onToggleItem}
            />
          ))}
        </SortableContext>
      )}
    </SectionCard>
  );
}

// ---- Sortable Note Row ----

function SortableNoteRow({
  note,
  groupId,
  selecting = false,
  selected = false,
  selectionEdge,
  onNoteContextMenu,
  onOpenNote,
  onToggleItem,
}: {
  note: NoteInfo;
  groupId: string | null;
  selecting?: boolean;
  selected?: boolean;
  selectionEdge?: SelectionEdge;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
  onOpenNote: (note: NoteInfo) => void;
  onToggleItem?: (relPath: string, event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeNoteId(note.relPath) });

  const clickGuard = useDragClickGuard(isDragging);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <ItemRow
      rowRef={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...clickGuard}
      selected={selected}
      selectable={selecting}
      checked={selected}
      selectionEdge={selectionEdge}
      className={note.missing ? "opacity-50" : ""}
      onPrimaryClick={(event) => {
        if (selecting) onToggleItem?.(note.relPath, event as React.MouseEvent<HTMLDivElement>);
        else if (!note.missing) onOpenNote(note);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onNoteContextMenu(event, note, groupId);
      }}
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`min-w-0 truncate ${note.missing ? "line-through" : ""}`}>
            {note.title}
          </span>
          {note.missing && (
            <span className="ml-1.5 inline-flex flex-shrink-0 items-center gap-0.5 text-caption text-warning">
              <AlertTriangle size={10} />
              {t["collections.missing"]}
            </span>
          )}
        </span>
      }
    />
  );
}

// ---- Drag Overlay Note ----

function DragOverlayNote({ note }: { note: NoteInfo }) {
  return (
    <DragPreview className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-body text-primary">{note.title}</span>
    </DragPreview>
  );
}

// ---- Drag Overlay Group ----

function DragOverlayGroup({ group, color }: { group: GroupView; color: PaletteColor }) {
  return (
    <DragPreview className="overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: color.tint }}>
        <span className="text-caption font-medium" style={{ color: color.name }}>{group.name}</span>
        <span className="text-caption text-muted">{group.notes.length}</span>
      </div>
    </DragPreview>
  );
}

// ---- Main Component ----

export default function CollectionDetail({
  groups,
  ungroupedNotes,
  collapsedGroups,
  ungroupedCollapsed,
  onToggleGroup,
  onToggleUngrouped,
  onGroupContextMenu,
  onReorderGroups,
  onMoveNote,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
  onOpenNote,
  emptyGroupText,
  scrollRef,
  selecting = false,
  selectedKeys,
  onToggleItem,
}: Props) {
  const { t } = useT();
  const emptyText = emptyGroupText ?? t["collections.dropNotesHere"];
  const [activeDrag, setActiveDrag] = useState<{ type: "group"; group: GroupView; color: PaletteColor } | { type: "note"; note: NoteInfo } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const groupIds = useMemo(() => groups.map((g) => makeGroupId(g.id)), [groups]);
  const ungroupedIds = useMemo(() => ungroupedNotes.map((n) => makeNoteId(n.relPath)), [ungroupedNotes]);
  const ungroupedKeys = useMemo(() => ungroupedNotes.map((note) => note.relPath), [ungroupedNotes]);
  const selection = selectedKeys ?? EMPTY_SELECTION;

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const gid = parseGroupId(active.id as string);
    if (gid) {
      const g = groups.find((x) => x.id === gid);
      if (g) {
        setActiveDrag({ type: "group", group: g, color: resolveTagColor(g.name, g.color) });
        return;
      }
    }
    const relPath = parseNoteRelPath(active.id as string);
    if (relPath) {
      for (const g of groups) {
        const n = g.notes.find((x) => x.relPath === relPath);
        if (n) { setActiveDrag({ type: "note", note: n }); return; }
      }
      const n = ungroupedNotes.find((x) => x.relPath === relPath);
      if (n) { setActiveDrag({ type: "note", note: n }); return; }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    // Group reorder
    const activeGroupId = parseGroupId(active.id as string);
    if (activeGroupId) {
      const overGroupId = parseGroupId(over.id as string);
      if (overGroupId && activeGroupId !== overGroupId) {
        const fromIdx = groups.findIndex((g) => g.id === activeGroupId);
        const toIdx = groups.findIndex((g) => g.id === overGroupId);
        if (fromIdx !== -1 && toIdx !== -1) {
          onReorderGroups(fromIdx, toIdx);
        }
      }
      return;
    }

    // Note operations
    const activeRelPath = parseNoteRelPath(active.id as string);
    if (!activeRelPath) return;

    const fromGroupId = findNoteGroupId(activeRelPath, groups, ungroupedNotes);
    if (fromGroupId === undefined) return;

    const overGroupId = parseGroupId(over.id as string);
    const overRelPath = parseNoteRelPath(over.id as string);

    if (overGroupId) {
      // Dropped on a group card — move to that group
      if (fromGroupId !== overGroupId) {
        onMoveNote(activeRelPath, fromGroupId, overGroupId);
      }
    } else if (overRelPath) {
      const toGroupId = findNoteGroupId(overRelPath, groups, ungroupedNotes);
      if (toGroupId === undefined) return;

      if (fromGroupId === toGroupId) {
        // Same group — reorder
        const containerNotes = toGroupId === null
          ? ungroupedNotes
          : (groups.find((g) => g.id === toGroupId)?.notes ?? []);
        const fromIdx = containerNotes.findIndex((n) => n.relPath === activeRelPath);
        const toIdx = containerNotes.findIndex((n) => n.relPath === overRelPath);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          onReorderNotes(toGroupId, fromIdx, toIdx);
        }
      } else {
        // Different container — move and insert at the drop position
        const toNotes = toGroupId === null
          ? ungroupedNotes
          : (groups.find((g) => g.id === toGroupId)?.notes ?? []);
        const toIdx = toNotes.findIndex((n) => n.relPath === overRelPath);
        onMoveNote(activeRelPath, fromGroupId, toGroupId, toIdx === -1 ? undefined : toIdx);
      }
    }
  };

  const totalNotes = ungroupedNotes.length + groups.reduce((s, g) => s + g.notes.length, 0);
  if (totalNotes === 0 && groups.length === 0) {
    return (
      <div className="flex-1">
        <EmptyState size="module" text={t["collections.noNotes"]} />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={scrollRef} tabIndex={-1} className="flex-1 overflow-y-auto p-3 focus:outline-none">
        {/* Group cards */}
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <SortableGroupCard
              key={group.id}
              group={group}
              collapsed={collapsedGroups.has(group.id)}
              color={resolveTagColor(group.name, group.color)}
              emptyText={emptyText}
              selecting={selecting}
              selectedKeys={selectedKeys}
              onToggle={() => onToggleGroup(group.id)}
              onGroupContextMenu={onGroupContextMenu}
              onNoteContextMenu={onNoteContextMenu}
              onOpenNote={onOpenNote}
              onToggleItem={onToggleItem}
            />
          ))}
        </SortableContext>

        {/* Ungrouped card */}
        {ungroupedNotes.length > 0 && (
          <SectionCard
            className="mb-3"
            title={(
              <span className="text-secondary uppercase tracking-wide">
                {t["collections.ungrouped"]}
              </span>
            )}
            count={ungroupedNotes.length}
            collapsed={ungroupedCollapsed}
            onToggle={onToggleUngrouped}
            headerClickToggles={false}
            bodyClassName="p-2"
          >
            <SortableContext items={ungroupedIds} strategy={verticalListSortingStrategy}>
              {ungroupedNotes.map((note, index) => (
                <SortableNoteRow
                  key={note.relPath}
                  note={note}
                  groupId={null}
                  selecting={selecting}
                  selected={selection.has(note.relPath)}
                  selectionEdge={selectionEdgeAt(ungroupedKeys, index, selection) ?? undefined}
                  onNoteContextMenu={onNoteContextMenu}
                  onOpenNote={onOpenNote}
                  onToggleItem={onToggleItem}
                />
              ))}
            </SortableContext>
          </SectionCard>
        )}

      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === "note" ? (
          <DragOverlayNote note={activeDrag.note} />
        ) : activeDrag?.type === "group" ? (
          <DragOverlayGroup group={activeDrag.group} color={activeDrag.color} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
