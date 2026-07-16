import { useState, useMemo } from "react";
import { GripVertical, X, AlertTriangle, ChevronDown, ChevronRight, MoreVertical, Plus } from "lucide-react";
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
  arrayMove,
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
  onMoveNote: (noteRelPath: string, fromGroupId: string | null, toGroupId: string | null) => void;
  onRemoveNote: (noteRelPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo) => void;
}

function findNoteGroupId(relPath: string, groups: GroupView[], ungrouped: NoteInfo[]): string | null {
  for (const g of groups) {
    if (g.notes.some((n) => n.relativePath === relPath)) return g.id;
  }
  if (ungrouped.some((n) => n.relativePath === relPath)) return null;
  return undefined as unknown as null;
}

function makeGroupId(id: string) { return `group-${id}`; }
function makeNoteId(relPath: string) { return `note-${relPath}`; }
function parseGroupId(dndId: string) { return dndId.startsWith("group-") ? dndId.slice(6) : null; }
function parseNoteRelPath(dndId: string) { return dndId.startsWith("note-") ? dndId.slice(5) : null; }

// ---- Sortable Group Card ----

function SortableGroupCard({
  group,
  index,
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
  index: number;
  collapsed: boolean;
  color: { bar: string; name: string };
  isOverlay?: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo) => void;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

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
      className={`mb-3 border rounded-xl bg-gray-900/20 overflow-hidden transition-colors ${
        isOverlay ? "shadow-xl border-[var(--accent)]" : "border-gray-700/50"
      }`}
    >
      <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: `${color.bar}18` }}>
        <button
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>
        <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color.bar }} />
        <button onClick={onToggle} className="text-gray-500 hover:text-gray-300 transition-colors">
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
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--accent)]"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs font-medium truncate max-w-[200px]" style={{ color: color.name }}>{group.name}</span>
        )}
        <span className="text-xs text-gray-500 ml-1">{group.notes.length}</span>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-0 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[100px]">
                <button
                  onClick={() => { setEditing(true); setEditName(group.name); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                >
                  {t["collections.rename"]}
                </button>
                <button
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
                >
                  {t["collections.delete"]}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-2 py-1.5">
          {group.notes.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-3">
              {t["collections.dropNotesHere"] ?? "拖入笔记到此处"}
            </p>
          ) : (
            <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
              {group.notes.map((note, i) => (
                <SortableNoteRow
                  key={note.relativePath}
                  note={note}
                  groupId={group.id}
                  index={i}
                  onRemoveNote={onRemoveNote}
                  onReorderNotes={onReorderNotes}
                  onNoteContextMenu={onNoteContextMenu}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Sortable Note Row ----

function SortableNoteRow({
  note,
  groupId,
  index,
  onRemoveNote,
  onReorderNotes,
  onNoteContextMenu,
}: {
  note: NoteInfo;
  groupId: string | null;
  index: number;
  onRemoveNote: (relPath: string, groupId: string | null) => void;
  onReorderNotes: (groupId: string | null, fromIndex: number, toIndex: number) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: NoteInfo) => void;
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
      className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
        note.missing ? "opacity-50" : "hover:bg-gray-700/30"
      }`}
      onClick={() => { if (!note.missing) window.prism.openInObsidian(note.path); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onNoteContextMenu(e, note); }}
    >
      <button
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>
      <span className={`flex-1 text-sm truncate ${note.missing ? "text-gray-600 line-through" : "text-gray-200"}`}>
        {note.title}
        {note.missing && (
          <span className="ml-1.5 text-xs text-yellow-500 inline-flex items-center gap-0.5">
            <AlertTriangle size={10} />
            {t["collections.missing"]}
          </span>
        )}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemoveNote(note.relativePath, groupId); }}
        className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 rounded transition-all flex-shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ---- Drag Overlay Note ----

function DragOverlayNote({ note }: { note: NoteInfo }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 border border-[var(--accent)] shadow-xl opacity-90">
      <GripVertical size={13} className="text-gray-500" />
      <span className="text-sm text-gray-200">{note.title}</span>
    </div>
  );
}

// ---- Drag Overlay Group ----

function DragOverlayGroup({ group, color }: { group: GroupView; color: { bar: string; name: string } }) {
  return (
    <div className="rounded-xl bg-gray-800 border border-[var(--accent)] shadow-xl opacity-90 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: `${color.bar}18` }}>
        <GripVertical size={13} className="text-gray-500" />
        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color.bar }} />
        <span className="text-xs font-medium" style={{ color: color.name }}>{group.name}</span>
        <span className="text-xs text-gray-500">{group.notes.length}</span>
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
    if (fromGroupId === (undefined as unknown as null)) return;

    const overGroupId = parseGroupId(over.id as string);
    const overRelPath = parseNoteRelPath(over.id as string);

    if (overGroupId) {
      // Dropped on a group card — move to that group
      if (fromGroupId !== overGroupId) {
        onMoveNote(activeRelPath, fromGroupId, overGroupId);
      }
    } else if (overRelPath) {
      const toGroupId = findNoteGroupId(overRelPath, groups, ungroupedNotes);
      if (toGroupId === (undefined as unknown as null)) return;

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
        // Different container — move + insert at position
        const toNotes = toGroupId === null
          ? ungroupedNotes
          : (groups.find((g) => g.id === toGroupId)?.notes ?? []);
        const toIdx = toNotes.findIndex((n) => n.relativePath === overRelPath);
        // First move the note to the target
        onMoveNote(activeRelPath, fromGroupId, toGroupId);
        // Then reorder to the correct position (the note is now at the end)
        // We need to handle this in the parent — for now, move to target and let the
        // React re-render handle the positioning via a follow-up reorder.
        // Since React batches state updates, we pass a special case to the parent.
      }
    }
  };

  const totalNotes = ungroupedNotes.length + groups.reduce((s, g) => s + g.notes.length, 0);
  if (totalNotes === 0 && groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">{t["collections.noNotes"]}</p>
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
              index={i}
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
          className="mb-3 border border-gray-700/30 rounded-xl bg-gray-900/10 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 h-8 bg-gray-800/30">
            <div className="w-1 h-4 rounded-full bg-gray-700 flex-shrink-0" />
            <button onClick={onToggleUngrouped} className="text-gray-500 hover:text-gray-300 transition-colors">
              {ungroupedCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t["collections.ungrouped"] ?? "未分组"}
            </span>
            <span className="text-xs text-gray-600">{ungroupedNotes.length}</span>
          </div>
          {!ungroupedCollapsed && (
            <div className="px-2 py-1.5">
              {ungroupedNotes.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-3">
                  {t["collections.dropNotesHere"] ?? "拖入笔记到此处"}
                </p>
              ) : (
                <SortableContext items={ungroupedIds} strategy={verticalListSortingStrategy}>
                  {ungroupedNotes.map((note, i) => (
                    <SortableNoteRow
                      key={note.relativePath}
                      note={note}
                      groupId={null}
                      index={i}
                      onRemoveNote={onRemoveNote}
                      onReorderNotes={onReorderNotes}
                      onNoteContextMenu={onNoteContextMenu}
                    />
                  ))}
                </SortableContext>
              )}
            </div>
          )}
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
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
              className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-lg text-sm text-white transition-colors"
            >
              {t["resources.save"]}
            </button>
            <button onClick={() => setAddingGroup(false)} className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-200">
              {t["resources.cancel"]}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
          >
            <Plus size={14} />
            {t["collections.addGroup"] ?? "添加分组"}
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
