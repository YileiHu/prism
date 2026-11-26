import { addDays, dateKey, parseDateKey } from "./dates";
import type { GrowthTask } from "../shared/models";

export interface TaskRange {
  /** Inclusive local YYYY-MM-DD. */
  start: string;
  /** Inclusive local YYYY-MM-DD. */
  end: string;
}

/**
 * Effective date window. A task with one date is a one-day task; an inverted
 * pair (start after end) collapses to the earlier deadline so no invalid range
 * ever reaches the list.
 */
export function taskDateRange(
  task: Pick<GrowthTask, "scheduledDate" | "dueDate">,
): TaskRange | null {
  const scheduled = task.scheduledDate;
  const due = task.dueDate;
  if (scheduled && due) {
    return scheduled <= due
      ? { start: scheduled, end: due }
      : { start: due, end: due };
  }
  if (scheduled) return { start: scheduled, end: scheduled };
  if (due) return { start: due, end: due };
  return null;
}

export function isTaskActiveOn(
  task: Pick<GrowthTask, "scheduledDate" | "dueDate">,
  date: string,
): boolean {
  const range = taskDateRange(task);
  return !!range && range.start <= date && date <= range.end;
}

/** Only a range whose end has passed is overdue; a past start is in progress. */
export function isTaskOverdue(
  task: Pick<GrowthTask, "scheduledDate" | "dueDate">,
  today = dateKey(new Date()),
): boolean {
  const range = taskDateRange(task);
  return !!range && range.end < today;
}

/** Earliest deadline first; newest created first within the same deadline. */
export function compareTasksByDeadline(a: GrowthTask, b: GrowthTask): number {
  const endA = taskDateRange(a)?.end ?? "";
  const endB = taskDateRange(b)?.end ?? "";
  if (endA !== endB) return endA < endB ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

export interface GrowthTaskBuckets {
  /** Past the end of their range; open tasks only. */
  overdue: GrowthTask[];
  /** Active today (including a multi-day range that spans today). */
  today: GrowthTask[];
  /** Starting within the next seven days. */
  soon: GrowthTask[];
  /** Starting later than that. */
  later: GrowthTask[];
  /** No dates yet. */
  undated: GrowthTask[];
}

/**
 * One pure grouping pass shared by the task view and the overview. The caller
 * passes open tasks only. A task inside its range belongs to today even when it
 * started earlier; overdue is based on the end of the range only.
 */
export function bucketGrowthTasks(
  tasks: GrowthTask[],
  today = dateKey(new Date()),
): GrowthTaskBuckets {
  const soonLimit = dateKey(addDays(parseDateKey(today) ?? new Date(), 7));
  const buckets: GrowthTaskBuckets = {
    overdue: [],
    today: [],
    soon: [],
    later: [],
    undated: [],
  };
  for (const task of tasks) {
    const range = taskDateRange(task);
    if (!range) {
      buckets.undated.push(task);
    } else if (range.end < today) {
      buckets.overdue.push(task);
    } else if (range.start <= today) {
      buckets.today.push(task);
    } else if (range.start <= soonLimit) {
      buckets.soon.push(task);
    } else {
      buckets.later.push(task);
    }
  }
  buckets.overdue.sort(compareTasksByDeadline);
  buckets.today.sort(compareTasksByDeadline);
  buckets.soon.sort(compareTasksByDeadline);
  buckets.later.sort(compareTasksByDeadline);
  buckets.undated.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return buckets;
}
