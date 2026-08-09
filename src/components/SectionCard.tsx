import type { ReactNode, Ref } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { PaletteColor } from "../lib/colors";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  count?: ReactNode;
  headerActions?: ReactNode;
  tintColor?: PaletteColor;
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
  collapsed,
  onToggle,
  bodyClassName = "p-2",
  bodyRef,
  className = "",
  children,
}: Props) {
  const body = <div ref={bodyRef} className={bodyClassName}>{children}</div>;
  return (
    <div className={`border border-strong/50 rounded-xl bg-surface/20 overflow-hidden ${className}`}>
      <div
        className={`flex items-center gap-2 px-3 h-8 flex-shrink-0 ${onToggle ? "cursor-pointer" : ""} ${tintColor ? "" : "bg-elevated/30"}`}
        style={tintColor ? { backgroundColor: `${tintColor.bar}18` } : undefined}
        onClick={onToggle}
      >
        {onToggle && (
          <span className="text-muted">{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
        )}
        {Icon && <Icon size={13} className="text-muted" />}
        <span
          className={`text-xs font-medium truncate ${tintColor ? "" : "text-secondary"}`}
          style={tintColor ? { color: tintColor.name } : undefined}
        >
          {title}
        </span>
        {count !== undefined && <span className="text-xs text-faint">{count}</span>}
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
