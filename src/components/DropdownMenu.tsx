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
  /** "none" removes the 4px inner padding so sticky section headers sit flush. */
  padding?: "default" | "none";
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
  padding = "default",
  className = "",
  children,
}: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [ready, setReady] = useState(false);
  const { mounted, exiting } = useAnimatedMount(open, 100);

  // Drop the previous session's geometry once the exit animation is over, so a
  // reopen never renders with a stale position/height before it is measured.
  useEffect(() => {
    if (mounted) return;
    setStyle({});
    setReady(false);
  }, [mounted]);

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
    // Measure at the width we are about to apply. A fresh menu has no inline
    // width yet, so it is laid out at its shrink-to-fit width, which differs
    // from the trigger: `align="right"` derives the left edge from the measured
    // width, so the very first open lands shifted sideways (later opens reuse
    // the remembered width, which is why it looks self-healing). The height is
    // only used to pick a side, never to cap the menu (see below).
    const inlineWidth = menu.style.width;
    if (matchWidth) menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = "none";
    menu.style.overflowY = "visible";
    const mw = menu.offsetWidth;
    const mh = Math.max(menu.offsetHeight, menu.scrollHeight);
    menu.style.width = inlineWidth;

    const gap = 4;
    const margin = 8;
    let left = align === "right" ? rect.right - mw : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - mw - margin));

    const roomBelow = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
    const roomAbove = Math.max(0, rect.top - gap - margin);
    const fitsBelow = mh <= roomBelow;
    const fitsAbove = mh <= roomAbove;
    // Respect an explicit side first; otherwise prefer below, then flip.
    const preferAbove = side === "top";
    let placeAbove = preferAbove ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
    if (!fitsBelow && !fitsAbove) {
      // Neither side can show the whole list: use the roomier side and scroll.
      placeAbove = roomAbove > roomBelow;
    }

    // The cap comes from the anchor geometry, not from the measured menu height:
    // anchor both edges with `top`/`bottom` and the menu can never leave the
    // viewport, even if a measurement was stale or the list grows later. It just
    // scrolls inside the room it was given.
    const maxHeight = placeAbove ? roomAbove : roomBelow;
    setStyle({
      left,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
      width: matchWidth ? rect.width : undefined,
      maxHeight,
      overflowY: "auto",
      overscrollBehavior: "contain",
    });
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
        className={`fixed z-menu bg-elevated border border-strong rounded-control shadow-popover ${
          padding === "none" ? "" : "p-1"
        } ${
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
      data-active={active && !danger ? "true" : undefined}
      className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-body rounded-chip transition-colors ${
        active && !danger
          ? "theme-active theme-hover theme-hover-accent"
          : danger
            ? "theme-hover theme-hover-danger text-danger hover:bg-danger/10"
            : "theme-hover text-secondary hover:bg-hover"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ---- DropdownMenuDivider ---- */

export function DropdownMenuDivider() {
  return <div className="h-px bg-strong mx-2 my-1" />;
}
