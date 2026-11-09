import path from "path";

/** Absolute, forward-slash, trailing-slash-free, case-folded key for comparisons. */
export function pathKey(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isPathInside(root: string, target: string): boolean {
  const r = pathKey(root);
  const t = pathKey(target);
  return t === r || t.startsWith(r + "/");
}
