import { forwardRef, useMemo } from "react";
import { Layers, Frame, Lock, LockOpen } from "lucide-react";
import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { useT } from "../../i18n";
import { useVaultLock } from "../../lib/vaultLock";
import { librarySelectionKey, readLibrarySelection } from "../../lib/librarySelection";
import EmptyState from "../EmptyState";
import Button from "../Button";
import SelectButton from "../SelectButton";
import NavItem from "../NavItem";
import Sidebar from "../Sidebar";
import type { VaultEntry } from "../../types";
import type { LibraryRef } from "../../lib/workspace/types";
import { normalizePath } from "../../lib/workspace/types";
import type { PdfCollectionData } from "../pdf/types";
import type { usePdfCollections } from "../pdf/usePdfCollections";
import type { CollectionData } from "../collectionTypes";
import { useLibraryData } from "./LibraryDataProvider";
import GroupNavRow from "./GroupNavRow";
import CollectionSection from "./CollectionSection";
import ResourceCollectionList from "./ResourceCollectionList";
import { toNoteCollectionGroups, toPdfCollectionGroups, type LibraryGroup } from "./libraryGroups";
import { LIBRARY_SOURCES } from "./librarySources";
import { CANVAS_VIEW_ID, type NoteLibrary } from "./useNoteLibrary";

const LibraryRow = forwardRef<HTMLButtonElement, {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>>(function LibraryRow(
  { icon, label, active, trailing, onClick, onContextMenu, className = "", ...props },
  ref,
) {
  return (
    <NavItem
      ref={ref}
      {...props}
      active={active}
      className={`w-full ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      leading={(
        <span className={`flex-shrink-0 ${active ? "text-[var(--accent-text)]" : "text-muted"}`}>
          {icon}
        </span>
      )}
      label={label}
      trailing={trailing}
    />
  );
});

function CollectionNavRow({
  name,
  icon,
  sortableId,
  dragData,
  dropKind,
  selected,
  index,
  trailing,
  onSelect,
  onRename,
  onDelete,
  onSetIcon,
}: {
  name: string;
  icon?: string;
  sortableId: string;
  dragData: { kind: string; id: string };
  dropKind: string;
  selected: boolean;
  index: number;
  trailing: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetIcon: (icon: string) => void;
}) {
  const { active, over } = useDndContext();
  const isDropTarget = active?.data.current?.kind === dropKind && over?.id === sortableId;
  const sortable = useSortable({
    id: sortableId,
    data: dragData,
  });

  return (
    <GroupNavRow
      name={name}
      icon={icon}
      count={trailing}
      active={selected}
      index={index}
      highlight={isDropTarget}
      sortable={sortable}
      onSelect={onSelect}
      onRename={onRename}
      onDelete={onDelete}
      onSetIcon={onSetIcon}
    />
  );
}

function NoteCollectionRow(props: {
  group: LibraryGroup;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetIcon: (icon: string) => void;
}) {
  const { group } = props;
  return (
    <CollectionNavRow
      name={group.name}
      icon={group.icon}
      sortableId={`coll-${group.id}`}
      dragData={{ kind: "collection", id: group.id }}
      dropKind="note"
      selected={props.selected}
      index={props.index}
      trailing={group.count}
      onSelect={props.onSelect}
      onRename={props.onRename}
      onDelete={props.onDelete}
      onSetIcon={props.onSetIcon}
    />
  );
}

function PdfCollectionRow(props: {
  group: LibraryGroup;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetIcon: (icon: string) => void;
}) {
  const { group } = props;
  return (
    <CollectionNavRow
      name={group.name}
      icon={group.icon}
      sortableId={`pdfcoll-${group.id}`}
      dragData={{ kind: "pdf-collection", id: group.id }}
      dropKind="pdf-doc"
      selected={props.selected}
      index={props.index}
      trailing={group.count}
      onSelect={props.onSelect}
      onRename={props.onRename}
      onDelete={props.onDelete}
      onSetIcon={props.onSetIcon}
    />
  );
}

interface Props {
  vaults: VaultEntry[];
  library: LibraryRef;
  note: NoteLibrary;
  pdfCols: ReturnType<typeof usePdfCollections>;
  pdfAllCount: number;
  onSelectLibrary: (library: LibraryRef) => void;
  onRenameNoteCollection: (collection: CollectionData) => void;
  onDeleteNoteCollection: (collection: CollectionData) => void;
  onRenamePdfCollection: (collection: PdfCollectionData) => void;
  onDeletePdfCollection: (collection: PdfCollectionData) => void;
  onOpenCollections?: () => void;
}

export default function LibrarySidebar({
  vaults,
  library,
  note,
  pdfCols,
  pdfAllCount,
  onSelectLibrary,
  onRenameNoteCollection,
  onDeleteNoteCollection,
  onRenamePdfCollection,
  onDeletePdfCollection,
  onOpenCollections,
}: Props) {
  const { t } = useT();
  const vaultLock = useVaultLock();
  const pdfMode = library.kind === "pdf";
  const resourcesMode = library.kind === "resources";
  const { canvas, resourceLib } = useLibraryData();

  const noteGroups = useMemo(
    () => toNoteCollectionGroups(note.collections),
    [note.collections],
  );
  const pdfGroups = useMemo(
    () => toPdfCollectionGroups(pdfCols.collections),
    [pdfCols.collections],
  );
  const noteIds = useMemo(
    () => noteGroups.map((group) => `coll-${group.id}`),
    [noteGroups],
  );
  const pdfIds = useMemo(
    () => pdfGroups.map((group) => `pdfcoll-${group.id}`),
    [pdfGroups],
  );

  // The selected note vault; PDF/resources modes still keep the note vault in
  // the selector so collections remain scoped to it.
  const activeVaultPath = library.kind === "note" || library.kind === "canvas"
    ? library.vaultPath
    : (note.shownVaultPath || note.vaultPath);
  const vaultOptions = useMemo(
    () => vaults.map((vault) => ({ value: vault.path, label: vault.name })),
    [vaults],
  );
  const currentVault = vaults.find(
    (vault) => normalizePath(vault.path) === normalizePath(activeVaultPath),
  );
  const currentPrivate = currentVault ? vaultLock.isPrivate(currentVault.path) : false;
  const currentLocked = currentPrivate && currentVault
    ? vaultLock.isLocked(currentVault.path)
    : false;

  // Restore the vault's last view: whiteboards or a collection.
  const openVault = async (vault: VaultEntry) => {
    let kind: "note" | "canvas" = "note";
    try {
      const lastView = await readLibrarySelection(librarySelectionKey("note", vault.path));
      if (lastView === CANVAS_VIEW_ID) kind = "canvas";
    } catch {
      // Default to the note view.
    }
    onSelectLibrary({ kind, vaultPath: vault.path });
    onOpenCollections?.();
  };

  // Collections are the web-resources grouping model, so selecting one also
  // points the library at the resources source (the workspace sidebar uses this too).
  const selectResourceCollection = (collectionId: number | null) => {
    onSelectLibrary({ kind: "resources" });
    resourceLib.setSelectedCollection(collectionId);
    onOpenCollections?.();
  };

  return (
    <Sidebar
      fill
      footer={
        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1 text-caption font-medium text-muted">
            {t[LIBRARY_SOURCES.pdf.sectionLabelKey]}
          </div>
          <LibraryRow
            icon={<LIBRARY_SOURCES.pdf.icon size={14} />}
            label={t[LIBRARY_SOURCES.pdf.labelKey]}
            active={library.kind === "pdf"}
            trailing={pdfAllCount}
            onClick={() => {
              onSelectLibrary({ kind: "pdf", repoPath: "" });
              onOpenCollections?.();
            }}
          />
          <LibraryRow
            icon={<LIBRARY_SOURCES.resources.icon size={14} />}
            label={t[LIBRARY_SOURCES.resources.labelKey]}
            active={resourcesMode}
            trailing={resourceLib.totalCount}
            onClick={() => {
              onSelectLibrary({ kind: "resources" });
              onOpenCollections?.();
            }}
          />
        </div>
      }
    >
      <div className="flex items-center gap-1 pb-2">
        <SelectButton
          className="min-w-0 flex-1"
          value={currentVault?.path ?? activeVaultPath}
          options={vaultOptions}
          onChange={(path) => {
            const vault = vaults.find((entry) => normalizePath(entry.path) === normalizePath(path));
            if (vault) void openVault(vault);
          }}
          ariaLabel={t["library.vaultSelect"]}
          placeholder={t["library.vaultSelect"]}
        />
        {currentVault && currentPrivate && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={currentLocked ? t["private.unlock"] : t["private.lockNow"]}
            onClick={() => {
              if (currentLocked) {
                vaultLock.requestUnlock(currentVault.path);
              } else {
                void vaultLock.lock(currentVault.path);
              }
            }}
          >
            {currentLocked ? <Lock size={14} /> : <LockOpen size={14} />}
          </Button>
        )}
      </div>
      {vaults.length === 0 && <EmptyState size="card" text={t["library.emptyVaults"]} />}

      <div
        key={pdfMode
          ? `pdf:${library.kind === "pdf" ? library.repoPath : ""}`
          : resourcesMode
            ? "resources"
            : `note:${note.shownVaultPath || note.vaultPath}`}
        className="-ml-2 flex-shrink min-h-0 overflow-y-auto pl-2 pr-0.5 anim-fade-in"
      >
        {!pdfMode && !resourcesMode && (
          <>
            <NavItem
              onClick={() => {
                onSelectLibrary({ kind: "note", vaultPath: note.vaultPath });
                note.selectCollection(null);
                onOpenCollections?.();
              }}
              active={library.kind === "note" && note.selectedCollectionId === null}
              className="mb-1 font-medium"
              leading={<Layers size={14} />}
              label={t[LIBRARY_SOURCES.note.allLabelKey]}
              trailing={note.sortedNotes.length}
            />
            {note.vaultPath && (
              <NavItem
                onClick={() => {
                  note.selectCanvasView();
                  onSelectLibrary({ kind: "canvas", vaultPath: note.vaultPath });
                  onOpenCollections?.();
                }}
                active={library.kind === "canvas"}
                className="mb-1 font-medium"
                leading={<Frame size={14} />}
                label={t[LIBRARY_SOURCES.canvas.labelKey]}
                trailing={canvas.files.length}
              />
            )}
            <CollectionSection ids={noteIds} emptyText={t["collections.emptyHint"]}>
              {noteGroups.map((group, index) => (
                <NoteCollectionRow
                  key={group.id}
                  group={group}
                  selected={library.kind === "note" && note.selectedCollectionId === group.id}
                  index={index}
                  onSelect={() => {
                    onSelectLibrary({ kind: "note", vaultPath: note.vaultPath });
                    note.selectCollection(group.id);
                    note.setSearchQuery("");
                    onOpenCollections?.();
                  }}
                  onRename={() => onRenameNoteCollection(group.source)}
                  onDelete={() => onDeleteNoteCollection(group.source)}
                  onSetIcon={(icon) => note.handleSetCollectionIcon(group.id, icon)}
                />
              ))}
            </CollectionSection>
          </>
        )}

        {resourcesMode && (
          <ResourceCollectionList resourceLib={resourceLib} onSelectCollection={selectResourceCollection} />
        )}

        {pdfMode && (
          <>
            <NavItem
              onClick={() => { pdfCols.selectCollection(null); onOpenCollections?.(); }}
              active={pdfCols.selectedId === null}
              className="mb-1 font-medium"
              leading={<Layers size={14} />}
              label={t[LIBRARY_SOURCES.pdf.allLabelKey]}
              trailing={pdfAllCount}
            />
            <CollectionSection ids={pdfIds} emptyText={t["collections.emptyHint"]}>
              {pdfGroups.map((group, index) => (
                <PdfCollectionRow
                  key={group.id}
                  group={group}
                  selected={pdfCols.selectedId === group.id}
                  index={index}
                  onSelect={() => { pdfCols.selectCollection(group.id); onOpenCollections?.(); }}
                  onRename={() => onRenamePdfCollection(group.source)}
                  onDelete={() => onDeletePdfCollection(group.source)}
                  onSetIcon={(icon) => pdfCols.setCollectionIcon(group.id, icon)}
                />
              ))}
            </CollectionSection>
          </>
        )}
      </div>
    </Sidebar>
  );
}
