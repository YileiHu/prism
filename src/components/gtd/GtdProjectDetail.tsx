import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderKanban,
  FolderOpen,
  Frame,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  SquarePen,
} from "lucide-react";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import Modal from "../Modal";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import SortableList from "../SortableList";
import { arrayMove } from "@dnd-kit/sortable";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { resolveTagColor } from "../../lib/colors";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from "../DropdownMenu";
import GtdProgressRing from "./GtdProgressRing";
import GtdSectionHeading from "./GtdSectionHeading";
import GtdProjectDocs, { type GtdProjectDocsHandle } from "./GtdProjectDocs";
import InboxCapture from "./InboxCapture";
import GtdTaskRow from "./GtdTaskRow";
import { useGtdFocusHighlight } from "./useGtdFocusHighlight";
import type { VaultEntry } from "../../types";
import type { GtdProjectLink } from "../../shared/models";
import type { GtdProject, GtdTask } from "./types";

interface Props {
  project: GtdProject;
  version: number;
  vaults: VaultEntry[];
  focusTaskId?: number;
  focusSeq?: number;
  onOpenTask: (task: GtdTask) => void;
  onOpenProjectLink: (link: GtdProjectLink) => void;
  onRequestDate: (task: GtdTask, kind: "scheduled" | "due") => void;
  onRequestDelete: (task: GtdTask) => void;
  onChanged: () => void;
}

export default function GtdProjectDetail({
  project,
  version,
  vaults,
  focusTaskId,
  focusSeq,
  onOpenTask,
  onOpenProjectLink,
  onRequestDate,
  onRequestDelete,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [tasks, setTasks] = useState<GtdTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const docsRef = useRef<GtdProjectDocsHandle>(null);
  const docsMenuRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const [docsState, setDocsState] = useState({ hasFiles: false, canOpenFolder: false });
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const readOnly = project.archivedAt !== null;
  const openTasks = useMemo(() => tasks.filter((task) => !task.completedAt), [tasks]);
  const doneTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.completedAt)
        .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1)),
    [tasks],
  );
  const highlightId = useGtdFocusHighlight(focusTaskId, focusSeq, loaded);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    window.prism
      .getGtdProjectTasks(project.id)
      .then((next) => { if (!cancelled) setTasks(next); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [project.id, version]);

  useEffect(() => {
    setTitleDraft(project.title);
  }, [project.id, project.title]);

  useEffect(() => {
    if (readOnly) setDocsMenuOpen(false);
  }, [readOnly]);

  useEffect(() => {
    if (!renaming || !railOpen) return;
    const frame = requestAnimationFrame(() => {
      railRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [railOpen, renaming]);

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="flex min-w-0 items-center gap-2 text-body font-medium text-primary">
        <FolderKanban size={15} className="text-[var(--accent-text)]" />
        <span className="truncate">{readOnly ? t["gtd.archived"] : t["gtd.projects"]}</span>
      </span>
    ),
    actions: (
      <>
        {!readOnly && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t["menu.rename"]}
              aria-label={t["menu.rename"]}
              disabled={renaming}
              onClick={() => {
                setRailOpen(true);
                setTitleDraft(project.title);
                setRenaming(true);
              }}
            >
              <Pencil size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t["gtd.editProjectDescription"]}
              aria-label={t["gtd.editProjectDescription"]}
              onClick={() => {
                setDescDraft(project.description ?? "");
                setDescOpen(true);
              }}
            >
              <SquarePen size={15} />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={t["gtd.projectDoc.openFolder"]}
          aria-label={t["gtd.projectDoc.openFolder"]}
          disabled={!docsState.canOpenFolder}
          onClick={() => docsRef.current?.openFolder()}
        >
          <FolderOpen size={15} />
        </Button>
        {!readOnly && (
          <Button
            ref={docsMenuRef}
            variant="ghost"
            size="icon-sm"
            active={docsMenuOpen}
            title={t["gtd.projectDocs"]}
            aria-label={t["gtd.projectDocs"]}
            aria-haspopup="menu"
            aria-expanded={docsMenuOpen}
            onClick={() => setDocsMenuOpen((open) => !open)}
          >
            <Link2 size={15} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={railOpen ? t["gtd.hideSidebar"] : t["gtd.showSidebar"]}
          aria-label={railOpen ? t["gtd.hideSidebar"] : t["gtd.showSidebar"]}
          onClick={() => setRailOpen((open) => !open)}
        >
          {railOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </Button>
      </>
    ),
  }), [
    docsMenuOpen,
    docsState.canOpenFolder,
    project.description,
    project.title,
    railOpen,
    readOnly,
    renaming,
    t,
  ]);

  useToolbarContribution("module:gtd", toolbar);

  const progressLabel = t["gtd.projectProgress"]
    .replace("{done}", String(project.doneTaskCount))
    .replace("{total}", String(project.taskCount));
  const percent = project.taskCount > 0 ? (project.doneTaskCount / project.taskCount) * 100 : 0;
  const projectColor = resolveTagColor(project.title, project.color).bar;

  const reorder = (fromIndex: number, toIndex: number) => {
    const next = arrayMove(openTasks, fromIndex, toIndex);
    setTasks([...next, ...doneTasks]);
    void window.prism
      .reorderGtdProjectTasks(project.id, next.map((task) => task.id))
      .then(onChanged)
      .catch(() => {
        setTasks(tasks);
        showToast(t["common.saveFailed"], "error");
      });
  };

  const saveDescription = async () => {
    try {
      await window.prism.updateGtdProject(project.id, { description: descDraft });
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDescOpen(false);
    onChanged();
  };

  const startRename = () => {
    setTitleDraft(project.title);
    setRenaming(true);
  };

  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (!title || title === project.title) {
      setRenaming(false);
      setTitleDraft(project.title);
      return;
    }
    try {
      await window.prism.updateGtdProject(project.id, { title });
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setRenaming(false);
    onChanged();
  };

  return (
    <>
      {railOpen && (
        <ProjectTitleBlock
          variant="narrow"
          project={project}
          projectColor={projectColor}
          readOnly={readOnly}
          renaming={renaming}
          titleDraft={titleDraft}
          onTitleDraft={setTitleDraft}
          onSaveTitle={() => void saveTitle()}
          onCancelRename={() => { setRenaming(false); setTitleDraft(project.title); }}
          onStartRename={startRename}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto min-[1100px]:flex min-[1100px]:overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!readOnly && (
            <div className="flex-shrink-0 border-b border-line/30 px-4 py-3">
              <InboxCapture
                projectId={project.id}
                onSaved={onChanged}
                placeholder={t["gtd.addTask"]}
              />
            </div>
          )}

          <div className="min-h-0 min-[1100px]:flex-1 min-[1100px]:overflow-y-auto">
            {!loaded && tasks.length === 0 && <SkeletonRows count={5} />}
            {loaded && tasks.length === 0 && (
              <EmptyState size="module" text={readOnly ? t["gtd.emptyActionsArchived"] : t["gtd.emptyActions"]} />
            )}

        {readOnly ? (
          <>
            {openTasks.map((task) => (
              <GtdTaskRow
                key={task.id}
                task={task}
                projects={[project]}
                showProject={false}
                readOnly
                highlighted={highlightId === task.id}
                onOpen={onOpenTask}
                onRequestDate={onRequestDate}
                onRequestDelete={onRequestDelete}
                onChanged={onChanged}
              />
            ))}
            {doneTasks.length > 0 && (
              <section>
                <GtdSectionHeading label={t["gtd.completed"]} count={doneTasks.length} />
                {doneTasks.map((task) => (
                  <GtdTaskRow
                    key={task.id}
                    task={task}
                    projects={[project]}
                    showProject={false}
                    completed
                    readOnly
                    highlighted={highlightId === task.id}
                    onOpen={onOpenTask}
                    onRequestDate={onRequestDate}
                    onRequestDelete={onRequestDelete}
                    onChanged={onChanged}
                  />
                ))}
              </section>
            )}
          </>
        ) : (
          <>
            <SortableList
              items={openTasks}
              itemId={(task) => String(task.id)}
              onReorder={reorder}
              renderItem={(task) => (
                <GtdTaskRow
                  task={task}
                  projects={[project]}
                  showProject={false}
                  highlighted={highlightId === task.id}
                  onOpen={onOpenTask}
                  onRequestDate={onRequestDate}
                  onRequestDelete={onRequestDelete}
                  onChanged={onChanged}
                />
              )}
              renderOverlay={(task) => (
                <div className="flex items-center gap-2 px-3 py-1.5 text-body text-primary">
                  <span className="surface-inset h-[18px] w-[18px] flex-shrink-0 rounded-full border" />
                  <span className="truncate">{task.title}</span>
                </div>
              )}
            />
            {doneTasks.length > 0 && (
              <section>
                <GtdSectionHeading label={t["gtd.completed"]} count={doneTasks.length} />
                {doneTasks.map((task) => (
                  <GtdTaskRow
                    key={task.id}
                    task={task}
                    projects={[project]}
                    showProject={false}
                    completed
                    onOpen={onOpenTask}
                    onRequestDate={onRequestDate}
                    onRequestDelete={onRequestDelete}
                    onChanged={onChanged}
                  />
                ))}
              </section>
            )}
          </>
        )}
          </div>
        </div>

        <aside
          ref={railRef}
          className={railOpen
            ? "flex flex-shrink-0 flex-col border-t border-line/30 bg-elevated/20 px-4 py-4 min-[1100px]:min-h-0 min-[1100px]:w-[280px] min-[1100px]:overflow-y-auto min-[1100px]:border-l min-[1100px]:border-t-0"
            : "hidden"}
        >
          <ProjectTitleBlock
            variant="rail"
            project={project}
            projectColor={projectColor}
            readOnly={readOnly}
            renaming={renaming}
            titleDraft={titleDraft}
            onTitleDraft={setTitleDraft}
            onSaveTitle={() => void saveTitle()}
            onCancelRename={() => { setRenaming(false); setTitleDraft(project.title); }}
            onStartRename={startRename}
          />

          <div className="mt-3 flex items-center gap-3">
            <GtdProgressRing
              size={56}
              strokeWidth={5}
              value={percent / 100}
              color={projectColor}
              label={`${Math.round(percent)}%`}
              title={progressLabel}
            />
            <div className="min-w-0">
              <div className="text-caption tabular-nums text-secondary">{progressLabel}</div>
              <div className="text-meta text-faint">
                {t["gtd.completed"]} {project.doneTaskCount}
              </div>
            </div>
          </div>

          <section className="mt-4 border-t border-line/30 pt-4">
            <div className="mb-2 text-meta font-medium text-muted">{t["gtd.projectDescription"]}</div>
            {project.description ? (
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap pr-1 text-body leading-relaxed text-secondary">
                {project.description}
              </div>
            ) : (
              <div className="text-body text-muted">{t["gtd.projectDescriptionEmpty"]}</div>
            )}
          </section>

          <GtdProjectDocs
            ref={docsRef}
            embedded
            project={project}
            version={version}
            vaults={vaults}
            readOnly={readOnly}
            onOpenLink={onOpenProjectLink}
            onChanged={onChanged}
            onStateChange={setDocsState}
          />
        </aside>
      </div>

      <Modal
        open={descOpen}
        onClose={() => setDescOpen(false)}
        title={t["gtd.projectDescription"]}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDescOpen(false)}>
              {t["resources.cancel"]}
            </Button>
            <Button variant="primary" size="sm" onClick={saveDescription}>
              {t["resources.save"]}
            </Button>
          </>
        }
      >
        <Textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          placeholder={t["gtd.projectDescriptionPlaceholder"]}
          autoFocus
          className="h-[40vh] min-h-[180px] max-h-[420px] w-full resize-y"
        />
      </Modal>

      <DropdownMenu
        open={docsMenuOpen}
        onClose={() => setDocsMenuOpen(false)}
        anchorRef={docsMenuRef}
        align="right"
      >
        <DropdownMenuItem
          onClick={() => {
            setDocsMenuOpen(false);
            docsRef.current?.create("note");
          }}
        >
          <FileText size={14} />
          {t["gtd.projectDoc.newNote"]}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setDocsMenuOpen(false);
            docsRef.current?.create("canvas");
          }}
        >
          <Frame size={14} />
          {t["gtd.projectDoc.newCanvas"]}
        </DropdownMenuItem>
        <DropdownMenuDivider />
        <DropdownMenuItem
          onClick={() => {
            setDocsMenuOpen(false);
            docsRef.current?.link("note");
          }}
        >
          <FileText size={14} />
          {t["gtd.projectDoc.linkNote"]}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setDocsMenuOpen(false);
            docsRef.current?.link("canvas");
          }}
        >
          <Frame size={14} />
          {t["gtd.projectDoc.linkCanvas"]}
        </DropdownMenuItem>
      </DropdownMenu>
    </>
  );
}

function ProjectTitleBlock({
  variant,
  project,
  projectColor,
  readOnly,
  renaming,
  titleDraft,
  onTitleDraft,
  onSaveTitle,
  onCancelRename,
  onStartRename,
}: {
  variant: "narrow" | "rail";
  project: GtdProject;
  projectColor: string;
  readOnly: boolean;
  renaming: boolean;
  titleDraft: string;
  onTitleDraft: (value: string) => void;
  onSaveTitle: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
}) {
  const { t } = useT();
  const title = renaming ? (
    <Input
      value={titleDraft}
      onChange={(e) => onTitleDraft(e.target.value)}
      onBlur={onSaveTitle}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSaveTitle();
        if (e.key === "Escape") onCancelRename();
      }}
      autoFocus
      className="min-w-0 flex-1"
    />
  ) : (
    <h2
      className={
        variant === "narrow"
          ? "min-w-0 flex-1 truncate text-section font-semibold text-primary"
          : "min-w-0 flex-1 break-words text-body font-semibold leading-snug text-primary"
      }
      onDoubleClick={() => { if (!readOnly) onStartRename(); }}
      title={readOnly ? undefined : t["menu.rename"]}
    >
      {project.title}
    </h2>
  );
  if (variant === "narrow") {
    return (
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-line/30 px-4 py-2.5 min-[1100px]:hidden">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: projectColor }}
        />
        {title}
      </div>
    );
  }

  return (
    <div className="hidden min-[1100px]:block">
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: projectColor }}
        />
        {title}
      </div>
    </div>
  );
}
