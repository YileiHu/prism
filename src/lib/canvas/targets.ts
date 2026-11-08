import type { CanvasTarget } from "./model";

export function leafName(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.replace(/\.(md|canvas\.json|json)$/i, "");
}

export function targetTitle(target: CanvasTarget | null): string {
  if (!target) return "";
  if (target.kind === "url") return target.url;
  return target.title || leafName(target.kind === "pdf" ? target.relPath : target.path);
}

// Only allow schemes the OS can hand off safely; anything else (javascript:,
// file:, data:) is rejected before it reaches shell.openExternal.
export function normalizeTargetUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? withScheme
      : null;
  } catch {
    return null;
  }
}
