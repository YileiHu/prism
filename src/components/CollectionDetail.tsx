import { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import Button from "./Button";
import EmptyState from "./EmptyState";
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
import { useDragClickGuard } from "../lib/useDragClickGuard";
import type { NoteRef } from "../shared/models";

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
  onToggle,
  onGroupContextMenu,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
  onOpenNote,
}: {
  group: GroupView;
  collapsed: boolean;
  color: PaletteColor;
  isOverlay?: boolean;
  onToggle: () => void;
  onGroupContextMenu: (e: React.MouseEvent, groupId: string) => void;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
  onOpenNote: (note: NoteInfo) => void;
}) {
  const { t } = useT();
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-3 border rounded-card bg-surface overflow-hidden transition-colors ${
        isOverlay ? "shadow-drag border-[var(--accent)]" : "border-strong/50"
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 h-8"
        style={{ backgroundColor: color.tint }}
        onContextMenu={(e) => onGroupContextMenu(e, group.id)}
        {...attributes}
        {...listeners}
        {...clickGuard}
      >
        <Button variant="ghost" size="icon-xs" onClick={onToggle}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </Button>
        <span className="text-caption font-medium truncate max-w-[200px]" style={{ color: color.name }}>{group.name}</span>
        <span className="text-caption text-muted ml-1">{group.notes.length}</span>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="p-2">
            {group.notes.length === 0 ? (
              <p className="text-caption text-faint text-center py-3">
                {t["collections.dropNotesHere"]}
              </p>
            ) : (
              <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
                {group.notes.map((note) => (
                  <SortableNoteRow
                    key={note.relPath}
                    note={note}
                    groupId={group.id}
                    onRemoveNote={onRemoveNote}
                    onReorderNotes={onReorderNotes}
                    onNoteContextMenu={onNoteContextMenu}
                    onOpenNote={onOpenNote}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Sortable Note Row ----

function SortableNoteRow({
  note,
  groupId,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
  onOpenNote,
}: {
  note: NoteInfo;
  groupId: string | null;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
  onOpenNote: (note: NoteInfo) => void;
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...clickGuard}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-control transition-colors cursor-pointer ${
        note.missing ? "opacity-50" : "hover:bg-hover/50"
      }`}
      onClick={() => { if (!note.missing) onOpenNote(note); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onNoteContextMenu(e, note, groupId); }}
    >
      <span className={`flex-1 text-body truncate ${note.missing ? "text-faint line-through" : "text-primary"}`}>
        {note.title}
        {note.missing && (
          <span className="ml-1.5 text-caption text-warning inline-flex items-center gap-0.5">
            <AlertTriangle size={10} />
            {t["collections.missing"]}
          </span>
        )}
      </span>
    </div>
  );
}

// ---- Drag Overlay Note ----

function DragOverlayNote({ note }: { note: NoteInfo }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
      <span className="text-body text-primary">{note.title}</span>
    </div>
  );
}

// ---- Drag Overlay Group ----

function DragOverlayGroup({ group, color }: { group: GroupView; color: PaletteColor }) {
  return (
    <div className="rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: color.tint }}>
        <span className="text-caption font-medium" style={{ color: color.name }}>{group.name}</span>
        <span className="text-caption text-muted">{group.notes.length}</span>
      </div>
    </div>
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
}: Props) {
  const { t } = useT();
  const [activeDrag, setActiveDrag] = useState<{ type: "group"; group: GroupView; color: PaletteColor } | { type: "note"; note: NoteInfo } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const groupIds = useMemo(() => groups.map((g) => makeGroupId(g.id)), [groups]);
  const ungroupedIds = useMemo(() => ungroupedNotes.map((n) => makeNoteId(n.relPath)), [ungroupedNotes]);

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
      <div className="flex-1 overflow-y-auto p-3">
        {/* Group cards */}
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <SortableGroupCard
              key={group.id}
              group={group}
              collapsed={collapsedGroups.has(group.id)}
              color={resolveTagColor(group.name, group.color)}
              onToggle={() => onToggleGroup(group.id)}
              onGroupContextMenu={onGroupContextMenu}
              onRemoveNote={onRemoveNote}
              onReorderNotes={onReorderNotes}
              onNoteContextMenu={onNoteContextMenu}
              onOpenNote={onOpenNote}
            />
          ))}
        </SortableContext>

        {/* Ungrouped card */}
        {ungroupedNotes.length > 0 && (
          <div
            className="mb-3 border border-strong/50 rounded-card bg-surface overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 h-8 bg-tint/[0.06] border-b border-line/60">
              <Button variant="ghost" size="icon-xs" onClick={onToggleUngrouped}>
                {ungroupedCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </Button>
              <span className="text-caption font-medium text-secondary uppercase tracking-wide">
                {t["collections.ungrouped"]}
              </span>
              <span className="text-caption text-faint">{ungroupedNotes.length}</span>
            </div>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: ungroupedCollapsed ? "0fr" : "1fr" }}
            >
              <div className="overflow-hidden min-h-0">
                <div className="p-2">
                  <SortableContext items={ungroupedIds} strategy={verticalListSortingStrategy}>
                    {ungroupedNotes.map((note) => (
                      <SortableNoteRow
                        key={note.relPath}
                        note={note}
                        groupId={null}
                        onRemoveNote={onRemoveNote}
                        onReorderNotes={onReorderNotes}
                        onNoteContextMenu={onNoteContextMenu}
                        onOpenNote={onOpenNote}
                      />
                    ))}
                  </SortableContext>
                </div>
              </div>
            </div>
          </div>
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
