import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  label: string;
  open: boolean;
  onToggle: () => void;
}

/**
 * Collapsible sidebar section header: chevron + label above a `sidebar-group`
 * frame. A section is a group of rows, not a destination — clicking it only
 * folds the list (the library's vaults/collections). Pair the open state with
 * `useSidebarSection`.
 */
export default function SidebarSection({ label, open, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex-shrink-0 flex items-center gap-1 px-2 pt-3 pb-1.5 text-caption font-medium text-muted hover:text-secondary cursor-pointer"
    >
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span className="truncate">{label}</span>
    </button>
  );
}
