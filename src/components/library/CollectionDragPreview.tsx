import DragPreview from "../DragPreview";
import { CollectionIcon } from "../../lib/collectionIcons";

export default function CollectionDragPreview({
  name,
  icon,
  count,
}: {
  name: string;
  icon?: string;
  count: number;
}) {
  return (
    <DragPreview className="flex items-center gap-1.5 px-3 py-1.5">
      <span className="flex-shrink-0 text-muted">
        <CollectionIcon icon={icon} size={14} />
      </span>
      <span className="flex-1 text-body text-primary">{name}</span>
      <span className="text-caption text-muted">{count}</span>
    </DragPreview>
  );
}
