import { useCallback, useEffect, useRef } from "react";

/**
 * One-shot debounced save timer. schedule() replaces any pending save; flush()
 * runs it immediately; the pending timer is dropped when the host unmounts
 * (callers that need an unmount save flush explicitly before teardown).
 */
export function useAutosaveTimer() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    cancel();
    saveRef.current?.();
  }, [cancel]);

  const schedule = useCallback((save: () => void, delay: number) => {
    saveRef.current = save;
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      saveRef.current?.();
    }, delay);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return { schedule, flush, cancel };
}
