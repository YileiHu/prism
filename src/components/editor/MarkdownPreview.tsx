import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Pencil, Info, Flame, CheckCircle2, Check, HelpCircle,
  AlertTriangle, XCircle, AlertOctagon, Bug, Zap, Quote,
  ListChecks, List, FileText,
} from "lucide-react";
import "katex/dist/katex.min.css";
import { renderMarkdown, type AssetContext } from "./markdown";
import { loadFolds, saveFold, FoldKeyCounter } from "./folds";
import OutlineCard, { type OutlineItem } from "./OutlineCard";
import { useSettings } from "../../lib/settings";

// Icons per canonical callout family (see CALLOUT_FAMILIES in markdown.ts)
const CALLOUT_ICONS: Record<string, typeof Info> = {
  note: Pencil,
  info: Info,
  todo: CheckCircle2,
  abstract: ListChecks,
  tip: Flame,
  success: Check,
  question: HelpCircle,
  warning: AlertTriangle,
  failure: XCircle,
  danger: Zap,
  error: AlertOctagon,
  bug: Bug,
  example: List,
  quote: Quote,
};

interface Props {
  content: string;
  assetContext?: AssetContext | null;
  foldScope?: string;
  onToggleTask: (taskIndex: number) => void;
  onOpenWikilink: (target: string) => void;
  onResolveRelativeLink: (href: string) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  // Section index the mode-switch restore will scroll to (-1 = none). Used to
  // seed the outline highlight so it doesn't flash the first entry before the
  // restore lands.
  initialSection?: number;
}

function formatFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FrontmatterCard({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).slice(0, 12);
  if (entries.length === 0) return null;
  return (
    <div className="mx-auto mb-4 px-1 pt-4" style={{ maxWidth: "var(--content-width)" }}>
      <div className="rounded-control border border-line/50 bg-surface px-4 py-2.5 text-caption overflow-hidden">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 py-0.5 min-w-0">
            <span className="text-muted flex-shrink-0">{key}</span>
            <span className="text-secondary truncate" title={formatFrontmatterValue(value)}>
              {formatFrontmatterValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MarkdownPreview({ content, assetContext, foldScope, onToggleTask, onOpenWikilink, onResolveRelativeLink, scrollRef, initialSection }: Props) {
  const { values } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const { html, frontmatter, outline } = useMemo(() => renderMarkdown(content, assetContext), [content, assetContext]);
  const foldsRef = useRef<Set<string>>(new Set());
  // Per fold-body element: callback that expands it (owned by the fold effect
  // below). Outline jumps use these to reveal headings hidden inside
  // collapsed sections. Rebuilt whenever the rendered html/foldScope changes.
  const unfoldRef = useRef(new Map<Element, () => void>());
  const foldBuildKeyRef = useRef("");
  // Outline highlight: which heading's section crosses the viewport center.
  // When a mode switch seeded a section, start on it so the first paint
  // already highlights the right entry.
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(() =>
    initialSection != null && initialSection >= 0 ? outline[initialSection]?.id ?? null : null,
  );
  // Clicking an entry smooth-scrolls through intermediate headings; hold the
  // highlight on the clicked one until the jump animation ends AND the user
  // scrolls again (center-based detection would otherwise move it right away).
  const jumpLockRef = useRef<string | null>(null);
  const jumpSettledRef = useRef(false);
  const jumpLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jumpToHeading = (id: string) => {
    const root = containerRef.current;
    // Scope the lookup to THIS preview: heading ids (hd-0..N) restart per
    // render, and other vault panes stay mounted (visibility:hidden) with
    // their own previews — a document-wide getElementById can hit a hidden
    // pane's heading and scroll the wrong container
    const el = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !el) return;
    // scrollIntoView is a no-op inside display:none fold bodies — expand any
    // collapsed sections wrapping the target first
    let p = el.parentElement;
    while (p && p !== root.parentElement) {
      if (p.classList.contains("md-fold-body") && p.style.display === "none") {
        unfoldRef.current.get(p)?.();
      }
      p = p.parentElement;
    }
    setActiveHeadingId(id);
    jumpLockRef.current = id;
    jumpSettledRef.current = false;
    if (jumpLockTimerRef.current) clearTimeout(jumpLockTimerRef.current);
    // Fallback for jumps that never scroll (already at the target, so no
    // scrollend): consider the jump settled after the animation window
    jumpLockTimerRef.current = setTimeout(() => {
      jumpSettledRef.current = true;
    }, 1000);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => () => {
    if (jumpLockTimerRef.current) clearTimeout(jumpLockTimerRef.current);
  }, []);

  // Track the section at the top of the viewport and mirror it into the
  // outline. Heading ids (hd-N) are the outline item ids.
  useEffect(() => {
    const scroller = scrollRef?.current;
    const root = containerRef.current;
    if (!scroller || !root) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (jumpLockRef.current) return;
      const rect = scroller.getBoundingClientRect();
      const threshold = rect.top + rect.height / 2;
      const heads = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
      let active: string | null = null;
      let firstVisible: string | null = null;
      for (const el of heads) {
        // Headings inside collapsed fold bodies have no box — skip them
        if (!el.id || el.getClientRects().length === 0) continue;
        if (firstVisible === null) firstVisible = el.id;
        if (el.getBoundingClientRect().top <= threshold) active = el.id;
        else break;
      }
      const next = active ?? firstVisible;
      setActiveHeadingId((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    // Programmatic jump scrolls keep the clicked entry highlighted; the lock
    // releases on the first scroll after the animation has settled
    const onScroll = () => {
      if (jumpLockRef.current) {
        if (!jumpSettledRef.current) return;
        jumpLockRef.current = null;
      }
      schedule();
    };
    const onScrollEnd = () => {
      if (jumpLockRef.current) jumpSettledRef.current = true;
    };
    compute();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    // Fold toggles and late image loads change the layout without scrolling
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    ro.observe(scroller);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
      ro.disconnect();
    };
  }, [scrollRef, html, foldScope]);

  // Layout effects so the folded DOM exists before the parent's mode-switch
  // scroll restore measures it (and before the first paint — no unfolded flash)
  useLayoutEffect(() => {
    foldsRef.current = foldScope ? loadFolds(foldScope) : new Set();
  }, [foldScope]);

  // Heading folding: wrap each heading's section in a collapsible body and
  // prepend a chevron. Fold keys match the editor's live-preview keys so both
  // modes share one persisted state.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !foldScope) return;
    // Rebuild the unfold map only when the content actually changed — React
    // StrictMode re-runs this effect on the same DOM in dev, and clearing it
    // then would drop the callbacks registered on the first run
    const buildKey = `${foldScope}|${html}`;
    if (foldBuildKeyRef.current !== buildKey) {
      unfoldRef.current.clear();
      foldBuildKeyRef.current = buildKey;
    }
    const folds = foldsRef.current;
    const keyCounter = new FoldKeyCounter();

    Array.from(root.children).forEach((el) => {
      const m = /^H([1-6])$/.exec(el.tagName);
      if (!m) return;
      const heading = el as HTMLElement;
      // Idempotency guard — React StrictMode runs this effect twice on the
      // same DOM in dev, and re-wrapping would duplicate buttons/bodies
      if (heading.querySelector(":scope > .md-fold-btn")) return;
      const level = Number(m[1]);
      const key = keyCounter.next(level, (heading.textContent ?? "").trim());

      const section: Element[] = [];
      let next = heading.nextElementSibling;
      while (next && !(/^H[1-6]$/.test(next.tagName) && Number(next.tagName[1]) <= level)) {
        section.push(next);
        next = next.nextElementSibling;
      }
      if (section.length === 0) return;

      heading.classList.add("md-foldable");
      const body = document.createElement("div");
      body.className = "md-fold-body";
      section[0].parentNode?.insertBefore(body, section[0]);
      section.forEach((s) => body.appendChild(s));

      const btn = document.createElement("span");
      btn.className = "md-fold-btn";
      btn.textContent = "▾";

      const apply = (folded: boolean) => {
        body.style.display = folded ? "none" : "";
        heading.classList.toggle("md-folded", folded);
        btn.classList.toggle("md-folded", folded);
        if (folded) folds.add(key);
        else folds.delete(key);
        saveFold(foldScope, key, folded);
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        apply(!folds.has(key));
      });
      heading.prepend(btn);
      unfoldRef.current.set(body, () => apply(false));

      if (folds.has(key)) {
        body.style.display = "none";
        heading.classList.add("md-folded");
        btn.classList.add("md-folded");
      }
    });
  }, [html, foldScope]);

  // Inject callout title icons into the rendered HTML (lucide is React-side,
  // so we serialize icons to markup and splice them into the DOM)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>(".callout").forEach((el) => {
      const title = el.querySelector(".callout-title");
      if (!title || title.querySelector(".callout-title-icon")) return;
      const Icon = CALLOUT_ICONS[el.getAttribute("data-callout") ?? ""] ?? FileText;
      const holder = document.createElement("span");
      holder.className = "callout-title-icon";
      holder.innerHTML = renderToStaticMarkup(<Icon size={14} className="shrink-0" />);
      title.prepend(holder);
    });
  }, [html]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    const wikilink = target.closest("a[data-wikilink]") as HTMLElement | null;
    if (wikilink) {
      e.preventDefault();
      onOpenWikilink(wikilink.getAttribute("data-wikilink") ?? "");
      return;
    }

    const checkbox = target.closest("input.task-list-item-checkbox");
    if (checkbox) {
      e.preventDefault();
      const all = Array.from(containerRef.current?.querySelectorAll("input.task-list-item-checkbox") ?? []);
      onToggleTask(all.indexOf(checkbox));
      return;
    }

    const anchor = target.closest("a[href]");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        window.prism.openUrl(href);
      } else if (/\.md$/i.test(href)) {
        onResolveRelativeLink(href);
      }
      // other relative hrefs (images/anchors) are not navigable here
    }
  };

  return (
    <div className="relative h-full">
      <OutlineCard items={outline} onJump={jumpToHeading} activeId={activeHeadingId} />
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {frontmatter && values.show_frontmatter && <FrontmatterCard data={frontmatter} />}
        <div
          ref={containerRef}
          className="markdown-preview mx-auto px-8 pb-40 pt-4"
          style={{ maxWidth: "var(--content-width)" }}
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
