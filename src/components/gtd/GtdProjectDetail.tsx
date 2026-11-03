import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Star, Pencil, Trash2 } from "lucide-react";
import Button from "../Button";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import ItemRow from "../ItemRow";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import Modal from "../Modal";
import { Textarea } from "../Input";
import { arrayMove } from "@dnd-kit/sortable";
import SortableList from "../SortableList";
import type { GtdAction, GtdItem } from "./types";

interface Props {
  project: GtdItem;
  version: number;
  onChanged: () => void;
  focusAction?: { projectId: number; actionId: number; seq: number } | null;
}

export default function GtdProjectDetail({ project, version, onChanged, focusAction }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [actions, setActions] = useState<GtdAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<GtdAction | null>(null);
  const [deleting, setDeleting] = useState<GtdAction | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const handledSeqRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.prism.getGtdActions(project.id).then(setActions).finally(() => setLoaded(true));
  }, [project.id, version]);

  // Scroll to and flash the action targeted by a Home navigation once loaded
  useEffect(() => {
    if (!focusAction || focusAction.projectId !== project.id) return;
    if (handledSeqRef.current === focusAction.seq) return;
    if (!actions.some((a) => a.id === focusAction.actionId)) return;
    handledSeqRef.current = focusAction.seq;
    document.getElementById(`gtd-action-${focusAction.actionId}`)?.scrollIntoView({ block: "center" });
    setHighlightId(focusAction.actionId);
    // No cleanup — same reason as GtdItemList
    setTimeout(() => setHighlightId(null), 1600);
  }, [focusAction, actions, project.id]);

  const allDone = actions.length > 0 && actions.every((a) => a.is_done === 1);

  useEffect(() => {
    if (!allDone) setBannerDismissed(false);
  }, [allDone]);

  const progress = t["gtd.projectProgress"]
    .replace("{done}", String(project.done_action_count))
    .replace("{total}", String(project.action_count));

  // Grow with the content up to ~4 lines, then scroll internally
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    try {
      await window.prism.addGtdAction(project.id, title);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDraft("");
    if (inputRef.current) {
      inputRef.current.style.height = "";
      inputRef.current.focus();
    }
    onChanged();
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    const next = arrayMove(actions, fromIndex, toIndex);
    setActions(next);
    void window.prism.reorderGtdActions(project.id, next.map((a) => a.id))
      .then(onChanged)
      .catch(() => {
        setActions(actions);
        showToast(t["common.saveFailed"], "error");
      });
  };

  const openDescription = () => {
    setDescDraft(project.description ?? "");
    setDescOpen(true);
  };

  const saveDescription = async () => {
    try {
      await window.prism.setGtdItemDescription(project.id, descDraft);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDescOpen(false);
    onChanged();
  };

  const toggleNext = async (action: GtdAction) => {
    try {
      await window.prism.setGtdActionNext(project.id, action.is_next ? null : action.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const completeProject = async () => {
    try {
      await window.prism.setGtdItemStatus(project.id, "done");
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const toggleActionDone = async (action: GtdAction) => {
    try {
      await window.prism.toggleGtdAction(action.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await window.prism.deleteGtdAction(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["common.deleted"]);
    onChanged();
  };

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <>
        <span className="min-w-0 text-body font-medium text-primary truncate">{project.title}</span>
        {project.action_count > 0 && (
          <span className="text-caption text-muted flex-shrink-0 whitespace-nowrap">{progress}</span>
        )}
      </>
    ),
  }), [project.action_count, project.title, progress]);

  useToolbarContribution("module:gtd", toolbar);

  return (
    <>
      <div className="px-4 py-2 border-b border-line/30 flex-shrink-0">
        <Textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoGrow(e.currentTarget); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t["gtd.addAction"]}
          autoFocus
          className="w-full max-h-24 resize-none overflow-y-auto"
        />
      </div>

      <div className="px-4 py-2 border-b border-line/30 flex-shrink-0">
        <button
          type="button"
          onClick={openDescription}
          className="group/desc w-full text-left rounded-control border border-line/50 bg-elevated/50 px-3 py-2 hover:border-strong transition-colors"
        >
          <span className="flex items-center gap-1.5 text-meta text-muted mb-1">
            {t["gtd.projectDescription"]}
            <Pencil size={11} className="ml-auto opacity-0 group-hover/desc:opacity-100 transition-opacity" />
          </span>
          {project.description ? (
            <span className="block whitespace-pre-wrap text-body leading-relaxed text-secondary max-h-28 overflow-y-auto pr-1">
              {project.description}
            </span>
          ) : (
            <span className="block text-body text-muted truncate">{t["gtd.projectDescriptionPlaceholder"]}</span>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {allDone && !bannerDismissed && (
          <div className="flex items-center gap-3 mx-4 mt-3 px-3 py-2 rounded-control bg-[var(--accent-muted)] border border-[var(--accent-border)]">
            <span className="flex-1 text-body text-[var(--accent-text)]">{t["gtd.projectCompletePrompt"]}</span>
            <Button variant="primary" size="xs" onClick={completeProject}>
              {t["gtd.completeProject"]}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setBannerDismissed(true)}>
              {t["gtd.later"]}
            </Button>
          </div>
        )}
        {!loaded && actions.length === 0 && <SkeletonRows count={5} />}
        {loaded && actions.length === 0 && <EmptyState size="module" text={t["gtd.emptyActions"]} />}
        <SortableList
          items={actions}
          itemId={(action) => String(action.id)}
          onReorder={reorder}
          renderItem={(action) => (
            <ItemRow
              id={`gtd-action-${action.id}`}
              variant="list"
              className={`border-b border-line/30 ${highlightId === action.id ? "bg-[var(--accent-muted)]" : ""}`}
              menuItems={[
                { label: action.is_next ? t["gtd.unsetNext"] : t["gtd.setNext"], icon: <Star size={14} />, onClick: () => toggleNext(action) },
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(action) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(action) },
              ]}
              leading={
                <button
                  onClick={() => toggleActionDone(action)}
                  className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                    action.is_done
                      ? "bg-[var(--accent)] border-[var(--accent)] text-on-accent"
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
          )}
          renderOverlay={(action) => (
            <div className="flex items-center gap-2 px-3 py-1.5 text-body text-primary">
              <span className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 ${action.is_done ? "bg-[var(--accent)] border-[var(--accent)]" : "border-strong"}`} />
              <span className={`truncate ${action.is_done ? "text-muted line-through" : ""}`}>{action.title}</span>
            </div>
          )}
        />
      </div>

      <Modal
        open={descOpen}
        onClose={() => setDescOpen(false)}
        title={t["gtd.projectDescription"]}
        icon={<Pencil size={16} className="text-muted" />}
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
          className="w-full h-[40vh] min-h-[180px] max-h-[420px] resize-y"
        />
      </Modal>

      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        multiline
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          try {
            if (renaming) await window.prism.renameGtdAction(renaming.id, title);
          } catch {
            showToast(t["common.saveFailed"], "error");
            return;
          }
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
