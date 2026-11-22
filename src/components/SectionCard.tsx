import type { HTMLAttributes, ReactNode, Ref } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { PaletteColor } from "../lib/colors";
import Button from "./Button";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  count?: ReactNode;
  headerActions?: ReactNode;
  tintColor?: PaletteColor;
  accent?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  /**
   * Whether clicking the header (not just the chevron) toggles the card.
   * Group cards that are drag handles pass false so a drag never collapses them.
   */
  headerClickToggles?: boolean;
  headerRef?: (node: HTMLDivElement | null) => void;
  headerProps?: HTMLAttributes<HTMLDivElement>;
  onHeaderContextMenu?: (event: React.MouseEvent) => void;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
  cardRef?: (node: HTMLDivElement | null) => void;
  overlay?: boolean;
  children: ReactNode;
}

export default function SectionCard({
  icon: Icon,
  title,
  count,
  headerActions,
  tintColor,
  accent,
  collapsed = false,
  onToggle,
  headerClickToggles = true,
  headerRef,
  headerProps,
  onHeaderContextMenu,
  bodyClassName = "p-2",
  bodyRef,
  className = "",
  style,
  cardRef,
  overlay = false,
  children,
}: Props) {
  const body = <div ref={bodyRef} className={bodyClassName}>{children}</div>;
  const headerColor = tintColor?.name ?? (accent ? "var(--accent-text)" : undefined);
  return (
    <div
      ref={cardRef}
      style={style}
      className={`border rounded-card bg-surface overflow-hidden transition-colors ${
        overlay
          ? "shadow-drag border-[var(--accent)]"
          : accent
            ? "border-[var(--accent-border)]"
            : "border-strong/50"
      } ${className}`}
    >
      <div
        {...headerProps}
        ref={headerRef}
        onClick={headerClickToggles ? onToggle : undefined}
        onContextMenu={onHeaderContextMenu}
        className={`flex items-center gap-2 px-3 h-8 flex-shrink-0 ${
          headerClickToggles && onToggle ? "cursor-pointer" : ""
        } ${accent ? "bg-[var(--accent-muted)]" : tintColor ? "" : "bg-tint/[0.06]"}`}
        style={tintColor ? { backgroundColor: tintColor.tint } : undefined}
      >
        {onToggle && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={!collapsed}
            onClick={(event) => { event.stopPropagation(); onToggle(); }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </Button>
        )}
        {Icon && (
          <Icon
            size={13}
            className={tintColor ? "" : accent ? "text-[var(--accent-text)]" : "text-muted"}
            style={tintColor ? { color: tintColor.name } : undefined}
          />
        )}
        <span
          className={`text-caption font-medium truncate min-w-0 ${tintColor || accent ? "" : "text-secondary"}`}
          style={headerColor ? { color: headerColor } : undefined}
        >
          {title}
        </span>
        {count !== undefined && <span className="text-caption text-muted ml-1">{count}</span>}
        {headerActions && <div className="ml-auto flex items-center gap-1">{headerActions}</div>}
      </div>
      {onToggle ? (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
        >
          <div className="overflow-hidden min-h-0">{body}</div>
        </div>
      ) : (
        body
      )}
    </div>
  );
}
