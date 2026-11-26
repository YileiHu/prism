import { useEffect, useMemo, useState } from "react";
import { Pencil, Sprout, Trash2, ExternalLink } from "lucide-react";
import Button from "../Button";
import Badge from "../Badge";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import SelectButton from "../SelectButton";
import { SkeletonRows } from "../Skeleton";
import { useContextMenu } from "../../lib/useContextMenu";
import { useToast } from "../../lib/toast";
import GrowthEmptyGuide from "./GrowthEmptyGuide";
import { useToolbarContribution } from "../toolbar/ToolbarProvider";
import { useT } from "../../i18n";
import { localDateFromStamp } from "../../lib/dates";
import type {
  GrowthAnnualNote,
  GrowthArtifact,
  GrowthChallenge,
  GrowthSeason,
  GrowthSnapshot,
} from "../../shared/models";
import { globalCurve, growthCoverUrl, seasonOrdinalOf, yearCurve } from "../../lib/growth";
import GrowthCurveChart from "./GrowthCurveChart";
import GrowthSeasonPoster from "./GrowthSeasonPoster";
import GrowthAnnualModal, { type AnnualStats } from "./GrowthAnnualModal";
import { ARTIFACT_KIND_KEYS } from "./labels";

const artifactDateKey = (artifact: GrowthArtifact): string =>
  artifactDateKey(artifact);

interface Props {
  /** Bumped by the module root after every write, so the timeline refetches. */
  version: number;
  seasons: GrowthSeason[];
  challenges: GrowthChallenge[];
  artifacts: GrowthArtifact[];
  annualNotes: GrowthAnnualNote[];
  /** Jump to the season page with that season selected. */
  onOpenSeason: (seasonId: number) => void;
  /** First-run guide: jump to the capability page to start. */
  onOpenCapabilities: () => void;
  onOpenArtifact: (artifact: GrowthArtifact) => void;
  onDeleteArtifact: (artifact: GrowthArtifact) => void;
  onChanged: () => void;
}

/** The year a season touches, so a season is shown in every year it spans. */
function seasonInYear(season: GrowthSeason, year: number | null): boolean {
  if (year === null) return true;
  return season.startDate <= `${year}-12-31` && season.endDate >= `${year}-01-01`;
}

/** One year's page: the hero of a single-year view, a card in the archive list. */
function AnnualCard({
  year,
  note,
  stats,
  featured,
  onEdit,
  onDelete,
}: {
  year: number;
  note: GrowthAnnualNote | null;
  stats?: AnnualStats | null;
  featured: boolean;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const { t } = useT();
  const { onContextMenu } = useContextMenu();
  const menuItems = onDelete
    ? [
        { label: t["growth.chronicle.editAnnual"], icon: <Pencil size={14} />, onClick: onEdit },
        {
          label: t["menu.delete"],
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: onDelete,
        },
      ]
    : [];

  if (!note) {
    return (
      <section className="rounded-card border border-dashed border-strong/40 bg-surface p-5">
        <span className="text-meta uppercase tracking-[0.18em] text-faint">
          {t["growth.chronicle.annual"]}
        </span>
        <h2 className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-primary">
          {year}
        </h2>
        <p className="mt-3 text-caption text-faint">{t["growth.chronicle.emptyAnnual"]}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onEdit}>
          {t["growth.chronicle.writePage"]}
        </Button>
      </section>
    );
  }

  return (
    <section
      onContextMenu={menuItems.length > 0 ? (event) => onContextMenu(event, menuItems) : undefined}
      className="relative overflow-hidden rounded-card border border-strong/40 bg-surface p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-8 select-none text-[128px] font-semibold leading-none tabular-nums text-primary opacity-[0.05]"
      >
        {note.year}
      </span>
      <div className="relative">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-meta uppercase tracking-[0.18em] text-faint">
              {t["growth.chronicle.annual"]}
            </span>
            <h2 className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-primary">
              {note.year}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-1"
            title={t["growth.chronicle.editAnnual"]}
            aria-label={t["growth.chronicle.editAnnual"]}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </Button>
        </div>
        {stats && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption tabular-nums text-secondary">
            <span>
              <span className="text-faint">{t["growth.chronicle.statsScore"]} </span>
              {stats.score === null ? "—" : Math.round(stats.score)}
              {stats.delta !== null && (
                <span className="ml-1 text-faint">
                  ({stats.delta >= 0 ? "+" : ""}
                  {stats.delta.toFixed(1)})
                </span>
              )}
            </span>
            <span>
              <span className="text-faint">{t["growth.chronicle.statsSeasons"]} </span>
              {stats.seasons}
            </span>
            <span>
              <span className="text-faint">{t["growth.chronicle.statsArtifacts"]} </span>
              {stats.artifacts}
            </span>
            <span>
              <span className="text-faint">{t["growth.chronicle.statsUpgrades"]} </span>
              {stats.upgrades}
            </span>
            {stats.highlights.length > 0 && (
              <span className="min-w-0 truncate text-faint">
                {t["growth.chronicle.statsHighlights"]} {stats.highlights.join(" · ")}
              </span>
            )}
          </div>
        )}
        {note.summary && (
          <p
            className={`mt-4 max-w-[54ch] whitespace-pre-wrap leading-relaxed text-primary ${
              featured ? "text-section font-medium" : "text-body"
            }`}
          >
            {note.summary}
          </p>
        )}
        {note.milestones.length > 0 && (
          <ol className="mt-3 space-y-1">
            {note.milestones.map((milestone, index) => (
              <li key={index} className="flex gap-2 text-caption text-secondary">
                <span className="flex-shrink-0 tabular-nums text-faint">{index + 1}.</span>
                <span className="min-w-0 flex-1">{milestone}</span>
              </li>
            ))}
          </ol>
        )}
        {(note.kept || note.dropped) && (
          <dl
            className={`mt-4 grid gap-2 ${featured ? "md:grid-cols-2" : "grid-cols-1"}`}
          >
            {note.kept && (
              <div className="rounded-control border border-strong/40 bg-elevated/30 px-3 py-2">
                <dt className="text-caption text-faint">{t["growth.chronicle.kept"]}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-caption text-secondary">
                  {note.kept}
                </dd>
              </div>
            )}
            {note.dropped && (
              <div className="rounded-control border border-strong/40 bg-elevated/30 px-3 py-2">
                <dt className="text-caption text-faint">{t["growth.chronicle.dropped"]}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-caption text-secondary">
                  {note.dropped}
                </dd>
              </div>
            )}
          </dl>
        )}
        {note.nextFocus && (
          <div className="mt-3 rounded-control border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2">
            <span className="block text-caption text-faint">
              {t["growth.chronicle.nextFocus"]}
            </span>
            <p className="mt-0.5 whitespace-pre-wrap text-caption text-[var(--accent-text)]">
              {note.nextFocus}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function GrowthChronicleView({
  version,
  seasons,
  challenges,
  artifacts,
  annualNotes,
  onOpenSeason,
  onOpenCapabilities,
  onOpenArtifact,
  onDeleteArtifact,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [snapshots, setSnapshots] = useState<GrowthSnapshot[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  // Open on the current year; "all years" remains an explicit choice.
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [annualOpen, setAnnualOpen] = useState(false);
  const [annualYear, setAnnualYear] = useState(() => new Date().getFullYear());
  const [deletingAnnual, setDeletingAnnual] = useState<GrowthAnnualNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getGrowthTimeline()
      .then((rows) => { if (!cancelled) setSnapshots(rows); })
      .catch(() => { /* keep the previous curve */ })
      .finally(() => { if (!cancelled) setTimelineLoaded(true); });
    return () => { cancelled = true; };
  }, [version]);

  const years = useMemo(() => {
    const found = new Set<number>();
    found.add(new Date().getFullYear());
    for (const season of seasons) {
      found.add(Number(season.startDate.slice(0, 4)));
      found.add(Number(season.endDate.slice(0, 4)));
    }
    for (const artifact of artifacts) {
      const at = artifactDateKey(artifact);
      found.add(Number(at.slice(0, 4)));
    }
    for (const note of annualNotes) found.add(note.year);
    for (const snapshot of snapshots) found.add(Number(localDateFromStamp(snapshot.takenAt).slice(0, 4)));
    return [...found].filter((value) => Number.isFinite(value) && value > 1900).sort((a, b) => b - a);
  }, [seasons, artifacts, annualNotes, snapshots]);

  // Same shape as the season toolbar capsule: "all" is a real option, not an
  // empty placeholder, so the trigger never reads as muted.
  const yearOptions = useMemo(
    () => [
      { value: "all", label: t["growth.chronicle.all"] },
      ...years.map((value) => ({ value: String(value), label: String(value) })),
    ],
    [years, t],
  );

  const curve = useMemo(
    () => (year === null ? globalCurve(snapshots, 12) : yearCurve(snapshots, year)),
    [snapshots, year],
  );
  const latest = curve[curve.length - 1];
  const previous = curve[curve.length - 2];
  const delta =
    latest?.score !== null && latest?.score !== undefined &&
    previous?.score !== null && previous?.score !== undefined
      ? latest.score - previous.score
      : null;

  const shownSeasons = useMemo(
    () => seasons.filter((season) => seasonInYear(season, year)),
    [seasons, year],
  );
  // Poster numbering follows the season page: oldest first, across all seasons.
  const shownArtifacts = useMemo(() => {
    if (year === null) return artifacts;
    return artifacts.filter((artifact) => {
      const at = artifactDateKey(artifact);
      return at.slice(0, 4) === String(year);
    });
  }, [artifacts, year]);
  const shownNotes = useMemo(
    () => (year === null ? annualNotes : annualNotes.filter((note) => note.year === year)),
    [annualNotes, year],
  );

  // Year figures the annual page can show without any typing.
  const annualStats = useMemo<AnnualStats | null>(() => {
    if (year === null) return null;
    const scored = curve.filter((point) => point.score !== null);
    const firstScore = scored[0]?.score ?? null;
    const lastScore = scored[scored.length - 1]?.score ?? null;
    const yearArtifacts = artifacts.filter(
      (artifact) =>
        artifactDateKey(artifact).slice(0, 4) === String(year),
    );
    let upgrades = 0;
    const lastLevel = new Map<number, number>();
    for (const snapshot of snapshots) {
      const previousLevel = lastLevel.get(snapshot.capabilityId);
      if (
        previousLevel !== undefined &&
        snapshot.level > previousLevel &&
        localDateFromStamp(snapshot.takenAt).slice(0, 4) === String(year)
      ) {
        upgrades += 1;
      }
      lastLevel.set(snapshot.capabilityId, snapshot.level);
    }
    return {
      score: lastScore,
      delta: firstScore !== null && lastScore !== null ? lastScore - firstScore : null,
      seasons: seasons.filter((season) => seasonInYear(season, year)).length,
      artifacts: yearArtifacts.length,
      upgrades,
      highlights: [...yearArtifacts]
        .sort((a, b) =>
          (b.createdOn ?? b.createdAt).localeCompare(a.createdOn ?? a.createdAt),
        )
        .slice(0, 3)
        .map((artifact) => artifact.title),
    };
  }, [year, curve, artifacts, seasons, snapshots]);

  const openAnnual = (targetYear: number) => {
    setAnnualYear(targetYear);
    setAnnualOpen(true);
  };

  const confirmDeleteAnnual = async () => {
    if (!deletingAnnual) return;
    const target = deletingAnnual;
    try {
      await window.prism.deleteGrowthAnnualNote(target.year);
      setDeletingAnnual(null);
      if (annualYear === target.year) setAnnualOpen(false);
      onChanged();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const editingNote = annualNotes.find((note) => note.year === annualYear) ?? null;

  const isBlank =
    timelineLoaded &&
    snapshots.length === 0 &&
    seasons.length === 0 &&
    artifacts.length === 0 &&
    annualNotes.length === 0;

  const toolbar = useMemo(
    () => ({
      // A blank chronicle has nothing to filter or edit: keep both controls
      // out until the timeline has loaded and there is data on screen.
      actions:
        timelineLoaded && !isBlank ? (
          <>
            <SelectButton
              ariaLabel={`${t["growth.chronicle.year"]} · ${
                year === null ? t["growth.chronicle.all"] : year
              }`}
              variant="pill"
              className="w-28 flex-shrink-0"
              value={year === null ? "all" : String(year)}
              options={yearOptions}
              onChange={(value) => setYear(value === "all" ? null : Number(value))}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              title={t["growth.chronicle.editAnnual"]}
              aria-label={t["growth.chronicle.editAnnual"]}
              onClick={() => openAnnual(year ?? new Date().getFullYear())}
            >
              <Pencil size={15} />
            </Button>
          </>
        ) : undefined,
    }),
    [t, year, yearOptions, isBlank, timelineLoaded],
  );
  useToolbarContribution("growth:chronicle-actions", toolbar);

  if (!timelineLoaded) {
    return <SkeletonRows count={7} className="p-2" />;
  }

  if (isBlank) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <GrowthEmptyGuide
          icon={<Sprout size={22} />}
          eyebrow={t["growth.guide.eyebrow"]}
          title={t["growth.guide.chronicleTitle"]}
          description={t["growth.guide.chronicleDesc"]}
          steps={[
            {
              title: t["growth.guide.stepChronicleCapability"],
              description: t["growth.guide.stepChronicleCapabilityDesc"],
            },
            {
              title: t["growth.guide.stepChronicleSeason"],
              description: t["growth.guide.stepChronicleSeasonDesc"],
            },
            {
              title: t["growth.guide.stepChronicleAnnual"],
              description: t["growth.guide.stepChronicleAnnualDesc"],
            },
          ]}
          primary={{
            label: t["growth.guide.openCapabilities"],
            onClick: onOpenCapabilities,
          }}
          hint={t["growth.guide.chronicleHint"]}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {year !== null && (
        <div>
          <AnnualCard
            year={year}
            note={shownNotes[0] ?? null}
            stats={annualStats}
            featured
            onEdit={() => openAnnual(year)}
            onDelete={shownNotes[0] ? () => setDeletingAnnual(shownNotes[0]) : undefined}
          />
        </div>
      )}

      <section className="mt-3 first:mt-0 rounded-card border border-strong/40 bg-surface p-3">
        <header className="flex items-center gap-2">
          <span className="text-caption text-muted">
            {year === null
              ? t["growth.chronicle.curve"]
              : t["growth.chronicle.yearCurve"].replace("{year}", String(year))}
          </span>
          <span className="text-section font-semibold tabular-nums text-primary">
            {latest?.score == null ? "—" : Math.round(latest.score)}
          </span>
          {delta !== null && (
            <span className="text-caption tabular-nums text-secondary">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}
            </span>
          )}
          <span className="ml-auto text-caption text-faint">
            {t["growth.chronicle.curveCount"].replace("{count}", String(latest?.count ?? 0))}
          </span>
        </header>

        <GrowthCurveChart points={curve} seasons={seasons} />
        <p className="mt-1 text-caption text-faint">{t["growth.chronicle.curveHint"]}</p>
      </section>

      <section className="mt-4">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted">{t["growth.seasonHistory"]}</span>
          <span className="text-caption tabular-nums text-faint">{shownSeasons.length}</span>
          <span className="text-caption text-faint">{t["growth.chronicle.seasonHint"]}</span>
        </header>
        {shownSeasons.length === 0 ? (
          <EmptyState size="card" text={t["growth.chronicle.noSeasons"]} />
        ) : (
          <div className="motion-stagger space-y-2">
            {shownSeasons.map((season) => {
              // Numbered along the whole history, not just this year.
              const ordinal = seasonOrdinalOf(seasons, season.id);
              return (
                <div
                  key={season.id}
                  role="button"
                  tabIndex={0}
                  title={t["growth.chronicle.openSeason"]}
                  onClick={() => onOpenSeason(season.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenSeason(season.id);
                    }
                  }}
                  className="group cursor-pointer"
                >
                  <GrowthSeasonPoster
                    season={season}
                    ordinal={ordinal}
                    challenges={challenges}
                    expandable
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-4">
        <header className="mb-2 flex items-center gap-2">
          <span className="text-caption text-muted">{t["growth.artifacts"]}</span>
          <span className="text-caption text-faint tabular-nums">{shownArtifacts.length}</span>
        </header>
        {shownArtifacts.length === 0 ? (
          <EmptyState size="card" text={t["growth.emptyArtifacts"]} />
        ) : (
          <ul>
            {shownArtifacts.map((artifact) => (
              <li key={artifact.id}>
                <ItemRow
                  className="text-caption"
                  onPrimaryClick={() => onOpenArtifact(artifact)}
                  menuItems={[
                    ...(artifact.url
                      ? [{
                          label: t["growth.artifactOpenLink"],
                          icon: <ExternalLink size={14} />,
                          onClick: () => void window.prism.openUrl(artifact.url),
                        }]
                      : []),
                    {
                      label: t["menu.delete"],
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onClick: () => onDeleteArtifact(artifact),
                    },
                  ]}
                  leading={
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      {artifact.cover && (
                        <img
                          src={growthCoverUrl(artifact.cover)}
                          alt=""
                          className="h-6 w-10 rounded-control object-cover"
                        />
                      )}
                      <Badge
                        variant="outline"
                        className="flex-shrink-0"
                        style={{ color: "rgb(var(--c-faint))" }}
                      >
                        {t[ARTIFACT_KIND_KEYS[artifact.kind]]}
                      </Badge>
                    </span>
                  }
                  title={<span className="truncate text-caption text-secondary">{artifact.title}</span>}
                  meta={
                    <span className="flex flex-shrink-0 items-center gap-2 text-caption">
                      {artifact.capabilityName && (
                        <span className="flex-shrink-0 text-faint">{artifact.capabilityName}</span>
                      )}
                      <span className="flex-shrink-0 tabular-nums text-faint">
                        {artifactDateKey(artifact)}
                      </span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {year === null && (
        <section className="mt-4">
          <header className="mb-2 flex items-center gap-2">
            <span className="text-caption text-muted">{t["growth.chronicle.annual"]}</span>
            <span className="text-caption tabular-nums text-faint">{annualNotes.length}</span>
            <span className="text-caption text-faint">{t["growth.chronicle.annualHint"]}</span>
          </header>
          {annualNotes.length === 0 ? (
            <EmptyState size="card" text={t["growth.chronicle.emptyAnnualAll"]} />
          ) : (
            <div className="motion-stagger space-y-2">
              {annualNotes.map((note) => (
                <AnnualCard
                  key={note.id}
                  year={note.year}
                  note={note}
                  featured={false}
                  onEdit={() => openAnnual(note.year)}
                  onDelete={() => setDeletingAnnual(note)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <GrowthAnnualModal
        open={annualOpen}
        note={editingNote}
        year={annualYear}
        stats={year !== null && annualYear === year ? annualStats : null}
        onClose={() => setAnnualOpen(false)}
        onSaved={onChanged}
      />

      <ConfirmDialog
        open={deletingAnnual !== null}
        message={t["growth.deleteAnnualConfirm"]}
        onConfirm={confirmDeleteAnnual}
        onClose={() => setDeletingAnnual(null)}
      />
    </div>
  );
}
