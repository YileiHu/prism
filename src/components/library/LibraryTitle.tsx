import type { ReactNode } from "react";
import { CollectionIcon } from "../../lib/collectionIcons";

interface Props {
  title: ReactNode;
  /** Preset id of the selected collection; rendered as its icon. */
  icon?: string | null;
  count?: ReactNode;
  action?: ReactNode;
}

// Shared toolbar title: optional collection icon, title, optional count and a
// trailing inline action (for example the resource "clear tag" link).
export default function LibraryTitle({ title, icon, count, action }: Props) {
  return (
    <>
      {icon !== undefined && icon !== null && (
        <span className="flex-shrink-0 text-tertiary">
          <CollectionIcon icon={icon} size={14} />
        </span>
      )}
      <span className="min-w-0 text-body font-medium text-primary truncate">{title}</span>
      {count !== undefined && <span className="text-caption text-faint tabular-nums">{count}</span>}
      {action}
    </>
  );
}
