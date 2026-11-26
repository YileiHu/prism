import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode, Ref } from "react";
import { type MenuItem } from "./ContextMenu";
import { useContextMenu } from "../lib/useContextMenu";
import type { SelectionEdge } from "../lib/selectionEdge";
import SelectionCheck from "./SelectionCheck";

type PrimaryClickEvent = MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>;

// A selection run is one block: only its first/last row keeps the outer radius,
// so adjacent selected rows do not read as a stack of separate pills.
const SELECTION_RADIUS: Record<SelectionEdge, string> = {
  only: "rounded-control",
  first: "rounded-t-control",
  middle: "rounded-none",
  last: "rounded-b-control",
};

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  selected?: boolean;
  /** Renders the selection indicator; the row still owns the click. */
  selectable?: boolean;
  checked?: boolean;
  /** Corner set for the row's position inside a selection run. */
  selectionEdge?: SelectionEdge;
  /** dnd-kit / measurement ref (the row is not a forwardRef component). */
  rowRef?: Ref<HTMLDivElement>;
  onPrimaryClick?: (event: PrimaryClickEvent) => void;
  menuItems?: MenuItem[];
  leading?: ReactNode;
  title: ReactNode;
  tooltip?: string;
  trailing?: ReactNode;
  meta?: ReactNode;
  multiline?: boolean;
}

/**
 * Content row for the main pane. Actions live in the context menu
 * (`menuItems`, right-click) or behind a row click (`onPrimaryClick`); the row
 * itself never grows trailing buttons, and rows are separated by the hover
 * block rather than dividers.
 */
export default function ItemRow({
  selected,
  selectable = false,
  checked = false,
  selectionEdge,
  rowRef,
  onPrimaryClick,
  menuItems,
  leading,
  title,
  tooltip,
  trailing,
  meta,
  multiline = false,
  className = "",
  onContextMenu: propsOnContextMenu,
  role,
  tabIndex,
  onKeyDown,
  ...rest
}: Props) {
  const { onContextMenu: openMenu } = useContextMenu();
  const interactive = !!onPrimaryClick;
  // A right-click menu is an affordance too: menu-only rows still highlight on
  // hover so the cursor suggests there is something to open.
  const hoverable = interactive || !!menuItems?.length;
  const radiusClass = selected ? SELECTION_RADIUS[selectionEdge ?? "only"] : "rounded-control";

  return (
    <div
      {...rest}
      ref={rowRef}
      title={tooltip}
      onClick={(event) => onPrimaryClick?.(event)}
      onContextMenu={menuItems ? (e) => openMenu(e, menuItems) : propsOnContextMenu}
      role={role ?? (interactive ? "button" : undefined)}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      aria-pressed={selectable ? checked : undefined}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!interactive || e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPrimaryClick(e);
        }
      }}
      className={`group flex gap-2 px-2 py-1.5 ${radiusClass} transition-colors ${multiline ? "items-start" : "items-center"} ${
        selected ? "bg-[var(--accent-muted)] selection-bar" : hoverable ? "hover:bg-[var(--sidebar-item-hover)]" : ""
      } ${interactive ? "cursor-pointer" : ""} ${className}`}
    >
      {selectable && <SelectionCheck checked={checked} />}
      {leading}
      <span className={`flex-1 min-w-0 text-body ${multiline ? "whitespace-pre-wrap break-words" : "truncate"} ${selected ? "text-[var(--accent-text)]" : "text-primary"}`}>
        {title}
      </span>
      {trailing}
      {meta}
    </div>
  );
}
