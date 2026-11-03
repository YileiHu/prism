import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useT } from "../i18n";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useSettings } from "../lib/settings";
import { resolveTagColor, type PaletteColor } from "../lib/colors";
import { type CollectionData } from "./collectionTypes";
import { toRelativePath } from "./useCollections";
import EmptyState from "./EmptyState";
import { SkeletonRows } from "./Skeleton";
import Badge from "./Badge";
import Spinner from "./Spinner";

interface Props {
  vaultPath: string;
  collections: CollectionData[];
  query: string;
  onOpenNote: (note: { path: string; title: string }) => void;
}

interface Membership {
  collection: string;
  group: string | null;
  color: PaletteColor;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-[var(--accent-muted)] text-[var(--accent-text)] rounded-chip px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function ContentSearchView({ vaultPath, collections, query, onOpenNote }: Props) {
  const { t } = useT();
  const { values } = useSettings();

  const membershipsByPath = useMemo(() => {
    const map = new Map<string, Membership[]>();
    const add = (relPath: string, membership: Membership) => {
      const key = relPath.replace(/\//g, "\\").toLowerCase();
      const list = map.get(key);
      if (list) list.push(membership);
      else map.set(key, [membership]);
    };
    for (const c of collections) {
      // Group membership uses the collection's own color, never the group's
      const color = resolveTagColor(c.name, c.color);
      for (const np of c.notePaths) add(np, { collection: c.name, group: null, color });
      for (const g of c.groups ?? []) {
        for (const np of g.notePaths) add(np, { collection: c.name, group: g.name, color });
      }
    }
    return map;
  }, [collections]);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [results, setResults] = useState<{ path: string; title: string; snippet: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    seqRef.current++;
  }, [vaultPath]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    const seq = ++seqRef.current;
    if (!q) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    window.prism
      .searchNoteContents(vaultPath, q)
      .then((hits) => {
        if (seq !== seqRef.current) return;
        setResults(hits);
        setLoading(false);
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setResults([]);
        setLoading(false);
      });
  }, [debouncedQuery, vaultPath]);

  const terms = debouncedQuery.trim().split(/\s+/).filter(Boolean);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 h-9 border-b border-line/50 flex-shrink-0 text-caption text-muted">
        {hasSearched && (
          <span>{t["vault.contentSearchCount"].replace("{count}", String(results.length))}</span>
        )}
        {hasSearched && results.length >= values.search_result_limit && (
          <span className="text-faint">
            {t["vault.resultLimitHint"].replace("{count}", String(values.search_result_limit))}
          </span>
        )}
        {loading && <Spinner size={13} className="flex-shrink-0" />}
      </div>

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {loading && results.length === 0 ? (
          <SkeletonRows count={5} />
        ) : hasSearched && results.length === 0 ? (
          <EmptyState size="module" text={t["vault.contentSearchEmpty"]} />
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const hit = results[virtualRow.index];
              const relKey = toRelativePath(hit.path, vaultPath).replace(/\//g, "\\").toLowerCase();
              const memberships = membershipsByPath.get(relKey) ?? [];
              return (
                <div
                  key={hit.path}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenNote({ path: hit.path, title: hit.title })}
                    title={hit.path}
                    className="w-full text-left px-4 py-2.5 border-b border-line/30 hover:bg-elevated/50 focus:outline-none focus-visible:bg-elevated/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-muted flex-shrink-0" />
                      <span className="text-body font-semibold leading-6 text-primary truncate min-w-0">{hit.title}</span>
                      {memberships.length > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {memberships.slice(0, 2).map((m, i) => (
                            <Badge key={i} palette={m.color} className="max-w-[180px]">
                              <span className="min-w-0 truncate">
                                {m.group ? `${m.collection} › ${m.group}` : m.collection}
                              </span>
                            </Badge>
                          ))}
                          {memberships.length > 2 && (
                            <span className="text-meta text-faint">+{memberships.length - 2}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 pl-[22px] text-caption text-tertiary leading-relaxed line-clamp-2 break-words">
                      <Highlighted text={hit.snippet} terms={terms} />
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
