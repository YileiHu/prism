import {
  Archive,
  BookMarked,
  BookOpen,
  Briefcase,
  Coffee,
  FileText,
  FolderOpen,
  Globe,
  GraduationCap,
  Heart,
  House,
  Leaf,
  Library,
  Palette,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";

export const VAULT_ICON_PRESETS: { id: string; Icon: LucideIcon }[] = [
  { id: "library", Icon: Library },
  { id: "book", Icon: BookOpen },
  { id: "bookmarked", Icon: BookMarked },
  { id: "file", Icon: FileText },
  { id: "folder", Icon: FolderOpen },
  { id: "star", Icon: Star },
  { id: "heart", Icon: Heart },
  { id: "sparkles", Icon: Sparkles },
  { id: "leaf", Icon: Leaf },
  { id: "coffee", Icon: Coffee },
  { id: "study", Icon: GraduationCap },
  { id: "work", Icon: Briefcase },
  { id: "globe", Icon: Globe },
  { id: "home", Icon: House },
  { id: "palette", Icon: Palette },
  { id: "archive", Icon: Archive },
];

export function VaultIcon({
  name,
  size = 14,
  className,
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  const preset = VAULT_ICON_PRESETS.find((entry) => entry.id === name) ?? VAULT_ICON_PRESETS[0];
  const Icon = preset.Icon;
  return <Icon size={size} className={className} />;
}
