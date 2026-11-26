import { useCallback, useEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Tracks an element's content box. Returns a **callback ref** rather than a
 * `RefObject` so it also works for elements that mount later (dialogs render
 * their body only while open); a `useEffect` on a `RefObject` would otherwise
 * attach the observer once, while the element was still absent.
 */
export function useElementSize<T extends HTMLElement>(): [
  (element: T | null) => void,
  ElementSize,
] {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const ref = useCallback((next: T | null) => setElement(next), []);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize((previous) =>
        Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
          ? previous
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [element]);

  return [ref, size];
}
