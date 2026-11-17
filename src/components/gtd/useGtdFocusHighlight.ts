import { useEffect, useRef, useState } from "react";

/**
 * Scrolls to and briefly highlights `gtd-task-<id>` once per focus sequence.
 * `ready` lets a view wait until its async list has rendered (project page).
 */
export function useGtdFocusHighlight(
  taskId: number | undefined,
  seq: number | undefined,
  ready = true,
): number | null {
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const handledSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || !taskId || seq === undefined || handledSeq.current === seq) return;
    const element = document.getElementById(`gtd-task-${taskId}`);
    if (!element) return;
    handledSeq.current = seq;
    element.scrollIntoView({ block: "center" });
    setHighlightId(taskId);
    // No cleanup: a later list refresh would otherwise clear the timer early.
    setTimeout(() => setHighlightId(null), 1600);
  }, [taskId, seq, ready]);

  return highlightId;
}
