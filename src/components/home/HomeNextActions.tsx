import { useState, useEffect } from "react";
import { ListChecks } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import ItemRow from "../ItemRow";
import Badge from "../Badge";
import { resolveTagColor } from "../../lib/colors";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import DueDateChip from "../gtd/DueDateChip";
import type { GtdFocusRequest, GtdNextList as GtdNextListData } from "../gtd/types";

interface Props {
  version: number;
  onChanged: () => void;
  onNavigateToGtd: (req: GtdFocusRequest) => void;
}

export default function HomeNextActions({ version, onChanged, onNavigateToGtd }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [data, setData] = useState<GtdNextListData>({ waiting: [], projects: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.prism.getGtdNextList().then(setData).finally(() => setLoaded(true));
  }, [version]);

  const completeWaiting = async (id: number) => {
    try {
      await window.prism.deleteGtdItem(id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    onChanged();
  };

  const completeAction = async (id: number) => {
    try {
      await window.prism.toggleGtdAction(id);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    onChanged();
  };

  const total = data.waiting.length + data.projects.length;

  const checkbox = (onToggle: () => void) => (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="surface-inset w-[18px] h-[18px] rounded-full border hover:border-[var(--accent)] flex-shrink-0 transition-colors"
    />
  );

  return (
    <SectionCard
      icon={ListChecks}
      title={t["home.nextActions"]}
      count={total}
      className="flex h-full min-h-0 flex-col"
      bodyClassName="p-1.5 overflow-y-auto flex-1 min-h-0"
    >
      {!loaded && total === 0 && <SkeletonRows count={3} />}
      {loaded && total === 0 && <EmptyState size="card" text={t["gtd.emptyNext"]} />}
      {data.waiting.map((item) => (
        <ItemRow
          key={`w${item.id}`}
          variant="dense"
          leading={checkbox(() => completeWaiting(item.id))}
          onPrimaryClick={() => onNavigateToGtd({ list: "waiting", itemId: item.id })}
          title={item.title}
          meta={
            <>
              <DueDateChip dueDate={item.dueDate} />
              <span className="text-caption text-faint flex-shrink-0">{t["gtd.waiting"]}</span>
            </>
          }
        />
      ))}
      {data.projects.map(({ project, action }) => (
        <ItemRow
          key={`p${project.id}`}
          variant="dense"
          leading={checkbox(() => completeAction(action.id))}
          onPrimaryClick={() => onNavigateToGtd({ list: "project", projectId: project.id, actionId: action.id })}
          title={action.title}
          meta={
            <>
              <DueDateChip dueDate={action.dueDate} />
              <Badge palette={resolveTagColor(project.title, project.color)} className="max-w-[40%] flex-shrink-0">
                <span className="min-w-0 truncate">{project.title}</span>
              </Badge>
            </>
          }
        />
      ))}
    </SectionCard>
  );
}
