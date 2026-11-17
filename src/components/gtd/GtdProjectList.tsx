import { useState } from "react";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import NavItem from "../NavItem";
import Badge from "../Badge";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import GtdProgressRing from "./GtdProgressRing";
import type { GtdProject } from "./types";

interface Props {
  projects: GtdProject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onChanged: () => void;
  archived?: boolean;
}

export default function GtdProjectList({ projects, selectedId, onSelect, onChanged, archived = false }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const showToast = useToast();
  const [renaming, setRenaming] = useState<GtdProject | null>(null);
  const [deleting, setDeleting] = useState<GtdProject | null>(null);

  const mutate = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const setArchived = (project: GtdProject, value: boolean) =>
    mutate(() => window.prism.setGtdProjectArchived(project.id, value));

  const setColor = (project: GtdProject, color: string) =>
    mutate(() => window.prism.updateGtdProject(project.id, { color }));

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
    onChanged();
  };

  return (
    <>
      {projects.map((project) => {
        const openCount = project.taskCount - project.doneTaskCount;
        const color = resolveTagColor(project.title, project.color).bar;
        const progressLabel = t["gtd.projectProgress"]
          .replace("{done}", String(project.doneTaskCount))
          .replace("{total}", String(project.taskCount));
        return (
          <NavItem
            key={project.id}
            onClick={() => onSelect(project.id)}
            onContextMenu={(e) =>
              onContextMenu(
                e,
                archived
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
                    ],
              )
            }
            active={selectedId === project.id}
            className="mb-0.5 last:mb-0"
            leading={
              project.taskCount > 0 && !archived ? (
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
              )
            }
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
      })}

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
