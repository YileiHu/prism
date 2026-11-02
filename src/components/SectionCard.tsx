import type { ReactNode, Ref } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { PaletteColor } from "../lib/colors";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  count?: ReactNode;
  headerActions?: ReactNode;
  tintColor?: PaletteColor;
  accent?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}

export default function SectionCard({
  icon: Icon,
  title,
  count,
  headerActions,
  tintColor,
  accent,
  collapsed,
  onToggle,
  bodyClassName = "p-2",
  bodyRef,
  className = "",
  children,
}: Props) {
  const body = <div ref={bodyRef} className={bodyClassName}>{children}</div>;
  return (
    <div className={`border rounded-card bg-surface/20 overflow-hidden ${accent ? "border-[var(--accent-border)]" : "border-strong/50"} ${className}`}>
      <div
        className={`flex items-center gap-2 px-3 h-8 flex-shrink-0 ${onToggle ? "cursor-pointer" : ""} ${accent ? "bg-[var(--accent-muted)]" : tintColor ? "" : "bg-elevated/30"}`}
        style={tintColor ? { backgroundColor: tintColor.tint } : undefined}
        onClick={onToggle}
      >
        {onToggle && (
          <span className="text-muted">{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
        )}
        {Icon && <Icon size={13} className={accent ? "text-[var(--accent-text)]" : "text-muted"} />}
        <span
          className={`text-caption font-medium truncate ${tintColor || accent ? "" : "text-secondary"}`}
          style={tintColor ? { color: tintColor.name } : accent ? { color: "var(--accent-text)" } : undefined}
        >
          {title}
        </span>
        {count !== undefined && <span className="text-caption text-faint">{count}</span>}
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
