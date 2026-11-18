import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Archive,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  Plus,
  type LucideIcon,
} from "lucide-react";
import CollapsibleSidebar from "../CollapsibleSidebar";
import { ModuleSidebar } from "../AppSidebarSlot";
import NavItem from "../NavItem";
import EmptyState from "../EmptyState";
import Button from "../Button";
import { SkeletonRows } from "../Skeleton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey, parseDateKey } from "../../lib/dates";
import { groupGtdTasks, taskDateRange } from "../../lib/gtd";
import GtdCalendar from "./GtdCalendar";
import GtdCompleted from "./GtdCompleted";
import GtdProjectDetail from "./GtdProjectDetail";
import GtdProjectList from "./GtdProjectList";
import GtdProjectCreateModal from "./GtdProjectCreateModal";
import GtdTaskModal from "./GtdTaskModal";
import GtdDueDateModal from "./GtdDueDateModal";
import ConfirmDialog from "../ConfirmDialog";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import type { GtdProjectLink } from "../../shared/models";
import type { VaultEntry } from "../../types";
import type { GtdFocus, GtdProject, GtdTask, GtdTaskPatch } from "./types";

type GtdListKey = "calendar" | "completed" | "project" | "archived";

interface Props {
  active: boolean;
  focus: GtdFocus | null;
  vaults: VaultEntry[];
  onOpenProjectLink: (link: GtdProjectLink) => void;
}

export default function GtdView({ active, focus, vaults, onOpenProjectLink }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [list, setList] = useState<GtdListKey>("calendar");
  const [openTasks, setOpenTasks] = useState<GtdTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<GtdTask[]>([]);
  const [projects, setProjects] = useState<GtdProject[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<GtdProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedArchivedId, setSelectedArchivedId] = useState<number | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [archivedOpen, setArchivedOpen] = useState(true);
  const [selectedTask, setSelectedTask] = useState<GtdTask | null>(null);
  const [dateEditing, setDateEditing] = useState<{ task: GtdTask; kind: "scheduled" | "due" } | null>(null);
  const [deleting, setDeleting] = useState<GtdTask | null>(null);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [activeFocus, setActiveFocus] = useState<GtdFocus | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [calendarSelected, setCalendarSelected] = useState(() => dateKey(new Date()));
  const focusSeqRef = useRef(0);

  const handleChanged = useCallback(() => setVersion((value) => value + 1), []);

  const reorderProjects = useCallback(async (from: number, to: number) => {
    const next = arrayMove(projects, from, to);
    setProjects(next);
    try {
      await window.prism.reorderGtdProjects(next.map((project) => project.id));
    } catch {
      showToast(t["common.saveFailed"], "error");
      handleChanged();
    }
  }, [projects, showToast, t, handleChanged]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.prism.getGtdOpenTasks(),
      window.prism.getGtdCompletedTasks(),
      window.prism.getGtdProjects(false),
      window.prism.getGtdProjects(true),
    ])
      .then(([open, completed, activeProjects, archived]) => {
        if (cancelled) return;
        setOpenTasks(open);
        setCompletedTasks(completed);
        setProjects(activeProjects);
        setArchivedProjects(archived);
      })
      .catch(() => { /* keep the previous snapshot */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    if (active) handleChanged();
  }, [active, handleChanged]);

  useEffect(() => {
    window.addEventListener("gtd-changed", handleChanged);
    return () => window.removeEventListener("gtd-changed", handleChanged);
  }, [handleChanged]);

  // Apply incoming navigation from deep links exactly once; repeat clicks bump seq.
  useEffect(() => {
    if (!focus || focus.seq === focusSeqRef.current) return;
    focusSeqRef.current = focus.seq;
    setActiveFocus(focus);
    setList(focus.view);
    if (focus.view === "project") {
      if (focus.archived) {
        setArchivedOpen(true);
        setList("archived");
        if (focus.projectId) setSelectedArchivedId(focus.projectId);
      } else {
        setProjectsOpen(true);
        if (focus.projectId) setSelectedProjectId(focus.projectId);
      }
    } else if (focus.view === "calendar" && focus.date) {
      const date = parseDateKey(focus.date);
      if (date) setCalendarCursor({ year: date.getFullYear(), month: date.getMonth() });
      setCalendarSelected(focus.date);
    }
  }, [focus]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const selectedArchived = archivedProjects.find((project) => project.id === selectedArchivedId) ?? archivedProjects[0] ?? null;

  const grouped = useMemo(() => groupGtdTasks(openTasks), [openTasks]);

  const reorderInbox = useCallback(async (from: number, to: number) => {
    const next = arrayMove(grouped.inbox, from, to);
    const orders = new Map(next.map((task, index) => [task.id, index]));
    setOpenTasks((prev) => prev.map((task) => {
      const order = orders.get(task.id);
      return order === undefined ? task : { ...task, inboxOrder: order };
    }));
    try {
      await window.prism.reorderGtdInboxTasks(next.map((task) => task.id));
    } catch {
      showToast(t["common.saveFailed"], "error");
      handleChanged();
    }
  }, [grouped.inbox, showToast, t, handleChanged]);

  const focusSeq = activeFocus?.seq;

  const requestDate = (task: GtdTask, kind: "scheduled" | "due") => setDateEditing({ task, kind });

  const saveDate = async (date: string | null) => {
    if (!dateEditing) return;
    const task = dateEditing.task;
    const range = taskDateRange(task);
    const patch: GtdTaskPatch = date === null
      ? { scheduledDate: null, dueDate: null }
      : !range
        ? { scheduledDate: date, dueDate: date }
        : dateEditing.kind === "scheduled"
          ? { scheduledDate: date, ...(range.end < date ? { dueDate: date } : {}) }
          : { dueDate: date, ...(range.start > date ? { scheduledDate: date } : {}) };
    try {
      await window.prism.updateGtdTask(task.id, patch);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDateEditing(null);
    handleChanged();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await window.prism.deleteGtdTask(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setDeleting(null);
    showToast(t["common.deleted"]);
    handleChanged();
  };

  const nav: { key: GtdListKey; icon: LucideIcon; label: string; count?: number }[] = [
    { key: "calendar", icon: CalendarRange, label: t["gtd.calendar"] },
    { key: "project", icon: FolderKanban, label: t["gtd.projects"] },
    { key: "completed", icon: CheckCircle2, label: t["gtd.completed"] },
    { key: "archived", icon: Archive, label: t["gtd.archived"] },
  ];

  const renderGroup = (opts: {
    key: "project" | "archived";
    icon: LucideIcon;
    label: string;
    items: GtdProject[];
    open: boolean;
    toggle: () => void;
    selectedId: number | null;
    select: (id: number) => void;
  }) => {
    const Icon = opts.icon;
    return (
      <Fragment key={opts.key}>
        <NavItem
          onClick={opts.toggle}
          active={list === opts.key && opts.selectedId === null}
          parentActive={list === opts.key && opts.selectedId !== null}
          leading={<Icon size={15} />}
          label={opts.label}
          trailing={
            <ChevronRight
              size={12}
              className={`translate-x-1 transition-transform duration-200 ${opts.open ? "rotate-90" : ""}`}
            />
          }
        />
        {opts.open && (opts.items.length > 0 || opts.key === "project") && (
          <div className="sidebar-group mb-1 mt-0.5">
            {opts.items.length > 0 && (
              <GtdProjectList
                projects={opts.items}
                archived={opts.key === "archived"}
                selectedId={list === opts.key ? opts.selectedId : null}
                onSelect={opts.select}
                onChanged={handleChanged}
                onReorder={opts.key === "project" ? reorderProjects : undefined}
              />
            )}
            {opts.key === "project" && (
              <NavItem
                onClick={() => setProjectCreateOpen(true)}
                leading={<Plus size={15} />}
                label={t["gtd.newProject"]}
              />
            )}
          </div>
        )}
      </Fragment>
    );
  };

  const renderNavItem = ({ key, icon: Icon, label, count }: (typeof nav)[number]) => {
    if (key === "project") {
      return renderGroup({
        key,
        icon: Icon,
        label,
        items: projects,
        open: projectsOpen,
        toggle: () => {
          if (list === "project") setProjectsOpen((open) => !open);
          else {
            setList("project");
            setProjectsOpen(true);
          }
        },
        selectedId: selectedProject?.id ?? null,
        select: (id) => {
          setList("project");
          setSelectedProjectId(id);
        },
      });
    }
    if (key === "archived") {
      return renderGroup({
        key,
        icon: Icon,
        label,
        items: archivedProjects,
        open: archivedOpen,
        toggle: () => {
          if (list === "archived") setArchivedOpen((open) => !open);
          else {
            setList("archived");
            setArchivedOpen(true);
          }
        },
        selectedId: selectedArchived?.id ?? null,
        select: (id) => {
          setList("archived");
          setSelectedArchivedId(id);
        },
      });
    }
    return (
      <NavItem
        key={key}
        onClick={() => setList(key)}
        active={list === key}
        leading={<Icon size={15} />}
        label={label}
        trailing={count !== undefined && count > 0 ? count : undefined}
      />
    );
  };

  return (
    <div className="flex h-full">
      <ModuleSidebar active={active}>
        <CollapsibleSidebar
          footer={
            <div className="max-h-[50vh] overflow-y-auto">
              {nav
                .filter(({ key }) => key === "completed" || key === "archived")
                .map(renderNavItem)}
            </div>
          }
        >
          {nav
            .filter(({ key }) => key !== "completed" && key !== "archived")
            .map(renderNavItem)}
        </CollapsibleSidebar>
      </ModuleSidebar>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!loaded ? (
          <SkeletonRows count={7} className="p-2" />
        ) : list === "calendar" ? (
          <GtdCalendar
            tasks={openTasks}
            inboxTasks={grouped.inbox}
            overdueTasks={grouped.overdue}
            projects={projects}
            cursor={calendarCursor}
            selectedDate={calendarSelected}
            focusTaskId={activeFocus?.view === "calendar" ? activeFocus.taskId : undefined}
            focusSeq={activeFocus?.view === "calendar" ? activeFocus.seq : undefined}
            onCursorChange={setCalendarCursor}
            onSelectDate={setCalendarSelected}
            onOpenTask={setSelectedTask}
            onRequestDate={requestDate}
            onRequestDelete={setDeleting}
            onReorderInbox={reorderInbox}
            onChanged={handleChanged}
          />
        ) : list === "completed" ? (
          <GtdCompleted
            tasks={completedTasks}
            projects={projects}
            focusTaskId={activeFocus?.view === "completed" ? activeFocus.taskId : undefined}
            focusSeq={focusSeq}
            onOpenTask={setSelectedTask}
            onRequestDelete={setDeleting}
            onChanged={handleChanged}
          />
        ) : list === "project" ? (
          selectedProject ? (
            <GtdProjectDetail
              key={selectedProject.id}
              project={selectedProject}
              version={version}
              vaults={vaults}
              focusTaskId={activeFocus?.view === "project" ? activeFocus.taskId : undefined}
              focusSeq={activeFocus?.view === "project" ? activeFocus.seq : undefined}
              onOpenTask={setSelectedTask}
              onOpenProjectLink={onOpenProjectLink}
              onRequestDate={requestDate}
              onRequestDelete={setDeleting}
              onChanged={handleChanged}
            />
          ) : (
            <EmptyView
              title={t["gtd.projects"]}
              icon={FolderKanban}
              text={t["gtd.emptyProjects"]}
              action={
                <Button variant="primary" size="sm" onClick={() => setProjectCreateOpen(true)}>
                  <Plus size={14} />
                  {t["gtd.newProject"]}
                </Button>
              }
            />
          )
        ) : selectedArchived ? (
          <GtdProjectDetail
            key={`archived-${selectedArchived.id}`}
            project={selectedArchived}
            version={version}
            vaults={vaults}
            onOpenTask={setSelectedTask}
            onOpenProjectLink={onOpenProjectLink}
            onRequestDate={requestDate}
            onRequestDelete={setDeleting}
            onChanged={handleChanged}
          />
        ) : (
          <EmptyView title={t["gtd.archived"]} icon={Archive} text={t["gtd.emptyArchived"]} />
        )}
      </div>

      <GtdTaskModal
        task={selectedTask}
        projects={projects}
        onClose={() => setSelectedTask(null)}
        onChanged={handleChanged}
      />

      <GtdDueDateModal
        open={dateEditing !== null}
        title={dateEditing?.task.title ?? ""}
        value={dateEditing ? (dateEditing.kind === "scheduled" ? dateEditing.task.scheduledDate : dateEditing.task.dueDate) : null}
        kind={dateEditing?.kind ?? "scheduled"}
        onClose={() => setDateEditing(null)}
        onSave={(date) => { void saveDate(date); }}
      />

      <ConfirmDialog
        open={deleting !== null}
        message={t["gtd.deleteTaskConfirm"]}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <GtdProjectCreateModal
        open={projectCreateOpen}
        onClose={() => setProjectCreateOpen(false)}
        onCreated={(project) => {
          setList("project");
          setSelectedProjectId(project.id);
          setProjectsOpen(true);
          handleChanged();
        }}
      />
    </div>
  );
}

function EmptyView({
  title,
  icon: Icon,
  text,
  action,
}: {
  title: string;
  icon: LucideIcon;
  text: string;
  action?: ReactNode;
}) {
  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="flex min-w-0 items-center gap-2 text-body font-medium text-primary">
        <Icon size={15} className="text-[var(--accent-text)]" />
        <span className="truncate">{title}</span>
      </span>
    ),
  }), [Icon, title]);

  useToolbarContribution("module:gtd", toolbar);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <EmptyState size="module" text={text} />
      {action}
    </div>
  );
}
