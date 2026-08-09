import { useState, useEffect, useRef } from "react";
import { Check, Star, Pencil, Trash2 } from "lucide-react";
import Button from "../Button";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import ItemRow from "../ItemRow";
import EmptyState from "../EmptyState";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import type { GtdAction, GtdItem } from "./types";

interface Props {
  project: GtdItem;
  version: number;
  onChanged: () => void;
}

export default function GtdProjectDetail({ project, version, onChanged }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [actions, setActions] = useState<GtdAction[]>([]);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdAction | null>(null);
  const [deleting, setDeleting] = useState<GtdAction | null>(null);
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

  const toggleNext = async (action: GtdAction) => {
    await window.prism.setGtdActionNext(project.id, action.is_next ? null : action.id);
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await window.prism.deleteGtdAction(deleting.id);
    showToast(t["common.deleted"]);
    onChanged();
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
        {actions.length === 0 && <EmptyState size="module" text={t["gtd.emptyActions"]} />}
        {actions.map((action) => (
          <ItemRow
            key={action.id}
            variant="list"
            className="border-b border-line/30"
            menuItems={[
              { label: action.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"], icon: <Star size={14} />, onClick: () => toggleNext(action) },
              { label: "", divider: true },
              { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(action) },
              { label: "", divider: true },
              { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(action) },
            ]}
            leading={
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
            }
            title={
              action.is_done
                ? <span className="text-muted line-through">{action.title}</span>
                : action.title
            }
            hoverActions={
              action.is_done === 0
                ? [{
                    icon: <Star size={14} fill={action.is_next ? "currentColor" : "none"} />,
                    label: action.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"],
                    onClick: () => toggleNext(action),
                    active: !!action.is_next,
                    className: action.is_next ? "text-[var(--accent-text)]" : undefined,
                  }]
                : []
            }
          />
        ))}
      </div>

      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) await window.prism.renameGtdAction(renaming.id, title);
          onChanged();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        message={t["gtd.deleteActionConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
