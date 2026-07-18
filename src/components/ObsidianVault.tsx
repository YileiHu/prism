import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, FileText, ExternalLink,
  FolderOpen, CheckSquare, Maximize2,
  Trash2, Plus, Pencil, RefreshCw,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
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
import Modal from "./Modal";

interface ObsidianNote {
  id: number;
  path: string;
  title: string;
  content?: string;
  tags: string;
  modified_at: string;
}

interface ConfirmDialog {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface Props {
  vaultPath: string;
  vaultName?: string;
  onScanComplete?: () => void;
}

export default function ObsidianVault({ vaultPath, vaultName, onScanComplete }: Props) {
  const { t } = useT();

  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [scanning, setScanning] = useState(true);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionData | null>(null);

  // Rename note state
  const [renameNoteTarget, setRenameNoteTarget] = useState<ObsidianNote | null>(null);
  const [renameNoteTitle, setRenameNoteTitle] = useState("");

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
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // ---- Vault loading (triggered by vaultPath prop) ----

  useEffect(() => {
    setScanning(true);
    setSelectMode(false);
    setSelectedPaths(new Set());
    (async () => {
      try {
        await window.prism.setVaultPath(vaultPath);
        const [cachedNotes, collData] = await Promise.all([
          window.prism.getNoteList(),
          window.prism.loadCollections(vaultPath) as Promise<{ version: number; collections: CollectionData[] } | null>,
        ]);
        setNotes(cachedNotes);
        await loadCollections(vaultPath);
        const lastCollId = await window.prism.getSetting(`last_coll_${vaultPath}`);
        if (lastCollId && (collData?.collections ?? []).some((c: CollectionData) => c.id === lastCollId)) {
          setSelectedCollectionId(lastCollId);
        }
      } finally {
        setScanning(false);
        if (!initialLoadDone.current) {
          initialLoadDone.current = true;
          onScanComplete?.();
        }
      }
    })();
  }, [vaultPath]);

  // ---- Notes loading ----

  const loadNotes = useCallback(async () => {
    if (debouncedQuery.trim()) {
      setNotes(await window.prism.searchNotes(debouncedQuery));
    } else {
      setNotes(await window.prism.getNoteList());
    }
  }, [debouncedQuery]);

  useEffect(() => {
    if (!scanning) loadNotes();
  }, [loadNotes, scanning]);

  const handleRefresh = async () => {
    setScanning(true);
    try {
      await window.prism.setVaultPath(vaultPath);
      await loadNotes();
      await loadCollections(vaultPath);
    } finally {
      setScanning(false);
    }
  };

  // ---- Collections (extracted hook) ----

  const {
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    loadCollections,
    handleCreateCollection,
    handleRenameCollection,
    handleDeleteCollection,
    handleReorderCollections,
    handleDropNote,
    handleDropNoteDirect,
    handleMoveNoteDirect,
    handleMoveNote,
    handleRemoveNote,
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
  } = useCollections({ selectedVault: { name: vaultName ?? "", path: vaultPath }, notes, showToast, loadNotes });

  // ---- Create note callback ----

  const handleCreateNote = (note: { id: number; path: string; title: string }, collectionId?: string, groupId?: string) => {
    setShowNewNoteModal(false);
    showToast(t["obsidian.newNoteCreated"].replace("{name}", note.title));
    const relPath = toRelativePath(note.path, vaultPath);
    if (collectionId) {
      if (groupId) {
        handleMoveNoteDirect(collectionId, relPath, groupId);
      } else {
        handleDropNoteDirect(collectionId, [relPath]);
      }
    }
    loadNotes();
  };

  // ---- Rename note ----

  const handleRenameNote = async () => {
    if (!renameNoteTitle.trim() || !renameNoteTarget) return;
    const oldRelPath = toRelativePath(renameNoteTarget.path, vaultPath);
    const result = await window.prism.renameNote(renameNoteTarget.path, renameNoteTitle.trim());
    const newRelPath = toRelativePath(result.path, vaultPath);
    updateNotePaths(oldRelPath, newRelPath);
    setRenameNoteTarget(null);
    showToast(t["obsidian.renamed"].replace("{name}", renameNoteTitle.trim()));
    loadNotes();
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

  const getContextMenuItems = (note: ObsidianNote): MenuItem[] => {
    const relPath = toRelativePath(note.path, vaultPath);

    return [
      {
        label: t["menu.openInObsidian"],
        icon: <ExternalLink size={14} />,
        onClick: () => window.prism.openInObsidian(note.path),
      },
      {
        label: t["menu.showInExplorer"],
        icon: <FolderOpen size={14} />,
        onClick: () => window.prism.showItemInFolder(note.path),
      },
      {
        label: t["menu.rename"],
        icon: <Pencil size={14} />,
        onClick: () => { setRenameNoteTarget(note); setRenameNoteTitle(note.title); },
      },
      { label: "", divider: true },
      {
        label: t["menu.addToCollection"],
        icon: <FileText size={14} />,
        children: collections.length > 0
          ? collections.map((c) => ({
            label: c.name,
            checked: c.notePaths.includes(relPath),
            onClick: () => handleDropNote(c.id, [relPath]),
          }))
          : [{ label: t["collections.none"], onClick: () => {} }],
      },
      { label: "", divider: true },
      {
        label: t["menu.moveToTrash"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => {
          setConfirm({
            message: t["confirm.deleteFile"].replace("{name}", note.title + ".md"),
            confirmLabel: t["menu.moveToTrash"],
            onConfirm: async () => {
              setConfirm(null);
              const result = await window.prism.trashFile(note.path);
              if (result.success) {
                removeNotePaths([relPath]);
                setNotes((prev) => prev.filter((n) => n.path !== note.path));
              } else {
                showToast(`Failed to delete: ${result.error}`);
              }
            },
          });
        },
      },
    ];
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
        onRefresh={handleRefresh}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedCollectionId && (
          <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-800/50 flex-shrink-0 bg-white/[0.04]">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t["obsidian.search"]}
                className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-3 py-1 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            <Button variant="ghost" size="icon-md" onClick={handleRefresh} disabled={scanning} title={t["obsidian.refresh"]}>
              <RefreshCw size={16} className={scanning ? "animate-spin" : ""} />
            </Button>
            <Button variant="ghost" size="icon-md" onClick={() => setShowNewNoteModal(true)} title={t["obsidian.newNote"]}>
              <Plus size={16} />
            </Button>
            <Button variant="ghost" size="icon-md" active={selectMode} onClick={toggleSelectMode} title={selectMode ? t["batch.cancelSelect"] : t["batch.selectMode"]}>
              <CheckSquare size={16} />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedCollection && selectedCollectionId && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 h-11 border-b border-gray-800/50 flex-shrink-0 flex items-center gap-2 bg-white/[0.04]">
                <h2 className="text-base font-semibold text-gray-200">{selectedCollection.name}</h2>
                <span className="text-xs text-gray-500">{totalCollectionNotes} notes</span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon-md" onClick={() => setShowNewNoteModal(true)} title={t["obsidian.newNote"]}>
                  <Plus size={16} />
                </Button>
                <Button variant="ghost" size="icon-md" onClick={handleToggleAll} title={allExpanded ? (t["collections.collapseAll"] ?? "折叠全部") : (t["collections.expandAll"] ?? "展开全部")}>
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
                onMoveNote={(relPath, fromG, toG) => handleMoveNote(selectedCollectionId!, relPath, fromG, toG)}
                onRemoveNote={(relPath, groupId) => handleRemoveNote(selectedCollectionId!, relPath, groupId)}
                onReorderNotes={(groupId, from, to) => handleReorderNotesInGroup(selectedCollectionId!, groupId, from, to)}
                onNoteContextMenu={(e, note) => onContextMenu(e, getContextMenuItems(note as unknown as ObsidianNote))}
              />
            </div>
          )}
          <div
            style={{ display: !selectedCollectionId ? "" : "none" }}
            className="flex-1 overflow-y-auto py-1"
            ref={notesScrollRef}
          >
              {sortedNotes.length === 0 && (
                <div className="text-center text-gray-400 mt-20 animate-pulse text-sm">
                  {scanning ? t["obsidian.scanning"] : (searchQuery ? t["obsidian.emptySearch"] : t["obsidian.emptyVault"])}
                </div>
              )}
              {sortedNotes.length > 0 && (
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const note = sortedNotes[virtualRow.index];
                    const relPath = toRelativePath(note.path, vaultPath);
                    const isSelected = selectedPaths.has(note.path);
                    return (
                      <div
                        key={note.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: "absolute", top: 0, left: 0, width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          draggable
                          onDragStart={(e) => {
                            const paths = selectedPaths.size > 0 && selectedPaths.has(note.path)
                              ? Array.from(selectedPaths) : [relPath];
                            e.dataTransfer.setData("text/x-note-paths", JSON.stringify(paths));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onContextMenu={(e) => onContextMenu(e, getContextMenuItems(note))}
                          onClick={() => {
                            if (selectMode) toggleSelectPath(note.path);
                            else window.prism.openInObsidian(note.path);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer ${isSelected ? "bg-[var(--accent-muted)]" : "hover:bg-gray-800/30"}`}
                          title={note.path}
                        >
                          {selectMode && (
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-[var(--accent)] border-[var(--accent)]" : "border-gray-600"}`}>
                              {isSelected && <CheckSquare size={12} className="text-white" />}
                            </div>
                          )}
                          <span className={`text-sm truncate flex-1 ${isSelected ? "text-[var(--accent-text)]" : "text-gray-300"}`}>
                            {note.title}
                          </span>
                          {!selectMode && (() => {
                            const noteColls = noteCollections.get(relPath.replace(/\//g, "\\").toLowerCase()) ?? [];
                            if (noteColls.length === 0) {
                              return (
                                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-400 bg-amber-500/10 whitespace-nowrap">
                                  未归类
                                </span>
                              );
                            }
                            return (
                              <span className="flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                                {noteColls.slice(0, 3).map((name) => (
                                  <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400 whitespace-nowrap">{name}</span>
                                ))}
                                {noteColls.length > 3 && <span className="text-[10px] text-gray-600">+{noteColls.length - 3}</span>}
                              </span>
                            );
                          })()}
                          {note.tags && !selectMode && (
                            <span className="hidden xl:flex items-center gap-1 flex-shrink-0 max-w-[200px] overflow-hidden">
                              {note.tags.split(" ").filter(Boolean).slice(0, 2).map((tag) => (
                                <span key={tag} className="text-xs text-[var(--accent-text)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded whitespace-nowrap">{tag}</span>
                              ))}
                            </span>
                          )}
                        </div>
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
              onDelete={() => {
                const paths = Array.from(selectedPaths);
                const { onConfirm } = handleBatchDelete(paths);
                setConfirm({
                  message: t["confirm.deleteFiles"].replace("{count}", String(paths.length)),
                  confirmLabel: t["menu.moveToTrash"],
                  onConfirm: () => { setConfirm(null); onConfirm(); setSelectedPaths(new Set()); },
                });
              }}
            />
          )}
        </div>
      </div>

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

      <Modal
        open={renameNoteTarget !== null}
        title={t["menu.rename"]}
        icon={<Pencil size={18} className="text-[var(--accent-text)]" />}
        onClose={() => setRenameNoteTarget(null)}
        width="400px"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameNoteTarget(null)}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="md" onClick={handleRenameNote} disabled={!renameNoteTitle.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <input
          type="text"
          value={renameNoteTitle}
          onChange={(e) => setRenameNoteTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleRenameNote(); }}
          placeholder={t["obsidian.renameTitle"]}
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </Modal>

      {confirm && (
        <Modal open onClose={() => setConfirm(null)} position="center" footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>{t["resources.cancel"]}</Button>
            <Button variant="danger" size="sm" onClick={confirm.onConfirm}>{confirm.confirmLabel}</Button>
          </>
        }>
          <p className="text-sm text-gray-200">{confirm.message}</p>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-sm text-gray-200 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  );
}
