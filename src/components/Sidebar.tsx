import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";

interface SidebarProps {
  children: ReactNode;
  footer?: ReactNode;
  storageKey?: string;
}

const MIN_WIDTH = 160;
const DEFAULT_WIDTH = 192;
const MAX_WIDTH = 400;

export default function Sidebar({ children, footer, storageKey }: SidebarProps) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const saved = Number(localStorage.getItem(`prism_sidebar_${storageKey}`));
      if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
    }
    return DEFAULT_WIDTH;
  });
  const dragging = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    };
    const onMouseUp = () => {
      if (dragging.current && storageKey) {
        localStorage.setItem(`prism_sidebar_${storageKey}`, String(widthRef.current));
      }
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [storageKey]);

  return (
    <aside
      className="flex-shrink-0 border-r border-line glass bg-base/50 flex flex-col select-none relative group"
      style={{ width }}
    >
      <div className="flex-1 overflow-y-auto py-1.5 px-2">{children}</div>
      {footer && (
        <div className="border-t border-line px-2 py-2">{footer}</div>
      )}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 -mr-0.5 cursor-col-resize hover:bg-accent/50 transition-colors z-10"
        onMouseDown={onMouseDown}
      />
    </aside>
  );
}
