import { useState, useMemo, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, MoreVertical, Plus } from "lucide-react";
import { useT } from "../i18n";
import Button from "./Button";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
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

const GROUP_COLORS = [
  { bar: "#c75b4a", name: "#d4846e" },
  { bar: "#c4a43e", name: "#d4b85a" },
  { bar: "#5b7fa5", name: "#7a9db8" },
  { bar: "#6b8e5a", name: "#8aa878" },
];

export interface NoteInfo {
  path: string;
  relativePath: string;
  title: string;
  missing: boolean;
}

interface GroupView {
  id: string;
  name: string;
  notes: NoteInfo[];
}

interface Props {
  groups: GroupView[];
  ungroupedNotes: NoteInfo[];
  collapsedGroups: Set<string>;
  ungroupedCollapsed: boolean;
  onToggleGroup: (id: string) => void;
  onToggleUngrouped: () => void;
  onAddGroup: (name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onReorderGroups: (fromIndex: number, toIndex: number) => void;
  onMoveNote: (noteRelPath: string, fromGroupId: string | null, toGroupId: string | null, toIndex?: number) => void;
  onRemoveNote: (noteRelPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
}

// Returns the group containing the note, null for ungrouped, undefined when absent
function findNoteGroupId(relPath: string, groups: GroupView[], ungrouped: NoteInfo[]): string | null | undefined {
  for (const g of groups) {
    if (g.notes.some((n) => n.relativePath === relPath)) return g.id;
  }
  if (ungrouped.some((n) => n.relativePath === relPath)) return null;
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
  onRename,
  onDelete,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
}: {
  group: GroupView;
  collapsed: boolean;
  color: { bar: string; name: string };
  isOverlay?: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const menuAnchorRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeGroupId(group.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const noteIds = useMemo(() => group.notes.map((n) => makeNoteId(n.relativePath)), [group.notes]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-3 border rounded-xl bg-surface/20 overflow-hidden transition-colors ${
        isOverlay ? "shadow-xl border-[var(--accent)]" : "border-strong/50"
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 h-8"
        style={{ backgroundColor: `${color.bar}18` }}
        {...attributes}
        {...listeners}
      >
        <button onClick={onToggle} className="text-muted hover:text-secondary transition-colors">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editName.trim()) { onRename(editName.trim()); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={() => {
              if (editName.trim()) onRename(editName.trim());
              setEditing(false);
            }}
            autoFocus
            className="flex-1 bg-hover border border-strong rounded px-2 py-0.5 text-sm text-primary focus:outline-none focus:border-[var(--accent)]"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs font-medium truncate max-w-[200px]" style={{ color: color.name }}>{group.name}</span>
        )}
        <span className="text-xs text-muted ml-1">{group.notes.length}</span>
        <div className="flex-1" />
        <div ref={menuAnchorRef}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-0"
          >
            <MoreVertical size={13} />
          </Button>
          <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchorRef} align="right" className="min-w-[100px]">
            <DropdownMenuItem onClick={() => { setEditing(true); setEditName(group.name); setMenuOpen(false); }}>
              {t["collections.rename"]}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { onDelete(); setMenuOpen(false); }} danger>
              {t["collections.deleteGroup"]}
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="p-2">
            {group.notes.length === 0 ? (
              <p className="text-xs text-faint text-center py-3">
                {t["collections.dropNotesHere"]}
              </p>
            ) : (
              <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
                {group.notes.map((note) => (
                  <SortableNoteRow
                    key={note.relativePath}
                    note={note}
                    groupId={group.id}
                    onRemoveNote={onRemoveNote}
                    onReorderNotes={onReorderNotes}
                    onNoteContextMenu={onNoteContextMenu}
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
}: {
  note: NoteInfo;
  groupId: string | null;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo, groupId: string | null) => void;
}) {
  const { t } = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: makeNoteId(note.relativePath) });

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
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
        note.missing ? "opacity-50" : "hover:bg-hover/30"
      }`}
      onClick={() => { if (!note.missing) window.prism.openInObsidian(note.path); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onNoteContextMenu(e, note, groupId); }}
    >
      <span className={`flex-1 text-sm truncate ${note.missing ? "text-faint line-through" : "text-primary"}`}>
        {note.title}
        {note.missing && (
          <span className="ml-1.5 text-xs text-yellow-500 inline-flex items-center gap-0.5">
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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-elevated border border-[var(--accent)] shadow-xl opacity-90">
      <span className="text-sm text-primary">{note.title}</span>
    </div>
  );
}

// ---- Drag Overlay Group ----

function DragOverlayGroup({ group, color }: { group: GroupView; color: { bar: string; name: string } }) {
  return (
    <div className="rounded-xl bg-elevated border border-[var(--accent)] shadow-xl opacity-90 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: `${color.bar}18` }}>
        <span className="text-xs font-medium" style={{ color: color.name }}>{group.name}</span>
        <span className="text-xs text-muted">{group.notes.length}</span>
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
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroups,
  onMoveNote,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
}: Props) {
  const { t } = useT();
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [activeDrag, setActiveDrag] = useState<{ type: "group"; group: GroupView; color: typeof GROUP_COLORS[0] } | { type: "note"; note: NoteInfo } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const groupIds = useMemo(() => groups.map((g) => makeGroupId(g.id)), [groups]);
  const ungroupedIds = useMemo(() => ungroupedNotes.map((n) => makeNoteId(n.relativePath)), [ungroupedNotes]);

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    onAddGroup(newGroupName.trim());
    setNewGroupName("");
    setAddingGroup(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const gid = parseGroupId(active.id as string);
    if (gid) {
      const g = groups.find((x) => x.id === gid);
      if (g) {
        const idx = groups.findIndex((x) => x.id === gid);
        setActiveDrag({ type: "group", group: g, color: GROUP_COLORS[idx % GROUP_COLORS.length] });
        return;
      }
    }
    const relPath = parseNoteRelPath(active.id as string);
    if (relPath) {
      for (const g of groups) {
        const n = g.notes.find((x) => x.relativePath === relPath);
        if (n) { setActiveDrag({ type: "note", note: n }); return; }
      }
      const n = ungroupedNotes.find((x) => x.relativePath === relPath);
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
        const fromIdx = containerNotes.findIndex((n) => n.relativePath === activeRelPath);
        const toIdx = containerNotes.findIndex((n) => n.relativePath === overRelPath);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          onReorderNotes(toGroupId, fromIdx, toIdx);
        }
      } else {
        // Different container — move and insert at the drop position
        const toNotes = toGroupId === null
          ? ungroupedNotes
          : (groups.find((g) => g.id === toGroupId)?.notes ?? []);
        const toIdx = toNotes.findIndex((n) => n.relativePath === overRelPath);
        onMoveNote(activeRelPath, fromGroupId, toGroupId, toIdx === -1 ? undefined : toIdx);
      }
    }
  };

  const totalNotes = ungroupedNotes.length + groups.reduce((s, g) => s + g.notes.length, 0);
  if (totalNotes === 0 && groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">{t["collections.noNotes"]}</p>
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
          {groups.map((group, i) => (
            <SortableGroupCard
              key={group.id}
              group={group}
              collapsed={collapsedGroups.has(group.id)}
              color={GROUP_COLORS[i % GROUP_COLORS.length]}
              onToggle={() => onToggleGroup(group.id)}
              onRename={(name) => onRenameGroup(group.id, name)}
              onDelete={() => onDeleteGroup(group.id)}
              onRemoveNote={onRemoveNote}
              onReorderNotes={onReorderNotes}
              onNoteContextMenu={onNoteContextMenu}
            />
          ))}
        </SortableContext>

        {/* Ungrouped card */}
        <div
          className="mb-3 border border-strong/30 rounded-xl bg-surface/10 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 h-8 bg-elevated/30">
            <button onClick={onToggleUngrouped} className="text-muted hover:text-secondary transition-colors">
              {ungroupedCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              {t["collections.ungrouped"]}
            </span>
            <span className="text-xs text-faint">{ungroupedNotes.length}</span>
          </div>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: ungroupedCollapsed ? "0fr" : "1fr" }}
          >
            <div className="overflow-hidden min-h-0">
              <div className="p-2">
                {ungroupedNotes.length === 0 ? (
                  <p className="text-xs text-faint text-center py-3">
                    {t["collections.dropNotesHere"]}
                  </p>
                ) : (
                  <SortableContext items={ungroupedIds} strategy={verticalListSortingStrategy}>
                    {ungroupedNotes.map((note) => (
                      <SortableNoteRow
                        key={note.relativePath}
                        note={note}
                        groupId={null}
                        onRemoveNote={onRemoveNote}
                        onReorderNotes={onReorderNotes}
                        onNoteContextMenu={onNoteContextMenu}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Add group button */}
        {addingGroup ? (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); if (e.key === "Escape") setAddingGroup(false); }}
              placeholder={t["collections.namePlaceholder"]}
              autoFocus
              className="flex-1 bg-elevated border border-strong rounded-lg px-3 py-1.5 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)]"
            />
            <Button
              variant="primary"
              size="xs"
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
            >
              {t["resources.save"]}
            </Button>
            <Button variant="secondary" size="xs" onClick={() => setAddingGroup(false)}>
              {t["resources.cancel"]}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-strong rounded-xl text-xs text-muted hover:text-secondary hover:border-strong transition-colors"
          >
            <Plus size={14} />
            {t["collections.addGroup"]}
          </button>
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
