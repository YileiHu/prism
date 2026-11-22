import { normalizePath } from "./paths";

export type LibrarySelectionSource = "note" | "pdf" | "resources";

// Every library source remembers its last selected group under a settings key.
// The key shapes are kept for compatibility with existing users; only the
// construction and IO are centralized so new sources cannot invent a new
// pattern.
export function librarySelectionKey(source: LibrarySelectionSource, scope = ""): string {
  if (source === "note") return `last_coll_${scope}`;
  if (source === "pdf") return `last_pdf_coll_${normalizePath(scope)}`;
  return "last_resource_tag";
}

export async function readLibrarySelection(key: string): Promise<string> {
  try {
    return (await window.prism.getSetting(key)) ?? "";
  } catch {
    return "";
  }
}

export async function writeLibrarySelection(key: string, value: string | null): Promise<void> {
  try {
    await window.prism.setSetting(key, value ?? "");
  } catch {
    // Selection memory is best-effort; the in-memory state remains usable.
  }
}
