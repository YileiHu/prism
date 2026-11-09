/** Forward slashes, no trailing slash, lower-cased — a comparison key. */
export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Canonical lookup key for a vault-relative note path. */
export function noteKey(value: string): string {
  return normalizePath(value);
}

/** Vault-absolute path → vault-relative path with forward slashes. */
export function toRelativePath(absPath: string, vaultPath: string): string {
  const vp = vaultPath.replace(/\\/g, "/").toLowerCase();
  const ap = absPath.replace(/\\/g, "/").toLowerCase();
  if (ap.startsWith(vp)) {
    return absPath.slice(vaultPath.length).replace(/^[/\\]/, "").replace(/\\/g, "/");
  }
  return absPath.replace(/\\/g, "/");
}

// Like toRelativePath, but returns null for paths outside the vault. Collection
// files may only ever reference notes inside their own vault; anything else is
// a cross-vault leak and must never be persisted.
export function relativePathInsideVault(absPath: string, vaultPath: string): string | null {
  const vp = vaultPath.replace(/[\\/]+$/, "");
  if (!vp) return null;
  const vpNorm = vp.replace(/\\/g, "/").toLowerCase();
  const apNorm = absPath.replace(/\\/g, "/").toLowerCase();
  if (apNorm === vpNorm) return "";
  if (!apNorm.startsWith(vpNorm + "/")) return null;
  return absPath.slice(vp.length).replace(/^[/\\]+/, "").replace(/\\/g, "/");
}
