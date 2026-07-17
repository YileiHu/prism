import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";

interface SidebarProps {
  children: ReactNode;
  footer?: ReactNode;
}

const MIN_WIDTH = 160;
const DEFAULT_WIDTH = 192;
const MAX_WIDTH = 400;

export default function Sidebar({ children, footer }: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth((w) => {
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
        return next;
      });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <aside
      className="flex-shrink-0 border-r border-gray-800 flex flex-col select-none relative group"
      style={{ width }}
    >
      <div className="flex-1 overflow-y-auto py-1.5 px-2">{children}</div>
      {footer && (
        <div className="border-t border-gray-800 px-2 py-2">{footer}</div>
      )}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 -mr-0.5 cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors z-10"
        onMouseDown={onMouseDown}
      />
    </aside>
  );
}
