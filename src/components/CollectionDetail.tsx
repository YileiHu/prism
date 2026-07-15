import { useState } from "react";
import { GripVertical, X, AlertTriangle, ChevronDown, ChevronRight, MoreVertical, Plus } from "lucide-react";
import { useT } from "../i18n";

// Subtle group accent colors — bright pastels on dark bg for readability
// 4 retro/vintage colors — muted brick, mustard, dusty blue, olive
const GROUP_COLORS = [
  { bar: "#c75b4a", name: "#d4846e" },  // brick red
  { bar: "#c4a43e", name: "#d4b85a" },  // mustard yellow
  { bar: "#5b7fa5", name: "#7a9db8" },  // dusty blue
  { bar: "#6b8e5a", name: "#8aa878" },  // olive green
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
}

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
}: Props) {
  const { t } = useT();
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    onAddGroup(newGroupName.trim());
    setNewGroupName("");
    setAddingGroup(false);
  };

  // ---- Note row component ----
  const NoteRow = ({ note, groupId, index }: { note: NoteInfo; groupId: string | null; index: number }) => (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-note-move", JSON.stringify({ relPath: note.relativePath, fromGroupId: groupId }));
        e.dataTransfer.setData("text/x-note-index", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={(e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData("text/x-note-index"));
        if (!isNaN(fromIndex) && fromIndex !== index) {
          onReorderNotes(groupId, fromIndex, index);
        }
      }}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
        note.missing ? "opacity-50" : "hover:bg-gray-700/30"
      }`}
      onClick={() => { if (!note.missing) window.prism.openInObsidian(note.path); }}
    >
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => e.stopPropagation()}
      >
        <GripVertical size={13} className="text-gray-600" />
      </div>
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

  // ---- Group card component ----
  const GroupCard = ({ group, index }: { group: GroupView; index: number }) => {
    const collapsed = collapsedGroups.has(group.id);
    const c = GROUP_COLORS[index % GROUP_COLORS.length];
    return (
      <div
        className="mb-3 border border-gray-700/50 rounded-xl bg-gray-900/20 overflow-hidden"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/x-group-index", String(index));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => {
          e.preventDefault();
          // Group reorder
          const fromIdx = parseInt(e.dataTransfer.getData("text/x-group-index"));
          if (!isNaN(fromIdx) && fromIdx !== index) {
            onReorderGroups(fromIdx, index);
            return;
          }
          // Note move into group
          try {
            const data = JSON.parse(e.dataTransfer.getData("text/x-note-move"));
            if (data.fromGroupId !== group.id) {
              onMoveNote(data.relPath, data.fromGroupId, group.id);
            }
          } catch { /* not a note move */ }
        }}
      >
        {/* Group header */}
        <div className="flex items-center gap-2 px-3 h-8" style={{ backgroundColor: `${c.bar}18` }}>
          <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: c.bar }} />
          <button
            onClick={() => onToggleGroup(group.id)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          {editingGroupId === group.id ? (
            <input
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editGroupName.trim()) {
                  onRenameGroup(group.id, editGroupName.trim());
                  setEditingGroupId(null);
                }
                if (e.key === "Escape") setEditingGroupId(null);
              }}
              onBlur={() => {
                if (editGroupName.trim()) onRenameGroup(group.id, editGroupName.trim());
                setEditingGroupId(null);
              }}
              autoFocus
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--accent)]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs font-medium truncate max-w-[200px]" style={{ color: c.name }}>{group.name}</span>
          )}
          <span className="text-xs text-gray-500 ml-1">{group.notes.length}</span>
          <div className="flex-1" />

          {/* Group menu */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuGroupId(menuGroupId === group.id ? null : group.id); }}
              className="p-0 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
            >
              <MoreVertical size={13} />
            </button>
            {menuGroupId === group.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuGroupId(null)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[100px]">
                  <button
                    onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); setMenuGroupId(null); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
                  >
                    {t["collections.rename"]}
                  </button>
                  <button
                    onClick={() => { onDeleteGroup(group.id); setMenuGroupId(null); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
                  >
                    {t["collections.delete"]}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Group notes */}
        {!collapsed && (
          <div className="px-2 py-1.5">
            {group.notes.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">
                {t["collections.dropNotesHere"] ?? "拖入笔记到此处"}
              </p>
            ) : (
              group.notes.map((note, i) => (
                <NoteRow key={note.relativePath} note={note} groupId={group.id} index={i} />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- Ungrouped section ----
  const UngroupedCard = () => (
    <div
      className="mb-3 border border-gray-700/30 rounded-xl bg-gray-900/10 overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/x-note-move"));
          if (data.fromGroupId !== null) {
            onMoveNote(data.relPath, data.fromGroupId, null);
          }
        } catch { /* not a note move */ }
      }}
    >
      <div className="flex items-center gap-2 px-3 h-8 bg-gray-800/30">
        <div className="w-1 h-4 rounded-full bg-gray-700 flex-shrink-0" />
        <button
          onClick={onToggleUngrouped}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
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
            ungroupedNotes.map((note, i) => (
              <NoteRow key={note.relativePath} note={note} groupId={null} index={i} />
            ))
          )}
        </div>
      )}
    </div>
  );

  // ---- Empty state ----
  const totalNotes = ungroupedNotes.length + groups.reduce((s, g) => s + g.notes.length, 0);
  if (totalNotes === 0 && groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">{t["collections.noNotes"]}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {/* Group cards */}
      {groups.map((group, i) => (
        <GroupCard key={group.id} group={group} index={i} />
      ))}

      {/* Ungrouped card */}
      <UngroupedCard />

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
          <button
            onClick={() => setAddingGroup(false)}
            className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
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
  );
}
