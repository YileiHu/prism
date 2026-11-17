import { Inbox } from "lucide-react";
import { useT } from "../../i18n";
import EmptyState from "../EmptyState";
import GtdTaskRow from "./GtdTaskRow";
import InboxCapture from "./InboxCapture";
import type { GtdProject, GtdTask } from "./types";

interface Props {
  tasks: GtdTask[];
  projects: GtdProject[];
  onOpenTask: (task: GtdTask) => void;
  onRequestDate: (task: GtdTask, kind: "scheduled" | "due") => void;
  onRequestDelete: (task: GtdTask) => void;
  onChanged: () => void;
}

/** Inbox card in the calendar home's top row. */
export default function GtdCalendarInbox({
  tasks,
  projects,
  onOpenTask,
  onRequestDate,
  onRequestDelete,
  onChanged,
}: Props) {
  const { t } = useT();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-strong/50 bg-surface">
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-line/30 px-3">
        <Inbox size={14} className="flex-shrink-0 text-[var(--accent-text)]" />
        <span className="truncate text-caption font-medium text-secondary">{t["gtd.inbox"]}</span>
        <span className="text-caption tabular-nums text-faint">{tasks.length}</span>
      </div>

      <div className="flex-shrink-0 border-b border-line/30 px-3 py-2">
        <InboxCapture rows={1} placeholder={t["gtd.inboxCapture"]} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <EmptyState size="card" text={t["gtd.emptyInbox"]} />
        ) : (
          tasks.map((task) => (
            <GtdTaskRow
              key={task.id}
              task={task}
              projects={projects}
              onOpen={onOpenTask}
              onRequestDate={onRequestDate}
              onRequestDelete={onRequestDelete}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}
