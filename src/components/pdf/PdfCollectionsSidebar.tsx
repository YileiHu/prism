import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useDndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import type { MenuItem } from "../ContextMenu";
import EmptyState from "../EmptyState";
import NavItem from "../NavItem";
import Sidebar from "../Sidebar";
import type { PdfCollectionData } from "./types";

export function pdfCollId(id: string) {
  return `pdfcoll-${id}`;
}

interface ItemProps {
  coll: PdfCollectionData;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (color: string) => void;
}

function SortablePdfCollection({
  coll,
  selected,
  index,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: ItemProps) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const { active, over } = useDndContext();
  const isDropTarget = active?.data.current?.kind === "pdf-doc" && over?.id === pdfCollId(coll.id);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pdfCollId(coll.id),
    data: { kind: "pdf-collection", id: coll.id, index },
  });
  const clickGuard = useDragClickGuard(isDragging);

  const menuItems: MenuItem[] = [
    buildColorMenuItem(t, {
      label: t["collections.color"],
      autoLabel: t["collections.colorAuto"],
      autoSource: coll.name,
      current: coll.color,
      onSelect: onSetColor,
    }),
    { label: t["collections.rename"], icon: <Pencil size={14} />, onClick: onRename },
    { label: t["collections.delete"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
  ];

  return (
    <NavItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        "--i": Math.min(index, 10),
      } as React.CSSProperties}
      {...attributes}
      {...listeners}
      {...clickGuard}
      active={selected}
      className={`group cursor-pointer stagger-in ${
        isDropTarget ? "ring-1 ring-[var(--accent)] bg-[var(--accent-muted)]" : ""
      }`}
      onClick={onSelect}
      onContextMenu={(e) => onContextMenu(e, menuItems)}
      leading={
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: resolveTagColor(coll.name, coll.color).bar }}
        />
      }
      label={coll.name}
      trailing={coll.pdfPaths.length}
    />
  );
}

interface Props {
  collections: PdfCollectionData[];
  selectedId: string | null;
  allCount: number;
  onSelect: (id: string | null) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSetColor: (id: string, color: string) => void;
}

export default function PdfCollectionsSidebar({
  collections,
  selectedId,
  allCount,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: Props) {
  const { t } = useT();
  const ids = useMemo(() => collections.map((c) => pdfCollId(c.id)), [collections]);

  return (
    <Sidebar>
      <div
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-1.5 px-3 py-2 text-body transition-colors rounded-control cursor-pointer mb-1 section-wash ${
          selectedId === null
            ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium accent-frame"
            : "text-secondary hover:text-primary hover:bg-elevated/50 font-medium"
        }`}
      >
        <span className="flex-1 text-body truncate text-left">{t["pdf.all"]}</span>
        <span className="text-caption text-faint flex-shrink-0">{allCount}</span>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {collections.length === 0 && <EmptyState size="card" text={t["collections.emptyHint"]} />}
        {collections.map((coll, index) => (
          <SortablePdfCollection
            key={coll.id}
            coll={coll}
            selected={selectedId === coll.id}
            index={index}
            onSelect={() => onSelect(coll.id)}
            onRename={() => onRename(coll.id)}
            onDelete={() => onDelete(coll.id)}
            onSetColor={(color) => onSetColor(coll.id, color)}
          />
        ))}
      </SortableContext>
    </Sidebar>
  );
}
