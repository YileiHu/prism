import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  Columns2,
  FolderOpen,
  Maximize2,
  TriangleAlert,
} from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import Button from "../Button";
import Spinner from "../Spinner";
import { loadPdf } from "./pdfjs";
import PdfPage from "./PdfPage";
import { pdfDocumentUrl, type PdfDocument } from "./types";

interface Props {
  doc: PdfDocument;
  active: boolean;
  onClose: () => void;
  onShowInFolder: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP_PERCENT = 10;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export default function PdfReader({ doc, active, onClose, onShowInFolder }: Props) {
  const { t } = useT();
  const { values } = useSettings();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const currentPageRef = useRef(1);
  const frameRef = useRef<number | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [baseWidth, setBaseWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [spread, setSpread] = useState(false);
  const [pageDraft, setPageDraft] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let proxy: PDFDocumentProxy | null = null;
    setPdf(null);
    setNumPages(0);
    setBaseWidth(0);
    currentPageRef.current = 1;
    setPageDraft("1");
    setZoom(clampZoom(values.pdf_default_zoom / 100));
    setError("");
    setLoading(true);

    void (async () => {
      try {
        proxy = await loadPdf(pdfDocumentUrl(doc.id));
        if (cancelled) {
          void proxy.loadingTask.destroy().catch(() => { /* ignore */ });
          return;
        }
        const firstPage = await proxy.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        if (cancelled) return;
        setBaseWidth(viewport.width);
        setNumPages(proxy.numPages);
        setPdf(proxy);
        void window.prism.pdfSetPageCount(doc.id, proxy.numPages);
      } catch {
        if (!cancelled) setError(t["pdf.reader.errorDesc"]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (proxy) void proxy.loadingTask.destroy().catch(() => { /* ignore */ });
    };
    // t is intentionally read once per document open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [pdf]);

  const registerPage = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(pageNumber, el);
    else pageEls.current.delete(pageNumber);
  }, []);

  const jumpToPage = useCallback((page: number) => {
    const target = Math.min(numPages || 1, Math.max(1, page));
    const el = pageEls.current.get(target);
    if (el) el.scrollIntoView({ block: "start" });
    currentPageRef.current = target;
    setPageDraft(String(target));
  }, [numPages]);

  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      let best = currentPageRef.current;
      let bestDistance = Infinity;
      pageEls.current.forEach((el, pageNumber) => {
        const pageRect = el.getBoundingClientRect();
        const distance = Math.abs(pageRect.top + pageRect.height / 2 - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = pageNumber;
        }
      });
      if (spread) best -= (best - 1) % 2;
      if (best !== currentPageRef.current) {
        currentPageRef.current = best;
        setPageDraft(String(best));
      }
    });
  }, [spread]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const commitPageDraft = useCallback(() => {
    const parsed = Number(pageDraft);
    if (!Number.isFinite(parsed)) {
      setPageDraft(String(currentPageRef.current));
      return;
    }
    jumpToPage(Math.floor(parsed));
  }, [jumpToPage, pageDraft]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      // A dialog owns the keyboard while it is open (its own Esc handling
      // runs on document, so ours must not also leave the reader).
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (typing) return;
      const step = spread ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        jumpToPage(currentPageRef.current + step);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        jumpToPage(currentPageRef.current - step);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, jumpToPage, onClose, spread]);

  const availableWidth = Math.max(200, containerWidth - 48);
  const spreadGap = 16;
  const perPageWidth = spread
    ? Math.max(120, Math.floor((availableWidth - spreadGap) / 2))
    : availableWidth;
  const scale = baseWidth > 0 ? (perPageWidth / baseWidth) * zoom : 1;
  const pageWidth = baseWidth > 0 ? Math.round(baseWidth * scale) : 0;
  const rowCount = spread ? Math.ceil(numPages / 2) : numPages;

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 flex items-center gap-2 px-2 border-b border-line bg-surface/60 flex-shrink-0">
        <Button variant="ghost" size="icon-md" onClick={onClose} title={t["pdf.reader.back"]}>
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1 truncate text-body font-medium text-primary px-1" title={doc.title}>
          {doc.title}
        </div>

        <div className="w-px h-5 bg-line/70 flex-shrink-0" />

        <div className="flex items-center gap-1.5">
          <span className="text-caption text-muted whitespace-nowrap">{t["pdf.reader.page"]}</span>
          <input
            value={pageDraft}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={commitPageDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitPageDraft();
                (e.target as HTMLInputElement).blur();
              }
            }}
            inputMode="numeric"
            aria-label={t["pdf.reader.pageInput"]}
            title={t["pdf.reader.pageInput"]}
            className="w-10 bg-elevated/50 hover:bg-elevated/70 text-center text-caption text-secondary tabular-nums rounded-chip border border-transparent hover:border-line focus:border-[var(--accent)] focus:outline-none px-1 py-0.5"
          />
          <span className="text-caption text-muted tabular-nums whitespace-nowrap">
            / {numPages || "—"}
          </span>
        </div>

        <div className="w-px h-5 bg-line/70 flex-shrink-0" />

        <div className="flex items-center gap-1.5">
          <span className="text-caption text-muted whitespace-nowrap">{t["pdf.reader.zoom"]}</span>
          <input
            type="range"
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
            step={ZOOM_STEP_PERCENT}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            aria-label={t["pdf.reader.zoom"]}
            title={t["pdf.reader.zoom"]}
            style={{
              "--slider-progress": `${
                ((zoom * 100 - MIN_ZOOM * 100) / ((MAX_ZOOM - MIN_ZOOM) * 100)) * 100
              }%`,
            } as CSSProperties}
            className="w-24 cursor-pointer"
          />
          <span className="text-caption text-muted tabular-nums w-9 text-right">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="w-px h-5 bg-line/70 flex-shrink-0" />

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-md"
            onClick={() => setZoom(1)}
            title={t["pdf.reader.fitWidth"]}
          >
            <Maximize2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon-md"
            active={spread}
            onClick={() => setSpread((v) => !v)}
            title={spread ? t["pdf.reader.single"] : t["pdf.reader.spread"]}
          >
            <Columns2 size={16} />
          </Button>
          <Button variant="ghost" size="icon-md" onClick={onShowInFolder} title={t["pdf.showInFolder"]}>
            <FolderOpen size={16} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted">
          <Spinner size={22} />
          <span className="text-caption">{t["pdf.reader.loading"]}</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <TriangleAlert size={28} className="text-warning" />
          <p className="text-body text-secondary max-w-md">{error}</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onShowInFolder}>
              <FolderOpen size={14} />
              {t["pdf.showInFolder"]}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t["pdf.reader.back"]}
            </Button>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-base/60">
          <div className="flex flex-col items-center gap-4 py-6">
            {pdf && pageWidth > 0 && Array.from({ length: rowCount }, (_, row) => {
              const start = spread ? row * 2 + 1 : row + 1;
              const pages = spread
                ? [start, start + 1].filter((pageNumber) => pageNumber <= numPages)
                : [start];
              return (
                <div key={start} className="flex items-start justify-center" style={{ gap: spreadGap }}>
                  {pages.map((pageNumber) => (
                    <div key={pageNumber} className="scroll-mt-4">
                      <PdfPage
                        pdf={pdf}
                        pageNumber={pageNumber}
                        width={pageWidth}
                        active={active}
                        registerRef={registerPage}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
