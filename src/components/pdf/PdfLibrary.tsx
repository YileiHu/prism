import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  BookOpen,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { resolveTagColor } from "../../lib/colors";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import CreateCollectionModal from "../CreateCollectionModal";
import { DropdownMenu, DropdownMenuItem } from "../DropdownMenu";
import RenameModal from "../RenameModal";
import SearchInput from "../SearchInput";
import Spinner from "../Spinner";
import PdfCollectionsSidebar, { pdfCollId } from "./PdfCollectionsSidebar";
import PdfGridView from "./PdfGridView";
import PdfReader from "./PdfReader";
import PdfTabBar from "./PdfTabBar";
import { usePdfCollections } from "./usePdfCollections";
import { usePdfLibrary } from "./usePdfLibrary";
import { usePdfTabs, type PdfTab } from "./usePdfTabs";
import { relKey, type PdfCollectionData, type PdfDocument, type PdfSort } from "./types";

interface Props {
  active: boolean;
  onOpenSettings: () => void;
}

type DragState =
  | { kind: "doc"; doc: PdfDocument }
  | { kind: "collection"; coll: PdfCollectionData }
  | null;

export default function PdfLibrary({ active, onOpenSettings }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const lib = usePdfLibrary(active);
  const cols = usePdfCollections(lib.repoPath);
  const tabs = usePdfTabs(lib.repoPath);
  const { restoreFrom, removePaths: removeTabPaths, openTab, closeTab, moveTab, setActivePath } = tabs;

  const [dragState, setDragState] = useState<DragState>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PdfCollectionData | null>(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState<PdfCollectionData | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<PdfDocument | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const sortAnchorRef = useRef<HTMLButtonElement>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("prism_pdf_sidebar_collapsed") === "1",
  );
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("prism_pdf_sidebar_collapsed", prev ? "0" : "1");
      return !prev;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const selectedCollection = cols.selected;

  // Restore persisted tabs once the first complete listing for this repo lands.
  useEffect(() => {
    if (!lib.loaded || !lib.repoPath || !lib.repoExists) return;
    restoreFrom(lib.documents);
  }, [lib.loaded, lib.repoPath, lib.repoExists, lib.documents, restoreFrom]);

  // Drop collection membership for paths the last scan no longer returns
  // (external delete/rename).
  useEffect(() => {
    if (!lib.loaded || !lib.repoExists || !cols.loaded) return;
    if (lib.documents.length === 0) return;
    if (relKey(lib.documents[0].repo_path) !== relKey(lib.repoPath)) return;
    const valid = new Set(lib.documents.map((doc) => relKey(doc.rel_path)));
    const removed = cols.pruneMissing(valid);
    if (removed > 0) {
      showToast(t["pdf.collectionRemovedMissing"].replace("{count}", String(removed)));
    }
  }, [lib.documents, lib.loaded, lib.repoExists, lib.repoPath, cols.loaded, cols.pruneMissing, showToast, t]);

  // Close tabs whose files disappeared from disk.
  useEffect(() => {
    if (!lib.loaded || !lib.repoExists) return;
    if (lib.documents.length === 0) return;
    if (relKey(lib.documents[0].repo_path) !== relKey(lib.repoPath)) return;
    const valid = new Set(lib.documents.map((doc) => relKey(doc.rel_path)));
    const missing = tabs.tabs
      .filter((tab) => !valid.has(relKey(tab.relPath)))
      .map((tab) => tab.relPath);
    if (missing.length > 0) removeTabPaths(missing);
  }, [lib.documents, lib.loaded, lib.repoExists, lib.repoPath, tabs.tabs, removeTabPaths]);

  const docByKey = useMemo(
    () => new Map(lib.documents.map((doc) => [relKey(doc.rel_path), doc])),
    [lib.documents],
  );

  const resolvedTabs = useMemo(
    () =>
      tabs.tabs
        .map((tab) => ({ tab, doc: docByKey.get(relKey(tab.relPath)) }))
        .filter((entry): entry is { tab: PdfTab; doc: PdfDocument } => entry.doc !== undefined),
    [tabs.tabs, docByKey],
  );

  const activeDoc = tabs.activePath ? docByKey.get(relKey(tabs.activePath)) ?? null : null;
  const reading = activeDoc !== null;
  const activeKey = activeDoc ? relKey(activeDoc.rel_path) : null;

  const displayed = useMemo(() => {
    if (!selectedCollection) return lib.visible;
    const keys = new Set(selectedCollection.pdfPaths.map(relKey));
    return lib.visible.filter((doc) => keys.has(relKey(doc.rel_path)));
  }, [lib.visible, selectedCollection]);

  const handleSelectCollection = (id: string | null) => {
    setActivePath(null);
    lib.setSearch("");
    cols.selectCollection(id);
  };

  const addToCollection = (doc: PdfDocument, collectionId: string) => {
    const target = cols.collections.find((c) => c.id === collectionId);
    const added = cols.addPaths(collectionId, [doc.rel_path]);
    if (!target) return;
    showToast(
      added > 0
        ? t["pdf.addToCollectionDone"].replace("{name}", target.name)
        : t["collections.alreadyExists"],
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.kind === "pdf-doc") {
      const doc = lib.documents.find((d) => d.id === data.id);
      if (doc) setDragState({ kind: "doc", doc });
    } else if (data?.kind === "pdf-collection") {
      const coll = cols.collections.find((c) => c.id === data.id);
      if (coll) setDragState({ kind: "collection", coll });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragState(null);
    const data = event.active.data.current;
    const overId = event.over?.id;
    if (data?.kind === "pdf-doc") {
      if (typeof overId !== "string" || !overId.startsWith("pdfcoll-")) return;
      const collectionId = overId.slice("pdfcoll-".length);
      const doc = lib.documents.find((d) => d.id === data.id);
      if (doc) addToCollection(doc, collectionId);
    } else if (data?.kind === "pdf-collection") {
      if (typeof overId !== "string" || !overId.startsWith("pdfcoll-")) return;
      const from = cols.collections.findIndex((c) => c.id === data.id);
      const to = cols.collections.findIndex((c) => pdfCollId(c.id) === overId);
      if (from >= 0 && to >= 0 && from !== to) cols.reorderCollections(from, to);
    }
  };

  const confirmDeleteDoc = async () => {
    if (!deleteDocTarget) return;
    const target = deleteDocTarget;
    try {
      const result = await lib.removeDocuments([target.id]);
      if (result.allSuccess) {
        removeTabPaths([target.rel_path]);
        showToast(t["pdf.trashed"].replace("{name}", target.title));
      } else {
        const failure = result.results.find((r) => !r.success);
        showToast(t["pdf.deleteFailed"].replace("{error}", failure?.error ?? ""), "error");
      }
    } catch (e) {
      showToast(t["pdf.deleteFailed"].replace("{error}", String(e)), "error");
    }
  };

  const showInFolder = (doc: PdfDocument) => { void window.prism.pdfShowInFolder(doc.id); };

  if (!lib.loaded) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        <Spinner size={22} />
      </div>
    );
  }

  if (!lib.repoPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <BookOpen size={40} strokeWidth={1.2} className="text-faint" />
        <h2 className="text-section font-semibold text-primary">{t["pdf.noRepoTitle"]}</h2>
        <p className="text-body text-muted max-w-md">{t["pdf.noRepoDesc"]}</p>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="primary" size="sm" onClick={() => { void lib.chooseRepo(); }}>
            <FolderOpen size={15} />
            {t["pdf.chooseRepo"]}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            {t["pdf.goSettings"]}
          </Button>
        </div>
      </div>
    );
  }

  if (!lib.repoExists) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertTriangle size={32} className="text-warning" />
        <h2 className="text-section font-semibold text-primary">{t["pdf.repoMissing"]}</h2>
        <p className="text-body text-muted max-w-lg">
          {t["pdf.repoMissingDesc"].replace("{path}", lib.repoPath)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="primary" size="sm" onClick={() => { void lib.rescan(); }}>
            <RefreshCw size={15} />
            {t["pdf.retry"]}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { void lib.chooseRepo(); }}>
            <FolderOpen size={15} />
            {t["pdf.changeRepo"]}
          </Button>
        </div>
      </div>
    );
  }

  const title = selectedCollection ? selectedCollection.name : t["pdf.all"];
  const titleColor = selectedCollection ? resolveTagColor(selectedCollection.name, selectedCollection.color) : null;
  const count = selectedCollection ? selectedCollection.pdfPaths.length : lib.documents.length;

  return (
    <div className="h-full flex">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragState(null)}
      >
        {/* Collections sidebar stays mounted (and interactive) while reading */}
        <div
          className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
            sidebarCollapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
          }`}
        >
          <div className="overflow-hidden min-w-0 h-full flex">
            <PdfCollectionsSidebar
              collections={cols.collections}
              selectedId={cols.selectedId}
              allCount={lib.documents.length}
              onSelect={handleSelectCollection}
              onRename={(id) => setRenameTarget(cols.collections.find((c) => c.id === id) ?? null)}
              onDelete={(id) => setDeleteCollectionTarget(cols.collections.find((c) => c.id === id) ?? null)}
              onSetColor={cols.setCollectionColor}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <PdfTabBar
            tabs={tabs.tabs}
            activePath={tabs.activePath}
            sidebarCollapsed={sidebarCollapsed}
            onSelect={setActivePath}
            onClose={closeTab}
            onReorder={moveTab}
            onNewCollection={() => setShowCreate(true)}
            onToggleSidebar={toggleSidebar}
          />

          <div className="flex-1 min-h-0 relative">
            {/* Library grid — hidden but kept mounted while a tab is reading so
                scroll position and search state survive the round trip */}
            <div
              style={reading ? { position: "absolute", inset: 0, visibility: "hidden" } : { height: "100%" }}
              className="flex flex-col"
            >
              <div className="h-11 px-4 flex items-center gap-2 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {titleColor && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: titleColor.bar }} />
                  )}
                  <span className="min-w-0 text-body font-medium text-primary truncate">{title}</span>
                  <span className="text-caption text-faint tabular-nums flex-shrink-0">{count}</span>
                </div>

                <SearchInput
                  value={lib.search}
                  onChange={lib.setSearch}
                  placeholder={t["pdf.search"]}
                  wrapperClassName="w-80 max-w-[45%] flex-shrink-0"
                />

                <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
                  <Button
                    ref={sortAnchorRef}
                    variant="ghost"
                    size="icon-md"
                    active={sortOpen}
                    onClick={() => setSortOpen((v) => !v)}
                    title={t["pdf.sortLabel"]}
                  >
                    <ArrowUpDown size={16} />
                  </Button>
                  <DropdownMenu
                    open={sortOpen}
                    onClose={() => setSortOpen(false)}
                    anchorRef={sortAnchorRef}
                    align="right"
                  >
                    {[
                      { value: "title", label: t["pdf.sortTitle"] },
                      { value: "added", label: t["pdf.sortAdded"] },
                      { value: "modified", label: t["pdf.sortModified"] },
                      { value: "pages", label: t["pdf.sortPages"] },
                    ].map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        active={lib.sort === option.value}
                        onClick={() => {
                          lib.setSort(option.value as PdfSort);
                          setSortOpen(false);
                        }}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon-md"
                    onClick={lib.toggleSortDir}
                    title={lib.sortDir === "asc" ? t["pdf.sortAsc"] : t["pdf.sortDesc"]}
                  >
                    {lib.sortDir === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-md"
                    onClick={() => { void lib.rescan(); }}
                    title={t["pdf.rescan"]}
                  >
                    <RefreshCw size={16} className={lib.scanning ? "animate-spin" : ""} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-md"
                    onClick={() => { void window.prism.pdfOpenRepo(lib.repoPath); }}
                    title={t["pdf.openRepo"]}
                  >
                    <FolderOpen size={16} />
                  </Button>
                </div>
              </div>

              {lib.limitHit && (
                <div className="px-4 py-1.5 text-caption text-faint">
                  {t["pdf.resultLimitHint"].replace("{count}", String(lib.visible.length))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                <PdfGridView
                  documents={displayed}
                  collections={cols.collections}
                  activeCollection={selectedCollection}
                  loading={lib.scanning}
                  emptyText={
                    lib.search.trim()
                      ? t["pdf.emptySearch"]
                      : selectedCollection
                        ? t["pdf.emptyCollection"]
                        : t["pdf.emptyRepo"]
                  }
                  onOpen={openTab}
                  onAddToCollection={addToCollection}
                  onRemoveFromCollection={(doc) => {
                    if (selectedCollection) cols.removePath(selectedCollection.id, doc.rel_path);
                  }}
                  onDelete={setDeleteDocTarget}
                  onShowInFolder={showInFolder}
                  onDocUpdated={(doc, patch) => lib.patchDocument(doc.id, patch)}
                />
              </div>
            </div>

            {/* One mounted reader per open tab — inactive ones keep their scroll,
                zoom and spread state but release their page canvases */}
            {resolvedTabs.map(({ doc }) => {
              const isActive = activeKey !== null && relKey(doc.rel_path) === activeKey;
              // Must fold in the module's active flag: an explicit
              // visibility:visible here would override the hidden ancestor pane
              // App uses for inactive module tabs.
              const visible = active && isActive;
              return (
                <div
                  key={doc.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    visibility: visible ? "visible" : "hidden",
                  }}
                  className="bg-base"
                >
                  <PdfReader
                    doc={doc}
                    active={visible}
                    onClose={() => setActivePath(null)}
                    onShowInFolder={() => showInFolder(doc)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {dragState?.kind === "doc" && (
            <div className="w-36 rounded-card bg-elevated border border-[var(--accent)] shadow-drag overflow-hidden opacity-95">
              <div className="aspect-[3/4] flex items-center justify-center bg-surface/80 text-faint">
                <BookOpen size={26} strokeWidth={1.3} />
              </div>
              <div className="px-2 py-1.5 text-caption text-primary truncate">{dragState.doc.title}</div>
            </div>
          )}
          {dragState?.kind === "collection" && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: resolveTagColor(dragState.coll.name, dragState.coll.color).bar }}
              />
              <span className="flex-1 text-body text-primary">{dragState.coll.name}</span>
              <span className="text-caption text-muted">{dragState.coll.pdfPaths.length}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showCreate && (
        <CreateCollectionModal
          title={t["pdf.newCollection"]}
          onSave={(name) => {
            cols.createCollection(name);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <RenameModal
        open={renameTarget !== null}
        initialValue={renameTarget?.name ?? ""}
        title={t["collections.rename"]}
        placeholder={t["collections.namePlaceholder"]}
        onClose={() => setRenameTarget(null)}
        onSubmit={(name) => {
          if (renameTarget) cols.renameCollection(renameTarget.id, name);
        }}
      />

      <ConfirmDialog
        open={deleteCollectionTarget !== null}
        message={t["pdf.deleteCollectionConfirm"].replace("{name}", deleteCollectionTarget?.name ?? "")}
        confirmLabel={t["collections.delete"]}
        onConfirm={() => {
          if (deleteCollectionTarget) cols.deleteCollection(deleteCollectionTarget.id);
        }}
        onClose={() => setDeleteCollectionTarget(null)}
      />

      <ConfirmDialog
        open={deleteDocTarget !== null}
        message={t["pdf.trashConfirm"].replace("{name}", deleteDocTarget?.title ?? "")}
        confirmLabel={t["pdf.trash"]}
        onConfirm={confirmDeleteDoc}
        onClose={() => setDeleteDocTarget(null)}
      />
    </div>
  );
}
