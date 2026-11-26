import { useCallback, useRef, type RefCallback } from "react";

/**
 * Wheel scrolls a horizontally overflowing strip sideways: the vertical wheel
 * (what a mouse always sends) is turned into horizontal scroll. Pair it with
 * the `scrollbar-none` class so the strip reads as a plain row of chips.
 *
 * Returns a ref callback, so a strip that unmounts and mounts again (an empty
 * state swapped for the list) keeps working without callers re-running effects.
 * React's onWheel is passive, hence the native listener: calling
 * preventDefault is what keeps the page from scrolling at the same time.
 */
export function useHorizontalWheel<T extends HTMLElement>(): RefCallback<T> {
  const detach = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      // Nothing to scroll: let the page have the wheel.
      if (el.scrollWidth <= el.clientWidth) return;
      // Trackpads and tilt wheels already send deltaX; leave those alone.
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      // At either end the strip has nothing left to give, so the page keeps the
      // wheel instead of the strip swallowing it.
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if (event.deltaY > 0 ? atEnd : atStart) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    detach.current = () => el.removeEventListener("wheel", onWheel);
  }, []);
}
