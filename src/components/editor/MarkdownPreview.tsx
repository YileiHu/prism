import { useEffect, useMemo, useRef, type RefObject } from "react";
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
    <div className="mx-auto max-w-[750px] mb-4 px-1 pt-4">
      <div className="rounded-lg border border-line/60 bg-surface/60 px-4 py-2.5 text-xs overflow-hidden">
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

export default function MarkdownPreview({ content, assetContext, foldScope, onToggleTask, onOpenWikilink, onResolveRelativeLink, scrollRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { html, frontmatter, outline } = useMemo(() => renderMarkdown(content, assetContext), [content, assetContext]);
  const foldsRef = useRef<Set<string>>(new Set());

  const jumpToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    foldsRef.current = foldScope ? loadFolds(foldScope) : new Set();
  }, [foldScope]);

  // Heading folding: wrap each heading's section in a collapsible body and
  // prepend a chevron. Fold keys match the editor's live-preview keys so both
  // modes share one persisted state.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !foldScope) return;
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
      <OutlineCard items={outline} onJump={jumpToHeading} />
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {frontmatter && <FrontmatterCard data={frontmatter} />}
        <div
          ref={containerRef}
          className="markdown-preview mx-auto max-w-[750px] px-8 pb-40 pt-4"
          onClick={handleClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
