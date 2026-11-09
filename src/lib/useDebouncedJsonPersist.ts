import { useCallback, useEffect, useRef } from "react";

interface Options {
  /** Debounce window before a scheduled save runs. */
  delay?: number;
  /** Called when a save rejects; failures within errorThrottleMs are suppressed. */
  onError?: () => void;
  errorThrottleMs?: number;
}

/**
 * Debounced "last write wins" persistence: schedule a save per edit, flush the
 * pending one on unmount / window close. A failed save stays pending so the
 * next flush retries it.
 */
export function useDebouncedPersist({
  delay = 300,
  onError,
  errorThrottleMs = 4000,
}: Options = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<(() => Promise<unknown>) | null>(null);
  const lastErrorAt = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    void pending().then(
      () => { lastErrorAt.current = 0; },
      () => {
        // Keep the snapshot retryable unless a newer edit replaced it.
        pendingRef.current ??= pending;
        const now = Date.now();
        if (now - lastErrorAt.current < errorThrottleMs) return;
        lastErrorAt.current = now;
        onErrorRef.current?.();
      },
    );
  }, [errorThrottleMs]);

  const schedule = useCallback((save: () => Promise<unknown>) => {
    pendingRef.current = save;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delay);
  }, [delay, flush]);

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  return { schedule, flush };
}
