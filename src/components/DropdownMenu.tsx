import { useLayoutEffect, useEffect, useRef, useState, type ReactNode, type RefObject, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAnimatedMount } from "../lib/useAnimatedMount";

/* ---- DropdownMenu (container) ----
   Rendered in a portal with fixed positioning so it never gets clipped by
   ancestors with overflow:hidden/auto. Position is derived from anchorRef. */

interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  side?: "bottom" | "top";
  matchWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export function DropdownMenu({
  open,
  onClose,
  anchorRef,
  align = "left",
  side = "bottom",
  matchWidth = false,
  className = "",
  children,
}: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [ready, setReady] = useState(false);
  const { mounted, exiting } = useAnimatedMount(open, 100);

  useLayoutEffect(() => {
    if (!open) return;
    setReady(false);
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    // The portal mounts one tick after `open` flips (useAnimatedMount), so on
    // the first pass there is nothing to measure. Wait for `mounted` rather
    // than positioning with the fallback size, which shifts narrow menus.
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    let left = align === "right" ? rect.right - mw : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));

    let top = side === "top" ? rect.top - mh - 4 : rect.bottom + 4;
    // Flip when overflowing the viewport edge
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 4);
    if (top < 8) top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - mh - 8));

    setStyle({ left, top, width: matchWidth ? rect.width : undefined });
    setReady(true);
  }, [open, mounted, anchorRef, align, side, matchWidth]);

  useEffect(() => {
    if (!open) return;
    // Capture phase: an open menu consumes Escape before a parent Modal's
    // document-level listener can close the whole dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const onResize = () => onClose();
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        data-prism-menu=""
        className={`fixed z-menu bg-elevated border border-strong rounded-control shadow-popover p-1 ${
          exiting ? "anim-exit" : side === "top" ? "anim-menu-up" : "anim-menu"
        } ${className}`}
        style={{ ...style, visibility: ready ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ---- DropdownMenuItem ---- */

interface DropdownMenuItemProps {
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
  children: ReactNode;
}

export function DropdownMenuItem({ onClick, danger, active, className = "", children }: DropdownMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-body rounded-chip transition-colors ${
        active
          ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
          : danger
            ? "text-danger hover:bg-danger/10"
            : "text-secondary hover:bg-hover"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ---- DropdownMenuDivider ---- */

export function DropdownMenuDivider() {
  return <div className="border-t border-strong mx-2 my-1" />;
}
