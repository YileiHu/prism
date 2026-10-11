import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
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
import NoteTabBar from "./editor/NoteTabBar";
import NoteEditor from "./editor/NoteEditor";
import { useNoteTabs } from "./editor/useNoteTabs";
import { resolveNoteTarget } from "./editor/linkResolver";

export interface NoteOpenRequest {
  seq: number;
  vaultPath: string;
  path: string;
  title: string;
}

interface VaultNote {
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
  openRequest?: NoteOpenRequest | null;
}

export default function VaultView({ vaultPath, onScanComplete, openRequest }: Props) {
  const { t } = useT();

  const [notes, setNotes] = useState<VaultNote[]>([]);
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

  // Collections sidebar collapse (global UI pref, like the sidebar width)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("prism_vault_sidebar_collapsed") === "1",
  );
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("prism_vault_sidebar_collapsed", prev ? "0" : "1");
      return !prev;
    });
  }, []);

  // Rename note state
  const [renameNoteTarget, setRenameNoteTarget] = useState<VaultNote | null>(null);

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

  // ---- In-app note editor tabs ----

  const {
    tabs,
    activePath,
    setActivePath,
    restoreFrom,
    openNote,
    closeTab,
    updateNote,
    removePaths,
    moveTab,
  } = useNoteTabs(vaultPath);
  const activeNoteTab = activePath ? tabs.find((tab) => tab.path === activePath) : undefined;
  const editorActive = activeNoteTab !== undefined;
  const lastOpenSeqRef = useRef(0);

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
        restoreFrom(cachedNotes);
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
    showToast(t["vault.newNoteCreated"].replace("{name}", note.title));
    const relPath = toRelativePath(note.path, vaultPath);
    if (collectionId) {
      if (groupId) {
        handleMoveNoteDirect(collectionId, relPath, groupId);
      } else {
        handleDropNoteDirect(collectionId, [relPath], true);
      }
    }
    openNote({ path: note.path, title: note.title });
    loadNotes();
  };

  // ---- Wikilink navigation from the reading view ----

  const handleOpenWikilink = async (target: string) => {
    const all = await window.prism.getNoteList(vaultPath);
    const found = resolveNoteTarget(target, vaultPath, all);
    if (found) {
      openNote({ path: found.path, title: found.title });
      return;
    }
    const title = target.split("#")[0].trim().replace(/\.md$/i, "");
    if (!title) return;
    // Images/attachments may still surface as links (non-image embeds
    // degrade to wikilinks) — they must never create notes
    if (/\.\w{1,5}$/i.test(target) && !/\.md$/i.test(target)) return;
    try {
      const created = await window.prism.createNote(vaultPath, title);
      openNote({ path: created.path, title: created.title });
      showToast(t["editor.linkNoteCreated"].replace("{name}", created.title));
      loadNotes();
    } catch {
      showToast(t["editor.linkNoteFailed"]);
    }
  };

  // Deep link from the Home dashboard (App switches to this vault's tab)
  useEffect(() => {
    if (!openRequest || openRequest.seq === lastOpenSeqRef.current) return;
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const vNorm = norm(vaultPath);
    const pNorm = norm(openRequest.path);
    if (pNorm !== vNorm && !pNorm.startsWith(vNorm + "/")) return;
    lastOpenSeqRef.current = openRequest.seq;
    openNote({ path: openRequest.path, title: openRequest.title });
  }, [openRequest, vaultPath, openNote]);

  // ---- Rename note ----

  const handleRenameNote = async (newTitle: string) => {
    if (!renameNoteTarget) return;
    const oldRelPath = toRelativePath(renameNoteTarget.path, vaultPath);
    try {
      const result = await window.prism.renameNote(vaultPath, renameNoteTarget.path, newTitle);
      const newRelPath = toRelativePath(result.path, vaultPath);
      updateNotePaths(oldRelPath, newRelPath);
      updateNote(renameNoteTarget.path, { path: result.path, title: newTitle });
      showToast(t["vault.renamed"].replace("{name}", newTitle));
      loadNotes();
    } catch {
      showToast(t["vault.renameFailed"]);
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
        checked: c.notePaths.includes(relPath) || (c.groups ?? []).some((g) => g.notePaths.includes(relPath)),
        onClick: () => handleDropNoteDirect(c.id, [relPath]),
      }))
      : [{ label: t["collections.none"], onClick: () => {} }];

    const items: MenuItem[] = [
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
        onClick: () => setRenameNoteTarget(note as VaultNote),
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
            removePaths([note.path]);
            setNotes((prev) => prev.filter((n) => n.path !== note.path));
            showToast(t["vault.trashed"]);
          } else {
            showToast(t["vault.deleteFailed"].replace("{error}", result.error ?? ""));
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
          <p className="text-sm text-muted">{t["vault.scanning"]}</p>
        </div>
      ) : vaultError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center anim-fade-in">
          <FolderX size={36} className="text-faint mb-1" />
          <p className="text-sm font-medium text-secondary">{t["vault.vaultNotFound"]}</p>
          <p className="text-xs text-muted leading-relaxed break-all max-w-md">
            {t["vault.vaultNotFoundDesc"].replace("{path}", vaultPath)}
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => setReloadKey((k) => k + 1)}>
            {t["vault.retry"]}
          </Button>
        </div>
      ) : (
      <>
      {/* Collections Sidebar — collapsible. The grid-template-columns 0fr↔1fr
          transition animates the collapse; the sidebar stays MOUNTED while
          collapsed so its scroll/selection state survives */}
      <div
        className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
          sidebarCollapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
        }`}
      >
        <div className="overflow-hidden min-w-0 h-full flex">
          <CollectionsSidebar
            collections={collections}
            selectedId={selectedCollectionId}
            allNotesCount={sortedNotes.length}
            onSelect={(id) => {
              // Browsing collections / all notes always leaves the note editor —
              // the open tab stays in the tab bar (inactive) and can be re-opened
              setActivePath(null);
              setSelectedCollectionId(id);
              setSelectMode(false);
              setSelectedPaths(new Set());
              setCollapsedGroups(new Set());
              setUngroupedCollapsed(false);
              if (id !== null) setSearchQuery("");
              window.prism.setSetting(`last_coll_${vaultPath}`, id ?? "");
            }}
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
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <NoteTabBar
          tabs={tabs}
          activePath={activePath}
          newLabel={t["vault.newNote"]}
          closeLabel={t["editor.closeTab"]}
          sidebarCollapsed={sidebarCollapsed}
          onSelect={setActivePath}
          onClose={closeTab}
          onNewNote={() => setShowNewNoteModal(true)}
          onNewCollection={() => setShowCreateModal(true)}
          onToggleSidebar={toggleSidebar}
          onReorder={moveTab}
        />
        {!selectedCollectionId && !editorActive && (
          <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t["vault.search"]}
              wrapperClassName="flex-1"
            />
            <Button variant="ghost" size="icon-md" active={selectMode} onClick={toggleSelectMode} title={selectMode ? t["batch.cancelSelect"] : t["batch.selectMode"]}>
              <CheckSquare size={16} />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col relative">
          {editorActive && activeNoteTab && (
            <NoteEditor
              key={activeNoteTab.path}
              vaultPath={vaultPath}
              notePath={activeNoteTab.path}
              title={activeNoteTab.title}
              onNoteGone={closeTab}
              onOpenWikilink={handleOpenWikilink}
            />
          )}
          {selectedCollection && selectedCollectionId && (
            <div
              key={selectedCollectionId}
              style={editorActive ? { position: "absolute", inset: 0, visibility: "hidden" } : undefined}
              className={`flex-1 flex flex-col overflow-hidden relative z-10 ${editorActive ? "" : "anim-fade-in"}`}
            >
              <div className="px-4 h-11 border-b border-line/50 flex-shrink-0 flex items-center gap-2 glass bg-tint/[0.04]">
                <h2 className="text-base font-semibold text-primary">{selectedCollection.name}</h2>
                <span className="text-xs text-muted">{t["vault.notesCount"].replace("{count}", String(totalCollectionNotes))}</span>
                <div className="flex-1" />
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
                onOpenNote={(note) => openNote({ path: note.path, title: note.title })}
              />
            </div>
          )}
          <div
            style={!selectedCollectionId && !editorActive ? {} : { position: "absolute", visibility: "hidden" }}
            className={`flex-1 overflow-y-auto py-1 inset-0 ${!selectedCollectionId && !editorActive ? "anim-fade-in" : ""}`}
            ref={notesScrollRef}
          >
              {sortedNotes.length === 0 && (
                <EmptyState
                  size="module"
                  text={scanning ? t["vault.scanning"] : (searchQuery ? t["vault.emptySearch"] : t["vault.emptyVault"])}
                  cta={!scanning && !searchQuery ? { label: t["vault.newNote"], onClick: () => setShowNewNoteModal(true), icon: <Plus size={14} /> } : undefined}
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
                            else openNote(note);
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
                                      {t["vault.uncategorized"]}
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
                removePaths(Array.from(selectedPaths));
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
        placeholder={t["vault.renameTitle"]}
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
