import { useState, useEffect } from "react";
import { ArrowRight, ListChecks } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import type { GtdNextList as GtdNextListData } from "../gtd/types";

interface Props {
  version: number;
  onChanged: () => void;
  onNavigateToGtd: () => void;
}

const MAX_WAITING = 5;
const MAX_PROJECTS = 8;

export default function HomeNextActions({ version, onChanged, onNavigateToGtd }: Props) {
  const { t } = useT();
  const [data, setData] = useState<GtdNextListData>({ waiting: [], projects: [] });

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

  const total = data.waiting.length + data.projects.length;
  const waiting = data.waiting.slice(0, MAX_WAITING);
  const projects = data.projects.slice(0, MAX_PROJECTS);

  const checkbox = (onToggle: () => void) => (
    <button
      onClick={onToggle}
      className="w-[18px] h-[18px] rounded-full border border-strong hover:border-[var(--accent)] flex-shrink-0 transition-colors"
    />
  );

  return (
    <SectionCard
      icon={ListChecks}
      title={t["home.nextActions"]}
      count={total}
      className="flex-shrink-0"
      bodyClassName="p-1.5"
      headerActions={
        <button
          onClick={onNavigateToGtd}
          className="flex items-center gap-1 text-xs text-faint hover:text-[var(--accent-text)] transition-colors"
        >
          {t["home.viewAll"]}
          <ArrowRight size={11} />
        </button>
      }
    >
      {total === 0 && <EmptyState size="card" text={t["gtd.emptyNext"]} />}
      {waiting.map((item) => (
        <ItemRow
          key={`w${item.id}`}
          variant="dense"
          leading={checkbox(() => completeWaiting(item.id))}
          title={item.title}
          meta={<span className="text-xs text-faint flex-shrink-0">{t["gtd.waiting"]}</span>}
        />
      ))}
      {projects.map(({ project, action }) => (
        <ItemRow
          key={`p${project.id}`}
          variant="dense"
          leading={checkbox(() => completeAction(action.id))}
          title={action.title}
          meta={<span className="text-xs text-faint truncate max-w-[40%] flex-shrink-0">{project.title}</span>}
        />
      ))}
    </SectionCard>
  );
}
