import type { ReactNode } from "react";
import type { PaletteColor } from "../../lib/colors";

interface Props {
  title: ReactNode;
  color?: PaletteColor | null;
  count?: ReactNode;
  action?: ReactNode;
}

// Shared toolbar title: optional group color dot, title, optional count and a
// trailing inline action (for example the resource "clear tag" link).
export default function LibraryTitle({ title, color, count, action }: Props) {
  return (
    <>
      {color && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color.bar }}
        />
      )}
      <span className="min-w-0 text-body font-medium text-primary truncate">{title}</span>
      {count !== undefined && <span className="text-caption text-faint tabular-nums">{count}</span>}
      {action}
    </>
  );
}
