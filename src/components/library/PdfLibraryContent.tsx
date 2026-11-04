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
import { resolveTagColor } from "../../lib/colors";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import { DropdownMenu, DropdownMenuItem } from "../DropdownMenu";
import SearchInput from "../SearchInput";
import Spinner from "../Spinner";
import PdfGridView from "../pdf/PdfGridView";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import type { usePdfCollections } from "../pdf/usePdfCollections";
import { relKey, type PdfDocument, type PdfSort } from "../pdf/types";

interface Props {
  cols: ReturnType<typeof usePdfCollections>;
  onOpenSettings: () => void;
  onNewCollection: () => void;
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
  const [sortOpen, setSortOpen] = useState(false);
  const sortAnchorRef = useRef<HTMLButtonElement>(null);
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
  const titleColor = selectedCollection
    ? resolveTagColor(selectedCollection.name, selectedCollection.color)
    : null;
  const count = selectedCollection ? selectedCollection.pdfPaths.length : pdf.documents.length;

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
    count, onNewCollection, pdf, searchColor(titleColor),
    sortOpen, t, title,
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
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <BookOpen size={40} strokeWidth={1.2} className="text-faint" />
        <h2 className="text-section font-semibold text-primary">{t["pdf.noRepoTitle"]}</h2>
        <p className="text-body text-muted max-w-md">{t["pdf.noRepoDesc"]}</p>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="primary" size="sm" onClick={() => { void pdf.chooseRepo(); }}>
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

  if (!pdf.repoExists) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
        <AlertTriangle size={32} className="text-warning" />
        <h2 className="text-section font-semibold text-primary">{t["pdf.repoMissing"]}</h2>
        <p className="text-body text-muted max-w-lg">
          {t["pdf.repoMissingDesc"].replace("{path}", pdf.repoPath)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="primary" size="sm" onClick={() => { void pdf.rescan(); }}>
            <RefreshCw size={15} />
            {t["pdf.retry"]}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { void pdf.chooseRepo(); }}>
            <FolderOpen size={15} />
            {t["pdf.changeRepo"]}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden">
      {pdf.limitHit && (
        <div className="px-4 py-1.5 text-caption text-faint">
          {t["pdf.resultLimitHint"].replace("{count}", String(pdf.visible.length))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        <PdfGridView
          documents={displayed}
          collections={cols.collections}
          activeCollection={selectedCollection}
          loading={pdf.scanning}
          emptyText={
            pdf.search.trim()
              ? t["pdf.emptySearch"]
              : selectedCollection
                ? t["pdf.emptyCollection"]
                : t["pdf.emptyRepo"]
          }
          onOpen={openPdf}
          onAddToCollection={(doc, collectionId) => {
            const target = cols.collections.find((collection) => collection.id === collectionId);
            const added = cols.addPaths(collectionId, [doc.relPath]);
            if (!target) return;
            showToast(
              added > 0
                ? t["pdf.addToCollectionDone"].replace("{name}", target.name)
                : t["collections.alreadyExists"],
            );
          }}
          onRemoveFromCollection={(doc) => {
            if (selectedCollection) cols.removePath(selectedCollection.id, doc.relPath);
          }}
          onDelete={setDeleteDocTarget}
          onShowInFolder={(doc) => { void window.prism.showPdfInFolder(doc.id); }}
          onDocUpdated={(doc, patch) => pdf.patchDocument(doc.id, patch)}
        />
      </div>

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

// Element identity for a palette color keeps the toolbar memo honest.
function searchColor(color: { bar: string } | null): string {
  return color?.bar ?? "";
}
