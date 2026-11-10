import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { DropdownMenuItem } from "./DropdownMenu";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  children?: MenuItem[];
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
}

interface Props {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
  exiting?: boolean;
}

const MARGIN = 8;
const SUBMENU_GAP = 4;

interface Placement {
  left: number;
  top: number;
  maxHeight?: number;
  maxWidth?: number;
  flipY: boolean;
}

// Clamp horizontally, flip above the cursor when there is no room below, and
// cap the height (making the menu scroll) when it fits on neither side.
function placeAtPoint(x: number, y: number, width: number, height: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(MARGIN, Math.min(x, vw - width - MARGIN));
  const roomBelow = vh - y - MARGIN;
  const roomAbove = y - MARGIN;
  let top = y;
  let maxHeight: number | undefined;
  let flipY = false;

  if (height > roomBelow) {
    if (height <= roomAbove) {
      top = y - height;
      flipY = true;
    } else if (roomAbove > roomBelow) {
      top = MARGIN;
      maxHeight = Math.max(0, roomAbove);
      flipY = true;
    } else {
      maxHeight = Math.max(0, roomBelow);
    }
  }
  return { left, top, maxHeight, maxWidth: vw - MARGIN * 2, flipY };
}

// Place a submenu beside its row, flipping to the left and scrolling when the
// viewport is too short to show it whole.
function placeBeside(anchor: { left: number; top: number; right: number }, width: number, height: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.right + SUBMENU_GAP;
  if (left + width > vw - MARGIN) {
    const flipped = anchor.left - width - SUBMENU_GAP;
    left = flipped >= MARGIN ? flipped : Math.max(MARGIN, vw - width - MARGIN);
  }
  let top = Math.max(MARGIN, anchor.top);
  let maxHeight: number | undefined;

  if (top + height > vh - MARGIN) {
    if (height <= vh - MARGIN * 2) {
      top = vh - MARGIN - height;
    } else {
      top = MARGIN;
      maxHeight = Math.max(0, vh - MARGIN * 2);
    }
  }
  return { left, top, maxHeight, maxWidth: vw - MARGIN * 2, flipY: false };
}

function scrollStyle(placement: Placement): CSSProperties {
  return {
    maxHeight: placement.maxHeight,
    maxWidth: placement.maxWidth,
    overflowY: placement.maxHeight !== undefined ? "auto" : undefined,
    overscrollBehavior: "contain",
  };
}

export default function ContextMenu({ items, position, onClose, exiting = false }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [placement, setPlacement] = useState<Placement>({ left: position.x, top: position.y, flipY: false });
  const [ready, setReady] = useState(false);
  const [submenu, setSubmenu] = useState<{ index: number; anchor: DOMRect } | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setSubmenu(null), 150);
  };

  // Measure before showing to avoid a flash at the unadjusted position.
  useEffect(() => {
    setReady(false);
    setSubmenu(null);
    const frame = requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      // Drop any height cap left from a previous position so the natural size is measured.
      el.style.maxHeight = "none";
      el.style.overflowY = "visible";
      setPlacement(placeAtPoint(position.x, position.y, el.offsetWidth, el.offsetHeight));
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [position.x, position.y, items]);

  useEffect(() => {
    // Any pointer button (left/right/middle) pressed outside the menu dismisses
    // it, like a native modal menu. Capture phase so inner handlers can't
    // swallow the event; presses inside the menu (or its portaled submenu)
    // are ignored so their click actions still run.
    const handlePointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-prism-menu]")) return;
      onClose();
    };
    // Capture phase: consume Escape before a parent Modal's listener runs.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const handleResize = () => onClose();
    // Scrolling the content behind the menu dismisses it — the menu is
    // anchored to the cursor, so it would otherwise float over shifted text.
    // Scrolling the menu (or its portaled submenu) itself must not close it.
    // Capture phase: scroll doesn't bubble, but capture reaches descendants.
    const handleScroll = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-prism-menu]")) return;
      onClose();
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  const submenuItems = submenu ? items[submenu.index]?.children : undefined;

  return (
    <>
      <div
        ref={menuRef}
        data-prism-menu=""
        className={`fixed z-context bg-elevated border border-strong rounded-control shadow-popover p-1 min-w-[180px] ${
          exiting ? "anim-exit" : placement.flipY ? "anim-menu-up" : "anim-menu"
        }`}
        style={{
          left: placement.left,
          top: placement.top,
          ...scrollStyle(placement),
          visibility: ready ? "visible" : "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        onScroll={() => setSubmenu(null)}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="my-1 h-px bg-strong" role="separator" />;
          }
          return (
            <div
              key={i}
              onMouseEnter={(e) => {
                clearCloseTimer();
                setSubmenu(item.children ? { index: i, anchor: e.currentTarget.getBoundingClientRect() } : null);
              }}
              onMouseLeave={scheduleClose}
            >
              <DropdownMenuItem
                onClick={() => {
                  item.onClick?.();
                  if (!item.children) onClose();
                }}
                danger={item.danger}
              >
                {item.icon && <span className="w-4 flex-shrink-0">{item.icon}</span>}
                <span className="flex-1 min-w-0 break-words text-left">{item.label}</span>
                {item.checked && <span className="text-[var(--accent-text)] text-caption">✓</span>}
                {item.children && <ChevronRight size={12} className="text-muted flex-shrink-0" />}
              </DropdownMenuItem>
            </div>
          );
        })}
      </div>
      {!exiting && submenu && submenuItems && (
        <Submenu
          key={submenu.index}
          items={submenuItems}
          anchor={submenu.anchor}
          onSelect={(child) => {
            child.onClick?.();
            onClose();
          }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        />
      )}
    </>
  );
}

interface SubmenuProps {
  items: MenuItem[];
  anchor: DOMRect;
  onSelect: (item: MenuItem) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// Rendered in a portal: the parent menu can scroll (`overflow-y: auto`), which
// would otherwise clip a submenu that hangs off its edge.
function Submenu({ items, anchor, onSelect, onMouseEnter, onMouseLeave }: SubmenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<CSSProperties>({});
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const next = placeBeside(anchor, el.offsetWidth, el.offsetHeight);
    setPlacement({ left: next.left, top: next.top, ...scrollStyle(next) });
    setReady(true);
  }, [anchor]);

  return createPortal(
    <div
      ref={menuRef}
      data-prism-menu=""
      className="fixed z-context bg-elevated border border-strong rounded-control shadow-popover p-1 min-w-[160px] anim-fade-in"
      style={{ ...placement, visibility: ready ? "visible" : "hidden" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((child, i) => (
        <div key={i}>
          {child.separator ? (
            <div className="my-1 h-px bg-strong" role="separator" />
          ) : (
            <DropdownMenuItem onClick={() => onSelect(child)} danger={child.danger}>
              {child.icon && <span className="w-4 flex-shrink-0">{child.icon}</span>}
              <span className="flex-1 min-w-0 break-words text-left">{child.label}</span>
              {child.checked && <span className="text-[var(--accent-text)] text-caption">✓</span>}
            </DropdownMenuItem>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
