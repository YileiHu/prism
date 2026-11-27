import { useCallback, useRef, useState } from "react";

export interface ScrollEdges {
  /** Content is hidden above the visible area. */
  top: boolean;
  /** Content is hidden below the visible area. */
  bottom: boolean;
}

export interface HorizontalScrollEdges {
  /** Content is hidden to the left of the visible area. */
  left: boolean;
  /** Content is hidden to the right of the visible area. */
  right: boolean;
}

/**
 * Tracks whether a scroll container has content off-screen, so an edge fade can
 * appear exactly when there is more to scroll to. Returns a ref callback (like
 * `useHorizontalWheel`) because the containers here mount conditionally: a modal
 * panel only exists while the dialog is open.
 *
 * Measurement is driven by scroll, by the container resizing, and by content
 * being inserted (async lists land after the dialog opens).
 */
export function useScrollEdges<T extends HTMLElement>(): [(el: T | null) => void, ScrollEdges] {
  const elementRef = useRef<T | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });

  const measure = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    // A hidden/zero-height body is not scrollable; never show a fade for it.
    if (el.clientHeight === 0) {
      setEdges((previous) =>
        previous.top || previous.bottom ? { top: false, bottom: false } : previous,
      );
      return;
    }
    const overflowing = el.scrollHeight > el.clientHeight + 2;
    const top = overflowing && el.scrollTop > 2;
    const bottom = overflowing && el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    );
  }, []);

  const attach = useCallback(
    (el: T | null) => {
      cleanup.current?.();
      cleanup.current = null;
      elementRef.current = el;
      // A fresh element starts at its top: drop stale edges without a re-render
      // when they were already false.
      setEdges((previous) => (previous.top || previous.bottom ? { top: false, bottom: false } : previous));
      if (!el) return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      // Lists that load after the dialog opens change the scroll height without
      // resizing the container.
      const mutations = new MutationObserver(measure);
      mutations.observe(el, { childList: true, subtree: true });
      el.addEventListener("scroll", measure, { passive: true });
      // The content is laid out by the time the first frame runs.
      const frame = requestAnimationFrame(measure);
      cleanup.current = () => {
        observer.disconnect();
        mutations.disconnect();
        el.removeEventListener("scroll", measure);
        cancelAnimationFrame(frame);
      };
    },
    [measure],
  );

  return [attach, edges];
}

/** Same edge tracking as `useScrollEdges`, but for a horizontal strip. */
export function useHorizontalScrollEdges<T extends HTMLElement>(): [
  (el: T | null) => void,
  HorizontalScrollEdges,
] {
  const elementRef = useRef<T | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [edges, setEdges] = useState<HorizontalScrollEdges>({ left: false, right: false });

  const measure = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    );
  }, []);

  const attach = useCallback(
    (el: T | null) => {
      cleanup.current?.();
      cleanup.current = null;
      elementRef.current = el;
      setEdges((previous) =>
        previous.left || previous.right ? { left: false, right: false } : previous,
      );
      if (!el) return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      const mutations = new MutationObserver(measure);
      mutations.observe(el, { childList: true, subtree: true });
      el.addEventListener("scroll", measure, { passive: true });
      const frame = requestAnimationFrame(measure);
      cleanup.current = () => {
        observer.disconnect();
        mutations.disconnect();
        el.removeEventListener("scroll", measure);
        cancelAnimationFrame(frame);
      };
    },
    [measure],
  );

  return [attach, edges];
}
