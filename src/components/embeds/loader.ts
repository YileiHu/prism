import { parseCanvas, type CanvasDoc } from "../../lib/canvas/model";
import {
  CANVAS_CHANGED_EVENT,
  CANVAS_SAVED_EVENT,
  type CanvasChangeDetail,
  type CanvasSavedDetail,
} from "../../lib/canvas/events";
import { normalizePath } from "../../lib/workspace/types";
import type { CanvasFile, NoteBrief, PdfDocument } from "../../shared/models";
import { assetSrc, type AssetContext } from "../editor/assetUrl";
import { resolveNoteTarget } from "../editor/linkResolver";
import { domainOf, type EmbedKind, type EmbedSpec } from "./model";

export type EmbedContext = AssetContext;

export type EmbedData =
  | { kind: "image"; src: string }
  | { kind: "canvas"; canvasPath: string; title: string; doc: CanvasDoc }
  | { kind: "note"; path: string; title: string; excerpt: string }
  | { kind: "pdf"; doc: PdfDocument }
  | { kind: "link"; url: string; label: string; domain: string };

export type EmbedLoadResult =
  | { status: "loading" }
  | { status: "ready"; data: EmbedData }
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "error" };

interface CachedDoc {
  vaultKey: string;
  promise: Promise<EmbedLoadResult>;
}

const canvasListCache = new Map<string, Promise<CanvasFile[]>>();
const canvasDocCache = new Map<string, CachedDoc>();
const noteListCache = new Map<string, Promise<NoteBrief[]>>();
const noteExcerptCache = new Map<string, CachedDoc>();
const pdfTargetCache = new Map<string, Promise<PdfDocument | null>>();

const listeners = new Set<() => void>();
let wired = false;

function notify(): void {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* a stale card must not break the others */ }
  }
}

function dropVaultEntries(cache: Map<string, CachedDoc>, vaultKey: string): void {
  for (const [key, entry] of cache) {
    if (entry.vaultKey === vaultKey) cache.delete(key);
  }
}

function wireInvalidation(): void {
  if (wired) return;
  wired = true;
  window.addEventListener(CANVAS_CHANGED_EVENT, (event) => {
    const detail = (event as CustomEvent<CanvasChangeDetail>).detail;
    if (!detail?.vaultPath) return;
    const vaultKey = normalizePath(detail.vaultPath);
    canvasListCache.delete(vaultKey);
    dropVaultEntries(canvasDocCache, vaultKey);
    notify();
  });
  window.addEventListener(CANVAS_SAVED_EVENT, (event) => {
    const detail = (event as CustomEvent<CanvasSavedDetail>).detail;
    if (!detail?.canvasPath) return;
    canvasDocCache.delete(normalizePath(detail.canvasPath));
    notify();
  });
  // Vault rescans mean note files may have been added, renamed or deleted
  window.prism.onVaultUpdated((vaultPath) => {
    const vaultKey = normalizePath(vaultPath);
    noteListCache.delete(vaultKey);
    dropVaultEntries(noteExcerptCache, vaultKey);
    notify();
  });
  window.prism.onPdfUpdated(() => {
    pdfTargetCache.clear();
    notify();
  });
}

// Cards subscribe once each; cache invalidation re-runs their loaders.
export function subscribeEmbedData(listener: () => void): () => void {
  wireInvalidation();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function canvasList(vaultPath: string): Promise<CanvasFile[]> {
  const key = normalizePath(vaultPath);
  let promise = canvasListCache.get(key);
  if (!promise) {
    promise = window.prism.listCanvases(vaultPath);
    canvasListCache.set(key, promise);
    promise.catch(() => canvasListCache.delete(key));
  }
  return promise;
}

function noteList(vaultPath: string): Promise<NoteBrief[]> {
  const key = normalizePath(vaultPath);
  let promise = noteListCache.get(key);
  if (!promise) {
    promise = window.prism.getNoteList(vaultPath);
    noteListCache.set(key, promise);
    promise.catch(() => noteListCache.delete(key));
  }
  return promise;
}

// PDF targets are repo-relative paths (as written by InsertModal) or titles;
// the main process resolves the single row, so one card never pays for the
// whole library.
function pdfDocFor(target: string): Promise<PdfDocument | null> {
  const key = target.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  let promise = pdfTargetCache.get(key);
  if (!promise) {
    promise = window.prism.resolvePdfEmbed(target);
    pdfTargetCache.set(key, promise);
    promise.catch(() => pdfTargetCache.delete(key));
  }
  return promise;
}

function resolveCanvasFile(target: string, vaultPath: string, files: CanvasFile[]): CanvasFile | null {
  const value = target.trim();
  const rel = value.replace(/^[\\/]+/, "");
  const absolute = normalizePath(`${vaultPath}/${rel}`);
  const withJson = /\.json$/i.test(rel) ? absolute : `${absolute}.json`;
  const byPath = files.find((file) => {
    const path = normalizePath(file.path);
    return path === absolute || path === withJson;
  });
  if (byPath) return byPath;
  const title = value.replace(/\.json$/i, "").toLowerCase();
  return files.find((file) => file.title.toLowerCase() === title) ?? null;
}

async function loadCanvas(ctx: EmbedContext, target: string): Promise<EmbedLoadResult> {
  const files = await canvasList(ctx.vaultPath);
  const file = resolveCanvasFile(target, ctx.vaultPath, files);
  if (!file) return { status: "missing" };
  const key = normalizePath(file.path);
  const vaultKey = normalizePath(ctx.vaultPath);
  let cached = canvasDocCache.get(key);
  if (!cached) {
    const promise = (async (): Promise<EmbedLoadResult> => {
      try {
        const content = await window.prism.readCanvas(file.path);
        const parsed = parseCanvas(content.json);
        if (parsed.corrupt) return { status: "corrupt" };
        return {
          status: "ready",
          data: { kind: "canvas", canvasPath: file.path, title: content.title || file.title, doc: parsed.doc },
        };
      } catch (error) {
        const message = String(error);
        if (/ENOENT|no such file|CANVAS_MISSING/i.test(message)) return { status: "missing" };
        return { status: "error" };
      }
    })();
    cached = { vaultKey, promise };
    canvasDocCache.set(key, cached);
    promise.then((result) => {
      if (result.status !== "ready") canvasDocCache.delete(key);
    });
  }
  return cached.promise;
}

function excerptOf(content: string): string {
  const body = content
    .replace(/^﻿/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter((line) => line && !/^(```|~~~)/.test(line))
    .join(" ")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function loadNote(ctx: EmbedContext, target: string): Promise<EmbedLoadResult> {
  const notes = await noteList(ctx.vaultPath);
  const found = resolveNoteTarget(target, ctx.vaultPath, notes);
  if (!found) return { status: "missing" };
  const key = normalizePath(found.path);
  const vaultKey = normalizePath(ctx.vaultPath);
  let cached = noteExcerptCache.get(key);
  if (!cached) {
    const promise = (async (): Promise<EmbedLoadResult> => {
      try {
        const note = await window.prism.readNote(found.path);
        return {
          status: "ready",
          data: { kind: "note", path: found.path, title: found.title, excerpt: excerptOf(note.content) },
        };
      } catch (error) {
        const message = String(error);
        if (/ENOENT|no such file/i.test(message)) return { status: "missing" };
        return { status: "error" };
      }
    })();
    cached = { vaultKey, promise };
    noteExcerptCache.set(key, cached);
    promise.then((result) => {
      if (result.status !== "ready") noteExcerptCache.delete(key);
    });
  }
  return cached.promise;
}

async function loadPdf(target: string): Promise<EmbedLoadResult> {
  const doc = await pdfDocFor(target);
  return doc ? { status: "ready", data: { kind: "pdf", doc } } : { status: "missing" };
}

export async function loadEmbed(ctx: EmbedContext, spec: EmbedSpec): Promise<EmbedLoadResult> {
  if (spec.kind === "image") {
    return { status: "ready", data: { kind: "image", src: assetSrc(spec.target, ctx) } };
  }
  if (spec.kind === "link") {
    const domain = domainOf(spec.target);
    return {
      status: "ready",
      data: { kind: "link", url: spec.target, label: spec.label || domain, domain },
    };
  }
  wireInvalidation();
  try {
    if (spec.kind === "pdf") return await loadPdf(spec.target);
    if (spec.kind === "canvas") return await loadCanvas(ctx, spec.target);
    return await loadNote(ctx, spec.target);
  } catch {
    return { status: "error" };
  }
}

export function isAsyncKind(kind: EmbedKind): boolean {
  return kind === "canvas" || kind === "note" || kind === "pdf";
}
