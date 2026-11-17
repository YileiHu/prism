import { Check, CalendarDays, Flag, FolderKanban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import ItemRow from "../ItemRow";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { resolveTagColor } from "../../lib/colors";
import { addDays, dateKey } from "../../lib/dates";
import { taskDateRange } from "../../lib/gtd";
import DueDateChip from "./DueDateChip";
import { formatGtdTime, type GtdProject, type GtdTask, type GtdTaskPatch } from "./types";
import type { MenuItem } from "../ContextMenu";

interface Props {
  task: GtdTask;
  projects: GtdProject[];
  /** Hide the project badge on a project page. */
  showProject?: boolean;
  completed?: boolean;
  readOnly?: boolean;
  highlighted?: boolean;
  /** Selected-day agenda: hide the day's start date; show only deadline/overdue. */
  contextDate?: string;
  onOpen: (task: GtdTask) => void;
  onRequestDate: (task: GtdTask, kind: "scheduled" | "due") => void;
  onRequestDelete: (task: GtdTask) => void;
  onChanged: () => void;
}

export default function GtdTaskRow({
  task,
  projects,
  showProject = true,
  completed = false,
  readOnly = false,
  highlighted = false,
  contextDate,
  onOpen,
  onRequestDate,
  onRequestDelete,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();

  const savePatch = async (patch: GtdTaskPatch) => {
    try {
      await window.prism.updateGtdTask(task.id, patch);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const toggleDone = async () => {
    if (readOnly || completed) return;
    try {
      await window.prism.completeGtdTask(task.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const reopen = async () => {
    try {
      await window.prism.reopenGtdTask(task.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const assignProject = (projectId: number | null) => {
    void savePatch({ projectId });
  };

  const projectMenu: MenuItem[] = [
    {
      label: t["gtd.noProject"],
      checked: !task.project,
      onClick: () => assignProject(null),
    },
    ...projects.map((project) => ({
      label: project.title,
      checked: task.project?.id === project.id,
      onClick: () => assignProject(project.id),
    })),
  ];

  const range = taskDateRange(task);
  const multiDay = !!range && range.start !== range.end;
  const todayKey = dateKey(new Date());
  const tomorrowKey = dateKey(addDays(new Date(), 1));

  const menuItems: MenuItem[] = completed
    ? [
        ...(task.project?.archived ? [] : [{ label: t["gtd.undoComplete"], icon: <RotateCcw size={14} />, onClick: reopen }]),
        ...(task.project?.archived ? [] : [{ label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => onRequestDelete(task) }]),
      ]
    : [
        { label: t["gtd.taskDetails"], icon: <Pencil size={14} />, onClick: () => onOpen(task) },
        ...(!multiDay
          ? [
              { label: t["gtd.dueDate.today"], icon: <CalendarDays size={14} />, onClick: () => void savePatch({ scheduledDate: todayKey, dueDate: todayKey }) },
              { label: t["gtd.dueDate.tomorrow"], icon: <CalendarDays size={14} />, onClick: () => void savePatch({ scheduledDate: tomorrowKey, dueDate: tomorrowKey }) },
              { label: t["gtd.chooseScheduleDate"], icon: <CalendarDays size={14} />, onClick: () => onRequestDate(task, "scheduled") },
              { label: t["gtd.chooseDueDate"], icon: <Flag size={14} />, onClick: () => onRequestDate(task, "due") },
            ]
          : []),
        { separator: true, label: "" },
        ...(showProject
          ? [{ label: t["gtd.moveToProject"], icon: <FolderKanban size={14} />, children: projectMenu }]
          : [{ label: t["gtd.removeFromProject"], icon: <FolderKanban size={14} />, onClick: () => assignProject(null) }]),
        { separator: true, label: "" },
        { label: t["gtd.markDone"], icon: <Check size={14} />, onClick: toggleDone },
        { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => onRequestDelete(task) },
      ];

  // Mixed views get a thin project stripe so scanning by project does not
  // depend on reading the badge. Project pages suppress it (showProject=false).
  const stripeColor = showProject && task.project
    ? resolveTagColor(task.project.title, task.project.color).bar
    : null;
  const rowStyle = stripeColor ? { boxShadow: `inset 2px 0 0 ${stripeColor}` } : undefined;

  if (readOnly) {
    return (
      <ItemRow
        id={`gtd-task-${task.id}`}
        variant="list"
        className="border-b border-line/30"
        style={rowStyle}
        leading={<DoneMark done={completed} readOnly />}
        title={completed ? <span className="text-muted line-through">{task.title}</span> : task.title}
        meta={<TaskMeta task={task} projects={projects} showProject={showProject} completed={completed} contextDate={contextDate} />}
      />
    );
  }

  return (
    <ItemRow
      id={`gtd-task-${task.id}`}
      variant="list"
      onPrimaryClick={() => onOpen(task)}
      menuItems={menuItems.length > 0 ? menuItems : undefined}
      className={`border-b border-line/30 ${highlighted ? "bg-[var(--accent-muted)]" : ""}`}
      style={rowStyle}
      leading={
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleDone();
          }}
          disabled={completed}
          title={completed ? t["gtd.markDone"] : t["gtd.markDone"]}
          className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
            completed
              ? "bg-[var(--accent)] border-[var(--accent)] text-on-accent"
              : "surface-inset hover:border-[var(--accent)]"
          }`}
        >
          {completed && <Check size={11} strokeWidth={3} />}
        </button>
      }
      title={completed ? <span className="text-muted line-through">{task.title}</span> : task.title}
      meta={<TaskMeta task={task} projects={projects} showProject={showProject} completed={completed} contextDate={contextDate} />}
    />
  );
}

function DoneMark({ done, readOnly }: { done: boolean; readOnly?: boolean }) {
  return (
    <span
      className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center ${
        done ? "bg-[var(--accent)] border-[var(--accent)] text-on-accent" : "surface-inset"
      } ${readOnly ? "opacity-60" : ""}`}
    >
      {done && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

function TaskMeta({
  task,
  projects,
  showProject,
  completed,
  contextDate,
}: {
  task: GtdTask;
  projects: GtdProject[];
  showProject: boolean;
  completed: boolean;
  contextDate?: string;
}) {
  const project = task.project ? projects.find((p) => p.id === task.project?.id) ?? task.project : null;
  const range = taskDateRange(task);
  const todayKey = dateKey(new Date());
  const endKind = completed ? "scheduled" : "due";

  return (
    <span className="flex flex-shrink-0 items-center gap-2">
      {range && (contextDate ? (
        range.end < todayKey || range.end > contextDate ? (
          <DueDateChip dueDate={range.end} kind="due" />
        ) : null
      ) : range.start === range.end ? (
        <DueDateChip dueDate={range.end} kind={endKind} />
      ) : (
        <>
          <DueDateChip dueDate={range.start} kind="scheduled" />
          <DueDateChip dueDate={range.end} kind={endKind} />
        </>
      ))}
      {completed && task.completedAt && (
        <span className="text-caption text-faint">{formatGtdTime(task.completedAt)}</span>
      )}
      {showProject && project && (
        <Badge palette={resolveTagColor(project.title, project.color)} className="max-w-[40%] flex-shrink-0">
          <span className="min-w-0 truncate">{project.title}</span>
        </Badge>
      )}
    </span>
  );
}
