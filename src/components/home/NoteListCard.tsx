import { Lock, type LucideIcon } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import Badge from "../Badge";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import { resolveTagColor, type PaletteColor } from "../../lib/colors";
import type { NoteRef } from "../../shared/models";
import type { NoteOwner } from "./useNoteCollectionIndex";
import type { MenuItem } from "../ContextMenu";

export interface NoteRow extends NoteRef {
  missing?: boolean;
  locked?: boolean;
  meta?: string;
  collection?: NoteOwner;
  collectionMore?: number;
}

interface Props {
  title: string;
  icon: LucideIcon;
  rows: NoteRow[];
  emptyText: string;
  tintColor?: PaletteColor;
  loading?: boolean;
  menuFor?: (row: NoteRow) => MenuItem[] | undefined;
}

export default function NoteListCard({ title, icon, rows, emptyText, tintColor, loading, menuFor }: Props) {
  const { t } = useT();

  return (
    <SectionCard
      icon={icon}
      title={title}
      count={rows.length}
      tintColor={tintColor}
      className="flex min-h-0 flex-1 flex-col"
      bodyClassName="p-1.5 overflow-y-auto flex-1 min-h-0"
    >
      {loading && rows.length === 0 && <SkeletonRows count={3} />}
      {!loading && rows.length === 0 && <EmptyState size="card" text={emptyText} />}
      {rows.map((row) => {
        const menuItems = menuFor?.(row);
        return (
          <ItemRow
            key={row.path}
            variant="dense"
            className={row.missing ? "opacity-50" : ""}
            menuItems={menuItems?.length ? menuItems : undefined}
            onPrimaryClick={
              row.missing
                ? undefined
                : () => window.dispatchEvent(new CustomEvent("prism:open-note", { detail: { path: row.path, title: row.title } }))
            }
            title={
              row.missing ? (
                <span className="text-faint line-through">{row.title}</span>
              ) : row.locked ? (
                <span className="flex min-w-0 items-center gap-1">
                  <Lock size={11} strokeWidth={2} className="flex-shrink-0 text-faint" />
                  <span className="truncate">{row.title}</span>
                </span>
              ) : (
                row.title
              )
            }
            trailing={
              !row.missing && row.collection ? (
                <span className="flex min-w-0 max-w-[45%] flex-shrink-0 items-center gap-1">
                  <Badge
                    palette={resolveTagColor(row.collection.label, row.collection.colorBar)}
                    className="max-w-[120px] min-w-0"
                    title={row.collection.tooltip}
                  >
                    <span className="min-w-0 truncate">{row.collection.label}</span>
                  </Badge>
                  {row.collectionMore ? (
                    <span className="flex-shrink-0 text-meta text-faint">+{row.collectionMore}</span>
                  ) : null}
                </span>
              ) : undefined
            }
            meta={
              row.missing ? (
                <span className="text-caption text-faint flex-shrink-0">{t["collections.missing"]}</span>
              ) : row.locked ? (
                <span className="text-caption text-faint flex-shrink-0">{t["private.locked"]}</span>
              ) : row.meta ? (
                <span className="text-caption text-faint flex-shrink-0">{row.meta}</span>
              ) : undefined
            }
          />
        );
      })}
    </SectionCard>
  );
}
