import { Check, ImagePlus, Trash2 } from "lucide-react";
import Button from "../Button";
import { useT } from "../../i18n";
import { growthCoverUrl } from "../../lib/growth";

interface Props {
  images: string[];
  cover: string;
  max: number;
  onAdd: () => void;
  onRemove: (name: string) => void;
  onSetCover: (name: string) => void;
}

/** Horizontal gallery editor: pick, remove, and choose the card cover. */
export default function GrowthArtifactGalleryField({
  images,
  cover,
  max,
  onAdd,
  onRemove,
  onSetCover,
}: Props) {
  const { t } = useT();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="block text-caption text-muted">{t["growth.artifactImages"]}</span>
        <span className="text-caption tabular-nums text-faint">
          {images.length} / {max}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {images.map((name) => (
          <div key={name} className="relative w-40 flex-shrink-0">
            <img
              src={growthCoverUrl(name)}
              alt=""
              className="aspect-[16/10] w-full rounded-card border border-strong/40 bg-elevated object-cover"
            />
            <div className="absolute right-1 top-1 flex gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                title={t["growth.artifactSetCover"]}
                aria-label={t["growth.artifactSetCover"]}
                disabled={cover === name}
                onClick={() => onSetCover(name)}
              >
                <Check size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t["growth.artifactCoverRemove"]}
                aria-label={t["growth.artifactCoverRemove"]}
                onClick={() => onRemove(name)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
            {cover === name && (
              <span className="absolute bottom-1 left-1 rounded-chip bg-surface/90 px-1.5 py-0.5 text-meta text-primary">
                {t["growth.artifactCover"]}
              </span>
            )}
          </div>
        ))}
        {images.length < max && (
          <Button
            variant="secondary"
            className="flex h-[100px] w-40 flex-shrink-0 flex-col gap-1"
            onClick={onAdd}
          >
            <ImagePlus size={18} />
            <span className="text-caption">{t["growth.artifactAddImage"]}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
