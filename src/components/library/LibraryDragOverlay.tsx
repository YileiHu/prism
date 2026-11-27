import { BookOpen } from "lucide-react";
import { DragOverlay } from "@dnd-kit/core";
import { useT } from "../../i18n";
import DragPreview from "../DragPreview";
import CollectionDragPreview from "./CollectionDragPreview";
import type { LibraryDragState } from "./useLibraryDnd";

// The single overlay for every library drag payload. Kept beside
// useLibraryDnd so both sidebar hosts render the same preview chrome.
export default function LibraryDragOverlay({ drag }: { drag: LibraryDragState }) {
  const { t } = useT();
  return (
    <DragOverlay dropAnimation={null}>
      {drag?.kind === "note" && (
        <DragPreview className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-body text-primary whitespace-nowrap">
            {drag.paths.length > 1
              ? t["collections.dragNotes"].replace("{count}", String(drag.paths.length))
              : drag.title}
          </span>
        </DragPreview>
      )}
      {drag?.kind === "note-collection" && (
        <CollectionDragPreview
          name={drag.collection.name}
          icon={drag.collection.icon}
          count={drag.collection.notePaths.length
            + (drag.collection.groups?.reduce((sum, group) => sum + group.notePaths.length, 0) ?? 0)}
        />
      )}
      {drag?.kind === "pdf-doc" && (
        <DragPreview className="w-36 overflow-hidden">
          <div className="aspect-[3/4] flex items-center justify-center bg-surface text-faint">
            <BookOpen size={26} strokeWidth={1.3} />
          </div>
          <div className="px-2 py-1.5 text-caption text-primary truncate">{drag.title}</div>
        </DragPreview>
      )}
      {drag?.kind === "pdf-collection" && (
        <CollectionDragPreview
          name={drag.collection.name}
          icon={drag.collection.icon}
          count={drag.collection.pdfPaths.length}
        />
      )}
    </DragOverlay>
  );
}
