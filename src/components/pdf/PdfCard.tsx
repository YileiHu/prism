import { FolderOpen, ImageIcon, MoreHorizontal, RotateCcw, Trash2, FolderMinus, BookOpen, PlusCircle } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import { useDragClickGuard } from "../../lib/useDragClickGuard";
import { resolveTagColor } from "../../lib/colors";
import Button from "../Button";
import type { MenuItem } from "../ContextMenu";
import PdfCover from "./PdfCover";
import { formatFileSize, relKey, type PdfCollectionData, type PdfDocument } from "./types";

interface Props {
  doc: PdfDocument;
  collections: PdfCollectionData[];
  activeCollection: PdfCollectionData | null;
  onOpen: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void;
  onDelete: () => void;
  onShowInFolder: () => void;
  onDocUpdated: (patch: Partial<PdfDocument>) => void;
}

export default function PdfCard({
  doc,
  collections,
  activeCollection,
  onOpen,
  onAddToCollection,
  onRemoveFromCollection,
  onDelete,
  onShowInFolder,
  onDocUpdated,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `pdfdoc-${doc.id}`,
    data: { kind: "pdf-doc", id: doc.id, relPath: doc.rel_path },
  });
  const clickGuard = useDragClickGuard(isDragging);

  const memberCollections = collections.filter((c) =>
    c.pdfPaths.some((p) => relKey(p) === relKey(doc.rel_path)),
  );

  const handleChooseCover = async () => {
    try {
      const result = await window.prism.pdfChooseCover(doc.id);
      if (!result) return;
      onDocUpdated({
        cover_version: result.coverVersion,
        cover_custom: 1,
        cover_dirty: 0,
        cover_path: doc.cover_path || "custom",
      });
      showToast(t["pdf.coverUpdated"]);
    } catch {
      showToast(t["pdf.coverFailed"], "error");
    }
  };

  const handleResetCover = async () => {
    try {
      const result = await window.prism.pdfResetCover(doc.id);
      onDocUpdated({
        cover_version: result.coverVersion,
        cover_custom: 0,
        cover_dirty: 1,
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
        label: t["pdf.addToCollection"],
        icon: <PlusCircle size={14} />,
        children: collections.length > 0
          ? collections.map((c) => ({
              label: c.name,
              checked: c.pdfPaths.some((p) => relKey(p) === relKey(doc.rel_path)),
              onClick: () => onAddToCollection(c.id),
            }))
          : [{ label: t["collections.none"] }],
      },
      { label: t["pdf.changeCover"], icon: <ImageIcon size={14} />, onClick: () => { void handleChooseCover(); } },
    ];
    if (doc.cover_custom === 1 || doc.cover_dirty === 1) {
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

  const pageLabel = doc.page_count && doc.page_count > 0
    ? t["pdf.pageCount"].replace("{count}", String(doc.page_count))
    : "";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...clickGuard}
      className={`group relative cursor-pointer select-none ${isDragging ? "opacity-40" : ""}`}
      onClick={onOpen}
      onContextMenu={(e) => onContextMenu(e, menuItems())}
    >
      <div className="relative aspect-[3/4] rounded-card overflow-hidden border border-line/60 bg-surface shadow-sm transition-[transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:shadow-popover">
        <PdfCover
          doc={doc}
          onGenerated={(_id, version, pageCount) => {
            onDocUpdated({
              cover_version: version,
              cover_dirty: 0,
              cover_path: doc.cover_path || "auto",
              page_count: pageCount,
            });
          }}
        />

        {memberCollections.length > 0 && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            {memberCollections.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="w-2 h-2 rounded-full ring-1 ring-black/20"
                style={{ backgroundColor: resolveTagColor(c.name, c.color).bar }}
              />
            ))}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/55 via-black/20 to-transparent">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white/85 hover:text-white hover:bg-white/15"
            title={t["pdf.open"]}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
          >
            <BookOpen size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white/85 hover:text-white hover:bg-white/15"
            title={t["pdf.showInFolder"]}
            onClick={(e) => { e.stopPropagation(); onShowInFolder(); }}
          >
            <FolderOpen size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-white/85 hover:text-white hover:bg-white/15"
            title={t["pdf.more"]}
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, menuItems()); }}
          >
            <MoreHorizontal size={14} />
          </Button>
        </div>
      </div>

      <div className="mt-1.5 px-0.5">
        <div className="text-body text-primary font-medium leading-snug line-clamp-2">{doc.title}</div>
        <div className="text-caption text-muted mt-0.5 truncate">
          {[pageLabel, formatFileSize(doc.file_size)].filter(Boolean).join(" · ")}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {memberCollections.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-chip text-[11px]"
              style={{ backgroundColor: resolveTagColor(c.name, c.color).bg, color: resolveTagColor(c.name, c.color).name }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: resolveTagColor(c.name, c.color).bar }} />
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
