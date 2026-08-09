import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";

export interface NoteRow {
  path: string;
  title: string;
  missing?: boolean;
  meta?: string;
}

interface Props {
  title: string;
  icon: LucideIcon;
  rows: NoteRow[];
  emptyText: string;
  onUnstar?: (row: NoteRow) => void;
}

export default function NoteListCard({ title, icon, rows, emptyText, onUnstar }: Props) {
  const { t } = useT();

  return (
    <SectionCard
      icon={icon}
      title={title}
      count={rows.length}
      className="flex flex-col min-h-0"
      bodyClassName="p-1.5 overflow-y-auto max-h-[260px]"
    >
      {rows.length === 0 && <EmptyState size="card" text={emptyText} />}
      {rows.map((row) => (
        <ItemRow
          key={row.path}
          variant="dense"
          className={row.missing ? "opacity-50" : ""}
          onPrimaryClick={row.missing ? undefined : () => window.prism.openInObsidian(row.path)}
          title={row.missing ? <span className="text-faint line-through">{row.title}</span> : row.title}
          meta={
            row.missing ? (
              <span className="text-xs text-faint flex-shrink-0">{t["collections.missing"]}</span>
            ) : row.meta ? (
              <span className="text-xs text-faint flex-shrink-0">{row.meta}</span>
            ) : undefined
          }
          hoverActions={
            onUnstar
              ? [{
                  icon: <Star size={13} fill="currentColor" />,
                  label: t["menu.unfavorite"],
                  onClick: () => onUnstar(row),
                  className: "text-[var(--accent)]",
                }]
              : []
          }
        />
      ))}
    </SectionCard>
  );
}
