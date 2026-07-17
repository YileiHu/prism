import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

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

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let x = position.x;
      let y = position.y;
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      setAdjustedPos({ x, y });
    }
  }, [position]);

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
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        // Pure divider — no button
        if (item.divider && !item.label && !item.onClick && !item.icon && !item.children) {
          return <div key={i} className="border-t border-gray-700 mx-2 my-1" />;
        }
        return (
        <div key={i}>
          {item.divider && <div className="border-t border-gray-700 mx-2 my-1" />}
          <div
            className="relative"
            onMouseEnter={() => {
              clearCloseTimer();
              setSubmenuOpen(item.children ? i : null);
            }}
            onMouseLeave={scheduleClose}
          >
            <button
              onClick={() => {
                item.onClick?.();
                if (!item.children) onClose();
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md ${
                item.danger
                  ? "text-red-400 hover:bg-red-400/10"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {item.icon && <span className="w-4 flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 text-left">{item.label}</span>
              {item.checked && <span className="text-[var(--accent-text)] text-xs">✓</span>}
              {item.children && <ChevronRight size={12} className="text-gray-500" />}
            </button>
            {item.children && submenuOpen === i && (
              <div
                className="absolute left-full top-0 ml-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1 min-w-[160px]"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleClose}
              >
                {item.children.map((child, ci) => (
                  <div key={ci}>
                    {child.divider && <div className="border-t border-gray-700 mx-2 my-1" />}
                    <button
                      onClick={() => {
                        child.onClick?.();
                        onClose();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors rounded-md ${
                        child.danger
                          ? "text-red-400 hover:bg-red-400/10"
                          : "text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {child.icon && <span className="w-4 flex-shrink-0">{child.icon}</span>}
                      <span className="flex-1 text-left">{child.label}</span>
                      {child.checked && <span className="text-[var(--accent-text)] text-xs">✓</span>}
                    </button>
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
