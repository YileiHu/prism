import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Edit3, X, Search, Tag, ExternalLink, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import "../lib/api";
import Button from "./Button";
import Modal from "./Modal";
import Sidebar from "./Sidebar";
import ContextMenu, { type MenuItem } from "./ContextMenu";

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
}

const TAG_COLORS = [
  { bar: "#c75b4a", name: "#d4846e", bg: "rgba(199, 91, 74, 0.08)" },
  { bar: "#c4a43e", name: "#d4b85a", bg: "rgba(196, 164, 62, 0.08)" },
  { bar: "#5b7fa5", name: "#7a9db8", bg: "rgba(91, 127, 165, 0.08)" },
  { bar: "#6b8e5a", name: "#8aa878", bg: "rgba(107, 142, 90, 0.08)" },
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function extractDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function filterTagSuggestions(allTags: TagInfo[], input: string): TagInfo[] {
  const q = input.toLowerCase().trim();
  if (!q) return allTags.slice(0, 8);
  return allTags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
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
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);

  const menuItems: MenuItem[] = [
    { label: t["menu.openInBrowser"], icon: <ExternalLink size={14} />, onClick: () => window.prism.openUrl(r.url) },
    { label: t["menu.edit"], icon: <Edit3 size={14} />, onClick: onStartEdit },
    { label: t["menu.moveToTrash"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer hover:bg-gray-700/30 ${flat ? "" : "rounded-lg"}`}
        onContextMenu={(e) => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            onClick={() => window.prism.openUrl(r.url)}
            className="flex-1 text-sm truncate text-gray-200 hover:text-[var(--accent-text)] transition-colors cursor-pointer"
            title={r.url}
          >
            {r.title || r.url}
          </span>
          <button
            onClick={() => window.prism.openUrl(r.url)}
            className="text-xs text-gray-600 hover:text-gray-400 truncate flex items-center gap-1"
          >
            <Link2 size={10} />
            {extractDomain(r.url)}
          </button>
          {r.tags.map((tag) => {
            const c = getTagColor(tag);
            return (
              <span
                key={tag}
                onClick={(e) => { e.stopPropagation(); onOpenTag(tag); }}
                className="text-xs px-1.5 py-0.5 rounded cursor-pointer whitespace-nowrap transition-colors hover:opacity-80"
                style={{ color: c.name, backgroundColor: c.bg }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      </div>
      {ctxPos && (
        <ContextMenu items={menuItems} position={ctxPos} onClose={() => setCtxPos(null)} />
      )}
    </>
  );
}

function TagCard({
  tag,
  count,
  color,
  collapsed,
  onToggle,
  onOpenTag,
  children,
}: {
  tag: string;
  count: number;
  color: typeof TAG_COLORS[0];
  collapsed: boolean;
  onToggle: () => void;
  onOpenTag: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 border border-gray-700/50 rounded-xl bg-gray-900/20 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 h-8 cursor-pointer"
        style={{ backgroundColor: `${color.bar}18` }}
        onClick={onToggle}
      >
        <button className="text-gray-500 hover:text-gray-300 transition-colors">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-xs font-medium truncate" style={{ color: color.name }}>{tag}</span>
        <span className="text-xs text-gray-500">{count}</span>
        <div className="flex-1" />
        <button
          onClick={(e) => { e.stopPropagation(); onOpenTag(); }}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          <ExternalLink size={12} />
        </button>
      </div>
      {!collapsed && (
        <div className="p-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default function WebResources() {
  const { t } = useT();
  const [resources, setResources] = useState<Resource[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalTags, setModalTags] = useState<string[]>([]);
  const [modalTagInput, setModalTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  // Edit modal state
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editTagDropdownOpen, setEditTagDropdownOpen] = useState(false);

  // Card collapse state
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const loadResources = useCallback(async () => {
    let results: Resource[];
    if (debouncedQuery.trim()) {
      results = await window.prism.searchResources(debouncedQuery);
    } else {
      results = await window.prism.getResources();
    }
    if (activeTag) {
      results = results.filter((r) => r.tags.includes(activeTag));
    }
    setResources(results);
  }, [debouncedQuery, activeTag]);

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
    const trimmedUrl = modalUrl.trim().startsWith("http") ? modalUrl.trim() : `https://${modalUrl.trim()}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(trimmedUrl));
    await window.prism.addResource(trimmedUrl, title, "", modalTags);
    closeModal();
    loadResources();
    loadTags();
  };

  const closeModal = () => {
    setShowModal(false);
    setModalUrl("");
    setModalTitle("");
    setModalTags([]);
    setModalTagInput("");
  };

  const handleDelete = async (id: number) => {
    await window.prism.deleteResource(id);
    loadResources();
    loadTags();
  };

  const openEditModal = (r: Resource) => {
    setEditResource(r);
    setEditUrl(r.url);
    setEditTitle(r.title);
    setEditTags([...r.tags]);
    setEditTagInput("");
    setEditTagDropdownOpen(false);
  };

  const closeEditModal = () => {
    setEditResource(null);
    setEditUrl("");
    setEditTitle("");
    setEditTags([]);
    setEditTagInput("");
  };

  const handleSaveEdit = async () => {
    if (!editResource || !editUrl.trim()) return;
    await window.prism.updateResource(editResource.id, editUrl.trim(), editTitle.trim() || editUrl, "", editTags);
    closeEditModal();
    loadResources();
    loadTags();
  };

  const filteredTags = useMemo(() => filterTagSuggestions(allTags, modalTagInput), [allTags, modalTagInput]);
  const editFilteredTags = useMemo(() => filterTagSuggestions(allTags, editTagInput), [allTags, editTagInput]);

  const handleModalAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !modalTags.includes(trimmed)) {
      setModalTags([...modalTags, trimmed]);
    }
    setModalTagInput("");
    setTagDropdownOpen(false);
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleModalAddTag(modalTagInput);
    }
  };

  const handleEditTagAdd = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setEditTagInput("");
    setEditTagDropdownOpen(false);
  };

  const handleEditTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditTagAdd(editTagInput);
    }
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
      .map(([tag, items]) => ({ tag, resources: items, color: getTagColor(tag) }));

    return { groups, untagged };
  }, [resources, activeTag]);

  const toggleCollapse = (tag: string) => {
    setCollapsedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const renderRow = (r: Resource, flat?: boolean) => (
    <ResourceRowView
      key={r.id}
      r={r}
      flat={flat}
      onOpenTag={setActiveTag}
      onStartEdit={() => openEditModal(r)}
      onDelete={() => handleDelete(r.id)}
    />
  );

  return (
    <div className="h-full flex">
      {/* Tag sidebar */}
      <Sidebar
        footer={
          <div className="flex items-center justify-center">
            <Button variant="ghost" size="icon-md" onClick={() => setShowModal(true)} title={t["resources.add"]}>
              <Plus size={16} />
            </Button>
          </div>
        }
      >
          <button
            onClick={() => setActiveTag(null)}
            className={`w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 pb-2 border-b border-gray-800/50 ${
              !activeTag
                ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium"
                : "text-gray-300 hover:text-gray-200 hover:bg-gray-800/50 font-medium"
            }`}
          >
            <span className="flex-1 text-left truncate">{t["resources.allTags"]}</span>
            <span className="text-xs text-gray-500">{resources.length}</span>
          </button>
          {allTags.map((tag) => {
            const c = getTagColor(tag.name);
            const isActive = activeTag === tag.name;
            return (
              <button
                key={tag.name}
                onClick={() => setActiveTag(isActive ? null : tag.name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.bar }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                <span className="text-xs text-gray-500">{tag.count}</span>
              </button>
            );
          })}
          {allTags.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-gray-500 leading-relaxed">{t["resources.empty"]}</p>
          )}
      </Sidebar>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-800/50 flex-shrink-0 bg-white/[0.04]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t["resources.search"]}
              className="w-full bg-gray-800 border border-gray-700 rounded-full pl-8 pr-3 py-1 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {resources.length === 0 && (
            <div className="text-center text-gray-500 mt-20 text-sm">
              {searchQuery || activeTag ? t["resources.emptySearch"] : t["resources.empty"]}
            </div>
          )}

          {/* Card view (All) */}
          {!activeTag && resources.length > 0 && (
            <div className="p-3">
              {tagGroups.groups.map(({ tag, resources: items, color }) => (
                <TagCard
                  key={tag}
                  tag={tag}
                  count={items.length}
                  color={color}
                  collapsed={collapsedTags.has(tag)}
                  onToggle={() => toggleCollapse(tag)}
                  onOpenTag={() => setActiveTag(tag)}
                >
                  {items.map((r) => renderRow(r))}
                </TagCard>
              ))}
              {tagGroups.untagged.length > 0 && (
                <div className="mb-3 border border-gray-700/30 rounded-xl bg-gray-900/10 overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-3 h-8 bg-gray-800/30 cursor-pointer"
                    onClick={() => toggleCollapse("__untagged__")}
                  >
                    <button className="text-gray-500 hover:text-gray-300 transition-colors">
                      {collapsedTags.has("__untagged__") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {t["collections.ungrouped"] ?? "未分组"}
                    </span>
                    <span className="text-xs text-gray-600">{tagGroups.untagged.length}</span>
                  </div>
                  {!collapsedTags.has("__untagged__") && (
                    <div className="p-2">
                      {tagGroups.untagged.map((r) => renderRow(r))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Flat list (tag filtered) */}
          {activeTag && resources.map((r) => (
            <div key={r.id} className="border-b border-gray-800/30">
              {renderRow(r, true)}
            </div>
          ))}
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
                if (e.key === "Enter" && !modalTagInput) handleSaveNew();
              }}
              placeholder={t["resources.addUrl"]}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <input
              type="text"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              placeholder={t["resources.title"]}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
              {modalTags.map((tag) => {
                const c = getTagColor(tag);
                return (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ color: c.name, backgroundColor: c.bg }}>
                    <Tag size={10} />
                    {tag}
                    <button
                      onClick={() => setModalTags(modalTags.filter((t2) => t2 !== tag))}
                      className="hover:text-red-400 ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="relative">
              <input
                type="text"
                value={modalTagInput}
                onChange={(e) => { setModalTagInput(e.target.value); setTagDropdownOpen(true); }}
                onKeyDown={handleModalKeyDown}
                onFocus={() => setTagDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTagDropdownOpen(false), 200)}
                placeholder={t["resources.tags"]}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              {tagDropdownOpen && filteredTags.length > 0 && (
                <div className="absolute top-full mt-1 left-0 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-1 w-full">
                  {filteredTags.map((tag) => (
                    <button
                      key={tag.name}
                      onMouseDown={() => handleModalAddTag(tag.name)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between rounded-md"
                    >
                      <span className="flex items-center gap-2">
                        <Tag size={12} className="text-gray-500" />
                        {tag.name}
                      </span>
                      <span className="text-xs text-gray-500">{tag.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
            <label className="block text-xs text-gray-500 mb-1">{t["resources.addUrl"]}</label>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={t["resources.addUrl"]}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t["resources.title"]}</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !editTagInput) handleSaveEdit();
              }}
              placeholder={t["resources.title"]}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
              {editTags.map((tag) => {
                const c = getTagColor(tag);
                return (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ color: c.name, backgroundColor: c.bg }}>
                    <Tag size={10} />
                    {tag}
                    <button
                      onClick={() => setEditTags(editTags.filter((t2) => t2 !== tag))}
                      className="hover:text-red-400 ml-0.5"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="relative">
              <input
                type="text"
                value={editTagInput}
                onChange={(e) => { setEditTagInput(e.target.value); setEditTagDropdownOpen(true); }}
                onKeyDown={handleEditTagKeyDown}
                onFocus={() => setEditTagDropdownOpen(true)}
                onBlur={() => setTimeout(() => setEditTagDropdownOpen(false), 200)}
                placeholder={t["resources.tags"]}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              {editTagDropdownOpen && editFilteredTags.length > 0 && (
                <div className="absolute top-full mt-1 left-0 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-1 w-full">
                  {editFilteredTags.map((tag) => (
                    <button
                      key={tag.name}
                      onMouseDown={() => handleEditTagAdd(tag.name)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between rounded-md"
                    >
                      <span className="flex items-center gap-2">
                        <Tag size={12} className="text-gray-500" />
                        {tag.name}
                      </span>
                      <span className="text-xs text-gray-500">{tag.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
