import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { makeNoteDoc, normalizePath, type DocTab } from "../../lib/workspace/types";
import { useLibraryData } from "../library/LibraryDataProvider";
import { usePdfDocuments } from "../pdf/PdfDocumentsProvider";
import { relKey } from "../pdf/types";
import PdfReader from "../pdf/PdfReader";
import NoteEditor from "../editor/NoteEditor";
import { resolveNoteTarget } from "../editor/linkResolver";
import Button from "../Button";
import Spinner from "../Spinner";

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
  const { openDoc, closeDoc, openInSplit, closeSplit, setLibrary, showModule } = useWorkspace();

  // Jump to the collection that owns this document (or "all" when it belongs
  // to none) and drop the tab. The library is normally already synced to the
  // document's vault/repo; the guards keep a cold or mid-switch library from
  // writing a selection into the wrong one.
  const backToLibrary = () => {
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
    return (
      <div className="h-full min-w-0 flex flex-col" onMouseDown={onFocus}>
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
          onOpenWikilink={(target) => { void openWikilink(tab.vaultPath, target); }}
        />
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
    </div>
  );
}
