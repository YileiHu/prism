import { dateKey } from "./dates";
import type { GtdTask } from "../shared/models";

export interface GtdTaskRange {
  /** Inclusive local YYYY-MM-DD. */
  start: string;
  /** Inclusive local YYYY-MM-DD. */
  end: string;
}

/**
 * Effective date window. A task with one date is a one-day task; a legacy
 * inverted pair (start after end) collapses to the earlier deadline so no
 * invalid range ever reaches the calendar.
 */
export function taskDateRange(
  task: Pick<GtdTask, "scheduledDate" | "dueDate">,
): GtdTaskRange | null {
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
  task: Pick<GtdTask, "scheduledDate" | "dueDate">,
  date: string,
): boolean {
  const range = taskDateRange(task);
  return !!range && range.start <= date && date <= range.end;
}

/** Only a range whose end has passed is overdue; a past start is in progress. */
export function isTaskOverdue(
  task: Pick<GtdTask, "scheduledDate" | "dueDate">,
  today = dateKey(new Date()),
): boolean {
  const range = taskDateRange(task);
  return !!range && range.end < today;
}

/** Earliest deadline first; newest created first within the same deadline. */
export function compareTasksByDeadline(a: GtdTask, b: GtdTask): number {
  const endA = taskDateRange(a)?.end ?? "";
  const endB = taskDateRange(b)?.end ?? "";
  if (endA !== endB) return endA < endB ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

export interface GtdGroupedTasks {
  /** Past the end of their range; open tasks only. */
  overdue: GtdTask[];
  /** Undated tasks already assigned to a project: the project page owns them. */
  projectUndated: GtdTask[];
  inbox: GtdTask[];
}

/**
 * One pure grouping pass shared by the GTD views. The caller passes open tasks
 * only. `inbox` is strictly unassigned undated tasks — assigning a project is a
 * processing action, so those tasks move to `projectUndated`. `overdue` is
 * based on the end of the range only; an active range is never overdue.
 */
export function groupGtdTasks(tasks: GtdTask[]): GtdGroupedTasks {
  const today = dateKey(new Date());
  const overdue: GtdTask[] = [];
  const projectUndated: GtdTask[] = [];
  const inbox: GtdTask[] = [];

  for (const task of tasks) {
    const range = taskDateRange(task);
    if (!range) {
      if (task.project) projectUndated.push(task);
      else inbox.push(task);
    } else if (range.end < today) {
      overdue.push(task);
    }
  }

  overdue.sort(compareTasksByDeadline);
  projectUndated.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  inbox.sort((a, b) =>
    a.inboxOrder !== b.inboxOrder
      ? a.inboxOrder - b.inboxOrder
      : (a.createdAt < b.createdAt ? 1 : -1)
  );
  return { overdue, projectUndated, inbox };
}
