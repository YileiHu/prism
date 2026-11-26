import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  FileText,
  FolderOpen,
  FolderX,
  ListPlus,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useSetToggle } from "../../lib/useToggleSet";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { hashColor, resolveTagColor } from "../../lib/colors";
import { noteBaseMenuItems } from "../../lib/noteMenu";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makeNoteDoc, noteDocId, noteKey } from "../../lib/workspace/types";
import { buildColorMenuItem } from "../ColorPicker";
import { SHORTCUT_EVENT, type ShortcutEventDetail } from "../../shared/shortcuts";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import LibraryTitle from "./LibraryTitle";
import SearchLimitHint from "./SearchLimitHint";
import Badge from "../Badge";
import GlowBadge from "../GlowBadge";
import Button from "../Button";
import SegmentedToggle from "../SegmentedToggle";
import Spinner from "../Spinner";
import SearchInput from "../SearchInput";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ItemRow from "../ItemRow";
import BatchActionBar, { type BatchAction } from "../BatchActionBar";
import SelectModeButton from "../SelectModeButton";
import { useMultiSelect } from "../../lib/useMultiSelect";
import { selectionEdgeAt } from "../../lib/selectionEdge";
import ContentSearchView from "../ContentSearchView";
import CollectionDetail from "../CollectionDetail";
import CreateCollectionModal from "../CreateCollectionModal";
import CreateGroupModal from "../CreateGroupModal";
import CreateNoteModal from "../CreateNoteModal";
import RenameModal from "../RenameModal";
import ConfirmDialog from "../ConfirmDialog";
import { useDraggable } from "@dnd-kit/core";
import { type MenuItem } from "../ContextMenu";
import { toRelativePath } from "../useCollections";
import type { CollectionData } from "../collectionTypes";
import type { NoteLibrary } from "./useNoteLibrary";
import type { NoteBrief } from "../../shared/models";

interface Props {
  lib: NoteLibrary;
  vaultName: string;
}

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

function DraggableNoteRow({
  notePath,
  noteTitle,
  dragPaths,
  children,
}: {
  notePath: string;
  noteTitle: string;
  dragPaths: string[];
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vnote:${notePath}`,
    data: { kind: "note", paths: dragPaths, title: noteTitle },
  });
  const clickGuard = useDragClickGuard(isDragging);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...clickGuard}
      className={isDragging ? "opacity-40" : undefined}
    >
      {children}
    </div>
  );
}

export default function NoteLibraryContent({ lib, vaultName }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const { openDoc, updateDoc, removeDocs } = useWorkspace();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionData | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameNoteTarget, setRenameNoteTarget] = useState<NoteBrief | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchFocusPendingRef = useRef(false);
  const notesScrollRef = useRef<HTMLDivElement>(null);
  const collectionScrollRef = useRef<HTMLDivElement>(null);
  const [searchFocusSeq, setSearchFocusSeq] = useState(0);
  const toggleCollapsedGroup = useSetToggle(setCollapsedGroups);

  const {
    vaultPath,
    notes,
    privateVault,
    settings,
    scanning,
    switching,
    notesLoading,
    initialLoading,
    vaultError,
    debouncedQuery,
    searchQuery,
    setSearchQuery,
    searchScope,
    changeSearchScope,
    selectCollection,
    reload,
    collectionColorByName,
    collections,
    selectedCollectionId,
    selectedCollection,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    restoreCollections,
    handleSetCollectionColor,
    handleReorderCollections,
    handleMoveNotesToCollection,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
    handleBatchRemoveFromAnyCollection,
    handleReorderNotesInGroup,
    handleAddGroup,
    handleSetGroupColor,
    handleRenameGroup,
    handleDeleteGroup,
    handleReorderGroups,
    updateNotePaths,
    removeNotePaths,
    handleBatchDelete,
    groupedViews,
    ungroupedNotes,
    totalCollectionNotes,
    noteCollections,
    sortedNotes,
  } = lib;

  // Two independent selections: the flat list and the open collection never
  // share a scroll container, and each scope key exits the mode when the user
  // switches away from it.
  const flatKeys = useMemo(() => sortedNotes.map((note) => note.path), [sortedNotes]);
  const flatSelection = useMultiSelect({
    scopeKey: `${vaultPath}|notes|${selectedCollectionId ?? ""}|${searchScope}|${debouncedQuery}`,
    keys: flatKeys,
    containerRef: notesScrollRef,
  });
  // A run of selected rows is drawn as one block: only its first/last row keeps
  // the outer radius.
  const flatEdges = useMemo(
    () => flatKeys.map((_, index) => selectionEdgeAt(flatKeys, index, flatSelection.selected)),
    [flatKeys, flatSelection.selected],
  );

  const collectionKeys = useMemo(
    () => [
      ...groupedViews.flatMap((group) => group.notes.map((note) => note.relPath)),
      ...ungroupedNotes.map((note) => note.relPath),
    ],
    [groupedViews, ungroupedNotes],
  );

  const collectionSelection = useMultiSelect({
    scopeKey: `${vaultPath}|collection|${selectedCollectionId ?? ""}`,
    keys: collectionKeys,
    containerRef: collectionScrollRef,
  });

  // relPath -> owning group, needed by "remove from collection" and by the
  // trash action (which must not resurrect a missing file).
  const collectionNotesByRelPath = useMemo(() => {
    const map = new Map<string, { path: string; missing: boolean; groupId: string | null }>();
    for (const group of groupedViews) {
      for (const note of group.notes) map.set(note.relPath, { path: note.path, missing: note.missing, groupId: group.id });
    }
    for (const note of ungroupedNotes) map.set(note.relPath, { path: note.path, missing: note.missing, groupId: null });
    return map;
  }, [groupedViews, ungroupedNotes]);

  const openNote = useCallback((note: { path: string; title: string }) => {
    openDoc(makeNoteDoc(vaultPath, note.path, note.title));
  }, [openDoc, vaultPath]);

  const leaveEditorSelection = useCallback(() => {
    flatSelection.exit();
    collectionSelection.exit();
    setCollapsedGroups(new Set());
    setUngroupedCollapsed(false);
  }, [flatSelection.exit, collectionSelection.exit]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ShortcutEventDetail>).detail;
      if (detail?.action !== "focusSearch" || detail.vaultPath !== vaultPath) return;
      leaveEditorSelection();
      selectCollection(null);
      searchFocusPendingRef.current = true;
      setSearchFocusSeq((seq) => seq + 1);
    };
    window.addEventListener(SHORTCUT_EVENT, handler);
    return () => window.removeEventListener(SHORTCUT_EVENT, handler);
  }, [vaultPath, leaveEditorSelection, selectCollection]);

  useEffect(() => {
    if (!searchFocusPendingRef.current) return;
    const input = searchInputRef.current;
    if (!input) return;
    searchFocusPendingRef.current = false;
    input.focus();
    input.select();
  }, [searchFocusSeq, selectedCollectionId]);

  const handleCreateNote = (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => {
    setShowNewNoteModal(false);
    showToast(t["vault.newNoteCreated"].replace("{name}", note.title));
    const relPath = toRelativePath(note.path, vaultPath);
    if (collectionId) {
      if (groupId) handleMoveNoteDirect(collectionId, relPath, groupId);
      else handleDropNoteDirect(collectionId, [relPath], true);
    }
    openNote(note);
    void lib.loadNotes();
  };

  const handleRenameNote = async (newTitle: string) => {
    if (!renameNoteTarget) return;
    const oldPath = renameNoteTarget.path;
    const oldRelPath = toRelativePath(oldPath, vaultPath);
    try {
      const result = await window.prism.renameNote(vaultPath, oldPath, newTitle);
      updateNotePaths(oldRelPath, toRelativePath(result.path, vaultPath));
      updateDoc(noteDocId(oldPath), { path: result.path, title: newTitle });
      window.dispatchEvent(new Event("gtd-project-links-changed"));
      showToast(t["vault.renamed"].replace("{name}", newTitle));
      void lib.loadNotes();
    } catch {
      showToast(t["vault.renameFailed"], "error");
    }
    setRenameNoteTarget(null);
  };

  const getContextMenuItems = (
    note: { path: string; title: string },
    collectionContext?: { collectionId: string; groupId: string | null; relPath: string; onRemove: () => void },
  ): MenuItem[] => {
    const relPath = collectionContext?.relPath ?? toRelativePath(note.path, vaultPath);
    const relKey = noteKey(relPath);
    const owners = collections.filter((collection) => (
      collection.notePaths.some((path) => noteKey(path) === relKey)
      || (collection.groups ?? []).some((group) => group.notePaths.some((path) => noteKey(path) === relKey))
    ));
    // Single assignment: the menu is a move picker, not an "add" list. The
    // current collection is excluded when the menu is opened from inside it.
    const moveTargets = collections.filter((collection) => collection.id !== collectionContext?.collectionId);
    const moveToCollectionSubmenu: MenuItem[] = moveTargets.length > 0
      ? moveTargets.map((collection) => ({
          label: collection.name,
          checked: owners.some((owner) => owner.id === collection.id),
          onClick: () => handleMoveNotesToCollection(collection.id, [relPath]),
        }))
      : [{ label: t["collections.none"], onClick: () => {} }];

    const items: MenuItem[] = noteBaseMenuItems(note, {
      showInExplorer: t["menu.showInExplorer"],
    });

    items.push({
      label: t["collections.moveTo"],
      icon: <ArrowRightLeft size={14} />,
      children: moveToCollectionSubmenu,
    });

    if (collectionContext) {
      items.push({
        label: t["menu.removeFromCollection"],
        icon: <Trash2 size={14} />,
        onClick: collectionContext.onRemove,
      });
    }

    items.push(
      {
        label: t["menu.rename"],
        icon: <Pencil size={14} />,
        onClick: () => setRenameNoteTarget(note as NoteBrief),
      },
      {
        label: t["menu.moveToTrash"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setConfirm({
          message: t["vault.trashConfirm"].replace("{name}", note.title),
          confirmLabel: t["menu.moveToTrash"],
          onConfirm: async () => {
            const result = await window.prism.trashFile(note.path);
            if (result.success) {
              await window.prism.deleteNotes([note.path]);
              removeNotePaths([relPath]);
              removeDocs([noteDocId(note.path)]);
              showToast(t["vault.trashed"]);
              void lib.loadNotes();
            } else {
              showToast(t["vault.deleteFailed"].replace("{error}", result.error ?? ""), "error");
            }
          },
        }),
      },
    );

    return items;
  };

  const getGroupContextMenuItems = (groupId: string): MenuItem[] => {
    const group = selectedCollection?.groups?.find((candidate) => candidate.id === groupId);
    if (!group || !selectedCollectionId) return [];
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
        onSelect: (color) => handleSetGroupColor(selectedCollectionId, group.id, color),
      }),
      {
        label: t["collections.deleteGroup"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setConfirm({
          message: t["collections.deleteGroupConfirm"].replace("{name}", group.name),
          confirmLabel: t["collections.deleteGroup"],
          onConfirm: () => {
            handleDeleteGroup(selectedCollectionId, group.id);
            showToast(t["collections.groupDeleted"].replace("{name}", group.name));
          },
        }),
      },
    ];
  };

  const rowVirtualizer = useVirtualizer({
    count: sortedNotes.length,
    getScrollElement: () => notesScrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });

  const allExpanded = collapsedGroups.size === 0 && !ungroupedCollapsed;
  const handleToggleAll = () => {
    if (allExpanded) {
      setCollapsedGroups(new Set((selectedCollection?.groups ?? []).map((group) => group.id)));
      setUngroupedCollapsed(true);
    } else {
      setCollapsedGroups(new Set());
      setUngroupedCollapsed(false);
    }
  };

  const contentResultsVisible =
    searchScope === "content" && searchQuery.trim() !== "" && !selectedCollectionId;

  const title = selectedCollection ? selectedCollection.name : vaultName;
  const titleColor = selectedCollection
    ? resolveTagColor(selectedCollection.name, selectedCollection.color)
    : null;
  const count = selectedCollection ? totalCollectionNotes : sortedNotes.length;

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: <LibraryTitle title={title} color={titleColor} count={count} />,
    // Searching inside a collection has no defined semantics (search replaces
    // the note list the collection resolves against), and private vaults are
    // not indexed — hide the controls in both cases.
    controls: selectedCollection || privateVault ? undefined : (
      <>
        <SearchInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            if (searchQuery) setSearchQuery("");
            else if (searchScope === "content") changeSearchScope("title");
            else searchInputRef.current?.blur();
          }}
          placeholder={searchScope === "title" ? t["vault.search"] : t["vault.contentSearchPlaceholder"]}
          wrapperClassName="w-80"
        />
        <SegmentedToggle
          value={searchScope}
          onChange={changeSearchScope}
          options={[
            { value: "title", label: t["vault.scopeTitle"] },
            { value: "content", label: t["vault.scopeContent"] },
          ]}
        />
      </>
    ),
    actions: (
      <>
        {selectedCollection && (
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
          </>
        )}
        {selectedCollection ? (
          <SelectModeButton
            active={collectionSelection.active}
            onToggle={collectionSelection.active ? collectionSelection.exit : collectionSelection.enter}
          />
        ) : contentResultsVisible ? null : (
          <SelectModeButton
            active={flatSelection.active}
            onToggle={flatSelection.active ? flatSelection.exit : flatSelection.enter}
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowCreateModal(true)}
          title={t["collections.new"]}
        >
          <FolderOpen size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowNewNoteModal(true)}
          title={t["vault.newNote"]}
        >
          <Plus size={16} />
        </Button>
      </>
    ),
  }), [
    allExpanded, changeSearchScope, collectionSelection.active, collectionSelection.enter,
    collectionSelection.exit, contentResultsVisible, count, flatSelection.active, flatSelection.enter,
    flatSelection.exit, handleToggleAll, privateVault, searchQuery, searchScope, selectedCollection, t,
    title, titleColor,
  ]);

  useToolbarContribution("module:library", toolbar);

  if (initialLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 anim-fade-in">
        <Spinner size={22} className="text-muted" />
        <p className="text-body text-muted">{t["vault.scanning"]}</p>
      </div>
    );
  }

  if (vaultError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-8 text-center anim-fade-in">
        <FolderX size={36} className="text-faint mb-1" />
        <p className="text-body font-medium text-secondary">{t["vault.vaultNotFound"]}</p>
        <p className="text-caption text-muted leading-relaxed break-all max-w-md">
          {t["vault.vaultNotFoundDesc"].replace("{path}", vaultPath)}
        </p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={reload}>
          {t["vault.retry"]}
        </Button>
      </div>
    );
  }

  const flatBatchActions: BatchAction[] = [];
  if (flatSelection.count > 0) {
    if (collections.length > 0) {
      flatBatchActions.push({
        key: "moveToCollection",
        label: t["collections.moveTo"],
        variant: "primary",
        menu: collections.map((collection) => ({
          key: collection.id,
          label: collection.name,
          onClick: () => {
            handleMoveNotesToCollection(
              collection.id,
              Array.from(flatSelection.selected).map((path) => toRelativePath(path, vaultPath)),
            );
            flatSelection.clear();
          },
        })),
      });
    }
    flatBatchActions.push({
      key: "removeFromCollection",
      label: t["collections.removeFrom"],
      onClick: () => {
        handleBatchRemoveFromAnyCollection(
          Array.from(flatSelection.selected).map((path) => toRelativePath(path, vaultPath)),
        );
        flatSelection.clear();
      },
    });
    flatBatchActions.push({
      key: "delete",
      label: t["batch.delete"],
      variant: "ghost-danger",
      onClick: () => {
        const paths = Array.from(flatSelection.selected);
        const { onConfirm } = handleBatchDelete(paths);
        setConfirm({
          message: t["vault.batchDeleteConfirm"].replace("{count}", String(paths.length)),
          confirmLabel: t["batch.delete"],
          onConfirm: async () => {
            const { succeeded } = await onConfirm();
            removeDocs(succeeded.map(noteDocId));
            flatSelection.exit();
          },
        });
      },
    });
  }

  const collectionBatchActions: BatchAction[] = [];
  if (collectionSelection.count > 0 && selectedCollectionId) {
    const moveTargets = collections.filter((collection) => collection.id !== selectedCollectionId);
    if (moveTargets.length > 0) {
      collectionBatchActions.push({
        key: "moveToCollection",
        label: t["collections.moveTo"],
        variant: "primary",
        menu: moveTargets.map((collection) => ({
          key: collection.id,
          label: collection.name,
          onClick: () => {
            handleMoveNotesToCollection(collection.id, Array.from(collectionSelection.selected));
            collectionSelection.clear();
          },
        })),
      });
    }
    collectionBatchActions.push({
      key: "removeFromCollection",
      label: t["collections.removeFrom"],
      onClick: () => {
        handleBatchRemoveFromAnyCollection(Array.from(collectionSelection.selected));
        collectionSelection.clear();
      },
    });
    collectionBatchActions.push({
      key: "delete",
      label: t["batch.delete"],
      variant: "ghost-danger",
      onClick: () => {
        const selected = Array.from(collectionSelection.selected);
        const paths: string[] = [];
        for (const relPath of selected) {
          const info = collectionNotesByRelPath.get(relPath);
          if (info && !info.missing) paths.push(info.path);
        }
        const skipped = selected.length - paths.length;
        if (paths.length === 0) {
          showToast(t["batch.deleteFailed"].replace("{count}", String(skipped)), "error");
          return;
        }
        const { onConfirm } = handleBatchDelete(paths);
        setConfirm({
          message: t["vault.batchDeleteConfirm"].replace("{count}", String(paths.length)),
          confirmLabel: t["batch.delete"],
          onConfirm: async () => {
            const { succeeded } = await onConfirm();
            removeDocs(succeeded.map(noteDocId));
            collectionSelection.exit();
            if (skipped > 0) showToast(t["batch.deleteFailed"].replace("{count}", String(skipped)), "error");
          },
        });
      },
    });
  }

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden relative" aria-busy={switching}>
      {switching && (
        <div className="absolute inset-0 z-20 flex items-start justify-center pt-10 bg-base/30">
          <div className="flex items-center gap-2 rounded-full bg-surface border border-line px-3 py-1.5 text-caption text-secondary">
            <Spinner size={12} />
            {t["vault.switching"]}
          </div>
        </div>
      )}
      {selectedCollection && selectedCollectionId && (
        <CollectionDetail
          groups={groupedViews}
          ungroupedNotes={ungroupedNotes}
          collapsedGroups={collapsedGroups}
          ungroupedCollapsed={ungroupedCollapsed}
          onToggleGroup={toggleCollapsedGroup}
          onToggleUngrouped={() => setUngroupedCollapsed(!ungroupedCollapsed)}
          onGroupContextMenu={(event, groupId) => onContextMenu(event, getGroupContextMenuItems(groupId))}
          onReorderGroups={(from, to) => handleReorderGroups(selectedCollectionId, from, to)}
          onMoveNote={(relPath, fromGroup, toGroup, toIndex) =>
            handleMoveNote(selectedCollectionId, relPath, fromGroup, toGroup, toIndex)}
          onRemoveNote={(relPath, groupId) => handleRemoveNote(selectedCollectionId, relPath, groupId)}
          onReorderNotes={(groupId, from, to) =>
            handleReorderNotesInGroup(selectedCollectionId, groupId, from, to)}
          onNoteContextMenu={(event, note, groupId) => onContextMenu(event, getContextMenuItems(
            note as unknown as { path: string; title: string },
            {
              collectionId: selectedCollectionId,
              groupId,
              relPath: note.relPath,
              onRemove: () => handleRemoveNote(selectedCollectionId, note.relPath, groupId),
            },
          ))}
          onOpenNote={openNote}
          scrollRef={collectionScrollRef}
          selecting={collectionSelection.active}
          selectedKeys={collectionSelection.selected}
          onToggleItem={(relPath, event) => collectionSelection.toggle(relPath, { shiftKey: event.shiftKey })}
        />
      )}

      {contentResultsVisible && (
        <ContentSearchView
          vaultPath={vaultPath}
          collections={collections}
          query={searchQuery}
          onOpenNote={openNote}
        />
      )}

      <div
        style={selectedCollectionId || contentResultsVisible ? { position: "absolute", visibility: "hidden" } : undefined}
        className={`flex-1 overflow-y-auto p-2 inset-0 focus:outline-none ${
          !selectedCollectionId && !contentResultsVisible ? "anim-fade-in" : ""
        }`}
        ref={notesScrollRef}
        tabIndex={-1}
      >
        {searchScope === "title" && debouncedQuery.trim() && notes.length >= settings.search_result_limit && (
          <SearchLimitHint
            limit={settings.search_result_limit}
            messageKey="vault.resultLimitHint"
          />
        )}
        {(scanning || notesLoading) && sortedNotes.length === 0 && <SkeletonRows count={8} />}
        {!scanning && !notesLoading && sortedNotes.length === 0 && (
          <EmptyState
            size="module"
            text={searchQuery ? t["vault.emptySearch"] : t["vault.emptyVault"]}
            cta={
              searchQuery
                ? { label: t["vault.contentSearch"], onClick: () => changeSearchScope("content"), icon: <Search size={14} /> }
                : { label: t["vault.newNote"], onClick: () => setShowNewNoteModal(true), icon: <Plus size={14} /> }
            }
          />
        )}
        {sortedNotes.length > 0 && (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const note = sortedNotes[virtualRow.index];
              const relPath = toRelativePath(note.path, vaultPath);
              const isSelected = flatSelection.isSelected(note.path);
              return (
                <div
                  key={note.path}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <DraggableNoteRow
                    notePath={note.path}
                    noteTitle={note.title}
                    dragPaths={flatSelection.selected.size > 0 && flatSelection.isSelected(note.path)
                      ? Array.from(flatSelection.selected) : [relPath]}
                  >
                    <ItemRow
                      // Fixed integer height: the virtualizer positions rows
                      // with fractional translateY when a row measures 30.2px
                      // (select mode hides `meta`), which leaves a subpixel seam
                      // between adjacent selected backgrounds. 32px matches
                      // `estimateSize` and the meta-visible height.
                      className="h-8"
                      menuItems={getContextMenuItems(note)}
                      onPrimaryClick={(event) => {
                        if (flatSelection.active) flatSelection.toggle(note.path, { shiftKey: event.shiftKey });
                        else openNote(note);
                      }}
                      selected={isSelected}
                      selectable={flatSelection.active}
                      checked={isSelected}
                      selectionEdge={flatEdges[virtualRow.index] ?? undefined}
                      tooltip={note.path}
                      title={
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate">{note.title}</span>
                        </span>
                      }
                      meta={!flatSelection.active ? (
                        <>
                          {(() => {
                            const noteColls = noteCollections.get(noteKey(relPath)) ?? [];
                            if (noteColls.length === 0) return <GlowBadge tone="warning" intensity={0.2}>{t["vault.uncategorized"]}</GlowBadge>;
                            return (
                              <span className="flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                                {noteColls.slice(0, 3).map((name) => (
                                  <Badge key={name} palette={collectionColorByName.get(name)}>{name}</Badge>
                                ))}
                                {noteColls.length > 3 && (
                                  <span className="text-meta text-faint">+{noteColls.length - 3}</span>
                                )}
                              </span>
                            );
                          })()}
                          {note.tags && (
                            <span className="hidden xl:flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                              {note.tags.split(" ").filter(Boolean).slice(0, 2).map((tag) => (
                                <Badge key={tag} palette={hashColor(tag)}>{tag}</Badge>
                              ))}
                            </span>
                          )}
                        </>
                      ) : undefined}
                    />
                  </DraggableNoteRow>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {collectionSelection.active && (
        <BatchActionBar
          selectedCount={collectionSelection.count}
          actions={collectionBatchActions}
          onSelectAll={collectionSelection.selectAll}
          onExit={collectionSelection.exit}
        />
      )}

      {flatSelection.active && !contentResultsVisible && (
        <BatchActionBar
          selectedCount={flatSelection.count}
          actions={flatBatchActions}
          onSelectAll={flatSelection.selectAll}
          onExit={flatSelection.exit}
        />
      )}

      {showCreateModal && (
        <CreateCollectionModal
          title={t["collections.new"]}
          onSave={(name) => {
            handleCreateCollection(name);
            setShowCreateModal(false);
            showToast(t["collections.created"].replace("{name}", name));
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {renameTarget && (
        <CreateCollectionModal
          title={t["collections.rename"]}
          initialName={renameTarget.name}
          onSave={(name) => {
            handleRenameCollection(renameTarget, name);
            setRenameTarget(null);
            showToast(t["collections.renamed"]);
          }}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {showGroupModal && (
        <CreateGroupModal
          title={t["collections.addGroup"]}
          onSave={(name, color) => {
            if (selectedCollectionId) handleAddGroup(selectedCollectionId, name, color);
            setShowGroupModal(false);
            showToast(t["collections.groupAdded"].replace("{name}", name));
          }}
          onClose={() => setShowGroupModal(false)}
        />
      )}
      {showNewNoteModal && (
        <CreateNoteModal
          vaultPath={vaultPath}
          collections={collections}
          defaultCollectionId={selectedCollectionId ?? undefined}
          onCreated={handleCreateNote}
          onClose={() => setShowNewNoteModal(false)}
        />
      )}
      <RenameModal
        open={renameGroupTarget !== null}
        initialValue={renameGroupTarget?.name ?? ""}
        title={t["collections.rename"]}
        icon={Pencil}
        onClose={() => setRenameGroupTarget(null)}
        onSubmit={(name) => {
          if (selectedCollectionId && renameGroupTarget) {
            handleRenameGroup(selectedCollectionId, renameGroupTarget.id, name);
          }
        }}
      />
      <RenameModal
        open={renameNoteTarget !== null}
        initialValue={renameNoteTarget?.title ?? ""}
        placeholder={t["vault.renameTitle"]}
        icon={Pencil}
        onClose={() => setRenameNoteTarget(null)}
        onSubmit={handleRenameNote}
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
