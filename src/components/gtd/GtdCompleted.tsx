import { useMemo, useState } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import EmptyState from "../EmptyState";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import GtdTaskRow from "./GtdTaskRow";
import { useGtdFocusHighlight } from "./useGtdFocusHighlight";
import GtdSectionHeading from "./GtdSectionHeading";
import { formatGtdDayHeading, gtdTimestampDateKey, type GtdProject, type GtdTask } from "./types";

interface Props {
  tasks: GtdTask[];
  projects: GtdProject[];
  focusTaskId?: number;
  focusSeq?: number;
  onOpenTask: (task: GtdTask) => void;
  onRequestDelete: (task: GtdTask) => void;
  onChanged: () => void;
}

export default function GtdCompleted({
  tasks,
  projects,
  focusTaskId,
  focusSeq,
  onOpenTask,
  onRequestDelete,
  onChanged,
}: Props) {
  const { t, lang } = useT();
  const showToast = useToast();
  const highlightId = useGtdFocusHighlight(focusTaskId, focusSeq);
  const [confirmClear, setConfirmClear] = useState(false);

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="flex min-w-0 items-center gap-2 text-body font-medium text-primary">
        <CheckCircle2 size={15} className="text-[var(--accent-text)]" />
        <span className="truncate">{t["gtd.completed"]}</span>
        <span className="text-caption text-muted">{tasks.length}</span>
      </span>
    ),
    actions: tasks.length > 0 ? (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setConfirmClear(true)}
        title={t["gtd.clearCompleted"]}
        aria-label={t["gtd.clearCompleted"]}
      >
        <Trash2 size={15} />
      </Button>
    ) : undefined,
  }), [t, tasks.length]);

  useToolbarContribution("module:gtd", toolbar);

  const groups = useMemo(() => {
    const map = new Map<string, GtdTask[]>();
    for (const task of tasks) {
      if (!task.completedAt) continue;
      const key = gtdTimestampDateKey(task.completedAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(task);
      else map.set(key, [task]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [tasks]);

  const clearCompleted = async () => {
    try {
      await window.prism.clearCompletedGtdTasks();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setConfirmClear(false);
    onChanged();
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 && <EmptyState size="module" text={t["gtd.emptyCompleted"]} />}
        {groups.map(([key, group]) => (
          <section key={key} id={`gtd-completed-day-${key}`} className="scroll-mt-2">
            <GtdSectionHeading label={formatGtdDayHeading(key, lang, t)} count={group.length} />
            {group.map((task) => (
              <GtdTaskRow
                key={task.id}
                task={task}
                projects={projects}
                completed
                readOnly={!!task.project?.archived}
                highlighted={highlightId === task.id}
                onOpen={onOpenTask}
                onRequestDate={() => {}}
                onRequestDelete={onRequestDelete}
                onChanged={onChanged}
              />
            ))}
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={confirmClear}
        message={t["gtd.clearCompletedConfirm"]}
        onConfirm={clearCompleted}
        onClose={() => setConfirmClear(false)}
      />
    </>
  );
}
