import type { GtdProject, GtdTask, GtdTaskPatch, GtdViewKey } from "../../shared/models";
import type { Translation } from "../../i18n/zh";
import { daysUntil, parseDateKey } from "../../lib/dates";

export type { GtdProject, GtdTask, GtdTaskPatch, GtdViewKey };

export interface GtdFocusRequest {
  view: GtdViewKey;
  taskId?: number;
  projectId?: number;
  /** Project focus can target the archived list. */
  archived?: boolean;
  /** Calendar focus: the day a Home card wants to open. */
  date?: string;
}

export interface GtdFocus extends GtdFocusRequest {
  seq: number;
}

export function formatGtdDate(value: string): string {
  return new Date(value + "Z").toLocaleDateString();
}

export function formatGtdTime(value: string): string {
  return new Date(value + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Local YYYY-MM-DD key for a SQLite UTC timestamp. */
export function gtdTimestampDateKey(value: string): string {
  const date = new Date(value + "Z");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date-key heading used by the Upcoming and Completed groups. */
export function formatGtdDayHeading(key: string, lang: "zh" | "en", t: Translation): string {
  const diff = daysUntil(key);
  if (diff === 0) return t["gtd.dueDate.today"];
  if (diff === 1) return t["gtd.dueDate.tomorrow"];
  const date = parseDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}
