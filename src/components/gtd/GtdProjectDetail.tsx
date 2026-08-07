import { useState, useEffect, useRef } from "react";
import { Check, Star, Pencil, Trash2 } from "lucide-react";
import Button from "../Button";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import GtdRenameModal from "./GtdRenameModal";
import type { GtdAction, GtdItem } from "./types";

interface Props {
  project: GtdItem;
  version: number;
  onChanged: () => void;
}

export default function GtdProjectDetail({ project, version, onChanged }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const [actions, setActions] = useState<GtdAction[]>([]);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdAction | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.prism.getGtdActions(project.id).then(setActions);
  }, [project.id, version]);

  const allDone = actions.length > 0 && actions.every((a) => a.is_done === 1);

  useEffect(() => {
    if (!allDone) setBannerDismissed(false);
  }, [allDone]);

  const progress = t["gtd.projectProgress"]
    .replace("{done}", String(project.done_action_count))
    .replace("{total}", String(project.action_count));

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    await window.prism.addGtdAction(project.id, title);
    setDraft("");
    onChanged();
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 h-11 border-b border-line/50 flex-shrink-0 glass bg-tint/[0.04]">
        <span className="flex-1 text-sm font-medium text-primary truncate">{project.title}</span>
        {project.action_count > 0 && <span className="text-xs text-muted flex-shrink-0">{progress}</span>}
      </div>

      <div className="px-4 py-2 border-b border-line/30 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={t["gtd.addAction"]}
          autoFocus
          className="w-full bg-elevated border border-strong rounded-full px-3 py-1 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {allDone && !bannerDismissed && (
          <div className="flex items-center gap-3 mx-4 mt-3 px-3 py-2 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-border)]">
            <span className="flex-1 text-sm text-[var(--accent-text)]">{t["gtd.projectCompletePrompt"]}</span>
            <Button variant="primary" size="xs" onClick={async () => { await window.prism.setGtdItemStatus(project.id, "done"); onChanged(); }}>
              {t["gtd.completeProject"]}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setBannerDismissed(true)}>
              {t["gtd.later"]}
            </Button>
          </div>
        )}
        {actions.length === 0 && (
          <div className="flex flex-col items-center gap-3 mt-20 anim-fade-in">
            <p className="text-center text-muted text-sm">{t["gtd.emptyActions"]}</p>
          </div>
        )}
        {actions.map((action) => (
          <div
            key={action.id}
            onContextMenu={(e) =>
              onContextMenu(e, [
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(action) },
                {
                  label: action.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"],
                  icon: <Star size={14} />,
                  onClick: async () => { await window.prism.setGtdActionNext(project.id, action.is_next ? null : action.id); onChanged(); },
                },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: async () => { await window.prism.deleteGtdAction(action.id); onChanged(); } },
              ])
            }
            className="group flex items-center gap-2 px-4 py-2 border-b border-line/30 hover:bg-elevated/40 transition-colors"
          >
            <button
              onClick={async () => { await window.prism.toggleGtdAction(action.id); onChanged(); }}
              className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                action.is_done
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "border-strong hover:border-[var(--accent)]"
              }`}
            >
              {action.is_done === 1 && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={`flex-1 text-sm truncate ${action.is_done ? "text-muted line-through" : "text-primary"}`}>
              {action.title}
            </span>
            {action.is_done === 0 && (
              <button
                onClick={async () => { await window.prism.setGtdActionNext(project.id, action.is_next ? null : action.id); onChanged(); }}
                title={action.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"]}
                className={`flex-shrink-0 transition-colors ${
                  action.is_next ? "text-[var(--accent-text)]" : "text-faint hover:text-tertiary opacity-0 group-hover:opacity-100"
                }`}
              >
                <Star size={14} fill={action.is_next ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        ))}
      </div>

      <GtdRenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) await window.prism.renameGtdAction(renaming.id, title);
          onChanged();
        }}
      />
    </>
  );
}
