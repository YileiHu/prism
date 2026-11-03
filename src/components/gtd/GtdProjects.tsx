import { useState, useEffect } from "react";
import { Pencil, Check, Trash2 } from "lucide-react";
import Sidebar from "../Sidebar";
import NavItem from "../NavItem";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import GtdProjectDetail from "./GtdProjectDetail";
import RenameModal from "../RenameModal";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import type { GtdItem } from "./types";

interface Props {
  version: number;
  onChanged: () => void;
  focusAction?: { projectId: number; actionId: number; seq: number } | null;
}

export default function GtdProjects({ version, onChanged, focusAction }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const showToast = useToast();
  const [projects, setProjects] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GtdItem | null>(null);

  useEffect(() => {
    window.prism.getGtdItems("project").then(setProjects).finally(() => setLoaded(true));
  }, [version]);

  // Select the project targeted by a Home navigation
  useEffect(() => {
    if (focusAction) setSelectedId(focusAction.projectId);
  }, [focusAction]);

  // Fall back to the first project when nothing (valid) is selected — e.g. the
  // current one was completed or deleted
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  const completeProject = async (item: GtdItem) => {
    try {
      await window.prism.setGtdItemStatus(item.id, "done");
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
      {!loaded ? (
        <SkeletonRows count={7} className="p-2" />
      ) : projects.length === 0 ? (
        <EmptyState size="module" text={t["gtd.emptyList"]} />
      ) : (
        <div className="flex-1 flex min-w-0 min-h-0">
          <Sidebar>
            {projects.map((p) => {
              const progress = t["gtd.projectProgress"]
                .replace("{done}", String(p.done_action_count))
                .replace("{total}", String(p.action_count));
              const percent = p.action_count > 0 ? (p.done_action_count / p.action_count) * 100 : 0;
              return (
                <NavItem
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onContextMenu={(e) =>
                    onContextMenu(e, [
                      { label: t["gtd.completeProject"], icon: <Check size={14} />, onClick: () => completeProject(p) },
                      { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(p) },
                      buildColorMenuItem(t, {
                        label: t["gtd.projectColor"],
                        autoLabel: t["collections.colorAuto"],
                        autoSource: p.title,
                        current: p.color,
                        onSelect: (color) => setProjectColor(p, color),
                      }),
                      { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(p) },
                    ])
                  }
                  active={selected?.id === p.id}
                  className="mb-0.5"
                  leading={
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: resolveTagColor(p.title, p.color).bar }}
                    />
                  }
                  label={p.title}
                  trailing={
                    p.action_count === 0 ? (
                      <Badge tone="accent">{t["gtd.pendingRefine"]}</Badge>
                    ) : (
                      progress
                    )
                  }
                  footer={
                    p.action_count > 0 ? (
                      <span className="block mt-1.5 h-1 rounded-chip bg-elevated overflow-hidden">
                        <span
                          className="block h-1 rounded-chip bg-[var(--accent)] transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </Sidebar>
          {selected && (
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <GtdProjectDetail
                key={selected.id}
                project={selected}
                version={version}
                onChanged={onChanged}
                focusAction={focusAction}
              />
            </div>
          )}
        </div>
      )}

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
