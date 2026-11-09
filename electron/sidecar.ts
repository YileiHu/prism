import fs from "node:fs";
import path from "node:path";

// Sidecar JSON files live in <root>/.prism/*.json. Writes go through a temp
// file + rename so a crash mid-write cannot truncate the previous version.

/** Read a sidecar; a corrupt file is copied aside to .bak and treated as missing. */
export function readSidecar<T = unknown>(dir: string, name: string): T | null {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    try { fs.copyFileSync(file, `${file}.bak`); } catch { /* ignore */ }
    return null;
  }
}

export function writeSidecar(dir: string, name: string, data: unknown): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}
