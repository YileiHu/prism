import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Edit3, Link2, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useToast } from "../../lib/toast";
import type { PaletteColor } from "../../lib/colors";
import type { Resource, TagInfo } from "../../shared/models";
import Button from "../Button";
import Badge from "../Badge";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import Input, { Textarea } from "../Input";
import ItemRow from "../ItemRow";
import Modal from "../Modal";
import SearchInput from "../SearchInput";
import SectionCard from "../SectionCard";
import { SkeletonRows } from "../Skeleton";
import SortableList from "../SortableList";
import TagInput from "../TagInput";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import type { MenuItem } from "../ContextMenu";
import LibraryTitle from "./LibraryTitle";
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
  onOpenTag,
  onStartEdit,
  onDelete,
  colorForTag,
  flat,
}: {
  r: Resource;
  onOpenTag: (tag: string) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  colorForTag: (name: string) => PaletteColor;
  flat?: boolean;
}) {
  const { t } = useT();

  const menuItems: MenuItem[] = [
    { label: t["menu.openInBrowser"], icon: <ExternalLink size={14} />, onClick: () => window.prism.openUrl(r.url) },
    { label: t["menu.edit"], icon: <Edit3 size={14} />, onClick: onStartEdit },
    { label: t["menu.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <ItemRow
      variant="list"
      className={flat ? "border-b border-line/30" : "rounded-control"}
      onPrimaryClick={() => window.prism.openUrl(r.url)}
      menuItems={menuItems}
      tooltip={r.notes ? `${r.title}\n${r.notes}\n${r.url}` : r.url}
      title={
        <>
          {r.title}
          {r.notes && <span className="ml-2 font-normal text-faint">{r.notes}</span>}
        </>
      }
      meta={
        <>
          <button
            onClick={(event) => { event.stopPropagation(); window.prism.openUrl(r.url); }}
            className="text-caption text-faint hover:text-tertiary truncate flex items-center gap-1 flex-shrink-0 max-w-[160px]"
          >
            <Link2 size={10} />
            {extractDomain(r.url)}
          </button>
          {r.tags.length > 0 && (
            <span className="hidden md:flex items-center gap-1 flex-shrink-0 max-w-[240px] overflow-hidden">
              {r.tags.slice(0, 3).map((tag) => {
                const color = colorForTag(tag);
                return (
                  <Badge
                    key={tag}
                    palette={color}
                    onClick={(event) => { event.stopPropagation(); onOpenTag(tag); }}
                    className="cursor-pointer hover:opacity-80"
                  >
                    {tag}
                  </Badge>
                );
              })}
              {r.tags.length > 3 && <span className="text-meta text-faint">+{r.tags.length - 3}</span>}
            </span>
          )}
        </>
      }
    />
  );
}

interface ResourceListHandlers {
  onReorder: (next: Resource[]) => void;
  onOpenTag: (tag: string) => void;
  onStartEdit: (resource: Resource) => void;
  onDelete: (resource: Resource) => void;
  colorForTag: (name: string) => PaletteColor;
}

function ResourceList({ items, flat, handlers }: { items: Resource[]; flat?: boolean; handlers: ResourceListHandlers }) {
  const { onReorder, onOpenTag, onStartEdit, onDelete, colorForTag } = handlers;
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
      renderItem={(resource) => (
        <ResourceRowView
          r={resource}
          flat={flat}
          onOpenTag={onOpenTag}
          onStartEdit={() => onStartEdit(resource)}
          onDelete={() => onDelete(resource)}
          colorForTag={colorForTag}
        />
      )}
      renderOverlay={(resource) => (
        <div className="flex items-center gap-2 px-3 py-1.5 text-body text-primary">
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
  headerActions,
  items,
  handlers,
  className,
}: {
  title: ReactNode;
  count: number;
  tintColor?: PaletteColor;
  collapsed: boolean;
  onToggle: () => void;
  headerActions?: ReactNode;
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
      headerActions={headerActions}
    >
      <ResourceList items={items} handlers={handlers} />
    </SectionCard>
  );
}

interface ResourceFormValues {
  url: string;
  title: string;
  notes: string;
  tags: string[];
}

function ResourceFields({
  values,
  onChange,
  error,
  suggestions,
  colorForTag,
  autoFocusField,
  enterField,
  onEnter,
}: {
  values: ResourceFormValues;
  onChange: (next: ResourceFormValues) => void;
  error: string;
  suggestions: TagInfo[];
  colorForTag: (name: string) => PaletteColor;
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
        <label className="field-label">{t["resources.tagsLabel"]}</label>
        <TagInput
          tags={values.tags}
          onChange={(tags) => onChange({ ...values, tags })}
          suggestions={suggestions}
          placeholder={t["resources.tags"]}
          colorForTag={colorForTag}
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
    tags,
    loaded,
    searchQuery,
    setSearchQuery,
    activeTag,
    setActiveTag,
    colorForTag,
    tagGroups,
    collapsedTags,
    toggleTagCollapse,
    addResource,
    updateResource,
    removeResource,
    reorderResources,
  } = resourceLib;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalTags, setModalTags] = useState<string[]>([]);
  const [modalError, setModalError] = useState("");

  // Edit modal state
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editError, setEditError] = useState("");

  // Delete confirm state
  const [deleting, setDeleting] = useState<Resource | null>(null);

  const handleSaveNew = async () => {
    if (!modalUrl.trim()) return;
    const trimmed = modalUrl.trim();
    const normalizedUrl = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(normalizedUrl));
    try {
      await addResource(normalizedUrl, title, modalTags, modalNotes.trim());
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
    setModalTags([]);
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
    setEditTags([...resource.tags]);
    setEditError("");
  };

  const closeEditModal = () => {
    setEditResource(null);
    setEditUrl("");
    setEditTitle("");
    setEditNotes("");
    setEditTags([]);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editResource || !editUrl.trim()) return;
    try {
      await updateResource(
        editResource.id,
        editUrl.trim(),
        editTitle.trim() || editUrl,
        editTags,
        editNotes.trim(),
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
    onOpenTag: setActiveTag,
    onStartEdit: openEditModal,
    onDelete: setDeleting,
    colorForTag,
  };

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <LibraryTitle
        title={activeTag ?? t["library.resourcesLibrary"]}
        color={activeTag ? colorForTag(activeTag) : null}
        count={resources.length}
        action={activeTag ? (
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className="text-caption text-muted hover:text-secondary"
          >
            {t["resources.allTags"]}
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
      <Button variant="ghost" size="icon-sm" onClick={() => setShowModal(true)} title={t["resources.add"]}>
        <Plus size={16} />
      </Button>
    ),
  }), [activeTag, colorForTag, resources.length, searchQuery, setActiveTag, setSearchQuery, t]);

  useToolbarContribution("module:library", toolbar);

  return (
    <div className="h-full flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
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
            text={searchQuery || activeTag ? t["resources.emptySearch"] : t["resources.empty"]}
            cta={!searchQuery && !activeTag
              ? { label: t["resources.add"], onClick: () => setShowModal(true), icon: <Plus size={14} /> }
              : undefined}
          />
        )}

        {/* Card view (All) */}
        {loaded && !activeTag && resources.length > 0 && (
          <div className="p-4">
            {tagGroups.groups.map(({ tag, resources: items, color }) => (
              <ResourceSection
                key={tag}
                className="mb-3"
                title={tag}
                count={items.length}
                tintColor={color}
                collapsed={collapsedTags.has(tag)}
                onToggle={() => toggleTagCollapse(tag)}
                headerActions={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(event) => { event.stopPropagation(); setActiveTag(tag); }}
                    title={tag}
                    aria-label={tag}
                    className="!text-faint hover:!text-tertiary"
                  >
                    <ExternalLink size={12} />
                  </Button>
                }
                items={items}
                handlers={listHandlers}
              />
            ))}
            {tagGroups.untagged.length > 0 && (
              <ResourceSection
                className="mb-3"
                title={<span className="uppercase tracking-wide text-secondary">{t["collections.ungrouped"]}</span>}
                count={tagGroups.untagged.length}
                collapsed={collapsedTags.has("__untagged__")}
                onToggle={() => toggleTagCollapse("__untagged__")}
                items={tagGroups.untagged}
                handlers={listHandlers}
              />
            )}
          </div>
        )}

        {/* Flat list (tag filtered) */}
        {loaded && activeTag && <ResourceList items={resources} flat handlers={listHandlers} />}
      </div>

      <Modal
        open={showModal}
        title={t["resources.addTitle"]}
        onClose={closeModal}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="md" onClick={handleSaveNew} disabled={!modalUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <ResourceFields
          values={{ url: modalUrl, title: modalTitle, notes: modalNotes, tags: modalTags }}
          onChange={(next) => {
            setModalUrl(next.url);
            setModalTitle(next.title);
            setModalNotes(next.notes);
            setModalTags(next.tags);
          }}
          error={modalError}
          suggestions={tags}
          colorForTag={colorForTag}
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
            <Button variant="primary" size="md" onClick={handleSaveEdit} disabled={!editUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <ResourceFields
          values={{ url: editUrl, title: editTitle, notes: editNotes, tags: editTags }}
          onChange={(next) => {
            setEditUrl(next.url);
            setEditTitle(next.title);
            setEditNotes(next.notes);
            setEditTags(next.tags);
          }}
          error={editError}
          suggestions={tags}
          colorForTag={colorForTag}
          autoFocusField="title"
          enterField="title"
          onEnter={handleSaveEdit}
        />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        message={t["resources.deleteConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
