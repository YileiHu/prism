import type { HTMLAttributes, ReactNode } from "react";
import { type MenuItem } from "./ContextMenu";
import { useContextMenu } from "../lib/useContextMenu";

export interface ItemRowHoverAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  selected?: boolean;
  onPrimaryClick?: () => void;
  menuItems?: MenuItem[];
  leading?: ReactNode;
  title: ReactNode;
  tooltip?: string;
  trailing?: ReactNode;
  meta?: ReactNode;
  hoverActions?: ItemRowHoverAction[];
  variant?: "dense" | "list";
  multiline?: boolean;
}

export default function ItemRow({
  selected,
  onPrimaryClick,
  menuItems,
  leading,
  title,
  tooltip,
  trailing,
  meta,
  hoverActions,
  variant = "list",
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
  const hasHoverActions = !!hoverActions?.length;
  // Overlaying an always-visible action would collide with meta, so only swap
  // when every action is hover-only.
  const swapMeta = meta != null && hasHoverActions && hoverActions!.every((a) => !a.active);

  const renderHoverAction = (action: ItemRowHoverAction, i: number) => (
    <button
      key={i}
      title={action.label}
      onClick={(e) => { e.stopPropagation(); action.onClick(); }}
      className={`flex-shrink-0 transition-opacity ${action.active ? "" : "opacity-0 group-hover:opacity-100"} ${action.className ?? "text-faint hover:text-secondary"}`}
    >
      {action.icon}
    </button>
  );

  return (
    <div
      {...rest}
      title={tooltip}
      onClick={onPrimaryClick}
      onContextMenu={menuItems ? (e) => openMenu(e, menuItems) : propsOnContextMenu}
      role={role ?? (interactive ? "button" : undefined)}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!interactive || e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPrimaryClick();
        }
      }}
      className={`group flex gap-2 transition-colors ${multiline ? "items-start" : "items-center"} ${variant === "dense" ? "px-2 py-1.5 rounded-control" : "px-3 py-1.5"} ${
        selected ? "bg-[var(--accent-muted)] active-bar" : "hover:bg-elevated/50"
      } ${interactive ? "cursor-pointer" : ""} ${className}`}
    >
      {leading}
      <span className={`flex-1 min-w-0 text-body ${multiline ? "whitespace-pre-wrap break-words" : "truncate"} ${selected ? "text-[var(--accent-text)]" : "text-primary"}`}>
        {title}
      </span>
      {trailing}
      {swapMeta ? (
        <span className="relative flex flex-shrink-0 items-center justify-end">
          <span className="flex items-center transition-opacity group-hover:opacity-0">{meta}</span>
          <span className="absolute inset-y-0 right-0 flex items-center gap-2">
            {hoverActions!.map(renderHoverAction)}
          </span>
        </span>
      ) : (
        <>
          {meta}
          {hoverActions?.map(renderHoverAction)}
        </>
      )}
    </div>
  );
}
