import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineItem } from "../editor/OutlineCard";

export interface PdfOutlineEntry extends OutlineItem {
  page: number | null;
}

type OutlineNode = NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>[number];

async function resolveDestPage(
  pdf: PDFDocumentProxy,
  dest: OutlineNode["dest"],
): Promise<number | null> {
  if (!dest) return null;
  try {
    const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(resolved) || resolved.length === 0) return null;
    const ref = resolved[0];
    if (typeof ref === "number") return Math.max(1, ref + 1);
    if (ref && typeof ref === "object") return (await pdf.getPageIndex(ref)) + 1;
  } catch {
    // Named destinations can point outside the document or at removed pages
  }
  return null;
}

// Flattens pdf.js's nested outline into the flat, id-addressable shape the
// shared OutlineCard renders. Entries whose destination cannot be resolved
// stay visible as headings but are not clickable.
export async function loadPdfOutline(pdf: PDFDocumentProxy): Promise<PdfOutlineEntry[]> {
  const nodes = await pdf.getOutline();
  if (!nodes?.length) return [];

  const items: PdfOutlineEntry[] = [];
  const walk = async (siblings: OutlineNode[], level: number, prefix: string) => {
    for (let i = 0; i < siblings.length; i++) {
      const node = siblings[i];
      const id = `${prefix}${i}`;
      const page = await resolveDestPage(pdf, node.dest);
      items.push({ id, level, text: node.title.trim() || "—", page });
      if (node.items?.length) await walk(node.items, level + 1, `${id}.`);
    }
  };

  await walk(nodes, 1, "");
  return items;
}
