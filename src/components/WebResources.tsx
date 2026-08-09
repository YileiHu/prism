import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Edit3, ExternalLink, Link2 } from "lucide-react";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useToast } from "../lib/toast";
import { hashColor } from "../lib/colors";
import Button from "./Button";
import Modal from "./Modal";
import Sidebar from "./Sidebar";
import { type MenuItem } from "./ContextMenu";
import TagInput from "./TagInput";
import ItemRow from "./ItemRow";
import SectionCard from "./SectionCard";
import SearchInput from "./SearchInput";
import EmptyState from "./EmptyState";
import ConfirmDialog from "./ConfirmDialog";
import { useSetToggle } from "../lib/useToggleSet";

interface Resource {
  id: number;
  url: string;
  title: string;
  created_at: string;
  tags: string[];
}

interface TagInfo {
  name: string;
  count: number;
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
  flat,
}: {
  r: Resource;
  onOpenTag: (tag: string) => void;
  onStartEdit: () => void;
  onDelete: () => void;
  flat?: boolean;
}) {
  const { t } = useT();

  const menuItems: MenuItem[] = [
    { label: t["menu.openInBrowser"], icon: <ExternalLink size={14} />, onClick: () => window.prism.openUrl(r.url) },
    { label: "", divider: true },
    { label: t["menu.edit"], icon: <Edit3 size={14} />, onClick: onStartEdit },
    { label: "", divider: true },
    { label: t["menu.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <ItemRow
      variant="list"
      className={flat ? "border-b border-line/30" : "rounded-lg"}
      onPrimaryClick={() => window.prism.openUrl(r.url)}
      menuItems={menuItems}
      tooltip={r.url}
      title={r.title}
      meta={
        <>
          <button
            onClick={(e) => { e.stopPropagation(); window.prism.openUrl(r.url); }}
            className="text-xs text-faint hover:text-tertiary truncate flex items-center gap-1 flex-shrink-0 max-w-[160px]"
          >
            <Link2 size={10} />
            {extractDomain(r.url)}
          </button>
          {r.tags.length > 0 && (
            <span className="hidden md:flex items-center gap-1 flex-shrink-0 max-w-[240px] overflow-hidden">
              {r.tags.slice(0, 3).map((tag) => {
                const c = hashColor(tag);
                return (
                  <span
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); onOpenTag(tag); }}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 whitespace-nowrap"
                    style={{ color: c.name, backgroundColor: c.bg }}
                  >
                    {tag}
                  </span>
                );
              })}
              {r.tags.length > 3 && <span className="text-[10px] text-faint">+{r.tags.length - 3}</span>}
            </span>
          )}
        </>
      }
      hoverActions={[
        { icon: <ExternalLink size={13} />, label: t["menu.openInBrowser"], onClick: () => window.prism.openUrl(r.url) },
        { icon: <Edit3 size={13} />, label: t["menu.edit"], onClick: onStartEdit },
      ]}
    />
  );
}

export default function WebResources({ onReady }: { onReady?: () => void }) {
  const { t } = useT();
  const showToast = useToast();
  const readyFired = useRef(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalTags, setModalTags] = useState<string[]>([]);
  const [modalError, setModalError] = useState("");

  // Edit modal state
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editError, setEditError] = useState("");

  // Delete confirm state
  const [deleting, setDeleting] = useState<Resource | null>(null);

  // Card collapse state
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const loadResources = useCallback(async () => {
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
    if (!readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [debouncedQuery, activeTag, onReady]);

  const loadTags = useCallback(async () => {
    const tags = await window.prism.getAllTags();
    setAllTags(tags);
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    loadTags();
  }, []);

  const handleSaveNew = async () => {
    if (!modalUrl.trim()) return;
    const trimmed = modalUrl.trim();
    const normalizedUrl = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(normalizedUrl));
    try {
      await window.prism.addResource(normalizedUrl, title, modalTags);
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
    setModalTags([]);
    setModalError("");
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await window.prism.deleteResource(deleting.id);
    showToast(t["common.deleted"]);
    loadResources();
    loadTags();
  };

  const openEditModal = (r: Resource) => {
    setEditResource(r);
    setEditUrl(r.url);
    setEditTitle(r.title);
    setEditTags([...r.tags]);
    setEditError("");
  };

  const closeEditModal = () => {
    setEditResource(null);
    setEditUrl("");
    setEditTitle("");
    setEditTags([]);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editResource || !editUrl.trim()) return;
    try {
      await window.prism.updateResource(editResource.id, editUrl.trim(), editTitle.trim() || editUrl, editTags);
    } catch (e) {
      setEditError(isUniqueViolation(e) ? t["resources.urlExists"] : String((e as Error)?.message ?? e));
      return;
    }
    closeEditModal();
    showToast(t["resources.updated"]);
    loadResources();
    loadTags();
  };


  // Group resources by tag for card view, sorted by tag count desc
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

    const groups = Array.from(grouped.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([tag, items]) => ({ tag, resources: items, color: hashColor(tag) }));

    return { groups, untagged };
  }, [resources, activeTag]);

  const toggleCollapse = useSetToggle(setCollapsedTags);

  const renderRow = (r: Resource, flat?: boolean) => (
    <ResourceRowView
      key={r.id}
      r={r}
      flat={flat}
      onOpenTag={setActiveTag}
      onStartEdit={() => openEditModal(r)}
      onDelete={() => setDeleting(r)}
    />
  );

  return (
    <div className="h-full flex">
      {/* Tag sidebar */}
      <Sidebar
        storageKey="resources"
        footer={
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon-md" onClick={() => setShowModal(true)} title={t["resources.add"]}>
              <Plus size={16} />
            </Button>
          </div>
        }
      >
          <button
            onClick={() => setActiveTag(null)}
            className={`w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 pb-2 border-b border-line/50 ${
              !activeTag
                ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium active-bar"
                : "text-secondary hover:text-primary hover:bg-elevated/50 font-medium"
            }`}
          >
            <span className="flex-1 text-left truncate">{t["resources.allTags"]}</span>
            <span className="text-xs text-muted">{totalCount}</span>
          </button>
          {allTags.map((tag, i) => {
            const c = hashColor(tag.name);
            const isActive = activeTag === tag.name;
            return (
              <button
                key={tag.name}
                onClick={() => setActiveTag(isActive ? null : tag.name)}
                style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors stagger-in ${
                  isActive
                    ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium active-bar"
                    : "text-tertiary hover:text-primary hover:bg-elevated/50"
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.bar }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                <span className="text-xs text-muted">{tag.count}</span>
              </button>
            );
          })}
          {allTags.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted leading-relaxed">{t["resources.empty"]}</p>
          )}
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
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {resources.length === 0 && (
            <EmptyState
              size="module"
              text={searchQuery || activeTag ? t["resources.emptySearch"] : t["resources.empty"]}
              cta={!searchQuery && !activeTag ? { label: t["resources.add"], onClick: () => setShowModal(true), icon: <Plus size={14} /> } : undefined}
            />
          )}

          {/* Card view (All) */}
          {!activeTag && resources.length > 0 && (
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
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
                      className="text-xs text-faint hover:text-tertiary transition-colors"
                    >
                      <ExternalLink size={12} />
                    </button>
                  }
                >
                  {items.map((r) => renderRow(r))}
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
                  {tagGroups.untagged.map((r) => renderRow(r))}
                </SectionCard>
              )}
            </div>
          )}

          {/* Flat list (tag filtered) */}
          {activeTag && resources.map((r) => renderRow(r, true))}
        </div>
      </div>

      {/* Add resource modal */}
      <Modal
        open={showModal}
        title={t["resources.addTitle"]}
        onClose={closeModal}
        width="560px"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="md" onClick={handleSaveNew} disabled={!modalUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={modalUrl}
              onChange={(e) => setModalUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveNew();
              }}
              placeholder={t["resources.addUrl"]}
              autoFocus
              className="w-full bg-elevated border border-strong rounded-lg px-4 py-2.5 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <input
              type="text"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              placeholder={t["resources.title"]}
              className="w-full bg-elevated border border-strong rounded-lg px-4 py-2 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Tags */}
          <TagInput
            tags={modalTags}
            onChange={setModalTags}
            suggestions={allTags}
            placeholder={t["resources.tags"]}
            colorForTag={hashColor}
          />
          {modalError && <p className="text-xs text-red-400">{modalError}</p>}
        </div>
      </Modal>

      {/* Edit resource modal */}
      <Modal
        open={editResource !== null}
        title={t["resources.editTitle"]}
        onClose={closeEditModal}
        width="560px"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeEditModal}>{t["resources.cancel"]}</Button>
            <Button variant="primary" size="md" onClick={handleSaveEdit} disabled={!editUrl.trim()}>{t["resources.save"]}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">{t["resources.addUrl"]}</label>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={t["resources.addUrl"]}
              className="w-full bg-elevated border border-strong rounded-lg px-4 py-2.5 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{t["resources.title"]}</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEdit();
              }}
              placeholder={t["resources.title"]}
              autoFocus
              className="w-full bg-elevated border border-strong rounded-lg px-4 py-2.5 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Tags */}
          <TagInput
            tags={editTags}
            onChange={setEditTags}
            suggestions={allTags}
            placeholder={t["resources.tags"]}
            colorForTag={hashColor}
          />
          {editError && <p className="text-xs text-red-400">{editError}</p>}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        message={t["resources.deleteConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
