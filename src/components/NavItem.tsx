import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface NavItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  // Parent of the active item: accent text without its own chip, so the
  // container and the selected child don't read as two stacked buttons.
  parentActive?: boolean;
  leading?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
}

const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  { active = false, parentActive = false, leading, label, trailing, footer, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`w-full px-3 py-2 rounded-control text-body text-left transition-colors ${
        active
          ? "bg-[var(--sidebar-item-active)] text-primary font-medium"
          : parentActive
            ? "text-[var(--accent-text)] font-medium hover:bg-[var(--sidebar-item-hover)]"
            : "text-secondary hover:text-primary hover:bg-[var(--sidebar-item-hover)]"
      } ${className}`}
      {...props}
    >
      <span className="flex items-center gap-2 min-w-0">
        {leading !== undefined && <span className="flex items-center flex-shrink-0">{leading}</span>}
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {trailing !== undefined && (
          <span className="text-caption text-muted flex-shrink-0">{trailing}</span>
        )}
      </span>
      {footer}
    </button>
  );
});

export default NavItem;
