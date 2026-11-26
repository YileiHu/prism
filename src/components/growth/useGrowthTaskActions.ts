import { useCallback, useState } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GrowthTask } from "../../shared/models";

const RIPPLE_MS = 180;

export type GrowthTaskToggleAction = "completed" | "reopened";

/**
 * Complete/reopen for a task row, shared by the overview card, a capability's
 * related list and a challenge's task list. When `onToggled` is provided the
 * caller owns the success toast (it can offer "settle the forecast" instead of
 * undo).
 */
export function useGrowthTaskActions(
  onChanged: () => void,
  onToggled: (task: GrowthTask, action: GrowthTaskToggleAction) => void,
) {
  const { t } = useT();
  const showToast = useToast();
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  const refresh = useCallback(() => {
    onChanged();
  }, [onChanged]);

  const toggle = useCallback(
    async (task: GrowthTask) => {
      if (togglingIds.has(task.id)) return;
      const reopening = task.completedAt !== null;
      setTogglingIds((current) => new Set(current).add(task.id));
      let saved = false;
      try {
        if (reopening) {
          await window.prism.reopenGrowthTask(task.id);
        } else {
          await window.prism.completeGrowthTask(task.id);
          // Let the check ripple finish before the row leaves the open list.
          await new Promise((resolve) => setTimeout(resolve, RIPPLE_MS));
        }
        saved = true;
        refresh();
      } catch {
        showToast(t["common.saveFailed"], "error");
      } finally {
        setTogglingIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
      if (!saved) return;
      // The toast is presentation only: a failure there must not read as a
      // failed save (the row is already persisted).
      try {
        onToggled(task, reopening ? "reopened" : "completed");
      } catch {
        /* the caller's toast is best-effort */
      }
    },
    [onToggled, refresh, showToast, t, togglingIds],
  );

  return { togglingIds, toggle };
}
