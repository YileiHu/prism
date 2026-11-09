import { lazy, Suspense } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makeCanvasDoc, makeNoteDoc, makePdfDoc, normalizePath, type DocTab } from "../../lib/workspace/types";
import { useLibraryData } from "../library/LibraryDataProvider";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import { relKey } from "../pdf/types";
import { toRelativePath } from "../useCollections";
import { resolveNoteTarget } from "../editor/linkResolver";
import type { EmbedOpenTarget } from "../embeds/model";
import Button from "../Button";
import Spinner from "../Spinner";

// Heavy document stacks load with the first tab of their kind: CodeMirror +
// Markdown/KaTeX for notes, pdf.js for PDFs, React Flow for canvases.
const CanvasEditor = lazy(() => import("../canvas/CanvasEditor"));
const NoteEditor = lazy(() => import("../editor/NoteEditor"));
const PdfReader = lazy(() => import("../pdf/PdfReader"));

function PaneFallback() {
  return (
    <div className="h-full flex items-center justify-center text-muted">
      <Spinner size={20} />
    </div>
  );
}

interface Props {
  tab: DocTab;
  focused: boolean;
  visible: boolean;
  toolbarScope: string;
  splitOpen: boolean;
  onFocus: () => void;
}

export default function DocumentPane({
  tab,
  focused,
  visible,
  toolbarScope,
  splitOpen,
  onFocus,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const pdf = usePdfDocuments();
  const { note, pdfCols } = useLibraryData();
  const { openDoc, updateDoc, closeDoc, openInSplit, closeSplit, setLibrary, showModule } = useWorkspace();

  // Jump to the collection that owns this document (or "all" when it belongs
  // to none) and drop the tab. The library is normally already synced to the
  // document's vault/repo; the guards keep a cold or mid-switch library from
  // writing a selection into the wrong one.
  const backToLibrary = () => {
    if (tab.kind === "canvas") {
      setLibrary({ kind: "canvas", vaultPath: tab.vaultPath });
      closeDoc(tab.id);
      showModule("library");
      return;
    }
    if (tab.kind === "note") {
      setLibrary({ kind: "note", vaultPath: tab.vaultPath });
      if (normalizePath(note.vaultPath) === normalizePath(tab.vaultPath) && note.initialLoadDone) {
        note.setSearchQuery("");
        note.selectCollection(note.findCollectionForNote(tab.path));
      }
    } else {
      setLibrary({ kind: "pdf", repoPath: tab.repoPath });
      if (normalizePath(pdf.repoPath) === normalizePath(tab.repoPath) && pdfCols.loaded) {
        pdfCols.selectCollection(pdfCols.findCollectionForPath(tab.relPath));
      }
    }
    closeDoc(tab.id);
    showModule("library");
  };

  const toggleSplit = () => {
    if (splitOpen) closeSplit();
    else openInSplit(tab.id);
  };

  const close = () => closeDoc(tab.id);

  const openWikilink = async (vaultPath: string, target: string) => {
    const notes = await window.prism.getNoteList(vaultPath);
    const found = resolveNoteTarget(target, vaultPath, notes);
    if (found) {
      openDoc(makeNoteDoc(vaultPath, found.path, found.title));
      return;
    }
    const title = target.split("#")[0].trim().replace(/\.md$/i, "");
    if (!title) return;
    if (/\.\w{1,5}$/i.test(target) && !/\.md$/i.test(target)) return;
    try {
      const created = await window.prism.createNote(vaultPath, title);
      openDoc(makeNoteDoc(vaultPath, created.path, created.title));
      showToast(t["editor.linkNoteCreated"].replace("{name}", created.title));
    } catch {
      showToast(t["editor.linkNoteFailed"], "error");
    }
  };

  if (tab.kind === "note") {
    const openEmbed = (target: EmbedOpenTarget) => {
      if (target.kind === "canvas") {
        openDoc(makeCanvasDoc(tab.vaultPath, target.path, target.title));
        return;
      }
      if (target.kind === "note") {
        openDoc(makeNoteDoc(tab.vaultPath, target.path, target.title));
        return;
      }
      if (target.kind === "pdf") {
        openDoc(makePdfDoc(target.repoPath, target.relPath, target.title));
        return;
      }
      void window.prism.openUrl(target.url);
    };
    // The file already moved on disk; keep the tab and this vault's collection
    // entries pointing at the new path/title.
    const handleNoteRenamed = (newPath: string, newTitle: string) => {
      if (normalizePath(note.vaultPath) === normalizePath(tab.vaultPath) && note.initialLoadDone) {
        note.updateNotePaths(
          toRelativePath(tab.path, tab.vaultPath),
          toRelativePath(newPath, tab.vaultPath),
        );
        void note.loadNotes();
      }
      updateDoc(tab.id, { path: newPath, title: newTitle });
    };
    return (
      <div className="h-full min-w-0 flex flex-col" onMouseDown={onFocus}>
        <Suspense fallback={<PaneFallback />}>
          <NoteEditor
            key={tab.id}
            vaultPath={tab.vaultPath}
            notePath={tab.path}
            title={tab.title}
            focused={focused}
            toolbarScope={toolbarScope}
            splitOpen={splitOpen}
            onToggleSplit={toggleSplit}
            onBackToLibrary={backToLibrary}
            onClose={close}
            onNoteGone={close}
            onNoteRenamed={handleNoteRenamed}
            onOpenWikilink={(target) => { void openWikilink(tab.vaultPath, target); }}
            onOpenEmbed={openEmbed}
          />
        </Suspense>
      </div>
    );
  }

  if (tab.kind === "canvas") {
    // React Flow writes `visibility: visible` inline on each node, which
    // defeats the workspace's ancestor visibility:hidden. Hide the branch with
    // display:none so minimap/nodes cannot bleed onto other modules.
    return (
      <div
        className={`h-full min-w-0 flex flex-col ${visible ? "" : "hidden"}`}
        onMouseDown={onFocus}
      >
        <Suspense
          fallback={(
            <div className="h-full flex items-center justify-center text-muted">
              <Spinner size={20} />
            </div>
          )}
        >
          <CanvasEditor
            key={tab.id}
            vaultPath={tab.vaultPath}
            canvasPath={tab.path}
            title={tab.title}
            focused={focused}
            toolbarScope={toolbarScope}
            splitOpen={splitOpen}
            onToggleSplit={toggleSplit}
            onBackToLibrary={backToLibrary}
            onClose={close}
            onOpenTarget={(target) => {
              if (target.kind === "note") {
                openDoc(makeNoteDoc(tab.vaultPath, target.path, target.title));
                return;
              }
              if (target.kind === "canvas") {
                openDoc(makeCanvasDoc(tab.vaultPath, target.path, target.title));
                return;
              }
              if (target.kind === "pdf") {
                const current = pdf.documents.find(
                  (entry) => relKey(entry.relPath) === relKey(target.relPath),
                );
                const repoPath = current?.repoPath ?? target.repoPath;
                if (!repoPath) {
                  showToast(t["pdf.reader.missing"], "error");
                  return;
                }
                openDoc(makePdfDoc(repoPath, target.relPath, target.title));
                return;
              }
              void window.prism.openUrl(target.url);
            }}
          />
        </Suspense>
      </div>
    );
  }

  const doc = pdf.documents.find((entry) => relKey(entry.relPath) === relKey(tab.relPath)) ?? null;

  if (!doc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8" onMouseDown={onFocus}>
        {!pdf.loaded ? (
          <Spinner size={20} className="text-muted" />
        ) : (
          <>
            <p className="text-body text-secondary">{t["pdf.reader.missing"]}</p>
            <Button variant="secondary" size="sm" onClick={close}>
              {t["editor.closeTab"]}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full min-w-0" onMouseDown={onFocus}>
      <Suspense fallback={<PaneFallback />}>
        <PdfReader
          key={tab.id}
          doc={doc}
          active={visible}
          focused={focused}
          toolbarScope={toolbarScope}
          splitOpen={splitOpen}
          onToggleSplit={toggleSplit}
          onBackToLibrary={backToLibrary}
          onClose={close}
          onShowInFolder={() => { void window.prism.showPdfInFolder(doc.id); }}
        />
      </Suspense>
    </div>
  );
}
