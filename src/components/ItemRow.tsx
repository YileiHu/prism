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
  meta?: ReactNode;
  hoverActions?: ItemRowHoverAction[];
  variant?: "dense" | "list";
}

export default function ItemRow({
  selected,
  onPrimaryClick,
  menuItems,
  leading,
  title,
  tooltip,
  meta,
  hoverActions,
  variant = "list",
  className = "",
  onContextMenu: propsOnContextMenu,
  ...rest
}: Props) {
  const { onContextMenu: openMenu } = useContextMenu();

  return (
    <div
      {...rest}
      title={tooltip}
      onClick={onPrimaryClick}
      onContextMenu={menuItems ? (e) => openMenu(e, menuItems) : propsOnContextMenu}
      className={`group flex items-center gap-2 transition-colors ${variant === "dense" ? "px-2 py-1.5 rounded-lg" : "px-3 py-1.5"} ${
        selected ? "bg-[var(--accent-muted)] active-bar" : "hover:bg-elevated/40"
      } ${onPrimaryClick ? "cursor-pointer" : ""} ${className}`}
    >
      {leading}
      <span className={`flex-1 min-w-0 truncate text-sm ${selected ? "text-[var(--accent-text)]" : "text-primary"}`}>
        {title}
      </span>
      {meta}
      {hoverActions?.map((a, i) => (
        <button
          key={i}
          title={a.label}
          onClick={(e) => { e.stopPropagation(); a.onClick(); }}
          className={`flex-shrink-0 transition-opacity ${a.active ? "" : "opacity-0 group-hover:opacity-100"} ${a.className ?? "text-faint hover:text-secondary"}`}
        >
          {a.icon}
        </button>
      ))}
    </div>
  );
}
