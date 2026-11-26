import type { NoteCollectionsFile, PdfCollectionsFile } from "./models";

// Library membership is single-assignment: a note/PDF belongs to at most one
// collection. Older sidecars could list the same path in several collections
// (and in both a collection root and one of its groups); normalize on read with
// a deterministic first-wins rule so the UI never shows a duplicate. The
// deduped state is persisted on the next natural save — reading never writes.

function pathKey(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function takeUnique(paths: string[], seen: Set<string>): string[] {
  const kept: string[] = [];
  for (const path of paths) {
    if (typeof path !== "string") continue;
    const key = pathKey(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(path);
  }
  return kept;
}

export function dedupeNoteCollections(file: NoteCollectionsFile | null): NoteCollectionsFile | null {
  if (!file || !Array.isArray(file.collections)) return file;
  const seen = new Set<string>();
  const collections = file.collections.map((collection) => {
    // Collection roots win over groups (a path listed in both keeps the root
    // slot, matching how `collectionHasNote` treats membership).
    const notePaths = takeUnique(collection.notePaths, seen);
    const groups = (collection.groups ?? []).map((group) => ({
      ...group,
      notePaths: takeUnique(group.notePaths, seen),
    }));
    return { ...collection, notePaths, groups };
  });
  return { ...file, collections };
}

export function dedupePdfCollections(file: PdfCollectionsFile | null): PdfCollectionsFile | null {
  if (!file || !Array.isArray(file.collections)) return file;
  const seen = new Set<string>();
  const collections = file.collections.map((collection) => ({
    ...collection,
    pdfPaths: takeUnique(collection.pdfPaths, seen),
  }));
  return { ...file, collections };
}
