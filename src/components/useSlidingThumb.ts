import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface SlidingThumbBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Measures the active item inside a relative container and returns the box a
 * sliding chip should occupy. Shared by `SegmentedToggle` and `ChipTabs` so both
 * controls move with the same easing instead of repainting.
 *
 * `signature` should encode item labels; it re-measures when labels change
 * without needing the array identity to be stable.
 */
export function useSlidingThumb(activeIndex: number, signature: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Array<HTMLElement | null>>([]);
  const [thumb, setThumb] = useState<SlidingThumbBox | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const item = activeIndex >= 0 ? itemsRef.current[activeIndex] : null;
    if (!container || !item) {
      setThumb((previous) => (previous === null ? previous : null));
      return;
    }
    // Rect math in CSS pixels. Rects are exact but carry the dialog's pop-in
    // scale (0.95 → 1), so convert back by dividing by `rect / layout width`.
    // Getting the direction wrong here shrinks the chip (that was the "missing
    // strip on the right and bottom" bug).
    const box = container.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const layoutWidth = container.offsetWidth;
    const rawRatio = box.width > 0 && layoutWidth > 0 ? box.width / layoutWidth : 1;
    const scale = rawRatio > 0.5 && rawRatio < 2 ? rawRatio : 1;
    const next: SlidingThumbBox = {
      left: (rect.left - box.left) / scale - container.clientLeft + container.scrollLeft,
      top: (rect.top - box.top) / scale - container.clientTop + container.scrollTop,
      width: rect.width / scale,
      height: rect.height / scale,
    };
    setThumb((previous) =>
      previous &&
      previous.left === next.left &&
      previous.top === next.top &&
      previous.width === next.width &&
      previous.height === next.height
        ? previous
        : next,
    );
  }, [activeIndex, signature]);

  // Runs before paint so the first frame is already in place.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  const measureRef = useRef(measure);
  measureRef.current = measure;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Modal scale-in and web fonts can shift the layout after mount.
    let second = 0;
    const frame = requestAnimationFrame(() => {
      measureRef.current();
      // One more frame: a font swap or scrollbar appearing can land in between.
      second = requestAnimationFrame(() => measureRef.current());
    });
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(container);
    // Items can change width without the container changing (different labels,
    // late font swap, flex redistribution), which used to leave a stale chip
    // that was a few pixels short. Observe the active item as well.
    const active = activeIndex >= 0 ? itemsRef.current[activeIndex] : null;
    if (active) observer.observe(active);
    const onResize = () => measureRef.current();
    window.addEventListener("resize", onResize);
    // Belt and braces: after the dialog's pop-in animation finishes the layout is
    // final, so take one more exact measurement.
    const holder = container.closest("[role='dialog']") ?? container;
    const onAnimationEnd = () => measureRef.current();
    holder.addEventListener("animationend", onAnimationEnd);
    void document.fonts?.ready.then(() => measureRef.current());
    return () => {
      cancelAnimationFrame(frame);
      if (second) cancelAnimationFrame(second);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      holder.removeEventListener("animationend", onAnimationEnd);
    };
  }, [activeIndex]);

  const setItemRef = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      itemsRef.current[index] = element;
    },
    [],
  );

  return { containerRef, setItemRef, thumb };
}
