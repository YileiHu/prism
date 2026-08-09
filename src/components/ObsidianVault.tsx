import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, ExternalLink,
  FolderOpen, FolderX, CheckSquare, Maximize2,
  Trash2, Plus, Pencil, RefreshCw,
  ArrowRightLeft, Star,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useToast } from "../lib/toast";
import CollectionsSidebar, { type CollectionData, type NoteGroup } from "./CollectionsSidebar";
import CollectionDetail from "./CollectionDetail";
import CreateCollectionModal from "./CreateCollectionModal";
import CreateNoteModal from "./CreateNoteModal";
import BatchActionBar from "./BatchActionBar";
import { type MenuItem } from "./ContextMenu";
import { useContextMenu } from "../lib/useContextMenu";
import { useSetToggle } from "../lib/useToggleSet";
import { useCollections, toRelativePath } from "./useCollections";
import Button from "./Button";
import ItemRow from "./ItemRow";
import SearchInput from "./SearchInput";
import EmptyState from "./EmptyState";
import RenameModal from "./RenameModal";
import ConfirmDialog from "./ConfirmDialog";

interface ObsidianNote {
  id: number;
  path: string;
  title: string;
  content?: string;
  tags: string;
  modified_at: string;
}

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface Props {
  vaultPath: string;
  onScanComplete?: () => void;
}

export default function ObsidianVault({ vaultPath, onScanComplete }: Props) {
  const { t } = useT();

  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [scanning, setScanning] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [vaultError, setVaultError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionData | null>(null);

  // Rename note state
  const [renameNoteTarget, setRenameNoteTarget] = useState<ObsidianNote | null>(null);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);

  // Context menu
  const { onContextMenu } = useContextMenu();
  const toggleCollapsedGroup = useSetToggle(setCollapsedGroups);

  // Confirm dialog
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const showToast = useToast();
  const initialLoadDone = useRef(false);

  // ---- Vault loading (triggered by vaultPath prop / retry) ----

  useEffect(() => {
    setScanning(true);
    setInitialLoading(true);
    setVaultError(false);
    setSelectMode(false);
    setSelectedPaths(new Set());
    (async () => {
      try {
        await window.prism.setVaultPath(vaultPath);
        const [cachedNotes, collData] = await Promise.all([
          window.prism.getNoteList(vaultPath),
          window.prism.loadCollections(vaultPath) as Promise<{ version: number; collections: CollectionData[] } | null>,
        ]);
        const lastCollId = await window.prism.getSetting(`last_coll_${vaultPath}`);
        // Apply all view state in one batch so the final layout renders in a
        // single frame — no intermediate "All Notes"/empty-sidebar flash
        const colls = collData?.collections ?? [];
        setCollections(colls);
        if (lastCollId && colls.some((c: CollectionData) => c.id === lastCollId)) {
          setSelectedCollectionId(lastCollId);
        }
        setNotes(cachedNotes);
      } catch {
        // setVaultPath throws when the vault directory is missing/unreadable
        setVaultError(true);
        setNotes([]);
      } finally {
        setScanning(false);
        setInitialLoading(false);
        if (!initialLoadDone.current) {
          initialLoadDone.current = true;
          onScanComplete?.();
        }
      }
    })();
  }, [vaultPath, reloadKey]);

  // ---- Notes loading ----

  const loadNotes = useCallback(async () => {
    if (debouncedQuery.trim()) {
      setNotes(await window.prism.searchNotes(vaultPath, debouncedQuery));
    } else {
      setNotes(await window.prism.getNoteList(vaultPath));
    }
  }, [debouncedQuery, vaultPath]);

  useEffect(() => {
    if (!scanning) loadNotes();
  }, [loadNotes, scanning]);

  // ---- Favorites (starred notes) ----

  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const refreshFavorites = useCallback(async () => {
    if (notes.length === 0) {
      setFavorites(new Set());
      return;
    }
    const paths = await window.prism.getFavoriteStatus(notes.map((n) => n.path));
    setFavorites(new Set(paths));
  }, [notes]);

  useEffect(() => { refreshFavorites(); }, [refreshFavorites]);

  // Home dashboard can unstar notes while this view stays mounted
  useEffect(() => {
    const handler = () => refreshFavorites();
    window.addEventListener("favorites-changed", handler);
    return () => window.removeEventListener("favorites-changed", handler);
  }, [refreshFavorites]);

  const toggleFavorite = async (note: { path: string; title: string }) => {
    const nowFav = await window.prism.toggleFavoriteNote(note.path, note.title);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(note.path);
      else next.delete(note.path);
      return next;
    });
    window.dispatchEvent(new Event("favorites-changed"));
  };

  // Silent refresh when the file watcher reports external changes to this vault
  useEffect(() => {
    return window.prism.onVaultUpdated((changedPath) => {
      const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
      if (norm(changedPath) === norm(vaultPath) && !scanning) loadNotes();
    });
  }, [vaultPath, loadNotes, scanning]);

  // ---- Collections (extracted hook) ----

  const {
    collections,
    setCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    handleReorderCollections,
    handleDropNote,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
    handleMoveToCollection,
    handleReorderNotesInGroup,
    handleAddGroup,
    handleRenameGroup,
    handleDeleteGroup,
    handleReorderGroups,
    updateNotePaths,
    removeNotePaths,
    handleBatchAddToCollection,
    handleBatchDelete,
    selectedCollection,
    groupedViews,
    ungroupedNotes,
    totalCollectionNotes,
    noteCollections,
    sortedNotes,
  } = useCollections({ vaultPath, notes, loadNotes });

  // ---- Create note callback ----

  const handleCreateNote = (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => {
    setShowNewNoteModal(false);
    showToast(t["obsidian.newNoteCreated"].replace("{name}", note.title));
    const relPath = toRelativePath(note.path, vaultPath);
    if (collectionId) {
      if (groupId) {
        handleMoveNoteDirect(collectionId, relPath, groupId);
      } else {
        handleDropNoteDirect(collectionId, [relPath], true);
      }
    }
    loadNotes();
  };

  // ---- Rename note ----

  const handleRenameNote = async (newTitle: string) => {
    if (!renameNoteTarget) return;
    const oldRelPath = toRelativePath(renameNoteTarget.path, vaultPath);
    try {
      const result = await window.prism.renameNote(vaultPath, renameNoteTarget.path, newTitle);
      const newRelPath = toRelativePath(result.path, vaultPath);
      updateNotePaths(oldRelPath, newRelPath);
      showToast(t["obsidian.renamed"].replace("{name}", newTitle));
      loadNotes();
    } catch {
      showToast(t["obsidian.renameFailed"]);
    }
  };

  // ---- Select mode ----

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
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

  // ---- Context menu ----

  const getContextMenuItems = (
    note: { path: string; title: string },
    collectionContext?: { collectionId: string; groupId: string | null; relPath: string; onRemove: () => void },
  ): MenuItem[] => {
    const relPath = collectionContext?.relPath ?? toRelativePath(note.path, vaultPath);

    const addToCollectionSubmenu: MenuItem[] = collections.length > 0
      ? collections.map((c) => ({
        label: c.name,
        checked: c.notePaths.includes(relPath),
        onClick: () => handleDropNoteDirect(c.id, [relPath]),
      }))
      : [{ label: t["collections.none"], onClick: () => {} }];

    const items: MenuItem[] = [
      {
        label: t["menu.openInObsidian"],
        icon: <ExternalLink size={14} />,
        onClick: () => window.prism.openInObsidian(note.path),
      },
      {
        label: favorites.has(note.path) ? t["menu.unfavorite"] : t["menu.favorite"],
        icon: <Star size={14} />,
        onClick: () => toggleFavorite(note),
      },
      {
        label: t["menu.showInExplorer"],
        icon: <FolderOpen size={14} />,
        onClick: () => window.prism.showItemInFolder(note.path),
      },
    ];

    if (collectionContext) {
      const otherCollections = collections.filter((c) => c.id !== collectionContext.collectionId);
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
            ? otherCollections.map((c) => ({
              label: c.name,
              onClick: () => handleMoveToCollection(collectionContext.collectionId, c.id, collectionContext.relPath, collectionContext.groupId),
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
      { label: "", divider: true },
      {
        label: t["menu.rename"],
        icon: <Pencil size={14} />,
        onClick: () => setRenameNoteTarget(note as ObsidianNote),
      },
      { label: "", divider: true },
      {
        label: t["menu.moveToTrash"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: async () => {
          const result = await window.prism.trashFile(note.path);
          if (result.success) {
            // Remove the DB row too, otherwise the next loadNotes() resurrects it
            await window.prism.deleteNotes([note.path]);
            removeNotePaths([relPath]);
            setNotes((prev) => prev.filter((n) => n.path !== note.path));
            showToast(t["obsidian.trashed"]);
          } else {
            showToast(t["obsidian.deleteFailed"].replace("{error}", result.error ?? ""));
          }
        },
      },
    );

    return items;
  };

  // ---- Virtual scroll ----

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
      const groupIds = (selectedCollection?.groups ?? []).map((g) => g.id);
      setCollapsedGroups(new Set(groupIds));
      setUngroupedCollapsed(true);
    } else {
      setCollapsedGroups(new Set());
      setUngroupedCollapsed(false);
    }
  };

  // ---- Render ----

  return (
    <div className="h-full flex">
      {initialLoading ? (
        // Single loading view until scan + collections + restored selection are
        // all ready — prevents flashing intermediate layouts on first mount
        <div className="flex-1 flex flex-col items-center justify-center gap-3 anim-fade-in">
          <RefreshCw size={22} className="animate-spin text-muted" />
          <p className="text-sm text-muted">{t["obsidian.scanning"]}</p>
        </div>
      ) : vaultError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center anim-fade-in">
          <FolderX size={36} className="text-faint mb-1" />
          <p className="text-sm font-medium text-secondary">{t["obsidian.vaultNotFound"]}</p>
          <p className="text-xs text-muted leading-relaxed break-all max-w-md">
            {t["obsidian.vaultNotFoundDesc"].replace("{path}", vaultPath)}
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => setReloadKey((k) => k + 1)}>
            {t["obsidian.retry"]}
          </Button>
        </div>
      ) : (
      <>
      {/* Collections Sidebar */}
      <CollectionsSidebar
        collections={collections}
        selectedId={selectedCollectionId}
        allNotesCount={sortedNotes.length}
        onSelect={(id) => {
          setSelectedCollectionId(id);
          setSelectMode(false);
          setSelectedPaths(new Set());
          setCollapsedGroups(new Set());
          setUngroupedCollapsed(false);
          if (id !== null) setSearchQuery("");
          window.prism.setSetting(`last_coll_${vaultPath}`, id ?? "");
        }}
        onCreate={() => setShowCreateModal(true)}
        onRename={(id) => {
          const coll = collections.find((c) => c.id === id);
          if (coll) setRenameTarget(coll);
        }}
        onDelete={(id) => {
          const { collName, onConfirm } = handleDeleteCollection(id);
          setConfirm({
            message: t["collections.deleteConfirm"],
            confirmLabel: t["collections.delete"],
            onConfirm: () => {
              onConfirm();
              setConfirm(null);
              showToast(t["collections.removed"].replace("{name}", collName));
            },
          });
        }}
        onReorder={handleReorderCollections}
        onDropNote={handleDropNote}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedCollectionId && (
          <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t["obsidian.search"]}
              wrapperClassName="flex-1"
            />
            <Button variant="ghost" size="icon-md" onClick={() => setShowNewNoteModal(true)} title={t["obsidian.newNote"]}>
              <Plus size={16} />
            </Button>
            <Button variant="ghost" size="icon-md" active={selectMode} onClick={toggleSelectMode} title={selectMode ? t["batch.cancelSelect"] : t["batch.selectMode"]}>
              <CheckSquare size={16} />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col relative">
          {selectedCollection && selectedCollectionId && (
            <div key={selectedCollectionId} className="flex-1 flex flex-col overflow-hidden relative z-10 anim-fade-in">
              <div className="px-4 h-11 border-b border-line/50 flex-shrink-0 flex items-center gap-2 glass bg-tint/[0.04]">
                <h2 className="text-base font-semibold text-primary">{selectedCollection.name}</h2>
                <span className="text-xs text-muted">{t["obsidian.notesCount"].replace("{count}", String(totalCollectionNotes))}</span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon-md" onClick={() => setShowNewNoteModal(true)} title={t["obsidian.newNote"]}>
                  <Plus size={16} />
                </Button>
                <Button variant="ghost" size="icon-md" onClick={handleToggleAll} title={allExpanded ? t["collections.collapseAll"] : t["collections.expandAll"]}>
                  <Maximize2 size={16} />
                </Button>
              </div>
              <CollectionDetail
                groups={groupedViews}
                ungroupedNotes={ungroupedNotes}
                collapsedGroups={collapsedGroups}
                ungroupedCollapsed={ungroupedCollapsed}
                onToggleGroup={toggleCollapsedGroup}
                onToggleUngrouped={() => setUngroupedCollapsed(!ungroupedCollapsed)}
                onAddGroup={(name) => handleAddGroup(selectedCollectionId!, name)}
                onRenameGroup={(groupId, name) => handleRenameGroup(selectedCollectionId!, groupId, name)}
                onDeleteGroup={(groupId) => handleDeleteGroup(selectedCollectionId!, groupId)}
                onReorderGroups={(from, to) => handleReorderGroups(selectedCollectionId!, from, to)}
                onMoveNote={(relPath, fromG, toG, toIdx) => handleMoveNote(selectedCollectionId!, relPath, fromG, toG, toIdx)}
                onRemoveNote={(relPath, groupId) => handleRemoveNote(selectedCollectionId!, relPath, groupId)}
                onReorderNotes={(groupId, from, to) => handleReorderNotesInGroup(selectedCollectionId!, groupId, from, to)}
                onNoteContextMenu={(e, note, groupId) => onContextMenu(e, getContextMenuItems(
                  note as unknown as { path: string; title: string },
                  {
                    collectionId: selectedCollectionId!,
                    groupId,
                    relPath: note.relativePath,
                    onRemove: () => handleRemoveNote(selectedCollectionId!, note.relativePath, groupId),
                  },
                ))}
              />
            </div>
          )}
          <div
            style={!selectedCollectionId ? {} : { position: "absolute", visibility: "hidden" }}
            className={`flex-1 overflow-y-auto py-1 inset-0 ${!selectedCollectionId ? "anim-fade-in" : ""}`}
            ref={notesScrollRef}
          >
              {sortedNotes.length === 0 && (
                <EmptyState
                  size="module"
                  text={scanning ? t["obsidian.scanning"] : (searchQuery ? t["obsidian.emptySearch"] : t["obsidian.emptyVault"])}
                  cta={!scanning && !searchQuery ? { label: t["obsidian.newNote"], onClick: () => setShowNewNoteModal(true), icon: <Plus size={14} /> } : undefined}
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
                        <ItemRow
                          variant="list"
                          draggable
                          onDragStart={(e) => {
                            const paths = selectedPaths.size > 0 && selectedPaths.has(note.path)
                              ? Array.from(selectedPaths) : [relPath];
                            e.dataTransfer.setData("text/x-note-paths", JSON.stringify(paths));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          menuItems={getContextMenuItems(note)}
                          onPrimaryClick={() => {
                            if (selectMode) toggleSelectPath(note.path);
                            else window.prism.openInObsidian(note.path);
                          }}
                          selected={isSelected}
                          tooltip={note.path}
                          leading={selectMode ? (
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-[var(--accent)] border-[var(--accent)]" : "border-strong"}`}>
                              {isSelected && <CheckSquare size={12} className="text-white" />}
                            </div>
                          ) : undefined}
                          title={note.title}
                          meta={!selectMode ? (
                            <>
                              {(() => {
                                const noteColls = noteCollections.get(relPath.replace(/\//g, "\\").toLowerCase()) ?? [];
                                if (noteColls.length === 0) {
                                  return (
                                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-400 bg-amber-500/10 whitespace-nowrap">
                                      {t["obsidian.uncategorized"]}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                                    {noteColls.slice(0, 3).map((name) => (
                                      <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-hover/60 text-tertiary whitespace-nowrap">{name}</span>
                                    ))}
                                    {noteColls.length > 3 && <span className="text-[10px] text-faint">+{noteColls.length - 3}</span>}
                                  </span>
                                );
                              })()}
                              {note.tags && (
                                <span className="hidden xl:flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                                  {note.tags.split(" ").filter(Boolean).slice(0, 2).map((tag) => (
                                    <span key={tag} className="text-xs text-[var(--accent-text)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded whitespace-nowrap">{tag}</span>
                                  ))}
                                </span>
                              )}
                            </>
                          ) : undefined}
                          hoverActions={!selectMode ? [{
                            icon: <Star size={13} fill={favorites.has(note.path) ? "currentColor" : "none"} />,
                            label: favorites.has(note.path) ? t["menu.unfavorite"] : t["menu.favorite"],
                            onClick: () => toggleFavorite(note),
                            active: favorites.has(note.path),
                            className: favorites.has(note.path) ? "text-[var(--accent)]" : undefined,
                          }] : []}
                        />
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
              onAddToCollection={(collId) => {
                handleBatchAddToCollection(collId, Array.from(selectedPaths));
                setSelectedPaths(new Set());
              }}
              onDelete={async () => {
                const { onConfirm } = handleBatchDelete(Array.from(selectedPaths));
                await onConfirm();
                setSelectedPaths(new Set());
              }}
            />
          )}
        </div>
      </div>
      </>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateCollectionModal
          title={t["collections.new"]}
          onSave={(name) => { handleCreateCollection(name); setShowCreateModal(false); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {renameTarget && (
        <CreateCollectionModal
          title={t["collections.rename"]}
          initialName={renameTarget.name}
          onSave={(name) => { handleRenameCollection(renameTarget, name); setRenameTarget(null); }}
          onClose={() => setRenameTarget(null)}
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
        open={renameNoteTarget !== null}
        initialValue={renameNoteTarget?.title ?? ""}
        placeholder={t["obsidian.renameTitle"]}
        icon={<Pencil size={18} className="text-[var(--accent-text)]" />}
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
