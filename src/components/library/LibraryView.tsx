import { useCallback, useMemo, useState } from "react";
import { BookOpen, LockKeyhole, LockOpen } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import { normalizePath, type LibraryRef } from "../../lib/workspace/types";
import { useSidebarCollapsed } from "../../lib/sidebarState";
import { resolveTagColor } from "../../lib/colors";
import ConfirmDialog from "../ConfirmDialog";
import CreateCollectionModal from "../CreateCollectionModal";
import EmptyState from "../EmptyState";
import RenameModal from "../RenameModal";
import { relKey, type PdfCollectionData } from "../pdf/types";
import type { CollectionData } from "../collectionTypes";
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

function CollectionDragPreview({ name, color, count }: { name: string; color?: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: resolveTagColor(name, color).bar }}
      />
      <span className="flex-1 text-body text-primary">{name}</span>
      <span className="text-caption text-muted">{count}</span>
    </div>
  );
}

type DragState =
  | { kind: "note"; title: string; count: number }
  | { kind: "note-collection"; collection: CollectionData }
  | { kind: "pdf-doc"; title: string }
  | { kind: "pdf-collection"; collection: PdfCollectionData }
  | null;

export default function LibraryView({ active, onOpenSettings }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { state: workspace, setLibrary } = useWorkspace();
  const { vaults, note, pdf, pdfCols, pdfMode, canvasMode } = useLibraryData();
  const vaultLock = useVaultLock();
  const noteVaultPath = note.vaultPath;
  const sidebarCollapsed = useSidebarCollapsed();
  const activeVaultPath = workspace.library.kind === "pdf" ? "" : workspace.library.vaultPath;
  const activeLocked = activeVaultPath !== "" && vaultLock.isLocked(activeVaultPath);

  const [drag, setDrag] = useState<DragState>(null);
  const [noteRenameTarget, setNoteRenameTarget] = useState<CollectionData | null>(null);
  const [noteDeleteTarget, setNoteDeleteTarget] = useState<CollectionData | null>(null);
  const [pdfCreateOpen, setPdfCreateOpen] = useState(false);
  const [pdfRenameTarget, setPdfRenameTarget] = useState<PdfCollectionData | null>(null);
  const [pdfDeleteTarget, setPdfDeleteTarget] = useState<PdfCollectionData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const kind = args.active.data.current?.kind;
    if (kind === "note" || kind === "pdf-doc") return pointerWithin(args);
    return closestCenter(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.kind === "note") {
      const paths = Array.isArray(data.paths) ? data.paths as string[] : [];
      setDrag({ kind: "note", title: String(data.title ?? ""), count: paths.length });
    } else if (data?.kind === "collection") {
      const collection = note.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "note-collection", collection });
    } else if (data?.kind === "pdf-doc") {
      const doc = pdf.documents.find((entry) => entry.id === data.id);
      if (doc) setDrag({ kind: "pdf-doc", title: doc.title });
    } else if (data?.kind === "pdf-collection") {
      const collection = pdfCols.collections.find((entry) => entry.id === data.id);
      if (collection) setDrag({ kind: "pdf-collection", collection });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDrag(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current;
    const overId = String(over.id);

    if (data?.kind === "note") {
      if (!overId.startsWith("coll-")) return;
      const paths = Array.isArray(data.paths) ? data.paths as string[] : [];
      if (paths.length > 0) note.handleDropNote(overId.slice(5), paths);
      return;
    }
    if (data?.kind === "collection") {
      if (!overId.startsWith("coll-") || active.id === over.id) return;
      const from = note.collections.findIndex((entry) => `coll-${entry.id}` === active.id);
      const to = note.collections.findIndex((entry) => `coll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) note.handleReorderCollections(from, to);
      return;
    }
    if (data?.kind === "pdf-doc") {
      if (!overId.startsWith("pdfcoll-")) return;
      const doc = pdf.documents.find((entry) => entry.id === data.id);
      const collection = pdfCols.collections.find((entry) => entry.id === overId.slice(8));
      if (doc && collection) {
        const added = pdfCols.addPaths(collection.id, [doc.relPath]);
        showToast(added > 0
          ? t["pdf.addToCollectionDone"].replace("{name}", collection.name)
          : t["collections.alreadyExists"]);
      }
      return;
    }
    if (data?.kind === "pdf-collection") {
      if (!overId.startsWith("pdfcoll-") || active.id === over.id) return;
      const from = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === active.id);
      const to = pdfCols.collections.findIndex((entry) => `pdfcoll-${entry.id}` === overId);
      if (from !== -1 && to !== -1) pdfCols.reorderCollections(from, to);
    }
  };

  const selectLibrary = (library: LibraryRef) => {
    setLibrary(library);
  };

  const confirmDeleteNoteCollection = () => {
    if (!noteDeleteTarget) return;
    const target = noteDeleteTarget;
    setNoteDeleteTarget(null);
    const snapshot = note.collections;
    const previousSelected = note.selectedCollectionId;
    const { collName, onConfirm } = note.handleDeleteCollection(target.id);
    onConfirm();
    showToast(t["collections.deleted"].replace("{name}", collName), {
      action: {
        label: t["common.undo"],
        onClick: () => note.restoreCollections(snapshot, previousSelected),
      },
    });
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
    shownVaultPath, sidebarCollapsed, t, vaults,
  ]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={drag?.kind !== "note"}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
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
                onRenameNoteCollection={setNoteRenameTarget}
                onDeleteNoteCollection={setNoteDeleteTarget}
                onRenamePdfCollection={setPdfRenameTarget}
                onDeletePdfCollection={setPdfDeleteTarget}
              />
            </div>
          </div>
        </ModuleSidebar>
        <div
          key={pdfMode
            ? `pdf:${workspace.library.kind === "pdf" ? workspace.library.repoPath : ""}`
            : `${canvasMode ? "canvas" : "note"}:${shownVaultPath}`}
          className="flex-1 min-w-0 flex anim-fade-in"
        >
          {content}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {drag?.kind === "note" && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-card bg-elevated border border-[var(--accent)] shadow-drag opacity-90">
            <span className="text-body text-primary whitespace-nowrap">
              {drag.count > 1
                ? t["collections.dragNotes"].replace("{count}", String(drag.count))
                : drag.title}
            </span>
          </div>
        )}
        {drag?.kind === "note-collection" && (
          <CollectionDragPreview
            name={drag.collection.name}
            color={drag.collection.color}
            count={drag.collection.notePaths.length}
          />
        )}
        {drag?.kind === "pdf-doc" && (
          <div className="w-36 rounded-card bg-elevated border border-[var(--accent)] shadow-drag overflow-hidden opacity-95">
            <div className="aspect-[3/4] flex items-center justify-center bg-surface text-faint">
              <BookOpen size={26} strokeWidth={1.3} />
            </div>
            <div className="px-2 py-1.5 text-caption text-primary truncate">{drag.title}</div>
          </div>
        )}
        {drag?.kind === "pdf-collection" && (
          <CollectionDragPreview
            name={drag.collection.name}
            color={drag.collection.color}
            count={drag.collection.pdfPaths.length}
          />
        )}
      </DragOverlay>

      <RenameModal
        open={noteRenameTarget !== null}
        initialValue={noteRenameTarget?.name ?? ""}
        title={t["collections.rename"]}
        placeholder={t["collections.namePlaceholder"]}
        onClose={() => setNoteRenameTarget(null)}
        onSubmit={(name) => {
          if (noteRenameTarget) {
            note.handleRenameCollection(noteRenameTarget, name);
            setNoteRenameTarget(null);
            showToast(t["collections.renamed"]);
          }
        }}
      />
      <ConfirmDialog
        open={noteDeleteTarget !== null}
        message={t["collections.deleteConfirm"]}
        confirmLabel={t["collections.delete"]}
        onConfirm={confirmDeleteNoteCollection}
        onClose={() => setNoteDeleteTarget(null)}
      />

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
      <RenameModal
        open={pdfRenameTarget !== null}
        initialValue={pdfRenameTarget?.name ?? ""}
        title={t["collections.rename"]}
        placeholder={t["collections.namePlaceholder"]}
        onClose={() => setPdfRenameTarget(null)}
        onSubmit={(name) => {
          if (pdfRenameTarget) pdfCols.renameCollection(pdfRenameTarget.id, name);
        }}
      />
      <ConfirmDialog
        open={pdfDeleteTarget !== null}
        message={t["pdf.deleteCollectionConfirm"].replace("{name}", pdfDeleteTarget?.name ?? "")}
        confirmLabel={t["collections.delete"]}
        onConfirm={() => {
          if (pdfDeleteTarget) pdfCols.deleteCollection(pdfDeleteTarget.id);
        }}
        onClose={() => setPdfDeleteTarget(null)}
      />
    </DndContext>
  );
}
