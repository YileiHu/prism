import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "../Button";
import DragPreview from "../DragPreview";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { addDays, buildMonthGrid, dateKey, parseDateKey, type MonthGridCell } from "../../lib/dates";
import { compareTasksByDeadline, isTaskActiveOn, isTaskOverdue, taskDateRange } from "../../lib/gtd";
import { resolveTagColor } from "../../lib/colors";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import GtdCalendarAgenda from "./GtdCalendarAgenda";
import GtdCalendarInbox from "./GtdCalendarInbox";
import type { GtdProject, GtdTask } from "./types";

interface Props {
  tasks: GtdTask[];
  inboxTasks: GtdTask[];
  overdueTasks: GtdTask[];
  projects: GtdProject[];
  cursor: { year: number; month: number };
  selectedDate: string;
  focusTaskId?: number;
  focusSeq?: number;
  onCursorChange: (cursor: { year: number; month: number }) => void;
  onSelectDate: (date: string) => void;
  onOpenTask: (task: GtdTask) => void;
  onRequestDate: (task: GtdTask, kind: "scheduled" | "due") => void;
  onRequestDelete: (task: GtdTask) => void;
  onReorderInbox: (from: number, to: number) => void;
  onChanged: () => void;
}

/** Two muted weeks before/after the real month give the focus row scrolling
 * room, so the first/last week can center without offset math. */
function buildBufferWeeks(start: Date, weeks = 2): MonthGridCell[][] {
  return Array.from({ length: weeks }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      return { date, key: dateKey(date), day: date.getDate(), inMonth: false };
    }),
  );
}

function BufferWeek({ days }: { days: MonthGridCell[] }) {
  return (
    <div className="grid h-16 grid-cols-7 gap-1" aria-hidden="true">
      {days.map((cell) => (
        <div
          key={cell.key}
          className="flex h-full min-w-0 flex-col overflow-hidden rounded-control border border-transparent bg-overlay/30 p-1 opacity-30"
        >
          <span className="flex h-5 w-5 items-center justify-center text-meta tabular-nums text-faint">
            {cell.day}
          </span>
        </div>
      ))}
    </div>
  );
}

function taskColor(task: GtdTask): string {
  return task.project
    ? resolveTagColor(task.project.title, task.project.color).bar
    : "rgb(var(--c-faint))";
}

function CalendarTaskChip({
  task,
  overdue,
  onOpen,
}: {
  task: GtdTask;
  overdue: boolean;
  onOpen: (task: GtdTask) => void;
}) {
  const range = taskDateRange(task);
  const draggable = !!range && range.start === range.end;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(task.id),
    data: { task },
    disabled: !draggable,
  });
  const guard = useDragClickGuard(isDragging);

  return (
    <button
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      {...guard}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      title={task.title}
      aria-label={task.title}
      className={`accent-focus flex w-full min-w-0 items-center gap-1 rounded-[3px] px-1 py-0.5 text-left text-meta leading-tight text-secondary transition-colors hover:bg-elevated/50 hover:text-primary ${
        isDragging ? "opacity-40" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <span
        className="h-3 w-[3px] flex-shrink-0 rounded-full"
        style={{ backgroundColor: taskColor(task) }}
      />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {overdue && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function CalendarDayCell({
  cell,
  tasks,
  selected,
  today,
  todayKey,
  past,
  maxChips,
  onSelect,
  onOpenTask,
}: {
  cell: MonthGridCell;
  tasks: GtdTask[];
  selected: boolean;
  today: boolean;
  todayKey: string;
  past: boolean;
  maxChips: number;
  onSelect: () => void;
  onOpenTask: (task: GtdTask) => void;
}) {
  const { t, lang } = useT();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const { isOver, setNodeRef } = useDroppable({
    id: cell.key,
    disabled: !cell.inMonth || past,
  });
  const visible = cell.inMonth ? tasks.slice(0, maxChips) : [];
  const extra = visible.length > 0 ? tasks.length - visible.length : 0;
  const fullDate = cell.date.toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const state = isOver
    ? "border-[var(--accent)] bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]"
    : selected
      ? "z-10 bg-accent/10 ring-2 ring-inset ring-accent"
      : today
        ? "bg-accent/5"
        : "hover:bg-elevated/40";

  return (
    <div
      ref={setNodeRef}
      onClick={cell.inMonth ? onSelect : undefined}
      className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-control border p-1 transition-colors ${
        cell.inMonth
          ? `cursor-pointer border-line/30 ${state}`
          : "cursor-default border-transparent bg-overlay/30 opacity-30"
      }`}
    >
      {cell.inMonth ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={fullDate}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-meta tabular-nums ${
            selected
              ? "bg-[var(--accent)] text-on-accent"
              : today
                ? "text-[var(--accent-text)]"
                : "text-secondary hover:bg-elevated"
          }`}
        >
          {cell.day}
        </button>
      ) : (
        <span className="flex h-5 w-5 items-center justify-center text-meta tabular-nums text-faint">
          {cell.day}
        </span>
      )}

      {visible.length > 0 && (
        <div className="mt-0.5 flex min-w-0 flex-col gap-0.5">
          {visible.map((task) => (
            <CalendarTaskChip
              key={task.id}
              task={task}
              overdue={isTaskOverdue(task, todayKey)}
              onOpen={(next) => {
                onSelect();
                onOpenTask(next);
              }}
            />
          ))}
          {extra > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              title={t["gtd.calendarMore"].replace("{count}", String(extra))}
              className="w-full truncate rounded-[3px] px-1 text-left text-meta text-muted hover:text-secondary"
            >
              +{extra}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GtdCalendar({
  tasks,
  inboxTasks,
  overdueTasks,
  projects,
  cursor,
  selectedDate,
  focusTaskId,
  focusSeq,
  onCursorChange,
  onSelectDate,
  onOpenTask,
  onRequestDate,
  onRequestDelete,
  onReorderInbox,
  onChanged,
}: Props) {
  const { t, lang } = useT();
  const showToast = useToast();
  const [activeTask, setActiveTask] = useState<GtdTask | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const weekStart: 0 | 1 = lang === "zh" ? 1 : 0;
  const todayKey = dateKey(new Date());

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, weekStart),
    [cursor.year, cursor.month, weekStart],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, GtdTask[]>();
    for (const cell of cells) {
      if (!cell.inMonth) continue;
      const active = tasks.filter((task) => isTaskActiveOn(task, cell.key));
      if (active.length > 0) map.set(cell.key, active.sort(compareTasksByDeadline));
    }
    return map;
  }, [tasks, cells]);
  const selectedTasks = useMemo(
    () => tasks.filter((task) => isTaskActiveOn(task, selectedDate)).sort(compareTasksByDeadline),
    [tasks, selectedDate],
  );
  const selectedDateLabel = parseDateKey(selectedDate)?.toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
  }) ?? selectedDate;
  const isTodaySelected = selectedDate === todayKey;

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="flex min-w-0 items-center gap-2 text-body font-medium text-primary">
        <CalendarDays size={15} className="flex-shrink-0 text-[var(--accent-text)]" />
        {isTodaySelected && (
          <>
            <span className="flex-shrink-0 text-[var(--accent-text)]">{t["gtd.dueDate.today"]}</span>
            <span className="flex-shrink-0 text-faint">·</span>
          </>
        )}
        <span className="truncate">{selectedDateLabel}</span>
      </span>
    ),
    subtitle: (
      <span className="flex-shrink-0 text-caption tabular-nums text-faint">
        {t["gtd.calendarDayCount"].replace("{count}", String(selectedTasks.length))}
      </span>
    ),
  }), [isTodaySelected, selectedDateLabel, selectedTasks.length, t]);
  useToolbarContribution("module:gtd", toolbar);

  const weeks = useMemo(() => {
    const rows: MonthGridCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);
  const focusWeekIndex = useMemo(
    () => Math.max(0, weeks.findIndex((week) => week.some((cell) => cell.key === selectedDate))),
    [weeks, selectedDate],
  );
  const focusWeekRef = useRef<HTMLDivElement>(null);

  const bufferBefore = useMemo(
    () => buildBufferWeeks(addDays(cells[0].date, -14)),
    [cells],
  );
  const bufferAfter = useMemo(
    () => buildBufferWeeks(addDays(cells[cells.length - 1].date, 1)),
    [cells],
  );

  // The buffer weeks above/below give the first/last real week enough scroll
  // range to center naturally.
  useEffect(() => {
    focusWeekRef.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [cursor.year, cursor.month, focusWeekIndex]);

  const weekdays = useMemo(() => {
    const sunday = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + ((weekStart + i) % 7));
      return date.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale, weekStart]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const selected = parseDateKey(selectedDate);
    const day = Math.min(selected?.getDate() ?? 1, daysInMonth);
    onCursorChange({ year: next.getFullYear(), month: next.getMonth() });
    onSelectDate(dateKey(new Date(next.getFullYear(), next.getMonth(), day)));
  };

  const goToday = () => {
    const now = new Date();
    onCursorChange({ year: now.getFullYear(), month: now.getMonth() });
    onSelectDate(dateKey(now));
  };

  const selectCell = (key: string, inMonth: boolean) => {
    if (!inMonth) {
      const date = parseDateKey(key);
      if (date) onCursorChange({ year: date.getFullYear(), month: date.getMonth() });
    }
    onSelectDate(key);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTask((active.data.current?.task as GtdTask | undefined) ?? null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over) return;
    const task = active.data.current?.task as GtdTask | undefined;
    const target = String(over.id);
    if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return;
    if (target < todayKey) return;
    const targetDate = parseDateKey(target);
    if (
      !targetDate ||
      targetDate.getFullYear() !== cursor.year ||
      targetDate.getMonth() !== cursor.month
    ) {
      return;
    }
    const range = taskDateRange(task);
    // Multi-day tasks are moved by editing their start/end dates, not by drag.
    if (!range || range.start !== range.end) return;
    if (range.start === target) return;

    try {
      await window.prism.updateGtdTask(task.id, { scheduledDate: target, dueDate: target });
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }

    onSelectDate(target);
    onChanged();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-[0_0_48%] gap-2 p-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-strong/50 bg-surface">
          <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-line/30 px-3">
            <CalendarDays size={14} className="flex-shrink-0 text-[var(--accent-text)]" />
            <span className="truncate text-caption font-medium text-secondary" title={selectedDateLabel}>
              {selectedDateLabel}
            </span>
          </div>
          <GtdCalendarAgenda
            date={selectedDate}
            tasks={selectedTasks}
            overdueTasks={overdueTasks}
            projects={projects}
            todayKey={todayKey}
            focusTaskId={focusTaskId}
            focusSeq={focusSeq}
            onOpenTask={onOpenTask}
            onRequestDate={onRequestDate}
            onRequestDelete={onRequestDelete}
            onChanged={onChanged}
          />
        </div>
        <GtdCalendarInbox
          tasks={inboxTasks}
          projects={projects}
          onOpenTask={onOpenTask}
          onRequestDate={onRequestDate}
          onRequestDelete={onRequestDelete}
          onReorder={onReorderInbox}
          onChanged={onChanged}
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-line/30 px-3 py-2">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t["gtd.dueDate.prevMonth"]}
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft size={15} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-medium text-primary">{monthLabel}</div>
        </div>
        <Button variant="secondary" size="xs" onClick={goToday}>
          {t["gtd.dueDate.today"]}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t["gtd.dueDate.nextMonth"]}
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight size={15} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="h-full min-w-[520px] px-2">
          <div className="relative h-full">
            <div className="h-full overflow-y-auto">
              <div className="sticky top-0 z-20 grid grid-cols-7 gap-1 bg-base py-1">
                {weekdays.map((name, i) => (
                  <div
                    key={`w${i}`}
                    className="flex h-6 items-center justify-center text-meta text-faint"
                  >
                    {name}
                  </div>
                ))}
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragCancel={() => setActiveTask(null)}
                onDragEnd={(event) => {
                  void handleDragEnd(event);
                }}
              >
                <div className="flex flex-col gap-1 py-2">
                  {bufferBefore.map((week) => (
                    <BufferWeek key={week[0].key} days={week} />
                  ))}
                  {weeks.map((week, index) => {
                    const distance = Math.abs(index - focusWeekIndex);
                    const rowHeight =
                      distance === 0
                        ? "h-[184px]"
                        : distance === 1
                          ? "h-[112px]"
                          : distance === 2
                            ? "h-[96px]"
                            : "h-[84px]";
                    const maxChips = distance === 0 ? 6 : distance === 1 ? 3 : 2;

                    return (
                      <div
                        key={week[0].key}
                        ref={index === focusWeekIndex ? focusWeekRef : undefined}
                        className={`grid grid-cols-7 gap-1 rounded-control ${rowHeight} ${
                          distance === 0 ? "bg-accent/5" : ""
                        }`}
                      >
                        {week.map((cell) => (
                          <CalendarDayCell
                            key={cell.key}
                            cell={cell}
                            tasks={cell.inMonth ? byDate.get(cell.key) ?? [] : []}
                            selected={cell.inMonth && cell.key === selectedDate}
                            today={cell.inMonth && cell.key === todayKey}
                            todayKey={todayKey}
                            past={cell.inMonth && cell.key < todayKey}
                            maxChips={maxChips}
                            onSelect={() => selectCell(cell.key, cell.inMonth)}
                            onOpenTask={onOpenTask}
                          />
                        ))}
                      </div>
                    );
                  })}
                  {bufferAfter.map((week) => (
                    <BufferWeek key={week[0].key} days={week} />
                  ))}
                </div>

                <DragOverlay dropAnimation={null}>
                  {activeTask ? (
                    <DragPreview className="flex max-w-[220px] items-center gap-1.5 px-2 py-1 text-meta text-primary">
                      <span
                        className="h-3.5 w-[3px] flex-shrink-0 rounded-full"
                        style={{ backgroundColor: taskColor(activeTask) }}
                      />
                      <span className="truncate">{activeTask.title}</span>
                    </DragPreview>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-8 z-30 h-12 bg-gradient-to-b from-base via-base/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-base via-base/70 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
