import { lazy, Suspense } from "react";
import { ExternalLink, Loader2, Pencil } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Badge from "../Badge";
import ImageGallery from "../ImageGallery";
import SectionCard from "../SectionCard";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { growthCoverUrl } from "../../lib/growth";
import { localDateFromStamp } from "../../lib/dates";
import type { GrowthArtifact, GrowthChallenge } from "../../shared/models";
import { ARTIFACT_KIND_KEYS } from "./labels";

const GrowthMarkdown = lazy(() => import("./GrowthMarkdown"));

interface Props {
  open: boolean;
  artifact: GrowthArtifact | null;
  challenges: GrowthChallenge[];
  onClose: () => void;
  onEdit: (artifact: GrowthArtifact) => void;
}

/** Reading view for one work: cover, story, link, and its few actions. */
export default function GrowthArtifactDetail({
  open,
  artifact,
  challenges,
  onClose,
  onEdit,
}: Props) {
  const { t } = useT();
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  if (!artifact) return null;

  const challenge = artifact.challengeId === null
    ? null
    : challenges.find((item) => item.id === artifact.challengeId) ?? null;
  const date = artifact.createdOn ?? localDateFromStamp(artifact.createdAt);
  const hasLink = artifact.url.trim() !== "";
  const twoColumn = width >= 880;

  const galleryImages =
    artifact.images.length > 0
      ? artifact.images
      : [artifact.cover].filter((name) => name !== "");
  const imagesBlock =
    galleryImages.length > 0 ? (
      <ImageGallery
        className="flex-shrink-0"
        images={galleryImages.map((name) => ({ src: growthCoverUrl(name) }))}
      />
    ) : null;

  const reading = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-caption text-faint">
        <Badge variant="outline">{t[ARTIFACT_KIND_KEYS[artifact.kind]]}</Badge>
        {artifact.capabilityName && <span className="truncate">{artifact.capabilityName}</span>}
        {challenge && <span className="truncate">{challenge.title}</span>}
        <span className="tabular-nums">{date}</span>
      </div>

      {artifact.note.trim() && (
        <p className="whitespace-pre-wrap border-l-2 border-[var(--accent-border)] pl-3 text-body leading-relaxed text-primary">
          {artifact.note}
        </p>
      )}

      {artifact.body.trim() ? (
        <SectionCard
          title={t["growth.artifactBody"]}
          className={twoColumn ? "flex min-h-0 flex-1 flex-col" : ""}
          bodyClassName={
            twoColumn
              ? "min-h-0 flex-1 overflow-y-auto p-3"
              : "p-3"
          }
        >
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-2 text-caption text-faint">
                <Loader2 size={14} className="animate-spin" />
                {t["growth.loading"]}
              </div>
            }
          >
            <GrowthMarkdown content={artifact.body} />
          </Suspense>
        </SectionCard>
      ) : (
        <p className="text-caption text-faint">{t["growth.artifactNeedsContent"]}</p>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={artifact.title}
      layout="document"
      position="center"
      headerActions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            title={hasLink ? t["growth.artifactOpenLink"] : t["growth.artifactNoLink"]}
            aria-label={hasLink ? t["growth.artifactOpenLink"] : t["growth.artifactNoLink"]}
            disabled={!hasLink}
            onClick={() => {
              if (hasLink) void window.prism.openUrl(artifact.url);
            }}
          >
            <ExternalLink size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.editArtifact"]}
            aria-label={t["growth.editArtifact"]}
            onClick={() => onEdit(artifact)}
          >
            <Pencil size={15} />
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${twoColumn ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        {imagesBlock}
        <div
          className={
            twoColumn
              ? `${imagesBlock ? "mt-5" : ""} flex min-h-0 flex-1 flex-col gap-5`
              : `${imagesBlock ? "mt-5" : ""} space-y-5`
          }
        >
          {reading}
        </div>
      </div>
    </Modal>
  );
}
