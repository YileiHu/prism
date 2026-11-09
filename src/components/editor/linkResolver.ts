import type { NoteRef } from "../../shared/models";
import { normalizePath } from "../../lib/paths";

export type LinkNoteBrief = NoteRef;

// Resolve a wikilink target against the vault's notes: exact path match
// (absolute-in-vault or vault-relative, with/without .md), then title match
// (most-recently-modified first, which is how brief lists are ordered).
// "#heading" suffixes are stripped; "#heading"-only links resolve to null
// (same-note anchors are not navigable between files).
export function resolveNoteTarget(target: string, vaultPath: string, notes: LinkNoteBrief[]): LinkNoteBrief | null {
  const pathPart = target.split("#")[0].trim();
  if (!pathPart) return null;

  const candidates: string[] = [];
  const cleaned = pathPart.replace(/\/{2,}/g, "/");
  const withMd = /\.md$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
  for (const raw of [cleaned, withMd]) {
    const joined = raw.replace(/^\//, "");
    candidates.push(normalizePath(`${vaultPath}/${joined}`));
  }

  for (const note of notes) {
    if (candidates.includes(normalizePath(note.path))) return note;
  }

  const titleLower = cleaned.replace(/\.md$/i, "").toLowerCase();
  return notes.find((n) => n.title.toLowerCase() === titleLower) ?? null;
}

// Turn a relative markdown link ("../dir/Note.md") into a vault-absolute
// path-shaped target string
export function resolveRelativeLink(href: string, notePath: string): string {
  const segments = notePath.replace(/\\/g, "/").split("/").slice(0, -1);
  for (const part of href.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}
