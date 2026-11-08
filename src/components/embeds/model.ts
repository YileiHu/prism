import { IMAGE_EXTS } from "../editor/assetUrl";
import {
  formatSizeToken,
  parseImageAlt,
  parseSizeToken,
  type ImageSize,
} from "../editor/imageSize";

export type EmbedKind = "image" | "canvas" | "note" | "pdf" | "link";

export interface EmbedSpec {
  kind: EmbedKind;
  target: string;
  label?: string;
  size: ImageSize | null;
}

// Navigation request emitted by a card; paths are absolute (resolved by the
// embed loader) so the workspace can open the exact document.
export type EmbedOpenTarget =
  | { kind: "canvas"; path: string; title: string }
  | { kind: "note"; path: string; title: string }
  | { kind: "pdf"; repoPath: string; relPath: string; title: string }
  | { kind: "link"; url: string };

export const CANVAS_PREVIEW_RATIO = 0.66;

// Preview width range shared by the size slider and the card renderer.
export const EMBED_SIZE_MIN = 300;
export const EMBED_SIZE_MAX = 600;
export const EMBED_SIZE_STEP = 20;

export function clampEmbedSize(size: ImageSize | null): ImageSize | null {
  if (!size) return null;
  const width = Math.min(EMBED_SIZE_MAX, Math.max(EMBED_SIZE_MIN, Math.round(size.width)));
  const height = size.height
    ? Math.round((size.height * width) / Math.max(1, size.width))
    : undefined;
  return { width, ...(height ? { height } : {}) };
}

export function detectEmbedKind(target: string): EmbedKind {
  const value = target.trim();
  const clean = value.split(/[?#]/)[0];
  // A remote URL that points straight at an image is an image, not a link
  if (/^https?:\/\//i.test(value) && IMAGE_EXTS.test(clean)) return "image";
  if (/^(https?:|mailto:)/i.test(value)) return "link";
  if (IMAGE_EXTS.test(clean)) return "image";
  // PDFs live in the separate PDF repo, not the vault; the card resolves the
  // target against that library's relPaths/titles.
  if (/\.pdf$/i.test(clean)) return "pdf";
  if (/\.(canvas|json)$/i.test(clean)) return "canvas";
  return "note";
}

// "![[target|label|WxH]]" semantics. Only visual kinds (image, canvas) treat
// a trailing numeric segment as a size; for notes and links every segment
// after the target is label text.
export function parseEmbedSpec(inner: string): EmbedSpec {
  const parts = inner.split("|");
  const target = (parts[0] ?? "").trim();
  const kind = detectEmbedKind(target);
  const visual = kind === "image" || kind === "canvas";
  let segments = parts.slice(1);
  let size: ImageSize | null = null;
  if (visual && segments.length > 0) {
    const candidate = parseSizeToken(segments[segments.length - 1]);
    if (candidate) {
      size = candidate;
      segments = segments.slice(0, -1);
    }
  }
  const label = segments.map((part) => part.trim()).filter(Boolean).join(" | ").trim();
  return { kind, target, ...(label ? { label } : {}), size };
}

function sanitizeLabel(label: string): string {
  // The embed parser stops at any bracket, so none may survive in a label
  return label
    .replace(/\r?\n/g, " ")
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\|/g, "／")
    .trim();
}

// Inner text for ![[...]] — the caller adds the surrounding brackets.
export function serializeEmbedSpec(spec: EmbedSpec): string {
  const target = spec.target.trim();
  const label = spec.label ? sanitizeLabel(spec.label) : "";
  const visual = spec.kind === "image" || spec.kind === "canvas";
  const size = visual && spec.size ? formatSizeToken(clampEmbedSize(spec.size)) : "";
  return [target, label, size].filter(Boolean).join("|");
}

// Legacy standard image syntax ![alt|WxH](src).
export function parseMarkdownImage(alt: string, src: string): EmbedSpec {
  const parsed = parseImageAlt(alt);
  return {
    kind: "image",
    target: src,
    ...(parsed.alt ? { label: parsed.alt } : {}),
    size: parsed.size,
  };
}

export function domainOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol.replace(/:$/, "") || url;
  } catch {
    return url;
  }
}

export function defaultEmbedHeight(kind: EmbedKind, width: number): number | undefined {
  return kind === "canvas" ? Math.round(width * CANVAS_PREVIEW_RATIO) : undefined;
}

// Rebuild a spec from the reading-view placeholder attributes.
export function specFromData(data: {
  kind?: string;
  target?: string;
  label?: string;
  size?: string;
}): EmbedSpec | null {
  const target = (data.target ?? "").trim();
  if (!target) return null;
  const kind = (data.kind as EmbedKind | undefined) ?? detectEmbedKind(target);
  return {
    kind,
    target,
    ...(data.label ? { label: data.label } : {}),
    size: data.size ? parseSizeToken(data.size) : null,
  };
}
