import { useState, useEffect } from "react";
import { ListChecks } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import type { GtdFocusRequest, GtdNextList as GtdNextListData } from "../gtd/types";

interface Props {
  version: number;
  onChanged: () => void;
  onNavigateToGtd: (req: GtdFocusRequest) => void;
}

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

  const checkbox = (onToggle: () => void) => (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="w-[18px] h-[18px] rounded-full border border-strong hover:border-[var(--accent)] flex-shrink-0 transition-colors"
    />
  );

  return (
    <SectionCard
      icon={ListChecks}
      title={t["home.nextActions"]}
      count={total}
      className="h-full min-h-0 flex flex-col"
      bodyClassName="p-1.5 overflow-y-auto flex-1 min-h-0"
    >
      {total === 0 && <EmptyState size="card" text={t["gtd.emptyNext"]} />}
      {data.waiting.map((item) => (
        <ItemRow
          key={`w${item.id}`}
          variant="dense"
          leading={checkbox(() => completeWaiting(item.id))}
          onPrimaryClick={() => onNavigateToGtd({ list: "waiting", itemId: item.id })}
          title={item.title}
          meta={<span className="text-xs text-faint flex-shrink-0">{t["gtd.waiting"]}</span>}
        />
      ))}
      {data.projects.map(({ project, action }) => (
        <ItemRow
          key={`p${project.id}`}
          variant="dense"
          leading={checkbox(() => completeAction(action.id))}
          onPrimaryClick={() => onNavigateToGtd({ list: "project", projectId: project.id, actionId: action.id })}
          title={action.title}
          meta={<span className="text-xs text-faint truncate max-w-[40%] flex-shrink-0">{project.title}</span>}
        />
      ))}
    </SectionCard>
  );
}
