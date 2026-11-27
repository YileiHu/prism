import { useState } from "react";
import { useT } from "../../i18n";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { CollectionIcon } from "../../lib/collectionIcons";
import type { MenuItem } from "../ContextMenu";
import NavItem from "../NavItem";
import CollectionIconPicker from "./CollectionIconPicker";
import { Pencil, Shapes, Trash2 } from "lucide-react";
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
  /** Preset id from lib/collectionIcons; empty falls back to the folder. */
  icon?: string;
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
  onSetIcon: (icon: string) => void;
}

// One sidebar row for every collection-like entity: note/PDF collections and
// web-resource collections. Keeps the icon, count, active state, menu, drag
// handle and click guard identical across sources.
export default function GroupNavRow({
  name,
  icon,
  count,
  active,
  index = 0,
  className = "",
  highlight = false,
  sortable,
  onSelect,
  onRename,
  onDelete,
  onSetIcon,
}: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const clickGuard = useDragClickGuard(sortable?.isDragging ?? false);
  const [iconOpen, setIconOpen] = useState(false);

  const menuItems: MenuItem[] = [
    {
      label: t["collections.chooseIcon"],
      icon: <Shapes size={14} />,
      onClick: () => setIconOpen(true),
    },
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
    <>
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
        leading={<CollectionIcon icon={icon} size={14} />}
        label={name}
        trailing={count}
      />
      <CollectionIconPicker
        open={iconOpen}
        value={icon}
        onPick={(next) => {
          onSetIcon(next);
          setIconOpen(false);
        }}
        onClose={() => setIconOpen(false)}
      />
    </>
  );
}
