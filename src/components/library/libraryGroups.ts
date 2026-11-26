import type { CollectionData } from "../collectionTypes";
import type { PdfCollectionData } from "../pdf/types";
import type { ResourceCollection } from "../../shared/models";

// Read-only view model for every group-like sidebar/card entity. The source
// stores stay independent: this only normalizes id/name/color/count so the
// shared row, card and drag-preview components never need a source switch.
export interface LibraryGroup<T = unknown> {
  id: string;
  name: string;
  color?: string;
  count: number;
  source: T;
}

export function toNoteCollectionGroups(collections: CollectionData[]): LibraryGroup<CollectionData>[] {
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    color: collection.color,
    count: collection.notePaths.length
      + (collection.groups?.reduce((sum, group) => sum + group.notePaths.length, 0) ?? 0),
    source: collection,
  }));
}

export function toPdfCollectionGroups(collections: PdfCollectionData[]): LibraryGroup<PdfCollectionData>[] {
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    color: collection.color,
    count: collection.pdfPaths.length,
    source: collection,
  }));
}

export function toResourceCollectionGroups(collections: ResourceCollection[]): LibraryGroup<ResourceCollection>[] {
  return collections.map((collection) => ({
    id: String(collection.id),
    name: collection.name,
    color: collection.color,
    count: collection.count,
    source: collection,
  }));
}
