import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface MultiSelectOptions<K extends string | number> {
  /**
   * Selection domain. Changing it (vault, collection, search text/scope, tag)
   * drops the selection so the bar can never claim items that are no longer on
   * screen.
   */
  scopeKey: string;
  /**
   * Keys currently visible in the list, in display order. Used to prune deleted
   * items, to select all, and to resolve Shift ranges.
   */
  keys: readonly K[];
  /**
   * Focus target and keyboard listener host for the list. `Ctrl/Cmd+A` is only
   * bound to this container, so it never hijacks an input, a modal, or the
   * editor.
   */
  containerRef?: RefObject<HTMLElement | null>;
}

export interface MultiSelect<K extends string | number> {
  active: boolean;
  selected: ReadonlySet<K>;
  count: number;
  /** Enter selection mode (clears any previous selection, focuses the list). */
  enter: () => void;
  /** Leave selection mode and drop the selection. */
  exit: () => void;
  /** Toggle one item; `shiftKey` extends from the last toggled anchor. */
  toggle: (key: K, event?: { shiftKey?: boolean }) => void;
  selectAll: () => void;
  /** Drop the selection but stay in selection mode. */
  clear: () => void;
  isSelected: (key: K) => boolean;
}

interface State<K extends string | number> {
  active: boolean;
  selected: Set<K>;
  anchor: K | null;
}

function emptyState<K extends string | number>(): State<K> {
  return { active: false, selected: new Set<K>(), anchor: null };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Multi-select state for one list container. Each list owns its own instance:
 * selection is a view concern (it resets when the container unmounts or the
 * scope changes), not global app state.
 */
export function useMultiSelect<K extends string | number>({
  scopeKey,
  keys,
  containerRef,
}: MultiSelectOptions<K>): MultiSelect<K> {
  const [state, setState] = useState<State<K>>(emptyState);
  // Callbacks and effects read the freshest key order without being rebuilt on
  // every keystroke of a filter.
  const keysRef = useRef<readonly K[]>(keys);
  keysRef.current = keys;

  const exit = useCallback(() => setState(emptyState<K>()), []);

  const clear = useCallback(() => {
    setState((prev) => (
      prev.selected.size === 0 && prev.anchor === null ? prev : { ...prev, selected: new Set<K>(), anchor: null }
    ));
  }, []);

  const enter = useCallback(() => {
    setState({ active: true, selected: new Set<K>(), anchor: null });
    containerRef?.current?.focus();
  }, [containerRef]);

  const toggle = useCallback((key: K, event?: { shiftKey?: boolean }) => {
    setState((prev) => {
      const order = keysRef.current;
      if (event?.shiftKey && prev.anchor !== null && prev.anchor !== key) {
        const from = order.indexOf(prev.anchor);
        const to = order.indexOf(key);
        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          const next = new Set(prev.selected);
          for (let index = start; index <= end; index += 1) next.add(order[index]);
          return { ...prev, selected: next };
        }
      }
      const next = new Set(prev.selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, selected: next, anchor: key };
    });
  }, []);

  const selectAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selected: new Set(keysRef.current),
      anchor: keysRef.current[0] ?? null,
    }));
  }, []);

  const isSelected = useCallback((key: K) => state.selected.has(key), [state.selected]);

  // Scope change: leave the mode entirely. Pruning alone would leave a bar
  // claiming hidden items, which is exactly the confusion this avoids.
  const scopeRef = useRef(scopeKey);
  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    setState(emptyState<K>());
  }, [scopeKey]);

  // Items disappearing (delete, rescan, filter) shrink the selection instead of
  // leaving ghost keys behind.
  useEffect(() => {
    setState((prev) => {
      if (prev.selected.size === 0) return prev;
      const valid = new Set(keys);
      let changed = false;
      const next = new Set<K>();
      for (const key of prev.selected) {
        if (valid.has(key)) next.add(key);
        else changed = true;
      }
      if (!changed) return prev;
      if (next.size === 0 && prev.active) return emptyState<K>();
      return { ...prev, selected: next, anchor: prev.anchor !== null && valid.has(prev.anchor) ? prev.anchor : null };
    });
  }, [keys]);

  useEffect(() => {
    if (!state.active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setState(emptyState<K>());
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.active]);

  useEffect(() => {
    if (!state.active) return;
    const element = containerRef?.current;
    if (!element) return;
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setState((prev) => ({
        ...prev,
        selected: new Set(keysRef.current),
        anchor: keysRef.current[0] ?? null,
      }));
    };
    element.addEventListener("keydown", handler);
    return () => element.removeEventListener("keydown", handler);
  }, [state.active, containerRef]);

  return {
    active: state.active,
    selected: state.selected,
    count: state.selected.size,
    enter,
    exit,
    toggle,
    selectAll,
    clear,
    isSelected,
  };
}
