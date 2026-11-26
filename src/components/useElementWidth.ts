import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's content width so SVGs can be laid out in real pixels
 * (crisp strokes and text) instead of being scaled.
 */
export function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
