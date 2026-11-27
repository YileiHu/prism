import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  BookOpen,
  FolderOpen,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makePdfDoc, pdfDocId } from "../../lib/workspace/types";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import LibraryTitle from "./LibraryTitle";
import { DEFAULT_COLLECTION_ICON } from "../../lib/collectionIcons";
import SearchLimitHint from "./SearchLimitHint";
import Button from "../Button";
import BatchActionBar, { type BatchAction } from "../BatchActionBar";
import ConfirmDialog from "../ConfirmDialog";
import { DropdownMenu, DropdownMenuItem } from "../DropdownMenu";
import EmptyState from "../EmptyState";
import SearchInput from "../SearchInput";
import SelectModeButton from "../SelectModeButton";
import Spinner from "../Spinner";
import { useMultiSelect } from "../../lib/useMultiSelect";
import PdfGridView from "../pdf/PdfGridView";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import type { usePdfCollections } from "../pdf/usePdfCollections";
import { relKey, type PdfDocument, type PdfSort } from "../pdf/types";

interface Props {
  cols: ReturnType<typeof usePdfCollections>;
  onOpenSettings: () => void;
  onNewCollection: () => void;
}

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export default function PdfLibraryContent({
  cols,
  onOpenSettings,
  onNewCollection,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const pdf = usePdfDocuments();
  const { openDoc, removeDocs } = useWorkspace();
  const [deleteDocTarget, setDeleteDocTarget] = useState<PdfDocument | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const sortAnchorRef = useRef<HTMLButtonElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const selectedCollection = cols.selected;

  // Drop collection membership for paths the last scan no longer returns.
  useEffect(() => {
    if (!pdf.loaded || !pdf.repoExists || !cols.loaded) return;
    if (pdf.documents.length === 0) return;
    if (relKey(pdf.documents[0].repoPath) !== relKey(pdf.repoPath)) return;
    const valid = new Set(pdf.documents.map((doc) => relKey(doc.relPath)));
    const removed = cols.pruneMissing(valid);
    if (removed > 0) {
      showToast(t["pdf.collectionRemovedMissing"].replace("{count}", String(removed)));
    }
  }, [pdf.documents, pdf.loaded, pdf.repoExists, pdf.repoPath, cols, showToast, t]);

  const displayed = useMemo(() => {
    if (!selectedCollection) return pdf.visible;
    const keys = new Set(selectedCollection.pdfPaths.map(relKey));
    return pdf.visible.filter((doc) => keys.has(relKey(doc.relPath)));
  }, [pdf.visible, selectedCollection]);

  const openPdf = (doc: PdfDocument) => {
    openDoc(makePdfDoc(pdf.repoPath, doc.relPath, doc.title));
  };

  const pdfSelection = useMultiSelect({
    scopeKey: `pdf|${pdf.repoPath}|${selectedCollection?.id ?? ""}|${pdf.search}`,
    keys: displayed.map((doc) => doc.id),
    containerRef: gridScrollRef,
  });

  const pdfBatchActions: BatchAction[] = [];
  if (pdfSelection.count > 0) {
    const moveTargets = cols.collections.filter((collection) => collection.id !== selectedCollection?.id);
    if (moveTargets.length > 0) {
      pdfBatchActions.push({
        key: "moveToCollection",
        label: t["collections.moveTo"],
        variant: "primary",
        menu: moveTargets.map((collection) => ({
          key: collection.id,
          label: collection.name,
          onClick: () => {
            const relPaths = displayed
              .filter((doc) => pdfSelection.isSelected(doc.id))
              .map((doc) => doc.relPath);
            cols.movePaths(collection.id, relPaths);
            showToast(t["collections.movedBatch"].replace("{count}", String(relPaths.length)).replace("{name}", collection.name));
            pdfSelection.clear();
          },
        })),
      });
    }
    pdfBatchActions.push({
      key: "removeFromCollection",
      label: t["collections.removeFrom"],
      onClick: () => {
        const relPaths = displayed
          .filter((doc) => pdfSelection.isSelected(doc.id))
          .map((doc) => doc.relPath);
        cols.removePathsFromAll(relPaths);
        showToast(t["collections.removedBatch"].replace("{count}", String(relPaths.length)));
        pdfSelection.clear();
      },
    });
    pdfBatchActions.push({
      key: "delete",
      label: t["pdf.trash"],
      variant: "ghost-danger",
      onClick: () => {
        const targets = displayed.filter((doc) => pdfSelection.isSelected(doc.id));
        if (targets.length === 0) return;
        setConfirm({
          message: t["vault.batchDeleteConfirm"].replace("{count}", String(targets.length)),
          confirmLabel: t["pdf.trash"],
          onConfirm: async () => {
            try {
              const result = await pdf.removeDocuments(targets.map((doc) => doc.id));
              const succeededIds = new Set(
                result.results.filter((entry) => entry.success).map((entry) => entry.id),
              );
              const removed = targets.filter((doc) => succeededIds.has(doc.id));
              if (removed.length > 0) {
                removeDocs(removed.map((doc) => pdfDocId(pdf.repoPath, doc.relPath)));
                showToast(t["batch.deleted"].replace("{count}", String(removed.length)));
              }
              const failed = targets.length - removed.length;
              if (failed > 0) {
                showToast(t["batch.deleteFailed"].replace("{count}", String(failed)), "error");
              }
            } catch (error) {
              showToast(t["pdf.deleteFailed"].replace("{error}", String(error)), "error");
            }
            pdfSelection.exit();
          },
        });
      },
    });
  }

  const confirmDeleteDoc = async () => {
    if (!deleteDocTarget) return;
    const target = deleteDocTarget;
    setDeleteDocTarget(null);
    try {
      const result = await pdf.removeDocuments([target.id]);
      if (result.allSuccess) {
        removeDocs([pdfDocId(pdf.repoPath, target.relPath)]);
        showToast(t["pdf.trashed"].replace("{name}", target.title));
      } else {
        const failure = result.results.find((entry) => !entry.success);
        showToast(t["pdf.deleteFailed"].replace("{error}", failure?.error ?? ""), "error");
      }
    } catch (error) {
      showToast(t["pdf.deleteFailed"].replace("{error}", String(error)), "error");
    }
  };

  const title = selectedCollection ? selectedCollection.name : t["pdf.all"];
  const titleIcon = selectedCollection
    ? selectedCollection.icon || DEFAULT_COLLECTION_ICON
    : null;
  const count = selectedCollection ? selectedCollection.pdfPaths.length : pdf.documents.length;

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: <LibraryTitle title={title} icon={titleIcon} count={count} />,
    controls: (
      <>
        <SearchInput
          value={pdf.search}
          onChange={pdf.setSearch}
          placeholder={t["pdf.search"]}
          wrapperClassName="w-80"
        />
        <Button
          ref={sortAnchorRef}
          variant="ghost"
          size="icon-sm"
          active={sortOpen}
          onClick={() => setSortOpen((value) => !value)}
          title={t["pdf.sortLabel"]}
        >
          <ArrowUpDown size={15} />
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
              active={pdf.sort === option.value}
              onClick={() => {
                pdf.setSort(option.value as PdfSort);
                setSortOpen(false);
              }}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={pdf.toggleSortDir}
          title={pdf.sortDir === "asc" ? t["pdf.sortAsc"] : t["pdf.sortDesc"]}
        >
          {pdf.sortDir === "asc" ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
        </Button>
      </>
    ),
    actions: (
      <>
        <SelectModeButton
          active={pdfSelection.active}
          onToggle={pdfSelection.active ? pdfSelection.exit : pdfSelection.enter}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { void pdf.rescan(); }}
          title={t["pdf.rescan"]}
        >
          <RefreshCw size={15} className={pdf.scanning ? "animate-spin" : ""} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNewCollection}
          title={t["pdf.newCollection"]}
        >
          <FolderPlus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { void window.prism.openPdfRepo(pdf.repoPath); }}
          title={t["pdf.openRepo"]}
        >
          <FolderOpen size={15} />
        </Button>
      </>
    ),
  }), [
    count, onNewCollection, pdf, pdfSelection.active, pdfSelection.enter, pdfSelection.exit,
    titleIcon, sortOpen, t, title,
  ]);

  useToolbarContribution("module:library", toolbar);

  if (!pdf.loaded) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        <Spinner size={22} />
      </div>
    );
  }

  if (!pdf.repoPath) {
    return (
      <EmptyState
        size="module"
        fill
        icon={<BookOpen size={40} strokeWidth={1.2} className="text-faint" />}
        title={t["pdf.noRepoTitle"]}
        description={t["pdf.noRepoDesc"]}
        actions={<>
          <Button variant="primary" size="sm" onClick={() => { void pdf.chooseRepo(); }}>
            <FolderOpen size={15} />
            {t["pdf.chooseRepo"]}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            {t["pdf.goSettings"]}
          </Button>
        </>}
      />
    );
  }

  if (!pdf.repoExists) {
    return (
      <EmptyState
        size="module"
        fill
        icon={<AlertTriangle size={32} className="text-warning" />}
        title={t["pdf.repoMissing"]}
        description={t["pdf.repoMissingDesc"].replace("{path}", pdf.repoPath)}
        actions={<>
          <Button variant="primary" size="sm" onClick={() => { void pdf.rescan(); }}>
            <RefreshCw size={15} />
            {t["pdf.retry"]}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { void pdf.chooseRepo(); }}>
            <FolderOpen size={15} />
            {t["pdf.changeRepo"]}
          </Button>
        </>}
      />
    );
  }

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden">
      {pdf.limitHit && (
        <SearchLimitHint limit={pdf.visible.length} messageKey="pdf.resultLimitHint" />
      )}
      <div ref={gridScrollRef} tabIndex={-1} className="flex-1 overflow-y-auto p-4 focus:outline-none">
        <PdfGridView
          scrollRef={gridScrollRef}
          documents={displayed}
          collections={cols.collections}
          activeCollection={selectedCollection}
          loading={pdf.scanning}
          selecting={pdfSelection.active}
          selectedIds={pdfSelection.selected}
          onToggleSelect={(doc, event) => pdfSelection.toggle(doc.id, { shiftKey: event.shiftKey })}
          emptyText={
            pdf.search.trim()
              ? t["pdf.emptySearch"]
              : selectedCollection
                ? t["pdf.emptyCollection"]
                : t["pdf.emptyRepo"]
          }
          onOpen={openPdf}
          onMoveToCollection={(doc, collectionId) => {
            const target = cols.collections.find((collection) => collection.id === collectionId);
            if (!target) return;
            cols.movePaths(collectionId, [doc.relPath]);
            showToast(t["collections.moved"].replace("{name}", target.name));
          }}
          onRemoveFromCollection={(doc) => {
            if (selectedCollection) cols.removePath(selectedCollection.id, doc.relPath);
          }}
          onDelete={setDeleteDocTarget}
          onShowInFolder={(doc) => { void window.prism.showPdfInFolder(doc.id); }}
          onDocUpdated={(doc, patch) => pdf.patchDocument(doc.id, patch)}
        />
      </div>

      {pdfSelection.active && (
        <BatchActionBar
          selectedCount={pdfSelection.count}
          actions={pdfBatchActions}
          onSelectAll={pdfSelection.selectAll}
          onExit={pdfSelection.exit}
        />
      )}

      <ConfirmDialog
        open={deleteDocTarget !== null}
        message={t["pdf.trashConfirm"].replace("{name}", deleteDocTarget?.title ?? "")}
        confirmLabel={t["pdf.trash"]}
        onConfirm={confirmDeleteDoc}
        onClose={() => setDeleteDocTarget(null)}
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
