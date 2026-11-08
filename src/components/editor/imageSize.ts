export interface ImageSize {
  width: number;
  height?: number;
}

export const IMAGE_SIZE_MIN = 24;
export const IMAGE_SIZE_MAX = 4000;

// Trailing alt/embed segment: "400" or "400x300" (also accepts ×)
const SIZE_TOKEN_RE = /^(\d{1,5})(?:[xX×](\d{1,5}))?$/;

function clampSize(value: number): number {
  return Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, Math.round(value)));
}

export function parseSizeToken(token: string): ImageSize | null {
  const m = SIZE_TOKEN_RE.exec(token.trim());
  if (!m) return null;
  return {
    width: clampSize(Number(m[1])),
    height: m[2] ? clampSize(Number(m[2])) : undefined,
  };
}

export function formatSizeToken(size: ImageSize | null): string {
  if (!size) return "";
  return size.height ? `${size.width}x${size.height}` : String(size.width);
}

// Standard image alt text: only a numeric trailing pipe segment counts as size
export function parseImageAlt(alt: string): { alt: string; size: ImageSize | null } {
  const pipe = alt.lastIndexOf("|");
  if (pipe === -1) return { alt, size: null };
  const size = parseSizeToken(alt.slice(pipe + 1));
  if (!size) return { alt, size: null };
  return { alt: alt.slice(0, pipe).trimEnd(), size };
}

export function withSizeInAlt(alt: string, size: ImageSize | null): string {
  const base = parseImageAlt(alt).alt;
  return size ? `${base}|${formatSizeToken(size)}` : base;
}

export function imageSizeAttrs(size: ImageSize | null): string {
  if (!size) return "";
  return ` width="${size.width}"${size.height ? ` height="${size.height}"` : ""}`;
}
