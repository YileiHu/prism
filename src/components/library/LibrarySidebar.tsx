import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Layers, Frame, Palette, Pencil, Trash2 } from "lucide-react";
import { useDndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import { VAULT_ICON_PRESETS, VaultIcon } from "../../lib/vaultIcons";
import { buildColorMenuItem } from "../ColorPicker";
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

function LibraryRow({
  icon,
  label,
  active,
  trailing,
  onClick,
  onContextMenu,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`w-full flex items-center gap-1.5 px-3 py-2 text-body transition-colors rounded-control cursor-pointer ${
        active
          ? "bg-[var(--sidebar-item-active)] text-primary font-medium"
          : "text-secondary hover:text-primary hover:bg-[var(--sidebar-item-hover)]"
      }`}
    >
      <span className={`flex-shrink-0 ${active ? "text-[var(--accent-text)]" : "text-muted"}`}>{icon}</span>
      <span className="flex-1 min-w-0 text-body truncate text-left">{label}</span>
      {trailing !== undefined && <span className="text-caption text-faint flex-shrink-0">{trailing}</span>}
    </div>
  );
}

function NoteCollectionRow({
  collection,
  selected,
  index,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: {
  collection: CollectionData;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (color: string) => void;
}) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const { active, over } = useDndContext();
  const id = `coll-${collection.id}`;
  const isDropTarget = active?.data.current?.kind === "note" && over?.id === id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { kind: "collection", id: collection.id },
  });
  const clickGuard = useDragClickGuard(isDragging);
  const total = collection.notePaths.length
    + (collection.groups?.reduce((sum, group) => sum + group.notePaths.length, 0) ?? 0);
  const menuItems: MenuItem[] = [
    buildColorMenuItem(t, {
      label: t["collections.color"],
      autoLabel: t["collections.colorAuto"],
      autoSource: collection.name,
      current: collection.color,
      onSelect: onSetColor,
    }),
    { label: t["collections.rename"], icon: <Pencil size={14} />, onClick: onRename },
    { label: t["collections.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <NavItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        "--i": Math.min(index, 10),
      } as React.CSSProperties}
      {...attributes}
      {...listeners}
      {...clickGuard}
      active={selected}
      className={`group cursor-pointer stagger-fade ${
        isDropTarget ? "ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-muted)]" : ""
      }`}
      onClick={onSelect}
      onContextMenu={(event) => onContextMenu(event, menuItems)}
      leading={(
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: resolveTagColor(collection.name, collection.color).bar }}
        />
      )}
      label={collection.name}
      trailing={total}
    />
  );
}

function PdfCollectionRow({
  collection,
  selected,
  index,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: {
  collection: PdfCollectionData;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (color: string) => void;
}) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const { active, over } = useDndContext();
  const id = `pdfcoll-${collection.id}`;
  const isDropTarget = active?.data.current?.kind === "pdf-doc" && over?.id === id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { kind: "pdf-collection", id: collection.id },
  });
  const clickGuard = useDragClickGuard(isDragging);
  const menuItems: MenuItem[] = [
    buildColorMenuItem(t, {
      label: t["collections.color"],
      autoLabel: t["collections.colorAuto"],
      autoSource: collection.name,
      current: collection.color,
      onSelect: onSetColor,
    }),
    { label: t["collections.rename"], icon: <Pencil size={14} />, onClick: onRename },
    { label: t["collections.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <NavItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        "--i": Math.min(index, 10),
      } as React.CSSProperties}
      {...attributes}
      {...listeners}
      {...clickGuard}
      active={selected}
      className={`group cursor-pointer stagger-fade ${
        isDropTarget ? "ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-muted)]" : ""
      }`}
      onClick={onSelect}
      onContextMenu={(event) => onContextMenu(event, menuItems)}
      leading={(
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: resolveTagColor(collection.name, collection.color).bar }}
        />
      )}
      label={collection.name}
      trailing={collection.pdfPaths.length}
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
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const [librariesOpen, setLibrariesOpen] = useState(() => readSection("libraries"));
  const [collectionsOpen, setCollectionsOpen] = useState(() => readSection("collections"));
  const [iconTarget, setIconTarget] = useState<VaultEntry | null>(null);
  const pdfMode = library.kind === "pdf";
  const { canvas } = useLibraryData();

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

  const noteIds = useMemo(
    () => note.collections.map((collection) => `coll-${collection.id}`),
    [note.collections],
  );
  const pdfIds = useMemo(
    () => pdfCols.collections.map((collection) => `pdfcoll-${collection.id}`),
    [pdfCols.collections],
  );

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
    <Sidebar fill>
      <SectionHeader label={t["nav.library"]} open={librariesOpen} onToggle={toggleLibraries} />
      {librariesOpen && (
        <div className="flex-shrink-0 max-h-[17rem] overflow-y-auto pr-0.5">
          {vaults.length === 0 && <EmptyState size="card" text={t["library.emptyVaults"]} />}
          {vaults.map((vault) => (
            <LibraryRow
              key={vault.path}
              icon={<VaultIcon name={vault.icon} size={14} />}
              label={vault.name}
              active={(library.kind === "note" || library.kind === "canvas")
                && normalizePath(library.vaultPath) === normalizePath(vault.path)}
              onClick={async () => {
                // Restore the vault's last view: whiteboards or a collection.
                let kind: "note" | "canvas" = "note";
                try {
                  const lastView = await window.prism.getSetting(`last_coll_${vault.path}`);
                  if (lastView === CANVAS_VIEW_ID) kind = "canvas";
                } catch {
                  // Default to the note view.
                }
                onSelectLibrary({ kind, vaultPath: vault.path });
                onOpenCollections?.();
              }}
              onContextMenu={(event) => onContextMenu(event, [
                {
                  label: t["library.vaultIcon"],
                  icon: <Palette size={14} />,
                  onClick: () => setIconTarget(vault),
                },
              ])}
            />
          ))}
          <LibraryRow
            icon={<BookOpen size={14} />}
            label={t["library.pdfLibrary"]}
            active={library.kind === "pdf"}
            trailing={pdfAllCount}
            onClick={() => {
              onSelectLibrary({ kind: "pdf", repoPath: "" });
              onOpenCollections?.();
            }}
          />
        </div>
      )}

      <SectionHeader label={t["library.collections"]} open={collectionsOpen} onToggle={toggleCollections} />
      {collectionsOpen && (
        <div
          key={pdfMode
            ? `pdf:${library.kind === "pdf" ? library.repoPath : ""}`
            : `note:${note.shownVaultPath || note.vaultPath}`}
          className="flex-shrink min-h-0 overflow-y-auto pr-0.5 anim-fade-in"
        >
          {!pdfMode && (
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
                label={t["collections.allNotes"]}
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
                  label={t["canvas.section"]}
                  trailing={canvas.files.length}
                />
              )}
              {note.collections.length === 0 ? (
                <EmptyState size="card" text={t["collections.emptyHint"]} />
              ) : (
                <div className="sidebar-group">
                  <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
                    {note.collections.map((collection, index) => (
                      <NoteCollectionRow
                        key={collection.id}
                        collection={collection}
                        selected={library.kind === "note" && note.selectedCollectionId === collection.id}
                        index={index}
                        onSelect={() => {
                          onSelectLibrary({ kind: "note", vaultPath: note.vaultPath });
                          note.selectCollection(collection.id);
                          note.setSearchQuery("");
                          onOpenCollections?.();
                        }}
                        onRename={() => onRenameNoteCollection(collection)}
                        onDelete={() => onDeleteNoteCollection(collection)}
                        onSetColor={(color) => note.handleSetCollectionColor(collection.id, color)}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}
            </>
          )}

          {pdfMode && (
            <>
              <NavItem
                onClick={() => { pdfCols.selectCollection(null); onOpenCollections?.(); }}
                active={pdfCols.selectedId === null}
                className="mb-1 font-medium"
                leading={<Layers size={14} />}
                label={t["pdf.all"]}
                trailing={pdfAllCount}
              />
              {pdfCols.collections.length === 0 ? (
                <EmptyState size="card" text={t["collections.emptyHint"]} />
              ) : (
                <div className="sidebar-group">
                  <SortableContext items={pdfIds} strategy={verticalListSortingStrategy}>
                    {pdfCols.collections.map((collection, index) => (
                      <PdfCollectionRow
                        key={collection.id}
                        collection={collection}
                        selected={pdfCols.selectedId === collection.id}
                        index={index}
                        onSelect={() => { pdfCols.selectCollection(collection.id); onOpenCollections?.(); }}
                        onRename={() => onRenamePdfCollection(collection)}
                        onDelete={() => onDeletePdfCollection(collection)}
                        onSetColor={(color) => pdfCols.setCollectionColor(collection.id, color)}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}
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
