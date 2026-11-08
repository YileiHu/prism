import { useMemo, useState } from "react";
import { FolderMinus, FolderOpen, ListPlus, Maximize2, Minimize2, Frame, Pencil, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useSetToggle } from "../../lib/useToggleSet";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makeCanvasDoc, normalizePath } from "../../lib/workspace/types";
import { relativePathInsideVault } from "../useCollections";
import { buildColorMenuItem } from "../ColorPicker";
import type { MenuItem } from "../ContextMenu";
import type { CanvasFile } from "../../shared/models";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import RenameModal from "../RenameModal";
import { SkeletonRows } from "../Skeleton";
import CollectionDetail, { type NoteInfo } from "../CollectionDetail";
import CreateGroupModal from "../CreateGroupModal";
import CreateCanvasModal from "../canvas/CreateCanvasModal";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { useLibraryData } from "./LibraryDataProvider";
import { useCanvasGroups } from "./useCanvasGroups";

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

function titleFromRel(rel: string): string {
  const file = rel.split(/[/\\]/).pop() ?? rel;
  return file.replace(/\.json$/i, "");
}

export default function CanvasLibraryContent() {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const { openDoc, state, updateDoc, closeDoc } = useWorkspace();
  const { note, canvas } = useLibraryData();
  const vaultPath = note.vaultPath;

  const {
    loaded: groupsLoaded,
    groups,
    ungroupedPaths,
    createGroup,
    renameGroup,
    setGroupColor,
    deleteGroup,
    reorderGroups,
    movePath,
    removePath,
    reorderPaths,
    renamePath,
    removePaths,
    resolveFile,
  } = useCanvasGroups(vaultPath, canvas.files);

  const [creating, setCreating] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CanvasFile | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CanvasFile | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const toggleCollapsedGroup = useSetToggle(setCollapsedGroups);

  const openCanvasFile = (file: CanvasFile) => {
    openDoc(makeCanvasDoc(vaultPath, file.path, file.title));
  };

  const toNoteInfo = (rel: string): NoteInfo => {
    const found = resolveFile(rel);
    return {
      path: found?.path ?? `${vaultPath}/${rel}`,
      relPath: rel,
      title: found?.title ?? titleFromRel(rel),
      missing: !found,
    };
  };

  const groupViews = useMemo(
    () => groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      notes: group.paths.map(toNoteInfo),
    })),
    [groups, resolveFile, vaultPath],
  );

  const ungroupedNotes = useMemo(
    () => ungroupedPaths.map(toNoteInfo),
    [ungroupedPaths, resolveFile, vaultPath],
  );

  const handleRenameCanvas = async (title: string) => {
    if (!renameTarget) return;
    const target = renameTarget;
    const oldRel = relativePathInsideVault(target.path, vaultPath);
    try {
      const next = await canvas.rename(target, title);
      const newRel = relativePathInsideVault(next.path, vaultPath);
      if (oldRel && newRel) renamePath(oldRel, newRel);
      const openTab = state.tabs.find(
        (tab) => tab.kind === "canvas" && normalizePath(tab.path) === normalizePath(target.path),
      );
      if (openTab) updateDoc(openTab.id, { path: next.path, title: next.title });
    } catch {
      showToast(t["canvas.renameFailed"], "error");
    }
    setRenameTarget(null);
  };

  const handleDeleteCanvas = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const rel = relativePathInsideVault(target.path, vaultPath);
    try {
      await canvas.remove(target);
      if (rel) removePaths([rel]);
      for (const tab of state.tabs) {
        if (tab.kind === "canvas" && normalizePath(tab.path) === normalizePath(target.path)) {
          closeDoc(tab.id);
        }
      }
    } catch {
      showToast(t["canvas.deleteFailed"], "error");
    }
  };

  const getCanvasMenuItems = (info: NoteInfo, groupId: string | null): MenuItem[] => {
    const file = resolveFile(info.relPath);
    const items: MenuItem[] = [];
    if (groupId) {
      items.push({
        label: t["canvas.removeFromGroup"],
        icon: <FolderMinus size={14} />,
        onClick: () => removePath(info.relPath, groupId),
      });
    }
    if (!file) return items;
    items.push(
      {
        label: t["canvas.rename"],
        icon: <Pencil size={14} />,
        onClick: () => setRenameTarget(file),
      },
      {
        label: t["canvas.showInFolder"],
        icon: <FolderOpen size={14} />,
        onClick: () => { void window.prism.showItemInFolder(file.path); },
      },
      {
        label: t["canvas.delete"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setDeleteTarget(file),
      },
    );
    return items;
  };

  const getGroupMenuItems = (groupId: string): MenuItem[] => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return [];
    return [
      {
        label: t["collections.rename"],
        icon: <Pencil size={14} />,
        onClick: () => setRenameGroupTarget({ id: group.id, name: group.name }),
      },
      buildColorMenuItem(t, {
        label: t["collections.groupColor"],
        autoLabel: t["collections.colorAuto"],
        autoSource: group.name,
        current: group.color,
        onSelect: (color) => setGroupColor(group.id, color),
      }),
      {
        label: t["collections.deleteGroup"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setConfirm({
          message: t["collections.deleteGroupConfirm"].replace("{name}", group.name),
          confirmLabel: t["collections.deleteGroup"],
          onConfirm: () => {
            deleteGroup(group.id);
            showToast(t["collections.groupDeleted"].replace("{name}", group.name));
          },
        }),
      },
    ];
  };

  const allExpanded = collapsedGroups.size === 0 && !ungroupedCollapsed;
  const handleToggleAll = () => {
    if (allExpanded) {
      setCollapsedGroups(new Set(groups.map((group) => group.id)));
      setUngroupedCollapsed(true);
    } else {
      setCollapsedGroups(new Set());
      setUngroupedCollapsed(false);
    }
  };

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <>
        <Frame size={14} className="text-muted flex-shrink-0" />
        <span className="text-body font-medium text-primary truncate">{t["canvas.section"]}</span>
        <span className="text-caption text-faint tabular-nums">{canvas.files.length}</span>
      </>
    ),
    actions: (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowGroupModal(true)}
          title={t["collections.addGroup"]}
        >
          <ListPlus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleAll}
          title={allExpanded ? t["collections.collapseAll"] : t["collections.expandAll"]}
        >
          {allExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCreating(true)}
          title={t["canvas.new"]}
        >
          <Plus size={16} />
        </Button>
      </>
    ),
  }), [
    allExpanded, canvas.files.length, groups, t,
    // handleToggleAll closes over the same state; recomputing on group list is enough
  ]);

  useToolbarContribution("module:library", toolbar);

  const loading = !canvas.loaded || !groupsLoaded;

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 overflow-hidden">
          <SkeletonRows count={6} />
        </div>
      ) : canvas.files.length === 0 && groups.length === 0 ? (
        <div className="flex-1">
          <EmptyState
            size="module"
            text={t["canvas.emptyLibrary"]}
            cta={{ label: t["canvas.new"], onClick: () => setCreating(true), icon: <Plus size={14} /> }}
          />
        </div>
      ) : (
        <CollectionDetail
          groups={groupViews}
          ungroupedNotes={ungroupedNotes}
          collapsedGroups={collapsedGroups}
          ungroupedCollapsed={ungroupedCollapsed}
          onToggleGroup={toggleCollapsedGroup}
          onToggleUngrouped={() => setUngroupedCollapsed(!ungroupedCollapsed)}
          onGroupContextMenu={(event, groupId) => onContextMenu(event, getGroupMenuItems(groupId))}
          onReorderGroups={reorderGroups}
          onMoveNote={(relPath, fromGroupId, toGroupId, toIndex) =>
            movePath(relPath, fromGroupId, toGroupId, toIndex)}
          onRemoveNote={(relPath, groupId) => removePath(relPath, groupId)}
          onReorderNotes={(groupId, from, to) => reorderPaths(groupId, from, to)}
          onNoteContextMenu={(event, info, groupId) => {
            const items = getCanvasMenuItems(info, groupId);
            if (items.length > 0) onContextMenu(event, items);
          }}
          onOpenNote={(info) => {
            const file = resolveFile(info.relPath);
            if (file) openCanvasFile(file);
          }}
          emptyGroupText={t["canvas.dropHere"]}
        />
      )}

      {creating && (
        <CreateCanvasModal
          vaultPath={vaultPath}
          onCreated={(path, title) => openDoc(makeCanvasDoc(vaultPath, path, title))}
          onClose={() => setCreating(false)}
        />
      )}

      {showGroupModal && (
        <CreateGroupModal
          title={t["collections.addGroup"]}
          onSave={(name, color) => {
            createGroup(name, color);
            setShowGroupModal(false);
            showToast(t["collections.groupAdded"].replace("{name}", name));
          }}
          onClose={() => setShowGroupModal(false)}
        />
      )}

      <RenameModal
        open={renameGroupTarget !== null}
        initialValue={renameGroupTarget?.name ?? ""}
        title={t["collections.rename"]}
        icon={Pencil}
        onClose={() => setRenameGroupTarget(null)}
        onSubmit={(name) => {
          if (renameGroupTarget) renameGroup(renameGroupTarget.id, name);
        }}
      />

      <RenameModal
        open={renameTarget !== null}
        initialValue={renameTarget?.title ?? ""}
        title={t["canvas.rename"]}
        icon={Pencil}
        placeholder={t["canvas.newPlaceholder"]}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleRenameCanvas}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        message={t["canvas.deleteConfirm"].replace("{name}", deleteTarget?.title ?? "")}
        confirmLabel={t["canvas.delete"]}
        onConfirm={handleDeleteCanvas}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={async () => { await confirm?.onConfirm(); }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
