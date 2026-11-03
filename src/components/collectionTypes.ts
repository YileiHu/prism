export interface NoteGroup {
  id: string;
  name: string;
  notePaths: string[];
  // Palette `bar` hex from TAG_COLORS; empty/undefined falls back to hashColor(name)
  color?: string;
}

export interface CollectionData {
  id: string;
  name: string;
  notePaths: string[];
  groups?: NoteGroup[];
  // Palette `bar` hex from TAG_COLORS; empty/undefined falls back to hashColor(name)
  color?: string;
}
