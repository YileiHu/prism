import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import NavItem from "../NavItem";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import { useGtdItemActions } from "./useGtdItemActions";
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
  const projectActions = useGtdItemActions({
    kind: "item",
    onChanged,
    deleteMessage: t["gtd.deleteProjectConfirm"],
    renameMultiline: false,
  });

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
                    { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => projectActions.requestDelete(p) },
                  ]
                : [
                    { label: t["gtd.archiveProject"], icon: <Archive size={14} />, onClick: () => setProjectArchived(p, true) },
                    { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => projectActions.requestRename(p) },
                    buildColorMenuItem(t, {
                      label: t["gtd.projectColor"],
                      autoLabel: t["collections.colorAuto"],
                      autoSource: p.title,
                      current: p.color,
                      onSelect: (color) => setProjectColor(p, color),
                    }),
                    { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => projectActions.requestDelete(p) },
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

      {projectActions.modals}
    </>
  );
}
