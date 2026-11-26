import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import Input from "../Input";
import ItemRow from "../ItemRow";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey } from "../../lib/dates";
import { bucketGrowthTasks, type GrowthTaskBuckets } from "../../lib/taskDates";
import type { PaletteColor } from "../../lib/colors";
import type { GrowthTask, GrowthTasksPayload } from "../../shared/models";
import GrowthTaskRow from "./GrowthTaskRow";
import { useGrowthTaskActions } from "./useGrowthTaskActions";

interface Props {
  tasks: GrowthTasksPayload;
  /** Domain colour per linked capability, so task badges match the capability page. */
  capabilityColors: Map<number, PaletteColor>;
  onOpenTask: (task: GrowthTask) => void;
  onDeleteTask: (task: GrowthTask) => void;
  onPredictTask: (task: GrowthTask) => void;
  onTaskToggled: (task: GrowthTask, action: "completed" | "reopened") => void;
  onChanged: () => void;
}

const GROUP_KEYS = ["overdue", "today", "soon", "later", "undated"] as const;

/**
 * The whole task surface, embedded in the capability page's all-domain
 * overview. One quick-add input is the only creation point; dates and
 * capabilities are edited in the task modal.
 * Every row is the shared `GrowthTaskRow`, so complete/reopen/edit/delete behave
 * the same here and in a capability's related list.
 */
export default function GrowthTasksCard({
  tasks,
  capabilityColors,
  onOpenTask,
  onDeleteTask,
  onPredictTask,
  onTaskToggled,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [clearingCompleted, setClearingCompleted] = useState(false);
  const { togglingIds, toggle } = useGrowthTaskActions(onChanged, onTaskToggled);

  const today = dateKey(new Date());
  const buckets = useMemo(() => bucketGrowthTasks(tasks.open, today), [tasks.open, today]);

  const add = async () => {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await window.prism.addGrowthTask({
        title: clean,
        scheduledDate: today,
        dueDate: today,
      });
      setTitle("");
      onChanged();
    } catch {
      showToast(t["common.saveFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const clearCompleted = async () => {
    try {
      const removed = await window.prism.clearCompletedGrowthTasks();
      setCompletedOpen(false);
      onChanged();
      if (removed > 0) {
        showToast(t["growth.tasks.clearedToast"].replace("{count}", String(removed)), "success");
      }
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("clear failed");
    }
  };

  const taskRow = (task: GrowthTask, completed = false) => (
    <li key={task.id}>
      <GrowthTaskRow
        task={task}
        palette={task.capability ? capabilityColors.get(task.capability.id) : undefined}
        showCapability
        showCompletedDate={completed}
        toggling={togglingIds.has(task.id)}
        onOpen={() => onOpenTask(task)}
        onToggle={() => void toggle(task)}
        onDelete={() => onDeleteTask(task)}
        onPredict={() => onPredictTask(task)}
      />
    </li>
  );

  const group = (key: (typeof GROUP_KEYS)[number], items: GrowthTask[]) => {
    if (items.length === 0) return null;
    return (
      <section key={key} className="space-y-1">
        <div className="flex items-center gap-2 px-2">
          <span className="text-caption text-muted">{t[`growth.tasks.group.${key}`]}</span>
          <span className="tabular-nums text-caption text-faint">{items.length}</span>
        </div>
        <ul>{items.map((task) => taskRow(task))}</ul>
      </section>
    );
  };

  return (
    <section className="flex h-full w-full min-h-0 min-w-0 flex-col rounded-card border border-strong/40 bg-surface p-3">
      <Input
        className="w-full min-w-0"
        value={title}
        placeholder={t["growth.tasks.quickAdd"]}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void add();
          }
        }}
      />

      <div className="motion-stagger mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {tasks.open.length === 0 ? (
          <EmptyState size="card" text={t["growth.tasks.cardEmpty"]} />
        ) : (
          GROUP_KEYS.map((key) => group(key, buckets[key as keyof GrowthTaskBuckets]))
        )}

        {/* A section-level rule separates open from completed; rows inside a
            list stay divider-free. No rule when there is nothing above it. */}
        {tasks.completed.length > 0 && (
          <section
            className={`space-y-1 ${
              tasks.open.length > 0 ? "border-t border-line/40 pt-2" : "pt-1"
            }`}
          >
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <ItemRow
                  onPrimaryClick={() => setCompletedOpen((open) => !open)}
                  leading={
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted">
                      {completedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  }
                  title={<span className="text-caption text-muted">{t["growth.tasks.completed"]}</span>}
                  meta={
                    <span className="text-caption tabular-nums text-faint">
                      {tasks.completed.length}
                    </span>
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t["growth.tasks.clearCompleted"]}
                aria-label={t["growth.tasks.clearCompleted"]}
                onClick={() => setClearingCompleted(true)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            {completedOpen && <ul>{tasks.completed.map((task) => taskRow(task, true))}</ul>}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={clearingCompleted}
        message={t["growth.tasks.clearCompletedConfirm"].replace(
          "{count}",
          String(tasks.completed.length),
        )}
        confirmLabel={t["growth.tasks.clearCompleted"]}
        onConfirm={clearCompleted}
        onClose={() => setClearingCompleted(false)}
      />
    </section>
  );
}
