import { useState, type CSSProperties, type MouseEvent } from "react";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import NavItem from "../NavItem";
import Badge from "../Badge";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import SortableList from "../SortableList";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import type { MenuItem } from "../ContextMenu";
import GtdProgressRing from "./GtdProgressRing";
import type { GtdProject } from "./types";

interface Props {
  projects: GtdProject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onChanged: () => void;
  onReorder?: (from: number, to: number) => void;
  archived?: boolean;
}

interface ProjectRowProps {
  project: GtdProject;
  archived: boolean;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent) => void;
}

function ProjectLeading({ project, archived }: { project: GtdProject; archived: boolean }) {
  const { t } = useT();
  const color = resolveTagColor(project.title, project.color).bar;
  const progressLabel = t["gtd.projectProgress"]
    .replace("{done}", String(project.doneTaskCount))
    .replace("{total}", String(project.taskCount));
  return project.taskCount > 0 && !archived ? (
    <GtdProgressRing
      size={16}
      strokeWidth={5}
      value={project.doneTaskCount / project.taskCount}
      color={color}
      trackColor={color}
      trackOpacity={0.22}
      title={progressLabel}
    />
  ) : (
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
  );
}

function ProjectRow({ project, archived, selected, index, onSelect, onContextMenu }: ProjectRowProps) {
  const { t } = useT();
  const openCount = project.taskCount - project.doneTaskCount;
  return (
    <NavItem
      style={{ "--i": Math.min(index, 10) } as CSSProperties}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      active={selected}
      className="group cursor-pointer stagger-fade"
      leading={<ProjectLeading project={project} archived={archived} />}
      label={project.title}
      trailing={
        archived ? undefined : openCount > 0 ? (
          <span className="text-caption text-faint tabular-nums">{openCount}</span>
        ) : project.taskCount === 0 ? (
          <Badge variant="accent">{t["gtd.projectEmpty"]}</Badge>
        ) : undefined
      }
    />
  );
}

function ProjectOverlay({ project, archived }: { project: GtdProject; archived: boolean }) {
  const openCount = project.taskCount - project.doneTaskCount;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-body text-primary">
      <span className="flex flex-shrink-0 items-center">
        <ProjectLeading project={project} archived={archived} />
      </span>
      <span className="min-w-0 flex-1 truncate">{project.title}</span>
      {!archived && openCount > 0 && (
        <span className="text-caption text-faint tabular-nums">{openCount}</span>
      )}
    </div>
  );
}

export default function GtdProjectList({ projects, selectedId, onSelect, onChanged, onReorder, archived = false }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const showToast = useToast();
  const [renaming, setRenaming] = useState<GtdProject | null>(null);
  const [deleting, setDeleting] = useState<GtdProject | null>(null);
  const canReorder = !archived && onReorder !== undefined && projects.length > 1;

  const mutate = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    window.dispatchEvent(new Event("gtd-project-links-changed"));
    onChanged();
  };

  const setArchived = (project: GtdProject, value: boolean) =>
    mutate(() => window.prism.setGtdProjectArchived(project.id, value));

  const setColor = (project: GtdProject, color: string) =>
    mutate(() => window.prism.updateGtdProject(project.id, { color }));

  const menuFor = (project: GtdProject): MenuItem[] => archived
    ? [
        { label: t["gtd.unarchive"], icon: <ArchiveRestore size={14} />, onClick: () => void setArchived(project, false) },
        { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(project) },
      ]
    : [
        { label: t["gtd.archiveProject"], icon: <Archive size={14} />, onClick: () => void setArchived(project, true) },
        { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(project) },
        buildColorMenuItem(t, {
          label: t["gtd.projectColor"],
          autoLabel: t["collections.colorAuto"],
          autoSource: project.title,
          current: project.color,
          onSelect: (color) => void setColor(project, color),
        }),
        { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(project) },
      ];

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await window.prism.deleteGtdProject(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    setDeleting(null);
    showToast(t["common.deleted"]);
    window.dispatchEvent(new Event("gtd-project-links-changed"));
    onChanged();
  };

  const rowProps = (project: GtdProject, index: number): ProjectRowProps => ({
    project,
    archived,
    selected: selectedId === project.id,
    index,
    onSelect: () => onSelect(project.id),
    onContextMenu: (event: MouseEvent) => onContextMenu(event, menuFor(project)),
  });

  return (
    <>
      {canReorder ? (
        <SortableList
          items={projects}
          itemId={(project) => `project-${project.id}`}
          onReorder={(from, to) => onReorder?.(from, to)}
          renderItem={(project, index) => <ProjectRow {...rowProps(project, index)} />}
          renderOverlay={(project) => <ProjectOverlay project={project} archived={archived} />}
        />
      ) : (
        projects.map((project, index) => (
          <ProjectRow key={project.id} {...rowProps(project, index)} />
        ))
      )}

      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        multiline={false}
        onClose={() => setRenaming(null)}
        onSubmit={(title) => {
          if (!renaming) return;
          void mutate(() => window.prism.updateGtdProject(renaming.id, { title })).then(() => setRenaming(null));
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        message={t["gtd.deleteProjectConfirm"]}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
