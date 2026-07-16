import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Edit3, Save, X, Search, Tag, ExternalLink, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "../i18n";
import "../lib/api";

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

export default function WebResources() {
  const { t } = useT();
  const [resources, setResources] = useState<Resource[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [modalTags, setModalTags] = useState<string[]>([]);
  const [modalTagInput, setModalTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);

  // Card collapse state
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());

  const loadResources = useCallback(async () => {
    let results: Resource[];
    if (searchQuery.trim()) {
      results = await window.prism.searchResources(searchQuery);
    } else {
      results = await window.prism.getResources();
    }
    if (activeTag) {
      results = results.filter((r) => r.tags.includes(activeTag));
    }
    setResources(results);
  }, [searchQuery, activeTag]);

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

  const startEdit = (r: Resource) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditTags(r.tags);
    setEditTagInput("");
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    await window.prism.updateResource(editingId, editTitle, "", editTags);
    setEditingId(null);
    loadResources();
    loadTags();
  };

  const filteredTags = useMemo(() => {
    const input = (editingId ? editTagInput : modalTagInput).toLowerCase().trim();
    if (!input) return allTags.slice(0, 8);
    return allTags.filter((t) => t.name.toLowerCase().includes(input)).slice(0, 6);
  }, [allTags, modalTagInput, editTagInput, editingId]);

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

  const handleEditAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setEditTagInput("");
    setEditDropdownOpen(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditAddTag(editTagInput);
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

  // Shared resource row
  const ResourceRow = ({ r }: { r: Resource }) => {
    const color = getTagColor(r.tags[0] || "");
    return (
      <div
        className={`group flex items-center gap-3 px-3 py-1.5 rounded transition-colors ${
          editingId === r.id ? "bg-gray-800/30" : "hover:bg-gray-700/20"
        }`}
      >
        {editingId === r.id ? (
          <div className="flex-1 flex flex-col gap-2 py-1">
            <div className="flex items-center gap-2">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t["resources.title"]}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="flex flex-wrap gap-1 mb-1">
                  {editTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{ color: getTagColor(tag).name, backgroundColor: getTagColor(tag).bg }}>
                      {tag}
                      <button
                        onClick={() => setEditTags(editTags.filter((t) => t !== tag))}
                        className="hover:text-red-400"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={editTagInput}
                    onChange={(e) => { setEditTagInput(e.target.value); setEditDropdownOpen(true); }}
                    onKeyDown={handleEditKeyDown}
                    onFocus={() => setEditDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setEditDropdownOpen(false), 200)}
                    placeholder={t["resources.tags"]}
                    className="w-48 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                  />
                  {editDropdownOpen && filteredTags.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                      {filteredTags.map((tag) => (
                        <button
                          key={tag.name}
                          onMouseDown={() => handleEditAddTag(tag.name)}
                          className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 flex items-center justify-between"
                        >
                          <span>{tag.name}</span>
                          <span className="text-gray-600">{tag.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleSaveEdit} className="p-1 text-green-400 hover:bg-gray-700 rounded">
                <Save size={14} />
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-700 rounded">
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <button
                onClick={() => window.prism.openUrl(r.url)}
                className="text-sm font-medium text-gray-200 truncate hover:text-[var(--accent-text)] transition-colors max-w-[360px] text-left"
                title={r.url}
              >
                {r.title || r.url}
              </button>
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
                    onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer whitespace-nowrap transition-colors hover:opacity-80"
                    style={{ color: c.name, backgroundColor: c.bg }}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => startEdit(r)} className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded">
                <Edit3 size={13} />
              </button>
              <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded">
                <Trash2 size={13} />
              </button>
              <button onClick={() => window.prism.openUrl(r.url)} className="p-1 text-gray-500 hover:text-[var(--accent-text)] hover:bg-gray-700 rounded" title={r.url}>
                <ExternalLink size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Card component for tag group
  const TagCard = ({ tag, items, color }: { tag: string; items: Resource[]; color: typeof TAG_COLORS[0] }) => {
    const collapsed = collapsedTags.has(tag);
    return (
      <div className="mb-3 border border-gray-700/50 rounded-xl bg-gray-900/20 overflow-hidden">
        <div
          className="flex items-center gap-2 px-3 h-8 cursor-pointer"
          style={{ backgroundColor: color.bg }}
          onClick={() => toggleCollapse(tag)}
        >
          <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color.bar }} />
          <button className="text-gray-500 hover:text-gray-300 transition-colors">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <span className="text-xs font-medium truncate" style={{ color: color.name }}>{tag}</span>
          <span className="text-xs text-gray-500">{items.length}</span>
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); setActiveTag(tag); }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            <ExternalLink size={12} />
          </button>
        </div>
        {!collapsed && (
          <div className="px-2 py-1.5">
            {items.map((r) => (
              <ResourceRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-800">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg text-sm font-medium transition-colors flex-shrink-0"
        >
          <Plus size={16} />
          {t["resources.add"]}
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t["resources.search"]}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 px-6 py-2 border-b border-gray-800/50 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
              !activeTag ? "bg-[var(--accent)] text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            }`}
          >
            {t["resources.allTags"]}
          </button>
          {allTags.map((tag) => {
            const c = getTagColor(tag.name);
            const isActive = activeTag === tag.name;
            return (
              <button
                key={tag.name}
                onClick={() => setActiveTag(isActive ? null : tag.name)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap border"
                style={{
                  color: isActive ? c.name : undefined,
                  backgroundColor: isActive ? c.bg : undefined,
                  borderColor: isActive ? c.bar : "transparent",
                }}
              >
                {tag.name}
                <span className="ml-1 opacity-50">{tag.count}</span>
              </button>
            );
          })}
        </div>
      )}

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
              <TagCard key={tag} tag={tag} items={items} color={color} />
            ))}
            {tagGroups.untagged.length > 0 && (
              <div className="mb-3 border border-gray-700/30 rounded-xl bg-gray-900/10 overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 h-8 bg-gray-800/30 cursor-pointer"
                  onClick={() => toggleCollapse("__untagged__")}
                >
                  <div className="w-1 h-4 rounded-full bg-gray-700 flex-shrink-0" />
                  <button className="text-gray-500 hover:text-gray-300 transition-colors">
                    {collapsedTags.has("__untagged__") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t["collections.ungrouped"] ?? "未分组"}
                  </span>
                  <span className="text-xs text-gray-600">{tagGroups.untagged.length}</span>
                </div>
                {!collapsedTags.has("__untagged__") && (
                  <div className="px-2 py-1.5">
                    {tagGroups.untagged.map((r) => (
                      <ResourceRow key={r.id} r={r} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Flat list (tag filtered) */}
        {activeTag && resources.map((r) => (
          <div key={r.id} className="border-b border-gray-800/30 px-3">
            <ResourceRow r={r} />
          </div>
        ))}
      </div>

      {/* Add resource modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="fixed inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[560px] p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-200">{t["resources.addTitle"]}</h2>
              <button onClick={closeModal} className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded">
                <X size={18} />
              </button>
            </div>

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
                          onClick={() => setModalTags(modalTags.filter((t) => t !== tag))}
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
                    <div className="absolute top-full mt-1 left-0 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 w-full">
                      {filteredTags.map((tag) => (
                        <button
                          key={tag.name}
                          onMouseDown={() => handleModalAddTag(tag.name)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between"
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

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t["resources.cancel"]}
              </button>
              <button
                onClick={handleSaveNew}
                disabled={!modalUrl.trim()}
                className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
              >
                {t["resources.save"]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
