import {
  Bookmark,
  BookOpen,
  Box,
  FileText,
  Folder,
  Hash,
  Layers,
  Search,
  Star,
  Tag,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface CollectionIconPreset {
  id: string;
  Icon: LucideIcon;
}

// Fixed preset list for collection icons. The id is what gets persisted in the
// sidecar/DB; an unknown or empty id falls back to the folder.
export const COLLECTION_ICON_PRESETS: readonly CollectionIconPreset[] = [
  { id: "folder", Icon: Folder },
  { id: "book", Icon: BookOpen },
  { id: "bookmark", Icon: Bookmark },
  { id: "file", Icon: FileText },
  { id: "layers", Icon: Layers },
  { id: "tag", Icon: Tag },
  { id: "star", Icon: Star },
  { id: "hash", Icon: Hash },
  { id: "search", Icon: Search },
  { id: "target", Icon: Target },
  { id: "zap", Icon: Zap },
  { id: "box", Icon: Box },
];

export const DEFAULT_COLLECTION_ICON = "folder";

export function CollectionIcon({
  icon,
  size = 14,
  className = "",
}: {
  icon?: string | null;
  size?: number;
  className?: string;
}) {
  const preset = COLLECTION_ICON_PRESETS.find((entry) => entry.id === icon) ?? COLLECTION_ICON_PRESETS[0];
  const Icon = preset.Icon;
  return <Icon size={size} className={className} />;
}
