import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import { buildColorMenuItem } from "../ColorPicker";
import type { MenuItem } from "../ContextMenu";
import NavItem from "../NavItem";
import { Pencil, Trash2 } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";

export interface GroupNavRowSortable {
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: React.ButtonHTMLAttributes<HTMLButtonElement>;
  listeners?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition: string | null | undefined;
  isDragging: boolean;
}

interface Props {
  name: string;
  color?: string;
  count: number;
  active: boolean;
  index?: number;
  className?: string;
  /** Ring highlight used when a note/PDF cannot be dropped here but hovers. */
  highlight?: boolean;
  sortable?: GroupNavRowSortable;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetColor: (color: string) => void;
}

// One sidebar row for every group-like entity: note/PDF collections, resource
// tags and (later) canvas groups. Keeps the colored dot, count, active state,
// menu, drag handle and click guard identical across sources.
export default function GroupNavRow({
  name,
  color,
  count,
  active,
  index = 0,
  className = "",
  highlight = false,
  sortable,
  onSelect,
  onRename,
  onDelete,
  onSetColor,
}: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const clickGuard = useDragClickGuard(sortable?.isDragging ?? false);
  const dot = resolveTagColor(name, color);

  const menuItems: MenuItem[] = [
    buildColorMenuItem(t, {
      label: t["library.groupColor"],
      autoLabel: t["collections.colorAuto"],
      autoSource: name,
      current: color,
      onSelect: onSetColor,
    }),
    { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: onRename },
    { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: onDelete },
  ];

  const style = {
    transform: sortable?.transform ? CSS.Transform.toString(sortable.transform) : undefined,
    transition: sortable?.transition ?? undefined,
    opacity: sortable?.isDragging ? 0.4 : 1,
    "--i": Math.min(index, 10),
  } as React.CSSProperties;

  return (
    <NavItem
      ref={sortable?.setNodeRef}
      {...sortable?.attributes}
      {...sortable?.listeners}
      {...clickGuard}
      style={style}
      active={active}
      className={`group cursor-pointer stagger-fade ${
        highlight ? "ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-muted)]" : ""
      } ${className}`}
      onClick={onSelect}
      onContextMenu={(event) => onContextMenu(event, menuItems)}
      leading={<span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot.bar }} />}
      label={name}
      trailing={count}
    />
  );
}
