import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { DropdownMenuItem, DropdownMenuDivider } from "./DropdownMenu";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  divider?: boolean;
  children?: MenuItem[];
  checked?: boolean;
  danger?: boolean;
}

interface Props {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [adjustedPos, setAdjustedPos] = useState(position);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setSubmenuOpen(null), 150);
  };

  // Measure before showing to avoid visual flash
  useEffect(() => {
    setReady(false);
    requestAnimationFrame(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        let x = position.x;
        let y = position.y;
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
        setAdjustedPos({ x, y });
      }
      setReady(true);
    });
  }, [position, items]);

  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1 min-w-[180px]"
      style={{ left: adjustedPos.x, top: adjustedPos.y, visibility: ready ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.divider && !item.label && !item.onClick && !item.icon && !item.children) {
          return <DropdownMenuDivider key={i} />;
        }
        return (
        <div key={i}>
          {item.divider && <DropdownMenuDivider />}
          <div
            className="relative"
            onMouseEnter={() => {
              clearCloseTimer();
              setSubmenuOpen(item.children ? i : null);
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
              <span className="flex-1 text-left">{item.label}</span>
              {item.checked && <span className="text-[var(--accent-text)] text-xs">✓</span>}
              {item.children && <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />}
            </DropdownMenuItem>
            {item.children && submenuOpen === i && (
              <div
                className="absolute left-full top-0 ml-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1 min-w-[160px]"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
              >
                {item.children.map((child, ci) => (
                  <div key={ci}>
                    {child.divider && <DropdownMenuDivider />}
                    <DropdownMenuItem
                      onClick={() => {
                        child.onClick?.();
                        onClose();
                      }}
                      danger={child.danger}
                    >
                      {child.icon && <span className="w-4 flex-shrink-0">{child.icon}</span>}
                      <span className="flex-1 text-left">{child.label}</span>
                      {child.checked && <span className="text-[var(--accent-text)] text-xs">✓</span>}
                    </DropdownMenuItem>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );})}
    </div>
  );
}
