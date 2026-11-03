import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";

let workerReady = false;

// The packaged renderer runs from file://, where loading pdf.worker.mjs from a
// URL is blocked. The inline worker becomes a blob URL, which works in both
// dev and production.
function ensureWorker() {
  if (workerReady) return;
  workerReady = true;
  GlobalWorkerOptions.workerPort = new PdfWorker();
}

// Streamed over prism-pdf:// with range requests; auto-fetch stays off so only
// the chunks needed for visible pages are downloaded.
export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  ensureWorker();
  const task = getDocument({ url, disableAutoFetch: true });
  return task.promise;
}

export interface RenderedCover {
  jpeg: Uint8Array;
  pageCount: number;
}

export async function renderFirstPageJpeg(url: string, targetWidth: number): Promise<RenderedCover> {
  const doc = await loadPdf(url);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("COVER_ENCODE_FAILED");
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    return { jpeg, pageCount: doc.numPages };
  } finally {
    await doc.loadingTask.destroy();
  }
}
