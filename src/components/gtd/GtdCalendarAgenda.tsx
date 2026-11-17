import { useT } from "../../i18n";
import { isTaskActiveOn } from "../../lib/gtd";
import EmptyState from "../EmptyState";
import GtdSectionHeading from "./GtdSectionHeading";
import InboxCapture from "./InboxCapture";
import GtdTaskRow from "./GtdTaskRow";
import { useGtdFocusHighlight } from "./useGtdFocusHighlight";
import type { GtdProject, GtdTask } from "./types";

interface Props {
  date: string;
  tasks: GtdTask[];
  overdueTasks: GtdTask[];
  projects: GtdProject[];
  todayKey: string;
  focusTaskId?: number;
  focusSeq?: number;
  onOpenTask: (task: GtdTask) => void;
  onRequestDate: (task: GtdTask, kind: "scheduled" | "due") => void;
  onRequestDelete: (task: GtdTask) => void;
  onChanged: () => void;
}

/** Selected-day agenda above the month grid. */
export default function GtdCalendarAgenda({
  date,
  tasks,
  overdueTasks,
  projects,
  todayKey,
  focusTaskId,
  focusSeq,
  onOpenTask,
  onRequestDate,
  onRequestDelete,
  onChanged,
}: Props) {
  const { t } = useT();
  const isPast = date < todayKey;
  const highlightId = useGtdFocusHighlight(focusTaskId, focusSeq);
  // Overdue tasks are pinned in every agenda; when viewing one of their past
  // days they already appear above, so skip the duplicate.
  const overdueForDay = overdueTasks.filter((task) => !isTaskActiveOn(task, date));

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {!isPast && (
        <div className="flex-shrink-0 border-b border-line/30 px-3 py-2">
          <InboxCapture
            key={date}
            scheduledDate={date}
            placeholder={t["gtd.calendarAddToDay"]}
            rows={1}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {overdueForDay.length > 0 && (
          <section>
            <GtdSectionHeading label={t["gtd.overdue"]} count={overdueForDay.length} tone="danger" />
            {overdueForDay.map((task) => (
              <GtdTaskRow
                key={task.id}
                task={task}
                projects={projects}
                contextDate={date}
                highlighted={highlightId === task.id}
                onOpen={onOpenTask}
                onRequestDate={onRequestDate}
                onRequestDelete={onRequestDelete}
                onChanged={onChanged}
              />
            ))}
          </section>
        )}

        {tasks.length === 0 ? (
          <EmptyState size="card" text={t["gtd.calendarEmptyDay"]} />
        ) : (
          tasks.map((task) => (
            <GtdTaskRow
              key={task.id}
              task={task}
              projects={projects}
              contextDate={date}
              highlighted={highlightId === task.id}
              onOpen={onOpenTask}
              onRequestDate={onRequestDate}
              onRequestDelete={onRequestDelete}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </section>
  );
}
