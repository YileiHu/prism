import { useState, useEffect } from "react";
import { Pencil, Check, Trash2 } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Sidebar from "../Sidebar";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import GtdProjectDetail from "./GtdProjectDetail";
import GtdRenameModal from "./GtdRenameModal";
import type { GtdItem } from "./types";

interface Props {
  version: number;
  onChanged: () => void;
}

export default function GtdProjects({ version, onChanged }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const [projects, setProjects] = useState<GtdItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GtdItem | null>(null);

  useEffect(() => {
    window.prism.getGtdItems("project").then(setProjects);
  }, [version]);

  // Fall back to the first project when nothing (valid) is selected — e.g. the
  // current one was completed or deleted
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  const completeProject = async (item: GtdItem) => {
    await window.prism.setGtdItemStatus(item.id, "done");
    onChanged();
  };

  const deleteProject = async () => {
    if (!confirmDelete) return;
    await window.prism.deleteGtdItem(confirmDelete.id);
    setConfirmDelete(null);
    onChanged();
  };

  return (
    <>
      {projects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center gap-3 mt-20 anim-fade-in">
          <p className="text-center text-muted text-sm">{t["gtd.emptyList"]}</p>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0">
          <Sidebar storageKey="gtd-projects">
            {projects.map((p) => {
              const progress = t["gtd.projectProgress"]
                .replace("{done}", String(p.done_action_count))
                .replace("{total}", String(p.action_count));
              const percent = p.action_count > 0 ? (p.done_action_count / p.action_count) * 100 : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onContextMenu={(e) =>
                    onContextMenu(e, [
                      { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(p) },
                      { label: t["gtd.completeProject"], icon: <Check size={14} />, onClick: () => completeProject(p) },
                      { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(p) },
                    ])
                  }
                  className={`w-full px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                    selected?.id === p.id
                      ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium active-bar"
                      : "text-tertiary hover:text-primary hover:bg-elevated/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex-1 text-left truncate">{p.title}</span>
                    {p.action_count === 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-muted)] text-[var(--accent-text)] flex-shrink-0">
                        {t["gtd.pendingRefine"]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted flex-shrink-0">{progress}</span>
                    )}
                  </span>
                  {p.action_count > 0 && (
                    <span className="block mt-1.5 h-1 rounded bg-elevated overflow-hidden">
                      <span
                        className="block h-1 rounded bg-[var(--accent)] transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </Sidebar>
          {selected && (
            <div className="flex-1 flex flex-col min-w-0">
              <GtdProjectDetail
                key={selected.id}
                project={selected}
                version={version}
                onChanged={onChanged}
              />
            </div>
          )}
        </div>
      )}

      <GtdRenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) await window.prism.renameGtdItem(renaming.id, title);
          onChanged();
        }}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t["menu.delete"]}
        position="center"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
              {t["resources.cancel"]}
            </Button>
            <Button variant="danger" size="sm" onClick={deleteProject}>
              {t["menu.delete"]}
            </Button>
          </>
        }
      >
        <p className="text-sm text-secondary">{t["gtd.deleteProjectConfirm"]}</p>
      </Modal>
    </>
  );
}
