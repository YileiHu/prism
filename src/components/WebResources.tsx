import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Edit3, ExternalLink, Link2, Pencil } from "lucide-react";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useSettings } from "../lib/settings";
import { useToast } from "../lib/toast";
import { hashColor, resolveTagColor, type PaletteColor } from "../lib/colors";
import { buildColorMenuItem } from "./ColorPicker";
import { useContextMenu } from "../lib/useContextMenu";
import RenameModal from "./RenameModal";
import Button from "./Button";
import Modal from "./Modal";
import Sidebar from "./Sidebar";
import { type MenuItem } from "./ContextMenu";
import TagInput from "./TagInput";
import ItemRow from "./ItemRow";
import SectionCard from "./SectionCard";
import SearchInput from "./SearchInput";
import EmptyState from "./EmptyState";
import { SkeletonRows } from "./Skeleton";
import ConfirmDialog from "./ConfirmDialog";
import { useSetToggle } from "../lib/useToggleSet";
import { arrayMove } from "@dnd-kit/sortable";
import SortableList from "./SortableList";
import NavItem from "./NavItem";
import Badge from "./Badge";
import Input, { Textarea } from "./Input";

interface Resource {
  id: number;
  url: string;
  title: string;
  notes: string;
  created_at: string;
  tags: string[];
}

interface TagInfo {
  name: string;
  count: number;
  color: string;
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function isUniqueViolation(e: unknown): boolean {
  return /unique/i.test(String((e as Error)?.message ?? e));
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
            onClick={(e) => { e.stopPropagation(); window.prism.openUrl(r.url); }}
            className="text-caption text-faint hover:text-tertiary truncate flex items-center gap-1 flex-shrink-0 max-w-[160px]"
          >
            <Link2 size={10} />
            {extractDomain(r.url)}
          </button>
          {r.tags.length > 0 && (
            <span className="hidden md:flex items-center gap-1 flex-shrink-0 max-w-[240px] overflow-hidden">
              {r.tags.slice(0, 3).map((tag) => {
                const c = colorForTag(tag);
                return (
                  <Badge
                    key={tag}
                    palette={c}
                    onClick={(e) => { e.stopPropagation(); onOpenTag(tag); }}
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

function ResourceList({
  items,
  flat,
  onReorder,
  onOpenTag,
  onStartEdit,
  onDelete,
  colorForTag,
}: {
  items: Resource[];
  flat?: boolean;
  onReorder: (next: Resource[]) => void;
  onOpenTag: (tag: string) => void;
  onStartEdit: (r: Resource) => void;
  onDelete: (r: Resource) => void;
  colorForTag: (name: string) => PaletteColor;
}) {
  return (
    <SortableList
      items={items}
      itemId={(r) => String(r.id)}
      onReorder={(from, to) => onReorder(arrayMove(items, from, to))}
      renderItem={(r) => (
        <ResourceRowView
          r={r}
          flat={flat}
          onOpenTag={onOpenTag}
          onStartEdit={() => onStartEdit(r)}
          onDelete={() => onDelete(r)}
          colorForTag={colorForTag}
        />
      )}
      renderOverlay={(r) => (
        <div className="flex items-center gap-2 px-3 py-1.5 text-body text-primary">
          <span className="truncate">{r.title}</span>
          <span className="ml-auto text-caption text-faint flex-shrink-0">{extractDomain(r.url)}</span>
        </div>
      )}
    />
  );
}

export default function WebResources({ onReady }: { onReady?: () => void }) {
  const { t } = useT();
  const { values: settings } = useSettings();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const readyFired = useRef(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [activeTag, setActiveTag] = useState<string | null>(null);

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

  // Tag management state
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  // Card collapse state
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const loadResources = useCallback(async () => {
    try {
      let results: Resource[];
      if (debouncedQuery.trim()) {
        results = await window.prism.searchResources(debouncedQuery);
      } else {
        results = await window.prism.getResources();
        setTotalCount(results.length);
      }
      if (activeTag) {
        results = results.filter((r) => r.tags.includes(activeTag));
      }
      setResources(results);
    } finally {
      setResourcesLoaded(true);
      if (!readyFired.current) {
        readyFired.current = true;
        onReady?.();
      }
    }
  }, [debouncedQuery, activeTag, onReady]);

  const loadTags = useCallback(async () => {
    try {
      setAllTags(await window.prism.getAllTags());
    } finally {
      setTagsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    loadTags();
  }, []);

  const tagColorMap = useMemo(() => {
    const map = new Map<string, PaletteColor>();
    for (const tag of allTags) map.set(tag.name, resolveTagColor(tag.name, tag.color));
    return map;
  }, [allTags]);

  const colorForTag = useCallback(
    (name: string) => tagColorMap.get(name) ?? hashColor(name),
    [tagColorMap],
  );

  const handleSaveNew = async () => {
    if (!modalUrl.trim()) return;
    const trimmed = modalUrl.trim();
    const normalizedUrl = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(normalizedUrl));
    try {
      await window.prism.addResource(normalizedUrl, title, modalTags, modalNotes.trim());
    } catch (e) {
      setModalError(isUniqueViolation(e) ? t["resources.urlExists"] : String((e as Error)?.message ?? e));
      return;
    }
    closeModal();
    showToast(t["resources.added"]);
    loadResources();
    loadTags();
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
      await window.prism.deleteResource(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["common.deleted"]);
    loadResources();
    loadTags();
  };

  const openEditModal = (r: Resource) => {
    setEditResource(r);
    setEditUrl(r.url);
    setEditTitle(r.title);
    setEditNotes(r.notes);
    setEditTags([...r.tags]);
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
      await window.prism.updateResource(editResource.id, editUrl.trim(), editTitle.trim() || editUrl, editTags, editNotes.trim());
    } catch (e) {
      setEditError(isUniqueViolation(e) ? t["resources.urlExists"] : String((e as Error)?.message ?? e));
      return;
    }
    closeEditModal();
    showToast(t["resources.updated"]);
    loadResources();
    loadTags();
  };

  const applyTagColor = async (name: string, color: string) => {
    try {
      await window.prism.setTagColor(name, color);
    } catch {
      showToast(t["common.actionFailed"], "error");
      return;
    }
    loadTags();
  };

  const openTagMenu = (e: React.MouseEvent, tag: TagInfo) => {
    onContextMenu(e, [
      buildColorMenuItem(t, {
        label: t["resources.tagColor"],
        autoLabel: t["resources.tagColorAuto"],
        autoSource: tag.name,
        current: tag.color,
        onSelect: (color) => applyTagColor(tag.name, color),
      }),
      { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenamingTag(tag.name) },
      { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeletingTag(tag.name) },
    ]);
  };

  const handleRenameTag = async (newName: string) => {
    if (!renamingTag) return;
    try {
      await window.prism.renameTag(renamingTag, newName);
    } catch {
      showToast(t["common.actionFailed"], "error");
      setRenamingTag(null);
      return;
    }
    if (activeTag === renamingTag) setActiveTag(newName);
    setRenamingTag(null);
    showToast(t["resources.tagRenamed"]);
    loadResources();
    loadTags();
  };

  const handleDeleteTag = async () => {
    if (!deletingTag) return;
    try {
      await window.prism.deleteTag(deletingTag);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    if (activeTag === deletingTag) setActiveTag(null);
    setDeletingTag(null);
    showToast(t["resources.tagDeleted"]);
    loadResources();
    loadTags();
  };

  const reorderTagList = (from: number, to: number) => {
    const next = arrayMove(allTags, from, to);
    setAllTags(next);
    void window.prism.reorderTags(next.map((tag) => tag.name)).catch(() => {
      showToast(t["common.actionFailed"], "error");
    });
  };

  // Group resources by tag for card view, following the sidebar's tag order
  const tagGroups = useMemo(() => {
    if (activeTag) return { groups: [], untagged: [] as Resource[] };
    const grouped = new Map<string, Resource[]>();
    const untagged: Resource[] = [];

    for (const r of resources) {
      if (r.tags.length === 0) {
        untagged.push(r);
      } else {
        for (const tag of r.tags) {
          if (!grouped.has(tag)) grouped.set(tag, []);
          grouped.get(tag)!.push(r);
        }
      }
    }

    const order = new Map(allTags.map((tag, index) => [tag.name, index]));
    const groups = Array.from(grouped.entries())
      .sort((a, b) => (order.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (order.get(b[0]) ?? Number.MAX_SAFE_INTEGER))
      .map(([tag, items]) => ({ tag, resources: items, color: colorForTag(tag) }));

    return { groups, untagged };
  }, [resources, activeTag, allTags, colorForTag]);

  const toggleCollapse = useSetToggle(setCollapsedTags);

  // Only the dragged list's rows are reordered; they keep the slots they
  // already occupy in the global order.
  const handleReorder = async (next: Resource[]) => {
    const subset = new Set(next.map((r) => r.id));
    setResources((prev) => {
      let i = 0;
      return prev.map((r) => (subset.has(r.id) ? next[i++] : r));
    });
    try {
      await window.prism.reorderResources(next.map((r) => r.id));
    } catch {
      showToast(t["common.actionFailed"], "error");
      loadResources();
    }
  };

  return (
    <div className="h-full flex">
      {/* Tag sidebar */}
      <Sidebar>
          <NavItem
            onClick={() => setActiveTag(null)}
            active={!activeTag}
            className="mb-1 font-medium section-wash"
            label={t["resources.allTags"]}
            trailing={totalCount}
          />
          {!tagsLoaded && <SkeletonRows count={6} />}
          {tagsLoaded && (
          <SortableList
            items={allTags}
            itemId={(tag) => tag.name}
            onReorder={reorderTagList}
            renderItem={(tag, i) => {
              const c = colorForTag(tag.name);
              const isActive = activeTag === tag.name;
              return (
                <NavItem
                  onClick={() => setActiveTag(isActive ? null : tag.name)}
                  onContextMenu={(e) => openTagMenu(e, tag)}
                  style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                  active={isActive}
                  className="stagger-in"
                  leading={<span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.bar }} />}
                  label={tag.name}
                  trailing={tag.count}
                />
              );
            }}
            renderOverlay={(tag) => (
              <div className="flex items-center gap-2 px-3 py-2 rounded-control text-body text-primary">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colorForTag(tag.name).bar }}
                />
                <span className="flex-1 truncate">{tag.name}</span>
                <span className="text-caption text-muted">{tag.count}</span>
              </div>
            )}
            />
          )}
          {tagsLoaded && allTags.length === 0 && <EmptyState size="card" text={t["resources.noTags"]} />}
      </Sidebar>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t["resources.search"]}
            wrapperClassName="flex-1"
          />
          <Button variant="ghost" size="icon-md" onClick={() => setShowModal(true)} title={t["resources.add"]}>
            <Plus size={16} />
          </Button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {debouncedQuery.trim() && resources.length >= settings.search_result_limit && (
            <div className="px-4 py-1.5 text-caption text-faint">
              {t["vault.resultLimitHint"].replace("{count}", String(settings.search_result_limit))}
            </div>
          )}
          {!resourcesLoaded && <SkeletonRows count={8} className="p-3" />}
          {resourcesLoaded && resources.length === 0 && (
            <EmptyState
              size="module"
              text={searchQuery || activeTag ? t["resources.emptySearch"] : t["resources.empty"]}
              cta={!searchQuery && !activeTag ? { label: t["resources.add"], onClick: () => setShowModal(true), icon: <Plus size={14} /> } : undefined}
            />
          )}

          {/* Card view (All) */}
          {resourcesLoaded && !activeTag && resources.length > 0 && (
            <div className="p-3">
              {tagGroups.groups.map(({ tag, resources: items, color }) => (
                <SectionCard
                  key={tag}
                  className="mb-3"
                  title={tag}
                  count={items.length}
                  tintColor={color}
                  collapsed={collapsedTags.has(tag)}
                  onToggle={() => toggleCollapse(tag)}
                  headerActions={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
                      title={tag}
                      aria-label={tag}
                      className="!text-faint hover:!text-tertiary"
                    >
                      <ExternalLink size={12} />
                    </Button>
                  }
                >
                  <ResourceList
                    items={items}
                    onReorder={handleReorder}
                    onOpenTag={setActiveTag}
                    onStartEdit={openEditModal}
                    onDelete={setDeleting}
                    colorForTag={colorForTag}
                  />
                </SectionCard>
              ))}
              {tagGroups.untagged.length > 0 && (
                <SectionCard
                  className="mb-3"
                  title={<span className="uppercase tracking-wide text-muted">{t["collections.ungrouped"]}</span>}
                  count={tagGroups.untagged.length}
                  collapsed={collapsedTags.has("__untagged__")}
                  onToggle={() => toggleCollapse("__untagged__")}
                >
                  <ResourceList
                    items={tagGroups.untagged}
                    onReorder={handleReorder}
                    onOpenTag={setActiveTag}
                    onStartEdit={openEditModal}
                    onDelete={setDeleting}
                    colorForTag={colorForTag}
                  />
                </SectionCard>
              )}
            </div>
          )}

          {/* Flat list (tag filtered) */}
          {resourcesLoaded && activeTag && (
            <ResourceList
              items={resources}
              flat
              onReorder={handleReorder}
              onOpenTag={setActiveTag}
              onStartEdit={openEditModal}
              onDelete={setDeleting}
              colorForTag={colorForTag}
            />
          )}
        </div>
      </div>

      {/* Add resource modal */}
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
        <div className="space-y-4">
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.urlLabel"]}</label>
            <Input
              type="text"
              value={modalUrl}
              onChange={(e) => setModalUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveNew();
              }}
              placeholder={t["resources.addUrl"]}
              autoFocus
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.titleLabel"]}</label>
            <Input
              type="text"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              placeholder={t["resources.title"]}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.notes"]}</label>
            <Textarea
              value={modalNotes}
              onChange={(e) => setModalNotes(e.target.value)}
              placeholder={t["resources.notesPlaceholder"]}
              rows={4}
              className="w-full resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.tagsLabel"]}</label>
            <TagInput
              tags={modalTags}
              onChange={setModalTags}
              suggestions={allTags}
              placeholder={t["resources.tags"]}
              colorForTag={colorForTag}
            />
          </div>
          {modalError && <p className="text-caption text-danger">{modalError}</p>}
        </div>
      </Modal>

      {/* Edit resource modal */}
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
        <div className="space-y-4">
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.urlLabel"]}</label>
            <Input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={t["resources.addUrl"]}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.titleLabel"]}</label>
            <Input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
              }}
              placeholder={t["resources.title"]}
              autoFocus
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.notes"]}</label>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder={t["resources.notesPlaceholder"]}
              rows={4}
              className="w-full resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-caption text-muted mb-1">{t["resources.tagsLabel"]}</label>
            <TagInput
              tags={editTags}
              onChange={setEditTags}
              suggestions={allTags}
              placeholder={t["resources.tags"]}
              colorForTag={colorForTag}
            />
          </div>
          {editError && <p className="text-caption text-danger">{editError}</p>}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        message={t["resources.deleteConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      {/* Tag rename */}
      <RenameModal
        open={renamingTag !== null}
        initialValue={renamingTag ?? ""}
        title={t["resources.tagRenameTitle"]}
        onClose={() => setRenamingTag(null)}
        onSubmit={handleRenameTag}
      />

      {/* Tag delete confirm */}
      <ConfirmDialog
        open={deletingTag !== null}
        message={t["resources.tagDeleteConfirm"].replace("{name}", deletingTag ?? "")}
        onConfirm={handleDeleteTag}
        onClose={() => setDeletingTag(null)}
      />
    </div>
  );
}
