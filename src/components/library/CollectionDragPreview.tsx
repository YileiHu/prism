import DragPreview from "../DragPreview";
import { resolveTagColor } from "../../lib/colors";

export default function CollectionDragPreview({
  name,
  color,
  count,
}: {
  name: string;
  color?: string;
  count: number;
}) {
  return (
    <DragPreview className="flex items-center gap-1.5 px-3 py-1.5">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: resolveTagColor(name, color).bar }}
      />
      <span className="flex-1 text-body text-primary">{name}</span>
      <span className="text-caption text-muted">{count}</span>
    </DragPreview>
  );
}
