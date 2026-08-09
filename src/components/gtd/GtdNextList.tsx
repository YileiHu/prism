import { useState, useEffect } from "react";
import { Check, Clock, FolderKanban, Pencil } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import RenameModal from "../RenameModal";
import type { GtdNextList as GtdNextListData } from "./types";

interface Props {
  version: number;
  onChanged: () => void;
}

export default function GtdNextList({ version, onChanged }: Props) {
  const { t } = useT();
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

  const checkbox = (done: boolean, onToggle: () => void) => (
    <button
      onClick={onToggle}
      className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
        done ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-strong hover:border-[var(--accent)]"
      }`}
    >
      {done && <Check size={11} strokeWidth={3} />}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {isEmpty && <EmptyState size="module" text={t["gtd.emptyNext"]} />}

      {data.waiting.length > 0 && (
        <SectionCard icon={Clock} title={t["gtd.waiting"]} count={data.waiting.length} className="mb-3">
          {data.waiting.map((item) => (
            <ItemRow
              key={item.id}
              variant="dense"
              menuItems={[
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming({ kind: "item", id: item.id, title: item.title }) },
              ]}
              leading={checkbox(false, () => completeWaiting(item.id))}
              title={item.title}
            />
          ))}
        </SectionCard>
      )}

      {data.projects.map(({ project, action }) => {
        const progress = t["gtd.projectProgress"]
          .replace("{done}", String(project.done_action_count))
          .replace("{total}", String(project.action_count));
        return (
          <SectionCard
            key={project.id}
            icon={FolderKanban}
            title={project.title}
            count={progress}
            className="mb-3"
          >
            <ItemRow
              variant="dense"
              menuItems={[
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming({ kind: "action", id: action.id, title: action.title }) },
              ]}
              leading={checkbox(action.is_done === 1, () => completeAction(action.id))}
              title={action.title}
            />
          </SectionCard>
        );
      })}

      <RenameModal
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
