import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Edit3, Save, X, Search, Tag, ExternalLink, Link2 } from "lucide-react";
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
  const [modalNotes, setModalNotes] = useState("");
  const [modalTags, setModalTags] = useState<string[]>([]);
  const [modalTagInput, setModalTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);

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
    loadResources();
  }, []);

  const handleSaveNew = async () => {
    if (!modalUrl.trim()) return;
    const trimmedUrl = modalUrl.trim().startsWith("http") ? modalUrl.trim() : `https://${modalUrl.trim()}`;
    const title = modalTitle.trim() || (await window.prism.fetchPageTitle(trimmedUrl));
    await window.prism.addResource(trimmedUrl, title, modalNotes, modalTags);
    closeModal();
    loadResources();
    loadTags();
  };

  const closeModal = () => {
    setShowModal(false);
    setModalUrl("");
    setModalTitle("");
    setModalNotes("");
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
    setEditNotes(r.notes);
    setEditTags(r.tags);
    setEditTagInput("");
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    await window.prism.updateResource(editingId, editTitle, editNotes, editTags);
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

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
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
          {allTags.map((tag) => (
            <button
              key={tag.name}
              onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                activeTag === tag.name
                  ? "bg-[var(--accent-muted)] text-[var(--accent-text)] border border-[var(--accent-border)]"
                  : "bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 border border-transparent"
              }`}
            >
              {tag.name}
              <span className="ml-1 opacity-50">{tag.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Resource list - compact rows */}
      <div className="flex-1 overflow-y-auto">
        {resources.length === 0 && (
          <div className="text-center text-gray-500 mt-20 text-sm">
            {searchQuery || activeTag ? t["resources.emptySearch"] : t["resources.empty"]}
          </div>
        )}
        {resources.map((r) => (
          <div
            key={r.id}
            className={`group flex items-center gap-4 px-6 py-2.5 border-b border-gray-800/30 hover:bg-gray-900/30 transition-colors ${
              editingId === r.id ? "bg-gray-900/50" : ""
            }`}
          >
            {editingId === r.id ? (
              /* Inline edit mode */
              <div className="flex-1 flex flex-col gap-2 py-1">
                <div className="flex items-center gap-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={t["resources.title"]}
                    className="w-52 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder={t["resources.editNotes"]}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {editTags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 text-xs text-[var(--accent-text)] bg-[var(--accent-muted)] px-2 py-0.5 rounded">
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
              /* Normal display mode */
              <>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <button
                    onClick={() => window.prism.openUrl(r.url)}
                    className="text-sm font-medium text-gray-200 truncate hover:text-[var(--accent-text)] transition-colors max-w-[360px] text-left"
                    title={r.url}
                  >
                    {r.title || r.url}
                  </button>
                  <button
                    onClick={() => window.prism.openUrl(r.url)}
                    className="text-xs text-gray-600 hover:text-gray-400 truncate flex items-center gap-1 hidden sm:flex"
                  >
                    <Link2 size={10} />
                    {extractDomain(r.url)}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 max-w-[200px] overflow-hidden">
                  {r.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      onClick={() => setActiveTag(tag)}
                      className="text-xs text-[var(--accent-text)]/70 bg-[var(--accent-muted)] px-1.5 py-0.5 rounded cursor-pointer hover:bg-[var(--accent-muted)] truncate max-w-[80px]"
                    >
                      {tag}
                    </span>
                  ))}
                  {r.tags.length > 3 && (
                    <span className="text-xs text-gray-600">+{r.tags.length - 3}</span>
                  )}
                </div>
                {r.notes && (
                  <span className="text-xs text-gray-600 truncate max-w-[160px] hidden lg:block" title={r.notes}>
                    {r.notes}
                  </span>
                )}
                <span className="text-xs text-gray-600 w-16 text-right flex-shrink-0 hidden sm:block">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
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
              {/* URL */}
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

              {/* Title + Notes */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder={t["resources.title"]}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <textarea
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder={t["resources.notes"]}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
                  {modalTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs text-[var(--accent-text)] bg-[var(--accent-muted)] px-2.5 py-1 rounded-full">
                      <Tag size={10} />
                      {tag}
                      <button
                        onClick={() => setModalTags(modalTags.filter((t) => t !== tag))}
                        className="hover:text-red-400 ml-0.5"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
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
                  <p className="text-xs text-gray-600 mt-1">{t["resources.tagsHint"]}</p>
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
