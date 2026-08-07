import { useState, useEffect } from "react";
import { Check, Clock, FolderKanban, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import GtdRenameModal from "./GtdRenameModal";
import type { GtdNextList as GtdNextListData } from "./types";

interface Props {
  version: number;
  onChanged: () => void;
}

export default function GtdNextList({ version, onChanged }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const [data, setData] = useState<GtdNextListData>({ waiting: [], projects: [] });
  const [renaming, setRenaming] = useState<{ kind: "item" | "action"; id: number; title: string } | null>(null);

  useEffect(() => {
    window.prism.getGtdNextList().then(setData);
  }, [version]);

  const completeWaiting = async (id: number) => {
    await window.prism.setGtdItemStatus(id, "done");
    onChanged();
  };

  const completeAction = async (id: number) => {
    await window.prism.toggleGtdAction(id);
    onChanged();
  };

  const isEmpty = data.waiting.length === 0 && data.projects.length === 0;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {isEmpty && (
        <div className="flex flex-col items-center gap-3 mt-16 anim-fade-in">
          <p className="text-center text-muted text-sm">{t["gtd.emptyNext"]}</p>
        </div>
      )}

      {data.waiting.length > 0 && (
        <div className="mb-3 border border-strong/50 rounded-xl bg-surface/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 h-8 bg-elevated/30">
            <Clock size={13} className="text-muted" />
            <span className="text-xs font-medium text-secondary">{t["gtd.waiting"]}</span>
            <span className="text-xs text-faint">{data.waiting.length}</span>
          </div>
          <div className="p-2">
            {data.waiting.map((item) => (
              <div
                key={item.id}
                onContextMenu={(e) =>
                  onContextMenu(e, [
                    { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming({ kind: "item", id: item.id, title: item.title }) },
                  ])
                }
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-elevated/40 transition-colors"
              >
                <button
                  onClick={() => completeWaiting(item.id)}
                  className="w-[18px] h-[18px] rounded-full border border-strong hover:border-[var(--accent)] flex-shrink-0 flex items-center justify-center transition-colors"
                />
                <span className="flex-1 text-sm text-primary truncate">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.projects.map(({ project, action }) => {
        const progress = t["gtd.projectProgress"]
          .replace("{done}", String(project.done_action_count))
          .replace("{total}", String(project.action_count));
        return (
          <div key={project.id} className="mb-3 border border-strong/50 rounded-xl bg-surface/20 overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-8 bg-elevated/30">
              <FolderKanban size={13} className="text-muted" />
              <span className="text-xs font-medium text-secondary truncate">{project.title}</span>
              <span className="text-xs text-faint flex-shrink-0">{progress}</span>
            </div>
            <div className="p-2">
              <div
                onContextMenu={(e) =>
                  onContextMenu(e, [
                    { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming({ kind: "action", id: action.id, title: action.title }) },
                  ])
                }
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-elevated/40 transition-colors"
              >
                <button
                  onClick={() => completeAction(action.id)}
                  className="w-[18px] h-[18px] rounded-full border border-strong hover:border-[var(--accent)] flex-shrink-0 flex items-center justify-center transition-colors"
                >
                  {action.is_done === 1 && <Check size={11} strokeWidth={3} />}
                </button>
                <span className="flex-1 text-sm text-primary truncate">{action.title}</span>
              </div>
            </div>
          </div>
        );
      })}

      <GtdRenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming?.kind === "item") await window.prism.renameGtdItem(renaming.id, title);
          if (renaming?.kind === "action") await window.prism.renameGtdAction(renaming.id, title);
          onChanged();
        }}
      />
    </div>
  );
}
