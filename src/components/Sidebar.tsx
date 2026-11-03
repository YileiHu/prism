import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

interface SidebarProps {
  children: ReactNode;
  footer?: ReactNode;
  // Let the body fill the remaining height instead of scrolling as one block,
  // so an inner list can stretch to the bottom edge.
  fill?: boolean;
}

const MIN_WIDTH = 160;
const DEFAULT_WIDTH = 192;
const MAX_WIDTH = 400;
const STORAGE_KEY = "prism_sidebar_width";
const LEGACY_KEYS = ["vault", "pdf", "resources", "gtd", "gtd-projects", "settings"].map(
  (key) => `prism_sidebar_${key}`,
);

function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

// Every module shares one width. On first run after the switch, adopt an
// existing per-module value instead of resetting the user's preference.
function readStoredWidth(): number {
  const read = (key: string) => {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH ? value : null;
  };
  const shared = read(STORAGE_KEY);
  if (shared !== null) return shared;
  for (const key of LEGACY_KEYS) {
    const legacy = read(key);
    if (legacy !== null) {
      localStorage.setItem(STORAGE_KEY, String(legacy));
      return legacy;
    }
  }
  return DEFAULT_WIDTH;
}

let sharedWidth = readStoredWidth();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setSharedWidth(next: number, persist: boolean) {
  const clamped = clampWidth(next);
  if (clamped !== sharedWidth) {
    sharedWidth = clamped;
    listeners.forEach((listener) => listener());
  }
  if (persist) localStorage.setItem(STORAGE_KEY, String(sharedWidth));
}

export default function Sidebar({ children, footer, fill = false }: SidebarProps) {
  // All mounted sidebars (including hidden module tabs) share the same width.
  const width = useSyncExternalStore(subscribe, () => sharedWidth);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setSharedWidth(e.clientX, false);
    };
    const onMouseUp = () => {
      if (dragging.current) setSharedWidth(sharedWidth, true);
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <aside
      className="flex-shrink-0 border-r border-line glass bg-base/50 flex flex-col select-none relative group"
      style={{ width }}
    >
      <div
        className={`flex-1 min-h-0 py-1.5 px-2 ${
          fill ? "flex flex-col overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {children}
      </div>
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
