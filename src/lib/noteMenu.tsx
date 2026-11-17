import { FolderOpen } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import type { NoteRef } from "../shared/models";

/** Base note-row menu shared by note lists. */
export function noteBaseMenuItems(
  note: NoteRef,
  labels: { showInExplorer?: string },
): MenuItem[] {
  if (!labels.showInExplorer) return [];
  return [
    {
      label: labels.showInExplorer,
      icon: <FolderOpen size={14} />,
      onClick: () => window.prism.showItemInFolder(note.path),
    },
  ];
}
