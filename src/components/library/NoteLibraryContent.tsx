import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  CheckSquare,
  FileText,
  FolderOpen,
  FolderX,
  ListPlus,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useSetToggle } from "../../lib/useToggleSet";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makeNoteDoc, noteDocId } from "../../lib/workspace/types";
import { buildColorMenuItem } from "../ColorPicker";
import { SHORTCUT_EVENT, type ShortcutEventDetail } from "../../shared/shortcuts";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import Badge from "../Badge";
import Button from "../Button";
import SegmentedToggle from "../SegmentedToggle";
import Spinner from "../Spinner";
import SearchInput from "../SearchInput";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ItemRow from "../ItemRow";
import BatchActionBar from "../BatchActionBar";
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchFocusPendingRef = useRef(false);
  const [searchFocusSeq, setSearchFocusSeq] = useState(0);
  const toggleCollapsedGroup = useSetToggle(setCollapsedGroups);

  const {
    vaultPath,
    notes,
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
    favorites,
    toggleFavorite,
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
    handleDropNote,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
    handleMoveToCollection,
    handleReorderNotesInGroup,
    handleAddGroup,
    handleSetGroupColor,
    handleRenameGroup,
    handleDeleteGroup,
    handleReorderGroups,
    updateNotePaths,
    removeNotePaths,
    handleBatchAddToCollection,
    handleBatchDelete,
    groupedViews,
    ungroupedNotes,
    totalCollectionNotes,
    noteCollections,
    sortedNotes,
  } = lib;

  const openNote = useCallback((note: { path: string; title: string }) => {
    openDoc(makeNoteDoc(vaultPath, note.path, note.title));
  }, [openDoc, vaultPath]);

  const leaveEditorSelection = useCallback(() => {
    setSelectMode(false);
    setSelectedPaths(new Set());
    setCollapsedGroups(new Set());
    setUngroupedCollapsed(false);
  }, []);

  useEffect(() => {
    if (!selectMode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setSelectMode(false);
      setSelectedPaths(new Set());
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectMode]);

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

  const toggleSelectMode = () => {
    setSelectMode((value) => !value);
    setSelectedPaths(new Set());
  };

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

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
    const addToCollectionSubmenu: MenuItem[] = collections.length > 0
      ? collections.map((collection) => ({
          label: collection.name,
          checked: collection.notePaths.includes(relPath)
            || (collection.groups ?? []).some((group) => group.notePaths.includes(relPath)),
          onClick: () => handleDropNoteDirect(collection.id, [relPath]),
        }))
      : [{ label: t["collections.none"], onClick: () => {} }];

    const items: MenuItem[] = [
      {
        label: favorites.has(note.path) ? t["menu.unfavorite"] : t["menu.favorite"],
        icon: <Star size={14} />,
        onClick: () => { void toggleFavorite(note); },
      },
      {
        label: t["menu.showInExplorer"],
        icon: <FolderOpen size={14} />,
        onClick: () => window.prism.showItemInFolder(note.path),
      },
    ];

    if (collectionContext) {
      const otherCollections = collections.filter((collection) => collection.id !== collectionContext.collectionId);
      items.push(
        {
          label: t["menu.addToCollection"],
          icon: <FileText size={14} />,
          children: addToCollectionSubmenu,
        },
        {
          label: t["menu.removeFromCollection"],
          icon: <Trash2 size={14} />,
          onClick: collectionContext.onRemove,
        },
        {
          label: t["menu.moveTo"],
          icon: <ArrowRightLeft size={14} />,
          children: otherCollections.length > 0
            ? otherCollections.map((collection) => ({
                label: collection.name,
                onClick: () => handleMoveToCollection(
                  collectionContext.collectionId,
                  collection.id,
                  collectionContext.relPath,
                  collectionContext.groupId,
                ),
              }))
            : [{ label: t["collections.none"], onClick: () => {} }],
        },
      );
    } else {
      items.push({
        label: t["menu.addToCollection"],
        icon: <FileText size={14} />,
        children: addToCollectionSubmenu,
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

  const notesScrollRef = useRef<HTMLDivElement>(null);
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
    title: (
      <>
        {titleColor && (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: titleColor.bar }} />
        )}
        <span className="text-body font-medium text-primary truncate">{title}</span>
        <span className="text-caption text-faint tabular-nums">{count}</span>
      </>
    ),
    // Searching inside a collection has no defined semantics (search replaces
    // the note list the collection resolves against), so hide the controls.
    controls: selectedCollection ? undefined : (
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
        {searchScope === "title" && (
          <Button
            variant="ghost"
            size="icon-sm"
            active={selectMode}
            onClick={toggleSelectMode}
            title={selectMode ? t["batch.cancelSelect"] : t["batch.selectMode"]}
          >
            <CheckSquare size={15} />
          </Button>
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
    allExpanded, changeSearchScope, count, handleToggleAll, searchQuery,
    searchScope, selectMode, selectedCollection, t, title, titleColor,
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
        className={`flex-1 overflow-y-auto py-1 inset-0 ${
          !selectedCollectionId && !contentResultsVisible ? "anim-fade-in" : ""
        }`}
        ref={notesScrollRef}
      >
        {searchScope === "title" && debouncedQuery.trim() && notes.length >= settings.search_result_limit && (
          <div className="px-4 py-1.5 text-caption text-faint">
            {t["vault.resultLimitHint"].replace("{count}", String(settings.search_result_limit))}
          </div>
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
              const isSelected = selectedPaths.has(note.path);
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
                    dragPaths={selectedPaths.size > 0 && selectedPaths.has(note.path)
                      ? Array.from(selectedPaths) : [relPath]}
                  >
                    <ItemRow
                      variant="list"
                      menuItems={getContextMenuItems(note)}
                      onPrimaryClick={() => {
                        if (selectMode) toggleSelectPath(note.path);
                        else openNote(note);
                      }}
                      selected={isSelected}
                      tooltip={note.path}
                      leading={selectMode ? (
                        <div className={`w-4 h-4 rounded-chip border flex-shrink-0 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "surface-raised-fill bg-[var(--accent)] border-[var(--accent)]"
                            : "surface-inset border-[var(--inset-border)]"
                        }`}>
                          {isSelected && <CheckSquare size={12} className="text-on-accent" />}
                        </div>
                      ) : undefined}
                      title={note.title}
                      meta={!selectMode ? (
                        <>
                          {(() => {
                            const noteColls = noteCollections.get(relPath.replace(/\//g, "\\").toLowerCase()) ?? [];
                            if (noteColls.length === 0) return <Badge variant="warning">{t["vault.uncategorized"]}</Badge>;
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
                                <Badge key={tag} variant="accent">{tag}</Badge>
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

      {selectMode && selectedPaths.size > 0 && (
        <BatchActionBar
          selectedCount={selectedPaths.size}
          collections={collections}
          onAddToCollection={(collectionId) => {
            handleBatchAddToCollection(collectionId, Array.from(selectedPaths));
            setSelectedPaths(new Set());
          }}
          onDelete={() => {
            const paths = Array.from(selectedPaths);
            const { onConfirm } = handleBatchDelete(paths);
            setConfirm({
              message: t["vault.batchDeleteConfirm"].replace("{count}", String(paths.length)),
              confirmLabel: t["batch.delete"],
              onConfirm: async () => {
                await onConfirm();
                removeDocs(paths.map(noteDocId));
                setSelectedPaths(new Set());
              },
            });
          }}
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
