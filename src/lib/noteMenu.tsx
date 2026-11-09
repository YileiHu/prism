import { FolderOpen, Star } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import type { NoteRef } from "../shared/models";

export async function toggleFavoriteNote(note: NoteRef): Promise<boolean> {
  const nowFavorite = await window.prism.toggleFavoriteNote(note.path, note.title);
  window.dispatchEvent(new Event("favorites-changed"));
  return nowFavorite;
}

/** Favorite/unfavorite plus optional "show in explorer" for a note row menu. */
export function noteBaseMenuItems(
  note: NoteRef,
  isFavorite: boolean,
  labels: { favorite: string; unfavorite: string; showInExplorer?: string },
): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: isFavorite ? labels.unfavorite : labels.favorite,
      icon: <Star size={14} />,
      onClick: () => { void toggleFavoriteNote(note); },
    },
  ];
  if (labels.showInExplorer) {
    items.push({
      label: labels.showInExplorer,
      icon: <FolderOpen size={14} />,
      onClick: () => window.prism.showItemInFolder(note.path),
    });
  }
  return items;
}
