import { Check, Pencil, RotateCcw, Timer, Trash2 } from "lucide-react";
import Badge from "../Badge";
import ItemRow from "../ItemRow";
import { useT } from "../../i18n";
import type { Translation } from "../../i18n/zh";
import { daysUntil, localDateFromStamp, parseDateKey } from "../../lib/dates";
import { isTaskOverdue, taskDateRange } from "../../lib/taskDates";
import type { PaletteColor } from "../../lib/colors";
import type { GrowthTask } from "../../shared/models";

function formatDay(value: string, lang: string): string {
  const date = parseDateKey(value);
  if (!date) return value;
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * Yesterday/today/tomorrow and "in N days" for the near window (up to three
 * days ahead); anything further away keeps a real date so a task can't read as
 * imminent when it isn't.
 */
function dayLabel(value: string, lang: string, t: Translation): string {
  const offset = daysUntil(value);
  if (offset === null) return value;
  if (offset === -1) return t["date.yesterday"];
  if (offset === 0) return t["date.today"];
  if (offset === 1) return t["date.tomorrow"];
  if (offset >= 2 && offset <= 3) {
    return t["date.inDays"].replace("{count}", String(offset));
  }
  return formatDay(value, lang);
}

interface Props {
  task: GrowthTask;
  /** Domain palette of the linked capability; only read when `showCapability`. */
  palette?: PaletteColor;
  /** The overview names the capability; a capability's own task list does not. */
  showCapability?: boolean;
  /** A completed row shows when it was finished instead of its date range. */
  showCompletedDate?: boolean;
  /** This row's complete/reopen call is in flight. */
  toggling?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
  /** Present when the row is shown on a surface that can open the forecast modal. */
  onPredict?: () => void;
}

/**
 * One task row, shared by the overview card and a capability's related list.
 * The checkbox lives inside the standard row (its click does not open the
 * dialog), editing is a row click, and complete/reopen/delete are right-click
 * actions — rows never grow trailing buttons.
 */
export default function GrowthTaskRow({
  task,
  palette,
  showCapability = false,
  showCompletedDate = true,
  toggling = false,
  onOpen,
  onToggle,
  onDelete,
  onPredict,
}: Props) {
  const { t, lang } = useT();
  const completed = task.completedAt !== null;
  const range = taskDateRange(task);
  const overdue = !completed && isTaskOverdue(task);
  const toggleLabel = completed ? t["growth.tasks.reopen"] : t["growth.tasks.complete"];
  const rangeLabel =
    range === null
      ? null
      : range.start === range.end
        ? dayLabel(range.start, lang, t)
        : `${dayLabel(range.start, lang, t)} – ${dayLabel(range.end, lang, t)}`;

  return (
    <ItemRow
      onPrimaryClick={onOpen}
      tooltip={task.notes.trim() || undefined}
      menuItems={[
        {
          label: t["menu.edit"],
          icon: <Pencil size={14} />,
          onClick: onOpen,
        },
        {
          label: toggleLabel,
          icon: completed ? <RotateCcw size={14} /> : <Check size={14} />,
          onClick: onToggle,
        },
        ...(!completed && onPredict
          ? [
              {
                label: t["growth.taskPredict"],
                icon: <Timer size={14} />,
                onClick: onPredict,
              },
            ]
          : []),
        {
          label: t["menu.delete"],
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: onDelete,
        },
      ]}
      leading={
        <button
          type="button"
          aria-pressed={completed}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={(event) => {
            event.stopPropagation();
            if (!toggling) onToggle();
          }}
          className={`relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
            completed
              ? "border-accent bg-accent text-on-accent"
              : toggling
                ? "border-accent text-[var(--accent-text)]"
                : "border-strong/50 text-transparent hover:border-accent hover:text-[var(--accent-text)]"
          }`}
        >
          {toggling && (
            <span className="growth-check-ripple pointer-events-none absolute inset-[-4px] rounded-full border border-[var(--accent)]" />
          )}
          <Check size={12} />
        </button>
      }
      title={
        <span className={completed ? "text-faint line-through" : "text-primary"}>
          {task.title}
        </span>
      }
      meta={
        <span className="flex flex-shrink-0 items-center gap-2">
          {showCapability && task.capability && (
            <Badge palette={palette} className="max-w-[9rem] flex-shrink-0 truncate">
              {task.capability.name}
            </Badge>
          )}
          {showCompletedDate && completed ? (
            <span className="flex-shrink-0 text-caption tabular-nums text-faint">
              {localDateFromStamp(task.completedAt)}
            </span>
          ) : (
            rangeLabel && (
              <span
                className={`flex-shrink-0 text-caption tabular-nums ${
                  overdue ? "text-danger" : "text-faint"
                }`}
              >
                {rangeLabel}
              </span>
            )
          )}
        </span>
      }
    />
  );
}
