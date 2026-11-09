import { ListChecks, Pencil, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import ItemRow from "../ItemRow";
import { formatGtdDate, type GtdItem } from "./types";

interface Props {
  items: GtdItem[];
  variant: "list" | "dense";
  multiline?: boolean;
  rowClassName?: string;
  onProcess: (item: GtdItem) => void;
  onRename: (item: GtdItem) => void;
  onDelete: (item: GtdItem) => void;
}

/** Item rows for the inbox; the shell (card vs module pane) stays with the caller. */
export default function GtdInboxList({
  items,
  variant,
  multiline,
  rowClassName,
  onProcess,
  onRename,
  onDelete,
}: Props) {
  const { t } = useT();
  return (
    <>
      {items.map((item) => (
        <ItemRow
          key={item.id}
          variant={variant}
          multiline={multiline}
          className={rowClassName}
          onPrimaryClick={() => onProcess(item)}
          menuItems={[
            { label: t["gtd.process"], icon: <ListChecks size={14} />, onClick: () => onProcess(item) },
            { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => onRename(item) },
            { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(item) },
          ]}
          title={item.title}
          meta={<span className="text-caption text-faint flex-shrink-0">{formatGtdDate(item.createdAt)}</span>}
        />
      ))}
    </>
  );
}
