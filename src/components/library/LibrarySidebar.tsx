import { forwardRef, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Frame, Lock, LockOpen, Palette } from "lucide-react";
import { useDndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { useVaultLock } from "../../lib/vaultLock";
import { librarySelectionKey, readLibrarySelection } from "../../lib/librarySelection";
import { VAULT_ICON_PRESETS, VaultIcon } from "../../lib/vaultIcons";
import type { MenuItem } from "../ContextMenu";
import EmptyState from "../EmptyState";
import Modal from "../Modal";
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
import ResourceTagList from "./ResourceTagList";
import { toNoteCollectionGroups, toPdfCollectionGroups, type LibraryGroup } from "./libraryGroups";
import { LIBRARY_SOURCES } from "./librarySources";
import { CANVAS_VIEW_ID, type NoteLibrary } from "./useNoteLibrary";

const SECTION_KEY = "prism_library_sections";

function readSection(name: "libraries" | "collections"): boolean {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[name] !== false;
  } catch {
    return true;
  }
}

function saveSection(name: "libraries" | "collections", open: boolean) {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed[name] = open;
    localStorage.setItem(SECTION_KEY, JSON.stringify(parsed));
  } catch {
    // Non-fatal UI preference
  }
}

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex-shrink-0 flex items-center gap-1 px-2 pt-3 pb-1.5 text-caption font-medium text-muted hover:text-secondary cursor-pointer"
    >
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span className="truncate">{label}</span>
    </button>
  );
}

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

function SortableVaultRow(props: {
  vault: VaultEntry;
  icon: React.ReactNode;
  active: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const { vault, ...row } = props;
  const sortable = useSortable({
    id: `vault-${vault.path}`,
    data: { kind: "vault", id: vault.path },
  });
  const clickGuard = useDragClickGuard(sortable.isDragging);
  return (
    <LibraryRow
      ref={sortable.setNodeRef}
      label={vault.name}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
      }}
      {...sortable.attributes}
      {...sortable.listeners}
      {...clickGuard}
      {...row}
    />
  );
}


function CollectionNavRow({
  name,
  color,
  sortableId,
  dragData,
  dropKind,
  selected,
  index,
  trailing,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: {
  name: string;
  color?: string;
  sortableId: string;
  dragData: { kind: string; id: string };
  dropKind: string;
  selected: boolean;
  index: number;
  trailing: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (color: string) => void;
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
      color={color}
      count={trailing}
      active={selected}
      index={index}
      highlight={isDropTarget}
      sortable={sortable}
      onSelect={onSelect}
      onRename={onRename}
      onDelete={onDelete}
      onSetColor={onSetColor}
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
  onSetColor: (color: string) => void;
}) {
  const { group } = props;
  return (
    <CollectionNavRow
      name={group.name}
      color={group.color}
      sortableId={`coll-${group.id}`}
      dragData={{ kind: "collection", id: group.id }}
      dropKind="note"
      selected={props.selected}
      index={props.index}
      trailing={group.count}
      onSelect={props.onSelect}
      onRename={props.onRename}
      onDelete={props.onDelete}
      onSetColor={props.onSetColor}
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
  onSetColor: (color: string) => void;
}) {
  const { group } = props;
  return (
    <CollectionNavRow
      name={group.name}
      color={group.color}
      sortableId={`pdfcoll-${group.id}`}
      dragData={{ kind: "pdf-collection", id: group.id }}
      dropKind="pdf-doc"
      selected={props.selected}
      index={props.index}
      trailing={group.count}
      onSelect={props.onSelect}
      onRename={props.onRename}
      onDelete={props.onDelete}
      onSetColor={props.onSetColor}
    />
  );
}

function CollectionSection({
  ids,
  emptyText,
  children,
}: {
  ids: string[];
  emptyText: string;
  children: React.ReactNode;
}) {
  if (ids.length === 0) return <EmptyState size="card" text={emptyText} />;
  return (
    <div className="sidebar-group">
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
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
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const vaultLock = useVaultLock();
  const [librariesOpen, setLibrariesOpen] = useState(() => readSection("libraries"));
  const [collectionsOpen, setCollectionsOpen] = useState(() => readSection("collections"));
  const [iconTarget, setIconTarget] = useState<VaultEntry | null>(null);
  const pdfMode = library.kind === "pdf";
  const resourcesMode = library.kind === "resources";
  const { canvas, resourceLib } = useLibraryData();

  const applyVaultIcon = async (vaultPath: string, icon: string) => {
    const updated = vaults.map((vault) =>
      normalizePath(vault.path) === normalizePath(vaultPath) ? { ...vault, icon } : vault,
    );
    try {
      await window.prism.setSetting("vault_paths", JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("vaults-changed"));
      setIconTarget(null);
    } catch {
      showToast(t["library.vaultIconFailed"], "error");
    }
  };

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
  const vaultIds = useMemo(
    () => vaults.map((vault) => `vault-${vault.path}`),
    [vaults],
  );

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

  // Tags are the web-resources grouping model, so selecting one also points the
  // library at the resources source (the workspace sidebar uses this too).
  const selectResourceTag = (tag: string | null) => {
    onSelectLibrary({ kind: "resources" });
    resourceLib.setActiveTag(tag);
    onOpenCollections?.();
  };

  const toggleLibraries = () => {
    setLibrariesOpen((open) => {
      saveSection("libraries", !open);
      return !open;
    });
  };
  const toggleCollections = () => {
    setCollectionsOpen((open) => {
      saveSection("collections", !open);
      return !open;
    });
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
      <SectionHeader
        label={t[LIBRARY_SOURCES.note.sectionLabelKey]}
        open={librariesOpen}
        onToggle={toggleLibraries}
      />
      {librariesOpen && (
        <div className="flex-shrink-0 max-h-[17rem] overflow-y-auto pr-0.5">
          {vaults.length === 0 && <EmptyState size="card" text={t["library.emptyVaults"]} />}
          <div className="sidebar-group">
            <SortableContext items={vaultIds} strategy={verticalListSortingStrategy}>
              {vaults.map((vault) => {
                const privateVault = vaultLock.isPrivate(vault.path);
                const locked = vaultLock.isLocked(vault.path);
                const menuItems: MenuItem[] = [];
                if (privateVault) {
                  menuItems.push(locked
                    ? {
                        label: t["private.unlock"],
                        icon: <LockOpen size={14} />,
                        onClick: () => { void openVault(vault); },
                      }
                    : {
                        label: t["private.lockNow"],
                        icon: <Lock size={14} />,
                        onClick: () => { void vaultLock.lock(vault.path); },
                      });
                }
                menuItems.push({
                  label: t["library.vaultIcon"],
                  icon: <Palette size={14} />,
                  onClick: () => setIconTarget(vault),
                });
                return (
                  <SortableVaultRow
                    key={vault.path}
                    vault={vault}
                    icon={<VaultIcon name={vault.icon} size={14} />}
                    active={(library.kind === "note" || library.kind === "canvas")
                      && normalizePath(library.vaultPath) === normalizePath(vault.path)}
                    trailing={privateVault
                      ? (
                        <span title={locked ? t["private.lockedBadge"] : t["private.unlock"]}>
                          {locked ? <Lock size={11} /> : <LockOpen size={11} />}
                        </span>
                      )
                      : undefined}
                    // Locked vaults still open here — the content pane renders
                    // the unlock card.
                    onClick={() => { void openVault(vault); }}
                    onContextMenu={(event) => onContextMenu(event, menuItems)}
                  />
                );
              })}
            </SortableContext>
          </div>
        </div>
      )}

      <SectionHeader
        label={t[resourcesMode ? LIBRARY_SOURCES.resources.groupLabelKey : LIBRARY_SOURCES.note.groupLabelKey]}
        open={collectionsOpen}
        onToggle={toggleCollections}
      />
      {collectionsOpen && (
        <div
          key={pdfMode
            ? `pdf:${library.kind === "pdf" ? library.repoPath : ""}`
            : resourcesMode
              ? "resources"
              : `note:${note.shownVaultPath || note.vaultPath}`}
          className="flex-shrink min-h-0 overflow-y-auto pr-0.5 anim-fade-in"
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
                    onSetColor={(color) => note.handleSetCollectionColor(group.id, color)}
                  />
                ))}
              </CollectionSection>
            </>
          )}

          {resourcesMode && (
            <ResourceTagList resourceLib={resourceLib} onSelectTag={selectResourceTag} />
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
                    onSetColor={(color) => pdfCols.setCollectionColor(group.id, color)}
                  />
                ))}
              </CollectionSection>
            </>
          )}
        </div>
      )}

      <Modal
        open={iconTarget !== null}
        onClose={() => setIconTarget(null)}
        title={t["library.vaultIcon"]}
        icon={Palette}
        size="sm"
      >
        <div className="grid grid-cols-6 gap-2">
          {VAULT_ICON_PRESETS.map(({ id, Icon }) => {
            const current = (iconTarget?.icon ?? "library") === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { if (iconTarget) void applyVaultIcon(iconTarget.path, id); }}
                className={`w-10 h-10 flex items-center justify-center rounded-control border transition-colors cursor-pointer ${
                  current
                    ? "accent-ring border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]"
                    : "border-line text-secondary hover:bg-elevated/60 hover:text-primary"
                }`}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </Modal>
    </Sidebar>
  );
}
