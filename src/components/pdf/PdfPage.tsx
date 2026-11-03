import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useT } from "../../i18n";
import { Skeleton } from "../Skeleton";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  active: boolean;
  registerRef: (pageNumber: number, el: HTMLDivElement | null) => void;
}

const DEFAULT_RATIO = 1.414; // height / width, A4 portrait

export default function PdfPage({ pdf, pageNumber, width, active, registerRef }: Props) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState(false);

  // Only the visible tab observes/renders pages; background tabs release their
  // canvases while keeping scroll offset and layout.
  useEffect(() => {
    if (!active) {
      setNear(false);
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active || !near) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setRendered(false);
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    setRendered(false);
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) {
          setRendered(true);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* already finished */ }
    };
  }, [active, near, pageNumber, pdf, width]);

  return (
    <div
      ref={(el) => {
        hostRef.current = el;
        registerRef(pageNumber, el);
      }}
      data-pdf-page={pageNumber}
      className="relative scroll-mt-4 bg-elevated/40 border border-line/50 shadow-sm"
      style={{ width, minHeight: width * ratio }}
    >
      {!rendered && (
        <div className="absolute inset-0">
          <Skeleton className="w-full h-full rounded-none" />
          {error && (
            <span className="absolute inset-0 flex items-center justify-center text-caption text-danger px-2 text-center">
              {t["pdf.reader.pageError"].replace("{page}", String(pageNumber))}
            </span>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`block w-full h-auto ${rendered ? "" : "invisible"}`}
      />
    </div>
  );
}
