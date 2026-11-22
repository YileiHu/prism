import { useMemo, useState } from "react";
import { LockKeyhole, LockOpen } from "lucide-react";
import { DndContext } from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { libraryVaultPath, normalizePath, type LibraryRef } from "../../lib/workspace/types";
import { useSidebarCollapsed } from "../../lib/sidebarState";
import CreateCollectionModal from "../CreateCollectionModal";
import EmptyState from "../EmptyState";
import { useVaultLock } from "../../lib/vaultLock";
import Button from "../Button";
import Input from "../Input";
import Spinner from "../Spinner";
import { useLibraryData } from "./LibraryDataProvider";
import LibrarySidebar from "./LibrarySidebar";
import { ModuleSidebar } from "../AppSidebarSlot";
import NoteLibraryContent from "./NoteLibraryContent";
import PdfLibraryContent from "./PdfLibraryContent";
import CanvasLibraryContent from "./CanvasLibraryContent";
import ResourcesLibraryContent from "./ResourcesLibraryContent";
import CollectionDialogs from "./CollectionDialogs";
import { useNotePdfDialogs } from "./useNotePdfDialogs";
import LibraryDragOverlay from "./LibraryDragOverlay";
import { useLibraryDnd } from "./useLibraryDnd";

interface Props {
  active: boolean;
  onOpenSettings: () => void;
}

function LockedVault({ vaultPath, vaultName }: { vaultPath: string; vaultName: string }) {
  const { t } = useT();
  const { unlock } = useVaultLock();
  const name = vaultName || vaultPath.split(/[\\/]/).filter(Boolean).pop() || vaultPath;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      await unlock(vaultPath, password);
    } catch (e) {
      setError(String(e).includes("BAD_PASSWORD") ? t["private.wrongPassword"] : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex-1 flex items-center justify-center px-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="w-80 max-w-full flex flex-col gap-3 p-6 bg-surface rounded-card border border-line/60 shadow-popover"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <LockKeyhole size={28} strokeWidth={1.4} className="text-faint" />
          <p className="text-body text-primary font-medium">{t["private.lockedTitle"]}</p>
          <p className="text-caption text-tertiary">
            {t["private.lockedDesc"].replace("{name}", name)}
          </p>
        </div>
        <Input
          type="password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(""); }}
          placeholder={t["private.passwordPlaceholder"]}
          className="w-full"
          disabled={busy}
          autoComplete="current-password"
          autoFocus
        />
        {error && <p className="text-caption text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="sm" className="w-full" disabled={busy || !password}>
          {busy ? <Spinner size={14} /> : <LockOpen size={14} />}
          {busy ? t["private.unlocking"] : t["private.unlockToOpen"]}
        </Button>
      </form>
    </div>
  );
}

export default function LibraryView({ active, onOpenSettings }: Props) {
  const { t } = useT();
  const { state: workspace, setLibrary } = useWorkspace();
  const { vaults, note, pdf, pdfCols, pdfMode, canvasMode, resourcesMode } = useLibraryData();
  const vaultLock = useVaultLock();
  const noteVaultPath = note.vaultPath;
  const sidebarCollapsed = useSidebarCollapsed();
  const activeVaultPath = libraryVaultPath(workspace.library);
  const activeLocked = activeVaultPath !== "" && vaultLock.isLocked(activeVaultPath);

  const dnd = useLibraryDnd({
    vaults,
    note,
    pdfDocuments: pdf.documents,
    pdfCols,
  });
  const [pdfCreateOpen, setPdfCreateOpen] = useState(false);
  const {
    openNoteRename,
    openNoteDelete,
    openPdfRename,
    openPdfDelete,
    noteDialogProps,
    pdfDialogProps,
  } = useNotePdfDialogs(note, pdfCols);

  const selectLibrary = (library: LibraryRef) => {
    setLibrary(library);
  };

  // The vault whose data is on screen; during a warm switch this stays on the
  // previous vault until the new data commits.
  const shownVaultPath = note.shownVaultPath || noteVaultPath;

  const content = useMemo(() => {
    if (activeLocked) {
      return (
        <LockedVault
          vaultPath={activeVaultPath}
          vaultName={vaults.find((vault) => normalizePath(vault.path) === normalizePath(activeVaultPath))?.name ?? ""}
        />
      );
    }
    if (resourcesMode) {
      return <ResourcesLibraryContent />;
    }
    if (canvasMode) {
      return <CanvasLibraryContent />;
    }
    if (!pdfMode) {
      if (!noteVaultPath) {
        return (
          <div className="h-full flex-1 flex items-center justify-center">
            <EmptyState size="module" text={t["library.emptyVaults"]} />
          </div>
        );
      }
      return (
        <NoteLibraryContent
          lib={note}
          vaultName={vaults.find((vault) => normalizePath(vault.path) === normalizePath(shownVaultPath))?.name ?? ""}
        />
      );
    }
    return (
      <PdfLibraryContent
        cols={pdfCols}
        onOpenSettings={onOpenSettings}
        onNewCollection={() => setPdfCreateOpen(true)}
      />
    );
  }, [
    activeLocked, activeVaultPath, canvasMode, noteVaultPath, note, onOpenSettings, pdfCols, pdfMode,
    resourcesMode, shownVaultPath, sidebarCollapsed, t, vaults,
  ]);

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      autoScroll={dnd.drag?.kind !== "note"}
      onDragStart={dnd.handleDragStart}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <div className="h-full flex">
        <ModuleSidebar active={active}>
          <div
            className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
              sidebarCollapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
            }`}
          >
            <div className="overflow-hidden min-w-0 h-full flex">
              <LibrarySidebar
                vaults={vaults}
                library={workspace.library}
                note={note}
                pdfCols={pdfCols}
                pdfAllCount={pdf.documents.length}
                onSelectLibrary={selectLibrary}
                onRenameNoteCollection={openNoteRename}
                onDeleteNoteCollection={openNoteDelete}
                onRenamePdfCollection={openPdfRename}
                onDeletePdfCollection={openPdfDelete}
              />
            </div>
          </div>
        </ModuleSidebar>
        <div
          key={pdfMode
            ? `pdf:${workspace.library.kind === "pdf" ? workspace.library.repoPath : ""}`
            : resourcesMode
              ? "resources"
              : `${canvasMode ? "canvas" : "note"}:${shownVaultPath}`}
          className="flex-1 min-w-0 flex anim-fade-in"
        >
          {content}
        </div>
      </div>

      <LibraryDragOverlay drag={dnd.drag} />

      <CollectionDialogs {...noteDialogProps} />

      {pdfCreateOpen && (
        <CreateCollectionModal
          title={t["pdf.newCollection"]}
          onSave={(name) => {
            pdfCols.createCollection(name);
            setPdfCreateOpen(false);
          }}
          onClose={() => setPdfCreateOpen(false)}
        />
      )}
      <CollectionDialogs {...pdfDialogProps} />
    </DndContext>
  );
}
