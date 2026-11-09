// Local asset URLs live on disk inside the vault, which the renderer can't
// fetch directly — they go through the prism-file:// protocol
// (electron/main.ts), which resolves the ref against the note's folder and
// the vault root.

export interface AssetContext {
  vaultPath: string;
  noteDir: string;
}

export const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

// Bumped whenever a private vault locks/unlocks. Chromium may still hold
// decrypted images from before the lock, so every rebuild gets a fresh URL.
let assetEpoch = 0;

export function bumpAssetEpoch(): void {
  assetEpoch += 1;
}

export function prismFileUrl(vaultPath: string, ref: string, noteDir: string): string {
  return `prism-file:///asset?vault=${encodeURIComponent(vaultPath)}&ref=${encodeURIComponent(ref)}&dir=${encodeURIComponent(noteDir)}&pv=${assetEpoch}`;
}

// Remote and inline assets load as-is; everything else is vault-local.
export function assetSrc(ref: string, ctx: AssetContext): string {
  if (/^(https?:|data:)/i.test(ref)) return ref;
  return prismFileUrl(ctx.vaultPath, ref.replace(/^[\\/]+/, ""), ctx.noteDir);
}
