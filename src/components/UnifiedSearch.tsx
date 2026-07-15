import { useState } from "react";
import { Search, Globe, FileText } from "lucide-react";
import { useT } from "../i18n";
import "../lib/api";

interface SearchResult {
  type: "resource" | "note";
  id: number;
  title: string;
  snippet: string;
}

export default function UnifiedSearch() {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const data = await window.prism.unifiedSearch(query.trim());
    setResults(data);
    setSearched(true);
  };

  const noResultsText = t["search.noResults"].replace("{query}", query);

  return (
    <div className="h-full flex flex-col p-6">
      {/* Search bar */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t["search.placeholder"]}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <button
          onClick={handleSearch}
          className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg text-sm font-medium transition-colors"
        >
          <Search size={16} />
          {t["search.button"]}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {!searched && (
          <div className="text-center text-gray-500 mt-20">
            {t["search.empty"]}
          </div>
        )}
        {searched && results.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            {noResultsText}
          </div>
        )}
        {results.map((r, i) => (
          <div key={`${r.type}-${r.id}-${i}`} className="p-4 bg-gray-900/50 rounded-lg border border-gray-800/50 hover:border-gray-700/50 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              {r.type === "resource" ? (
                <Globe size={14} className="text-blue-400 flex-shrink-0" />
              ) : (
                <FileText size={14} className="text-emerald-400 flex-shrink-0" />
              )}
              <span className={`text-xs font-medium ${r.type === "resource" ? "text-blue-400" : "text-emerald-400"}`}>
                {r.type === "resource" ? t["search.resourceLabel"] : t["search.noteLabel"]}
              </span>
            </div>
            <h3 className="font-medium text-sm text-gray-200">{r.title}</h3>
            {r.snippet && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{r.snippet}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
