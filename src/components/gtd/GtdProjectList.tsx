import { useState } from "react";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import NavItem from "../NavItem";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import RenameModal from "../RenameModal";
import ConfirmDialog from "../ConfirmDialog";
import type { GtdItem } from "./types";

interface Props {
  projects: GtdItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onChanged: () => void;
  archived?: boolean;
}

export default function GtdProjectList({ projects, selectedId, onSelect, onChanged, archived = false }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const showToast = useToast();
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GtdItem | null>(null);

  const setProjectArchived = async (item: GtdItem, value: boolean) => {
    try {
      await window.prism.setGtdItemArchived(item.id, value);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const setProjectColor = async (project: GtdItem, color: string) => {
    try {
      await window.prism.setGtdItemColor(project.id, color);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const deleteProject = async () => {
    if (!confirmDelete) return;
    try {
      await window.prism.deleteGtdItem(confirmDelete.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["common.deleted"]);
    onChanged();
  };

  return (
    <>
      {projects.map((p) => (
        <NavItem
          key={p.id}
          onClick={() => onSelect(p.id)}
          onContextMenu={(e) =>
            onContextMenu(
              e,
              archived
                ? [
                    { label: t["gtd.unarchive"], icon: <ArchiveRestore size={14} />, onClick: () => setProjectArchived(p, false) },
                    { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(p) },
                  ]
                : [
                    { label: t["gtd.archiveProject"], icon: <Archive size={14} />, onClick: () => setProjectArchived(p, true) },
                    { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(p) },
                    buildColorMenuItem(t, {
                      label: t["gtd.projectColor"],
                      autoLabel: t["collections.colorAuto"],
                      autoSource: p.title,
                      current: p.color,
                      onSelect: (color) => setProjectColor(p, color),
                    }),
                    { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(p) },
                  ],
            )
          }
          active={selectedId === p.id}
          className="mb-0.5 last:mb-0"
          leading={
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: resolveTagColor(p.title, p.color).bar }}
            />
          }
          label={p.title}
          trailing={!archived && p.actionCount === 0 ? <Badge variant="accent">{t["gtd.pendingRefine"]}</Badge> : undefined}
        />
      ))}

      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          try {
            if (renaming) await window.prism.renameGtdItem(renaming.id, title);
          } catch {
            showToast(t["common.saveFailed"], "error");
            return;
          }
          onChanged();
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        message={t["gtd.deleteProjectConfirm"]}
        onConfirm={deleteProject}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
