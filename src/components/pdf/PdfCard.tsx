import { FolderOpen, ImageIcon, RotateCcw, Trash2, FolderMinus, BookOpen, PlusCircle } from "lucide-react";
import type { MouseEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import type { MenuItem } from "../ContextMenu";
import SelectionCheck from "../SelectionCheck";
import PdfCover from "./PdfCover";
import { formatFileSize, type PdfCollectionData, type PdfDocument } from "./types";

interface Props {
  doc: PdfDocument;
  collections: PdfCollectionData[];
  memberCollections: PdfCollectionData[];
  activeCollection: PdfCollectionData | null;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onMoveToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void;
  onDelete: () => void;
  onShowInFolder: () => void;
  onDocUpdated: (patch: Partial<PdfDocument>) => void;
}

export default function PdfCard({
  doc,
  collections,
  memberCollections,
  activeCollection,
  selecting,
  selected,
  onOpen,
  onToggleSelect,
  onMoveToCollection,
  onRemoveFromCollection,
  onDelete,
  onShowInFolder,
  onDocUpdated,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();

  // Dragging a card into a collection is the range gesture; in select mode the
  // click toggles instead so the two never fight over the same drag.
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `pdfdoc-${doc.id}`,
    data: { kind: "pdf-doc", id: doc.id, relPath: doc.relPath },
    disabled: selecting,
  });
  const clickGuard = useDragClickGuard(isDragging);

  const handleChooseCover = async () => {
    try {
      const result = await window.prism.choosePdfCover(doc.id);
      if (!result) return;
      onDocUpdated({
        coverVersion: result.coverVersion,
        coverCustom: true,
        coverDirty: false,
        coverPath: doc.coverPath || "custom",
      });
      showToast(t["pdf.coverUpdated"]);
    } catch {
      showToast(t["pdf.coverFailed"], "error");
    }
  };

  const handleResetCover = async () => {
    try {
      const result = await window.prism.resetPdfCover(doc.id);
      onDocUpdated({
        coverVersion: result.coverVersion,
        coverCustom: false,
        coverDirty: true,
      });
      showToast(t["pdf.coverReset"]);
    } catch {
      showToast(t["pdf.coverFailed"], "error");
    }
  };

  const menuItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      { label: t["pdf.open"], icon: <BookOpen size={14} />, onClick: onOpen },
      { label: t["pdf.showInFolder"], icon: <FolderOpen size={14} />, onClick: onShowInFolder },
      {
        label: t["collections.moveTo"],
        icon: <PlusCircle size={14} />,
        children: collections.length > 0
          ? collections.map((c) => ({
              label: c.name,
              checked: memberCollections.some((m) => m.id === c.id),
              onClick: () => onMoveToCollection(c.id),
            }))
          : [{ label: t["collections.none"] }],
      },
      { label: t["pdf.changeCover"], icon: <ImageIcon size={14} />, onClick: () => { void handleChooseCover(); } },
    ];
    if (doc.coverCustom || doc.coverDirty) {
      items.push({ label: t["pdf.resetCover"], icon: <RotateCcw size={14} />, onClick: () => { void handleResetCover(); } });
    }
    if (activeCollection) {
      items.push({
        label: t["pdf.removeFromCollection"],
        icon: <FolderMinus size={14} />,
        onClick: onRemoveFromCollection,
      });
    }
    items.push({ label: t["pdf.trash"], icon: <Trash2 size={14} />, onClick: onDelete, danger: true });
    return items;
  };

  const pageLabel = doc.pageCount && doc.pageCount > 0
    ? t["pdf.pageCount"].replace("{count}", String(doc.pageCount))
    : "";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...clickGuard}
      className={`group relative cursor-pointer select-none ${isDragging ? "opacity-40" : ""}`}
      onClick={(event) => {
        if (selecting) onToggleSelect(event);
        else onOpen();
      }}
      onContextMenu={(e) => onContextMenu(e, menuItems())}
    >
      <div className={`relative aspect-[3/4] rounded-card overflow-hidden border bg-surface shadow-sm transition-[transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:shadow-popover ${
        selected ? "border-accent ring-2 ring-accent" : "border-line/60"
      }`}>
        <PdfCover
          doc={doc}
          onGenerated={(_id, version, pageCount) => {
            onDocUpdated({
              coverVersion: version,
              coverDirty: false,
              coverPath: doc.coverPath || "auto",
              pageCount: pageCount,
            });
          }}
        />

        {selecting && (
          <div className="absolute left-2 top-2 z-10">
            <SelectionCheck checked={selected} />
          </div>
        )}

        {!selecting && memberCollections.length > 0 && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            {memberCollections.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="w-2 h-2 rounded-full ring-1 ring-[color:var(--ring-subtle)]"
                style={{ backgroundColor: resolveTagColor(c.name).bar }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-1.5 px-0.5">
        <div className="text-body text-primary font-medium leading-snug line-clamp-2">{doc.title}</div>
        <div className="text-caption text-muted mt-0.5 truncate">
          {[pageLabel, formatFileSize(doc.fileSize)].filter(Boolean).join(" · ")}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {memberCollections.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-chip text-[11px]"
              style={{ backgroundColor: resolveTagColor(c.name).bg, color: resolveTagColor(c.name).name }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: resolveTagColor(c.name).bar }} />
              <span className="max-w-[84px] truncate">{c.name}</span>
            </span>
          ))}
          {memberCollections.length > 2 && (
            <span className="text-[11px] text-faint self-center">+{memberCollections.length - 2}</span>
          )}
          {memberCollections.length === 0 && activeCollection === null && (
            <span className="text-[11px] text-faint">{t["pdf.uncategorized"]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
