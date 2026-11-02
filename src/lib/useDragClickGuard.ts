import { useEffect, useRef, type MouseEvent } from "react";

// A pointer drag ends with a click on the row. Swallow that click so dragging
// a clickable row does not also select/open it.
export function useDragClickGuard(isDragging: boolean) {
  const dragged = useRef(false);

  useEffect(() => {
    if (isDragging) dragged.current = true;
  }, [isDragging]);

  return {
    onPointerDownCapture: () => {
      dragged.current = false;
    },
    onClickCapture: (e: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
