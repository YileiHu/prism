import { ExternalLink, ImageIcon, Pencil, Trash2 } from "lucide-react";
import Badge from "../Badge";
import type { MenuItem } from "../ContextMenu";
import { useContextMenu } from "../../lib/useContextMenu";
import { useT } from "../../i18n";
import { growthCoverUrl, plainTextExcerpt } from "../../lib/growth";
import { localDateFromStamp } from "../../lib/dates";
import type { GrowthArtifact } from "../../shared/models";
import { ARTIFACT_KIND_KEYS } from "./labels";

interface Props {
  artifact: GrowthArtifact;
  onOpen: (artifact: GrowthArtifact) => void;
  onEdit: (artifact: GrowthArtifact) => void;
  onDelete: (artifact: GrowthArtifact) => void;
}

/** One card on the season wall: cover, title, blurb, metadata. */
export default function GrowthArtifactCard({ artifact, onOpen, onEdit, onDelete }: Props) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const cover = artifact.cover ? growthCoverUrl(artifact.cover) : null;
  const blurb = artifact.note.trim() || plainTextExcerpt(artifact.body, 110);
  const date = artifact.createdOn ?? localDateFromStamp(artifact.createdAt);
  const menuItems: MenuItem[] = [
    {
      label: t["growth.editArtifact"],
      icon: <Pencil size={14} />,
      onClick: () => onEdit(artifact),
    },
  ];
  if (artifact.url) {
    menuItems.push({
      label: t["growth.artifactOpenLink"],
      icon: <ExternalLink size={14} />,
      onClick: () => void window.prism.openUrl(artifact.url),
    });
  }
  menuItems.push({
    label: t["menu.delete"],
    icon: <Trash2 size={14} />,
    danger: true,
    onClick: () => onDelete(artifact),
  });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={artifact.title}
      onClick={() => onOpen(artifact)}
      onContextMenu={(event) => onContextMenu(event, menuItems)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(artifact);
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-card border border-line/60 bg-surface transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-popover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-elevated">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-faint">
            <ImageIcon size={22} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-body font-medium leading-snug text-primary">
          {artifact.title}
        </span>
        {blurb ? (
          <span className="line-clamp-2 text-caption leading-relaxed text-faint">{blurb}</span>
        ) : (
          <Badge variant="outline" className="w-fit text-warning">
            {t["growth.artifactNeedsContent"]}
          </Badge>
        )}
        <span className="mt-auto flex min-w-0 items-center gap-1.5 pt-1.5 text-caption text-faint">
          <Badge variant="outline" className="flex-shrink-0">
            {t[ARTIFACT_KIND_KEYS[artifact.kind]]}
          </Badge>
          {artifact.capabilityName && (
            <span className="min-w-0 truncate">{artifact.capabilityName}</span>
          )}
          <span className="ml-auto flex-shrink-0 tabular-nums">{date}</span>
        </span>
      </div>
    </div>
  );
}
