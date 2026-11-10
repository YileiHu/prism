import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { BookOpen, Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import type { ImageSize } from "../editor/imageSize";
import { assetSrc } from "../editor/assetUrl";
import { pdfCoverUrl } from "../pdf/types";
import {
  EMBED_SIZE_MAX,
  clampEmbedSize,
  defaultEmbedHeight,
  type EmbedOpenTarget,
  type EmbedSpec,
} from "./model";
import {
  isAsyncKind,
  loadEmbed,
  subscribeEmbedData,
  type EmbedContext,
  type EmbedLoadResult,
} from "./loader";
import EmbedSizeSlider from "./EmbedSizeSlider";

// Only the canvas preview chunk imports @xyflow/react.
const CanvasEmbedPreview = lazy(() => import("./CanvasEmbedPreview"));

export interface EmbedLabels {
  open: string;
  size: string;
  label: string;
  loading: string;
  missing: string;
  corrupt: string;
  emptyCanvas: string;
  imageFailed: string;
  pageCount: string;
  copySyntax?: string;
  deleteEmbed?: string;
  editSource?: string;
}

export const DEFAULT_EMBED_LABELS: EmbedLabels = {
  open: "Open",
  size: "Preview size",
  label: "Caption",
  loading: "Loading...",
  missing: "Target not found",
  corrupt: "File is corrupted",
  emptyCanvas: "Empty canvas",
  imageFailed: "Image failed to load",
  pageCount: "{count} pages",
};

export const DEFAULT_EMBED_CANVAS_WIDTH = EMBED_SIZE_MAX;

export interface EmbedCardProps {
  spec: EmbedSpec;
  ctx: EmbedContext;
  editable: boolean;
  labels: EmbedLabels;
  onOpen: (target: EmbedOpenTarget) => void;
  onSizeCommit?: (size: ImageSize | null) => void;
  onLabelCommit?: (label: string) => void;
  onCopySyntax?: () => void;
  onDelete?: () => void;
  onEditSource?: () => void;
}

function StateLine({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className={`md-embed-state${error ? " md-embed-state-error" : ""}`}>
      <span>{text}</span>
    </div>
  );
}

function LoadingLine({ text }: { text: string }) {
  return (
    <div className="md-embed-state">
      <Loader2 size={14} className="animate-spin" />
      <span>{text}</span>
    </div>
  );
}

export default function EmbedCard({
  spec,
  ctx,
  editable,
  labels,
  onOpen,
  onSizeCommit,
  onLabelCommit,
  onCopySyntax,
  onDelete,
  onEditSource,
}: EmbedCardProps) {
  const asyncKind = isAsyncKind(spec.kind);
  const [result, setResult] = useState<EmbedLoadResult | null>(
    asyncKind ? { status: "loading" } : null,
  );
  const [localSize, setLocalSize] = useState<ImageSize | null>(() => clampEmbedSize(spec.size));
  const [imgFailed, setImgFailed] = useState(false);
  const [pdfCoverFailed, setPdfCoverFailed] = useState(false);
  const [labelDraft, setLabelDraft] = useState(spec.label ?? "");
  // While a size drag is active the toolbar is pinned to its on-screen rect so
  // the resizing card can't drag the slider out from under the pointer.
  const [toolbarAnchor, setToolbarAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    setLocalSize(clampEmbedSize(spec.size));
  }, [spec.size?.width, spec.size?.height]);

  useEffect(() => {
    setLabelDraft(spec.label ?? "");
  }, [spec.label]);

  useEffect(() => {
    if (!asyncKind) {
      setResult(null);
      return;
    }
    let cancelled = false;
    let initial = true;
    const run = () => {
      if (initial) setResult({ status: "loading" });
      initial = false;
      void loadEmbed(ctx, spec).then((next) => {
        if (!cancelled) setResult(next);
      });
    };
    run();
    const unsubscribe = subscribeEmbedData(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [asyncKind, spec.kind, spec.target, ctx.vaultPath, ctx.noteDir]);

  useEffect(() => {
    setImgFailed(false);
    setPdfCoverFailed(false);
  }, [spec.target]);

  const data = result?.status === "ready" ? result.data : null;

  let openTarget: EmbedOpenTarget | null = null;
  if (spec.kind === "link") {
    openTarget = { kind: "link", url: spec.target };
  } else if (data?.kind === "canvas") {
    openTarget = { kind: "canvas", path: data.canvasPath, title: data.title };
  } else if (data?.kind === "note") {
    openTarget = { kind: "note", path: data.path, title: data.title };
  } else if (data?.kind === "pdf") {
    openTarget = {
      kind: "pdf",
      repoPath: data.doc.repoPath,
      relPath: data.doc.relPath,
      title: data.doc.title,
    };
  }

  const commitLabel = () => {
    if (!onLabelCommit) return;
    const next = labelDraft.trim();
    if (next === (spec.label ?? "")) return;
    onLabelCommit(next);
  };

  const visual = spec.kind === "image" || spec.kind === "canvas";
  const canResize = editable && visual && Boolean(onSizeCommit);
  const canvasWidth = localSize?.width ?? DEFAULT_EMBED_CANVAS_WIDTH;
  const canvasHeight = localSize?.height ?? defaultEmbedHeight(spec.kind, canvasWidth) ?? 400;

  const imageStyle: CSSProperties | undefined = localSize
    ? { width: localSize.width, height: localSize.height ?? "auto" }
    : undefined;

  const body = (() => {
    if (spec.kind === "image") {
      if (imgFailed) return <StateLine text={labels.imageFailed} error />;
      return (
        <img
          src={assetSrc(spec.target, ctx)}
          alt={spec.label ?? ""}
          style={imageStyle}
          loading="lazy"
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      );
    }

    if (spec.kind === "link") {
      const domain = (() => {
        try { return new URL(spec.target).hostname || spec.target; } catch { return spec.target; }
      })();
      return (
        <div className="md-embed-link-body">
          <span className="md-embed-link-domain">{domain}</span>
          <span className="md-embed-link-label">{spec.label || domain}</span>
        </div>
      );
    }

    if (!result || result.status === "loading") return <LoadingLine text={labels.loading} />;
    if (result.status === "missing") return <StateLine text={labels.missing} error />;
    if (result.status === "corrupt") return <StateLine text={labels.corrupt} error />;
    if (result.status === "error") return <StateLine text={labels.missing} error />;

    if (data?.kind === "note") {
      return (
        <div className="md-embed-note-body">
          <span className="md-embed-note-title">{spec.label || data.title}</span>
          <span className="md-embed-note-path">{data.path}</span>
          {data.excerpt && <span className="md-embed-note-excerpt">{data.excerpt}</span>}
        </div>
      );
    }

    if (data?.kind === "pdf") {
      const doc = data.doc;
      const showCover = !pdfCoverFailed && doc.coverVersion > 0;
      return (
        <div className="md-embed-pdf-body">
          <div className="md-embed-pdf-cover">
            {showCover ? (
              <img
                src={pdfCoverUrl(doc.id, doc.coverVersion)}
                alt=""
                loading="lazy"
                draggable={false}
                onError={() => setPdfCoverFailed(true)}
              />
            ) : (
              <span className="md-embed-pdf-cover-empty">
                <BookOpen size={22} strokeWidth={1.4} />
              </span>
            )}
          </div>
          <div className="md-embed-pdf-meta">
            <span className="md-embed-pdf-title">{spec.label || doc.title}</span>
            {doc.pageCount != null && (
              <span className="md-embed-pdf-sub">
                {labels.pageCount.replace("{count}", String(doc.pageCount))}
              </span>
            )}
            <span className="md-embed-pdf-path">{doc.relPath}</span>
          </div>
        </div>
      );
    }

    if (data?.kind === "canvas") {
      const empty = data.doc.nodes.length === 0 && data.doc.groups.length === 0;
      return (
        <>
          <div
            className="md-embed-visual"
            style={{ width: canvasWidth, height: canvasHeight, maxWidth: "100%" }}
          >
            {empty ? (
              <StateLine text={labels.emptyCanvas} />
            ) : (
              <Suspense fallback={<LoadingLine text={labels.loading} />}>
                <CanvasEmbedPreview doc={data.doc} />
              </Suspense>
            )}
          </div>
          {spec.label && <span className="md-embed-caption">{spec.label}</span>}
        </>
      );
    }

    return <StateLine text={labels.missing} error />;
  })();

  return (
    <div className={`md-embed-card md-embed-card-${spec.kind} md-embed-${spec.kind}`}>
      {body}
      {openTarget && (
        <button
          type="button"
          className="md-embed-open-layer"
          aria-label={labels.open}
          title={labels.open}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(openTarget!);
          }}
          onMouseDown={(event) => event.preventDefault()}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      )}
      {editable && (
        <div
          className="md-embed-toolbar"
          style={toolbarAnchor ? {
            position: "fixed",
            left: toolbarAnchor.left,
            top: toolbarAnchor.top,
            right: "auto",
            width: toolbarAnchor.width,
            maxWidth: "none",
            opacity: 1,
            pointerEvents: "auto",
            zIndex: 50,
          } : undefined}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).tagName !== "INPUT") event.preventDefault();
          }}
        >
          {openTarget && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(openTarget!);
              }}
            >
              {labels.open}
            </button>
          )}
          {canResize && onSizeCommit && (
            <EmbedSizeSlider
              value={localSize}
              labels={labels}
              onPreview={(width) => setLocalSize({ width })}
              onDragChange={(rect) => setToolbarAnchor(
                rect ? { left: rect.left, top: rect.top, width: rect.width } : null,
              )}
              onCommit={(size) => {
                setLocalSize(size);
                onSizeCommit(size);
              }}
            />
          )}
          {canResize && onLabelCommit && spec.kind !== "image" && (
            <span className="h-4 w-px shrink-0 self-center bg-line" aria-hidden="true" />
          )}
          {onLabelCommit && spec.kind !== "image" && (
            <label className="flex items-center gap-1.5">
              <span className="text-caption text-muted">{labels.label}</span>
              <input
                className="field-inset w-24 rounded-chip border px-2 py-1 text-caption text-primary transition-colors focus:border-[var(--accent)] focus:outline-none"
                value={labelDraft}
                spellCheck={false}
                aria-label={labels.label}
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitLabel();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setLabelDraft(spec.label ?? "");
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          )}
          {onEditSource && (
            <button
              type="button"
              className="md-embed-toolbar-icon"
              title={labels.editSource ?? "Edit source"}
              aria-label={labels.editSource ?? "Edit source"}
              onClick={(event) => {
                event.stopPropagation();
                onEditSource();
              }}
            >
              <Pencil size={14} />
            </button>
          )}
          {onCopySyntax && (
            <button
              type="button"
              className="md-embed-toolbar-icon"
              title={labels.copySyntax ?? "Copy reference"}
              aria-label={labels.copySyntax ?? "Copy reference"}
              onClick={(event) => {
                event.stopPropagation();
                onCopySyntax();
              }}
            >
              <Copy size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="md-embed-toolbar-icon md-embed-toolbar-danger"
              title={labels.deleteEmbed ?? "Delete"}
              aria-label={labels.deleteEmbed ?? "Delete"}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
