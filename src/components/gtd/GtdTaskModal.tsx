import { useEffect, useState } from "react";
import { Check, CalendarDays, Flag, ListChecks, RotateCcw, Trash2 } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import ConfirmDialog from "../ConfirmDialog";
import DueDateCalendar from "./DueDateCalendar";
import DueDateChip from "./DueDateChip";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { taskDateRange } from "../../lib/gtd";
import { formatGtdDate, formatGtdTime, type GtdProject, type GtdTask } from "./types";
import { Select } from "../settings/controls";

interface Props {
  task: GtdTask | null;
  projects: GtdProject[];
  onClose: () => void;
  onChanged: () => void;
}

export default function GtdTaskModal({ task, projects, onClose, onChanged }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dateKind, setDateKind] = useState<"scheduled" | "due" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const range = task ? taskDateRange(task) : null;
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setProjectId(task?.project?.id != null ? String(task.project.id) : "");
    setScheduledDate(range?.start ?? null);
    setDueDate(range?.end ?? null);
    setDateKind(null);
    setConfirmDelete(false);
  }, [task?.id]);

  const readOnly = !!task?.project?.archived;
  const completed = task?.completedAt != null;
  const locked = readOnly || completed;

  // Start and end are a pair: setting one fills the other only when the other
  // is still empty. Once both exist, editing one boundary leaves the other
  // alone (the range may grow or shrink); only an inverted pair is clamped.
  const applyStartDate = (next: string | null) => {
    if (next === null) {
      setScheduledDate(null);
      setDueDate(null);
      return;
    }
    setScheduledDate(next);
    setDueDate((current) => {
      if (!current) return next;
      if (current < next) return next;
      return current;
    });
  };

  const applyDueDate = (next: string | null) => {
    if (next === null) {
      setScheduledDate(null);
      setDueDate(null);
      return;
    }
    setDueDate(next);
    setScheduledDate((current) => {
      if (!current) return next;
      if (next < current) return next;
      return current;
    });
  };

  const save = async () => {
    if (!task) return;
    try {
      await window.prism.updateGtdTask(task.id, {
        title,
        notes,
        projectId: projectId ? Number(projectId) : null,
        scheduledDate,
        dueDate,
      });
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
    onClose();
  };

  const undo = async () => {
    if (!task) return;
    try {
      await window.prism.reopenGtdTask(task.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
    onClose();
  };

  const complete = async () => {
    if (!task) return;
    try {
      await window.prism.completeGtdTask(task.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
    onClose();
  };

  const remove = async () => {
    if (!task) return;
    try {
      await window.prism.deleteGtdTask(task.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setConfirmDelete(false);
    showToast(t["common.deleted"]);
    onChanged();
    onClose();
  };

  if (!task) return null;

  const projectOptions = [
    { value: "", label: t["gtd.noProject"] },
    ...projects.map((project) => ({ value: String(project.id), label: project.title })),
  ];

  const dateRow = (
    label: string,
    kind: "scheduled" | "due",
    value: string | null,
    setValue: (next: string | null) => void,
    icon: typeof CalendarDays,
  ) => {
    const Icon = icon;
    return (
      <div className="rounded-control border border-line/50 bg-elevated/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-muted flex-shrink-0" />
          <span className="text-caption text-muted">{label}</span>
          <span className="flex-1" />
          {value ? (
            <DueDateChip dueDate={value} kind={kind} />
          ) : (
            <span className="text-caption text-faint">{t["gtd.noDate"]}</span>
          )}
          {!readOnly && (
            <>
              <Button variant="ghost" size="xs" onClick={() => setDateKind(dateKind === kind ? null : kind)}>
                {t["gtd.dueDate.set"]}
              </Button>
              {value && (
                <Button variant="ghost" size="xs" onClick={() => setValue(null)}>
                  {t["gtd.dueDate.clear"]}
                </Button>
              )}
            </>
          )}
        </div>
        {!readOnly && dateKind === kind && (
          <div className="mt-2">
            <DueDateCalendar value={value} onChange={(next) => setValue(next)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={completed ? t["gtd.completed"] : t["gtd.taskDetails"]}
        icon={ListChecks}
        size="lg"
        footer={
          readOnly ? (
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t["common.close"]}
            </Button>
          ) : completed ? (
            <div className="flex w-full items-center gap-2">
              <Button variant="danger-subtle" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} />
                {t["menu.delete"]}
              </Button>
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t["common.close"]}
              </Button>
              <Button variant="primary" size="sm" onClick={undo}>
                <RotateCcw size={14} />
                {t["gtd.undoComplete"]}
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <Button variant="danger-subtle" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} />
                {t["menu.delete"]}
              </Button>
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={complete}>
                <Check size={14} />
                {t["gtd.markDone"]}
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t["resources.cancel"]}
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={!title.trim()}>
                {t["resources.save"]}
              </Button>
            </div>
          )
        }
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-caption text-muted">{t["gtd.taskTitle"]}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={locked}
              autoFocus={!locked}
              placeholder={t["gtd.taskTitle"]}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted">{t["gtd.taskNotes"]}</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              readOnly={locked}
              rows={4}
              placeholder={t["gtd.taskNotesPlaceholder"]}
              className="w-full resize-y"
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted">{t["gtd.projects"]}</label>
            {locked ? (
              <div className="text-body text-secondary">
                {task.project?.title ?? t["gtd.noProject"]}
                {readOnly && <span className="ml-2 text-caption text-muted">{t["gtd.projectArchivedNote"]}</span>}
              </div>
            ) : (
              <Select value={projectId} options={projectOptions} onChange={setProjectId} className="w-full" />
            )}
          </div>

          {locked ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-body text-secondary">
                <CalendarDays size={13} className="text-muted" />
                {t["gtd.scheduledDate"]}：
                {scheduledDate ? <DueDateChip dueDate={scheduledDate} kind="scheduled" /> : t["gtd.noDate"]}
              </div>
              <div className="flex items-center gap-2 text-body text-secondary">
                <Flag size={13} className="text-muted" />
                {t["gtd.dueDate"]}：
                {dueDate ? <DueDateChip dueDate={dueDate} kind="due" /> : t["gtd.noDate"]}
              </div>
            </div>
          ) : (
            <>
              {dateRow(t["gtd.scheduledDate"], "scheduled", scheduledDate, applyStartDate, CalendarDays)}
              {dateRow(t["gtd.dueDate"], "due", dueDate, applyDueDate, Flag)}
            </>
          )}

          <p className="text-caption leading-relaxed text-faint">{t["gtd.dateRangeHint"]}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line/30 pt-2 text-caption text-faint">
            <span>
              {formatGtdDate(task.createdAt)} {formatGtdTime(task.createdAt)}
            </span>
            {task.completedAt && <span>{t["gtd.completed"]}: {formatGtdDate(task.completedAt)}</span>}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        message={t["gtd.deleteTaskConfirm"]}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
