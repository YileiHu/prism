import { normalizePath } from "../../lib/paths";

export type { PdfDocument } from "../../shared/models";

export interface PdfCollectionData {
  id: string;
  name: string;
  color?: string;
  pdfPaths: string[];
}

export type PdfSort = "title" | "added" | "modified" | "pages";
export type PdfSortDir = "asc" | "desc";

// Collection paths are repo-relative with forward slashes; comparisons are
// case-insensitive because Windows paths are.
export function relKey(relPath: string): string {
  return normalizePath(relPath);
}

export function pdfCoverUrl(id: number, version: number): string {
  return `prism-cover://cover?id=${id}&v=${version}`;
}

// Streamed by the main process (range-capable) so large PDFs never have to be
// loaded into memory as a single buffer.
export function pdfDocumentUrl(id: number): string {
  return `prism-pdf://doc/${id}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}
