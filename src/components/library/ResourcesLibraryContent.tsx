import { useMemo, useRef, useState, type ReactNode } from "react";
import { Edit3, FolderPlus, Link2, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useToast } from "../../lib/toast";
import { useMultiSelect } from "../../lib/useMultiSelect";
import { selectionEdgeAt, type SelectionEdge } from "../../lib/selectionEdge";
import type { PaletteColor } from "../../lib/colors";
import type { Resource, ResourceCollection } from "../../shared/models";
import Button from "../Button";
import Badge from "../Badge";
import BatchActionBar, { type BatchAction } from "../BatchActionBar";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import Input, { Textarea } from "../Input";
import ItemRow from "../ItemRow";
import Modal from "../Modal";
import SearchInput from "../SearchInput";
import SectionCard from "../SectionCard";
import SelectButton from "../SelectButton";
import SelectModeButton from "../SelectModeButton";
import { SkeletonRows } from "../Skeleton";
import SortableList from "../SortableList";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import type { MenuItem } from "../ContextMenu";
import CreateCollectionModal from "../CreateCollectionModal";
import LibraryTitle from "./LibraryTitle";
import { DEFAULT_COLLECTION_ICON } from "../../lib/collectionIcons";
import SearchLimitHint from "./SearchLimitHint";
import { useLibraryData } from "./LibraryDataProvider";

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function isUniqueViolation(error: unknown): boolean {
  return /unique/i.test(String((error as Error)?.message ?? error));
}

function ResourceRowView({
  r,
  collection,
  selecting,
  selected,
  selectionEdge,
  onStartEdit,
  onDelete,
  onToggle,
  colorForCollection,
}: {
  r: Resource;
  collection: ResourceCollection | null;
  selecting: boolean;
  selected: boolean;
  selectionEdge?: SelectionEdge;
  onStartEdit: () => void;
  onDelete: () => void;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
  colorForCollection: (collection: ResourceCollection) => PaletteColor;
}) {
  const { t } = useT();

  const menuItems: MenuItem[] = [
    { label: t["menu.openInBrowser"], icon: <Link2 size={14} />, onClick: () => window.prism.openUrl(r.url) },
    { label: t["menu.edit"], icon: <Edit3 size={14} />, onClick: onStartEdit },
    { label: t["menu.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <ItemRow
      onPrimaryClick={(event) => {
        if (selecting) onToggle(event as React.MouseEvent<HTMLDivElement>);
        else window.prism.openUrl(r.url);
      }}
      selected={selected}
      selectable={selecting}
      checked={selected}
      selectionEdge={selectionEdge}
      menuItems={menuItems}
      tooltip={r.notes ? `${r.title}\n${r.notes}\n${r.url}` : r.url}
      title={
        <>
          {r.title}
          {r.notes && <span className="ml-2 font-normal text-faint">{r.notes}</span>}
        </>
      }
      meta={selecting ? undefined : (
        <>
          <span className="text-caption text-faint truncate flex items-center gap-1 flex-shrink-0 max-w-[160px]">
            <Link2 size={10} />
            {extractDomain(r.url)}
          </span>
          {collection && (
            <span className="hidden md:flex items-center gap-1 flex-shrink-0 max-w-[240px] overflow-hidden">
              <Badge palette={colorForCollection(collection)}>{collection.name}</Badge>
            </span>
          )}
        </>
      )}
    />
  );
}

interface ResourceListHandlers {
  onReorder: (next: Resource[]) => void;
  onStartEdit: (resource: Resource) => void;
  onDelete: (resource: Resource) => void;
  selecting: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelect: (resource: Resource, event: React.MouseEvent<HTMLDivElement>) => void;
  collectionsById: Map<number, ResourceCollection>;
  colorForCollection: (collection: ResourceCollection) => PaletteColor;
}

function ResourceList({ items, handlers }: { items: Resource[]; handlers: ResourceListHandlers }) {
  const {
    onReorder, onStartEdit, onDelete, selecting, selectedIds, onToggleSelect,
    collectionsById, colorForCollection,
  } = handlers;
  const itemKeys = useMemo(() => items.map((resource) => resource.id), [items]);
  return (
    <SortableList
      items={items}
      itemId={(resource) => String(resource.id)}
      onReorder={(from, to) => {
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onReorder(next);
      }}
      renderItem={(resource, index) => (
        <ResourceRowView
          r={resource}
          collection={resource.collectionId === null ? null : collectionsById.get(resource.collectionId) ?? null}
          selecting={selecting}
          selected={selectedIds.has(resource.id)}
          selectionEdge={selectionEdgeAt(itemKeys, index, selectedIds) ?? undefined}
          onStartEdit={() => onStartEdit(resource)}
          onDelete={() => onDelete(resource)}
          onToggle={(event) => onToggleSelect(resource, event)}
          colorForCollection={colorForCollection}
        />
      )}
      renderOverlay={(resource) => (
        <div className="flex items-center gap-2 px-2 py-1.5 text-body text-primary">
          <span className="truncate">{resource.title}</span>
          <span className="ml-auto text-caption text-faint flex-shrink-0">{extractDomain(resource.url)}</span>
        </div>
      )}
    />
  );
}

function ResourceSection({
  title,
  count,
  tintColor,
  collapsed,
  onToggle,
  items,
  handlers,
  className,
}: {
  title: ReactNode;
  count: number;
  tintColor?: PaletteColor;
  collapsed: boolean;
  onToggle: () => void;
  items: Resource[];
  handlers: ResourceListHandlers;
  className?: string;
}) {
  return (
    <SectionCard
      className={className}
      title={title}
      count={count}
      tintColor={tintColor}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <ResourceList items={items} handlers={handlers} />
    </SectionCard>
  );
}

interface ResourceFormValues {
  url: string;
  title: string;
  notes: string;
  collectionId: number | null;
}

function ResourceFields({
  values,
  onChange,
  error,
  collections,
  autoFocusField,
  enterField,
  onEnter,
}: {
  values: ResourceFormValues;
  onChange: (next: ResourceFormValues) => void;
  error: string;
  collections: ResourceCollection[];
  autoFocusField?: "url" | "title";
  enterField?: "url" | "title";
  onEnter?: () => void;
}) {
  const { t } = useT();
  const enterProps = (field: "url" | "title") =>
    enterField === field && onEnter
      ? { onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter") onEnter(); } }
      : {};

  return (
    <div className="space-y-4">
      <div>
        <label className="field-label">{t["resources.urlLabel"]}</label>
        <Input
          type="text"
          value={values.url}
          onChange={(event) => onChange({ ...values, url: event.target.value })}
          placeholder={t["resources.addUrl"]}
          autoFocus={autoFocusField === "url"}
          className="w-full"
          {...enterProps("url")}
        />
      </div>
      <div>
        <label className="field-label">{t["resources.titleLabel"]}</label>
        <Input
          type="text"
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
          placeholder={t["resources.title"]}
          autoFocus={autoFocusField === "title"}
          className="w-full"
          {...enterProps("title")}
        />
      </div>
      <div>
        <label className="field-label">{t["resources.notes"]}</label>
        <Textarea
          value={values.notes}
          onChange={(event) => onChange({ ...values, notes: event.target.value })}
          placeholder={t["resources.notesPlaceholder"]}
          rows={4}
          className="w-full resize-none"
        />
      </div>
      <div>
        <label className="field-label">{t["resources.collectionLabel"]}</label>
        <SelectButton
          value={values.collectionId === null ? "" : String(values.collectionId)}
          options={collections.map((collection) => ({ value: String(collection.id), label: collection.name }))}
          emptyLabel={t["collections.ungrouped"]}
          onChange={(value) => onChange({ ...values, collectionId: value === "" ? null : Number(value) })}
          ariaLabel={t["resources.collectionLabel"]}
          className="w-full"
        />
      </div>
      {error && <p className="text-caption text-danger">{error}</p>}
    </div>
  );
}

export default function ResourcesLibraryContent() {
  const { t } = useT();
  const { values: settings } = useSettings();
  const showToast = useToast();
  const { resourceLib } = useLibraryData();
  const {
    resources,
    collections,
    loaded,
    searchQuery,
    setSearchQuery,
    selectedCollectionId,
    selectedCollection,
    setSelectedCollection,
    colorForCollection,
    collectionGroups,
    collapsedCollections,
    toggleCollectionCollapse,
    addResource,
    updateResource,
    removeResource,
    moveResources,
    createCollection,
    reorderResources,
  } = resourceLib;

  const collectionsById = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections],
  );

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalCollectionId, setModalCollectionId] = useState<number | null>(null);
  const [modalError, setModalError] = useState("");

  // Edit modal state
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCollectionId, setEditCollectionId] = useState<number | null>(null);
  const [editError, setEditError] = useState("");

  // Create collection modal
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Delete confirm state
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Keys follow what is actually on screen: grouped sections in "All", the flat
  // filtered list inside a collection. Shift ranges must match the visual order.
  const orderedResources = useMemo(
    () => (selectedCollectionId !== null
      ? resources
      : [...collectionGroups.groups.flatMap((group) => group.resources), ...collectionGroups.ungrouped]),
    [selectedCollectionId, resources, collectionGroups],
  );
  const resourceSelection = useMultiSelect({
    scopeKey: `${selectedCollectionId ?? ""}|${resourceLib.debouncedQuery}`,
    keys: orderedResources.map((resource) => resource.id),
    containerRef: scrollRef,
  });

  const selectedIds = Array.from(resourceSelection.selected);

  const resourceBatchActions: BatchAction[] = [];
  if (resourceSelection.count > 0) {
    const moveTargets = collections.filter((collection) => collection.id !== selectedCollectionId);
    if (moveTargets.length > 0) {
      resourceBatchActions.push({
        key: "moveToCollection",
        label: t["collections.moveTo"],
        variant: "primary",
        menu: moveTargets.map((collection) => ({
          key: String(collection.id),
          label: collection.name,
          onClick: () => {
            void moveResources(selectedIds, collection.id)
              .then(() => {
                showToast(t["collections.movedBatch"]
                  .replace("{count}", String(selectedIds.length))
                  .replace("{name}", collection.name));
                resourceSelection.clear();
              })
              .catch(() => showToast(t["common.actionFailed"], "error"));
          },
        })),
      });
    }
    resourceBatchActions.push({
      key: "removeFromCollection",
      label: t["collections.removeFrom"],
      onClick: () => {
        void moveResources(selectedIds, null)
          .then(() => {
            showToast(t["collections.removedBatch"].replace("{count}", String(selectedIds.length)));
            resourceSelection.clear();
          })
          .catch(() => showToast(t["common.actionFailed"], "error"));
      },
    });
    resourceBatchActions.push({
      key: "delete",
      label: t["batch.delete"],
      variant: "ghost-danger",
      onClick: () => setBatchDeleteOpen(true),
    });
  }

  const handleBatchDelete = async () => {
    setBatchDeleteOpen(false);
    const ids = Array.from(resourceSelection.selected);
    let failed = 0;
    for (const id of ids) {
      try {
        await removeResource(id);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) showToast(t["common.deleted"]);
    else showToast(t["common.deleteFailed"], "error");
    resourceSelection.exit();
  };

  const handleCreateCollection = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createCollection(trimmed);
    } catch (error) {
      showToast(isUniqueViolation(error) ? t["resources.collectionExists"] : String((error as Error)?.message ?? error), "error");
      return;
    }
    setCreatingCollection(false);
    showToast(t["collections.created"].replace("{name}", trimmed));
  };

  const handleSaveNew = async () => {
    if (!modalUrl.trim()) return;
    const trimmed = modalUrl.trim();
    const normalizedUrl = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(normalizedUrl));
    try {
      await addResource(normalizedUrl, title, modalNotes.trim(), modalCollectionId);
    } catch (error) {
      setModalError(isUniqueViolation(error) ? t["resources.urlExists"] : String((error as Error)?.message ?? error));
      return;
    }
    closeModal();
    showToast(t["resources.added"]);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalUrl("");
    setModalTitle("");
    setModalNotes("");
    setModalCollectionId(selectedCollectionId);
    setModalError("");
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await removeResource(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setDeleting(null);
    showToast(t["common.deleted"]);
  };

  const openEditModal = (resource: Resource) => {
    setEditResource(resource);
    setEditUrl(resource.url);
    setEditTitle(resource.title);
    setEditNotes(resource.notes);
    setEditCollectionId(resource.collectionId);
    setEditError("");
  };

  const closeEditModal = () => {
    setEditResource(null);
    setEditUrl("");
    setEditTitle("");
    setEditNotes("");
    setEditCollectionId(null);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editResource || !editUrl.trim()) return;
    try {
      await updateResource(
        editResource.id,
        editUrl.trim(),
        editTitle.trim() || editUrl,
        editNotes.trim(),
        editCollectionId,
      );
    } catch (error) {
      setEditError(isUniqueViolation(error) ? t["resources.urlExists"] : String((error as Error)?.message ?? error));
      return;
    }
    closeEditModal();
    showToast(t["resources.updated"]);
  };

  // Only the dragged list's rows are reordered; they keep the slots they
  // already occupy in the global order.
  const handleReorder = (next: Resource[]) => {
    void reorderResources(next).catch(() => {
      showToast(t["common.actionFailed"], "error");
    });
  };

  const listHandlers: ResourceListHandlers = {
    onReorder: handleReorder,
    onStartEdit: openEditModal,
    onDelete: setDeleting,
    selecting: resourceSelection.active,
    selectedIds: resourceSelection.selected,
    onToggleSelect: (resource, event) => resourceSelection.toggle(resource.id, { shiftKey: event.shiftKey }),
    collectionsById,
    colorForCollection,
  };

  const titleIcon = selectedCollection
    ? selectedCollection.icon || DEFAULT_COLLECTION_ICON
    : null;
  const headerTitle = selectedCollection ? selectedCollection.name : t["library.allResources"];

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <LibraryTitle
        title={headerTitle}
        icon={titleIcon}
        count={resources.length}
        action={selectedCollection ? (
          <button
            type="button"
            onClick={() => setSelectedCollection(null)}
            className="text-caption text-muted hover:text-secondary"
          >
            {t["library.allResources"]}
          </button>
        ) : undefined}
      />
    ),
    controls: (
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t["resources.search"]}
        wrapperClassName="w-96 max-w-[45vw]"
      />
    ),
    actions: (
      <>
        <SelectModeButton
          active={resourceSelection.active}
          onToggle={resourceSelection.active ? resourceSelection.exit : resourceSelection.enter}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCreatingCollection(true)}
          title={t["resources.newCollection"]}
        >
          <FolderPlus size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => { setModalCollectionId(selectedCollectionId); setShowModal(true); }} title={t["resources.add"]}>
          <Plus size={16} />
        </Button>
      </>
    ),
  }), [
    headerTitle, resourceSelection.active, resourceSelection.enter, resourceSelection.exit,
    resources.length, searchQuery, selectedCollection, selectedCollectionId, setSearchQuery,
    setSelectedCollection, t, titleIcon,
  ]);

  useToolbarContribution("module:library", toolbar);

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden">
      <div ref={scrollRef} tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        {resourceLib.debouncedQuery.trim() && resources.length >= settings.search_result_limit && (
          <SearchLimitHint
            limit={settings.search_result_limit}
            messageKey="vault.resultLimitHint"
          />
        )}
        {!loaded && <SkeletonRows count={8} className="p-3" />}
        {loaded && resources.length === 0 && (
          <EmptyState
            size="module"
            text={searchQuery || selectedCollection ? t["resources.emptySearch"] : t["resources.empty"]}
            cta={!searchQuery && !selectedCollection
              ? { label: t["resources.add"], onClick: () => { setModalCollectionId(null); setShowModal(true); }, icon: <Plus size={14} /> }
              : undefined}
          />
        )}

        {/* Card view (All) */}
        {loaded && selectedCollectionId === null && resources.length > 0 && (
          <div className="p-4">
            {collectionGroups.groups.map(({ collection, resources: items, color }) => (
              <ResourceSection
                key={collection.id}
                className="mb-3"
                title={collection.name}
                count={items.length}
                tintColor={color}
                collapsed={collapsedCollections.has(String(collection.id))}
                onToggle={() => toggleCollectionCollapse(String(collection.id))}
                items={items}
                handlers={listHandlers}
              />
            ))}
            {collectionGroups.ungrouped.length > 0 && (
              <ResourceSection
                className="mb-3"
                title={<span className="uppercase tracking-wide text-secondary">{t["collections.ungrouped"]}</span>}
                count={collectionGroups.ungrouped.length}
                collapsed={collapsedCollections.has("__ungrouped__")}
                onToggle={() => toggleCollectionCollapse("__ungrouped__")}
                items={collectionGroups.ungrouped}
                handlers={listHandlers}
              />
            )}
          </div>
        )}

        {/* Flat list (collection filtered) */}
        {loaded && selectedCollectionId !== null && (
          <div className="p-2">
            <ResourceList items={resources} handlers={listHandlers} />
          </div>
        )}
      </div>

      {resourceSelection.active && (
        <BatchActionBar
          selectedCount={resourceSelection.count}
          actions={resourceBatchActions}
          onSelectAll={resourceSelection.selectAll}
          onExit={resourceSelection.exit}
        />
      )}

      <Modal
        open={showModal}
        title={t["resources.addTitle"]}
        onClose={closeModal}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="sm" onClick={handleSaveNew} disabled={!modalUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <ResourceFields
          values={{ url: modalUrl, title: modalTitle, notes: modalNotes, collectionId: modalCollectionId }}
          onChange={(next) => {
            setModalUrl(next.url);
            setModalTitle(next.title);
            setModalNotes(next.notes);
            setModalCollectionId(next.collectionId);
          }}
          error={modalError}
          collections={collections}
          autoFocusField="url"
          enterField="url"
          onEnter={handleSaveNew}
        />
      </Modal>

      <Modal
        open={editResource !== null}
        title={t["resources.editTitle"]}
        onClose={closeEditModal}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeEditModal}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={!editUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <ResourceFields
          values={{ url: editUrl, title: editTitle, notes: editNotes, collectionId: editCollectionId }}
          onChange={(next) => {
            setEditUrl(next.url);
            setEditTitle(next.title);
            setEditNotes(next.notes);
            setEditCollectionId(next.collectionId);
          }}
          error={editError}
          collections={collections}
          autoFocusField="title"
          enterField="title"
          onEnter={handleSaveEdit}
        />
      </Modal>

      {creatingCollection && (
        <CreateCollectionModal
          title={t["resources.newCollection"]}
          onSave={(name) => { void handleCreateCollection(name); }}
          onClose={() => setCreatingCollection(false)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        message={t["resources.deleteConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        message={t["resources.batchDeleteConfirm"].replace("{count}", String(resourceSelection.count))}
        confirmLabel={t["batch.delete"]}
        onConfirm={handleBatchDelete}
        onClose={() => setBatchDeleteOpen(false)}
      />
    </div>
  );
}
