import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Flag,
  Pencil,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import Button from "../Button";
import Badge from "../Badge";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import SegmentedToggle from "../SegmentedToggle";
import SelectButton from "../SelectButton";
import { useToolbarContribution } from "../toolbar/ToolbarProvider";
import ConfirmDialog from "../ConfirmDialog";
import GrowthEmptyGuide from "./GrowthEmptyGuide";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import {
  artifactDateForSeason,
  challengeHasContent,
  levelGrade,
  plainTextExcerpt,
  seasonArtifacts as seasonArtifactsFor,
  seasonOrdinalOf,
  seasonTimeline,
} from "../../lib/growth";
import GrowthSeasonPoster from "./GrowthSeasonPoster";
import GrowthArtifactCard from "./GrowthArtifactCard";
import GrowthChallengeDetail from "./GrowthChallengeDetail";
import type {
  GrowthArtifact,
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
  GrowthPrediction,
  GrowthResolveResult,
  GrowthSeason,
  GrowthTask,
  GrowthTasksPayload,
} from "../../shared/models";
import type { GrowthPredictionLink, GrowthArtifactDefaults, GrowthTaskDefaults } from "./types";
import { CHALLENGE_STATUS_KEYS } from "./labels";
import { ChallengeStatusIcon } from "./GrowthBadges";
import GrowthChallengeModal from "./GrowthChallengeModal";
import GrowthResolveModal from "./GrowthResolveModal";
import GrowthSeasonModal from "./GrowthSeasonModal";
import GrowthSeasonCloseModal from "./GrowthSeasonCloseModal";

interface Props {
  seasons: GrowthSeason[];
  challenges: GrowthChallenge[];
  artifacts: GrowthArtifact[];
  capabilities: GrowthCapability[];
  domains: GrowthDomain[];
  tasks: GrowthTasksPayload;
  predictions: GrowthPrediction[];
  /** Season to open on mount, e.g. jumping in from the chronicle chapters. */
  focusSeasonId?: number | null;
  /** Challenge to open on mount, e.g. jumping in from a capability detail. */
  openChallengeId?: number | null;
  onChallengeOpened?: () => void;
  onChanged: () => void;
  onOpenTask: (task: GrowthTask) => void;
  onNewTask: (defaults: GrowthTaskDefaults) => void;
  onPredictTask: (task: GrowthTask) => void;
  onNewPrediction: (link: GrowthPredictionLink) => void;
  onSettlePrediction: (prediction: GrowthPrediction) => void;
  onDeleteTask: (task: GrowthTask) => void;
  onTaskToggled: (task: GrowthTask, action: "completed" | "reopened") => void;
  onOpenCapability: (capabilityId: number) => void;
  onOpenArtifact: (artifact: GrowthArtifact) => void;
  onEditArtifact: (artifact: GrowthArtifact) => void;
  onNewArtifact: (defaults?: GrowthArtifactDefaults) => void;
  onDeleteArtifact: (artifact: GrowthArtifact) => void;
}

export default function GrowthChallengeBoard({
  seasons,
  challenges,
  artifacts,
  capabilities,
  domains,
  tasks,
  predictions,
  focusSeasonId = null,
  openChallengeId = null,
  onChallengeOpened,
  onChanged,
  onOpenTask,
  onNewTask,
  onPredictTask,
  onNewPrediction,
  onSettlePrediction,
  onDeleteTask,
  onTaskToggled,
  onOpenCapability,
  onOpenArtifact,
  onEditArtifact,
  onNewArtifact,
  onDeleteArtifact,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [challengeModal, setChallengeModal] = useState<{ open: boolean; challenge: GrowthChallenge | null }>({
    open: false,
    challenge: null,
  });
  const [resolveTarget, setResolveTarget] = useState<GrowthChallenge | null>(null);
  const [detail, setDetail] = useState<GrowthChallenge | null>(null);
  const [seasonModal, setSeasonModal] = useState<{ open: boolean; season: GrowthSeason | null }>({
    open: false,
    season: null,
  });
  const [seasonCloseTarget, setSeasonCloseTarget] = useState<GrowthSeason | null>(null);
  const [deletingChallenge, setDeletingChallenge] = useState<GrowthChallenge | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("all");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(focusSeasonId);

  const seasonHistory = useMemo(() => seasonTimeline(seasons), [seasons]);
  const currentSeason = useMemo(
    () => seasons.find((season) => season.closedAt === null) ?? null,
    [seasons],
  );
  // Picking a season keeps its poster (and memory) on screen even after it ends.
  const activeSeason = useMemo(
    () =>
      seasons.find((season) => season.id === selectedSeasonId) ??
      currentSeason ??
      seasonHistory[seasonHistory.length - 1] ??
      null,
    [seasons, selectedSeasonId, currentSeason, seasonHistory],
  );
  const seasonChallenges = useMemo(
    () =>
      activeSeason ? challenges.filter((item) => item.seasonId === activeSeason.id) : challenges,
    [challenges, activeSeason],
  );
  const seasonArtifacts = useMemo(
    () => (activeSeason ? seasonArtifactsFor(artifacts, challenges, activeSeason) : artifacts),
    [artifacts, challenges, activeSeason],
  );
  const seasonOrdinal = useMemo(
    () => seasonOrdinalOf(seasons, activeSeason?.id ?? null) || 1,
    [seasons, activeSeason],
  );
  // Newest first in the toolbar select: the running season is the one people
  // jump back to, and the past ones read as history below it.
  const seasonSelectOptions = useMemo(
    () =>
      seasonHistory
        .map((season, index) => ({ value: String(season.id), label: `S${index + 1} · ${season.title}` }))
        .reverse(),
    [seasonHistory],
  );
  // A settled season has nothing left to act on: the list is always the full
  // record and the filter control is not shown at all.
  const filterLocked = activeSeason !== null && activeSeason.closedAt !== null;
  const effectiveFilter = filterLocked ? "all" : filter;
  const visibleChallenges = useMemo(
    () =>
      effectiveFilter === "open"
        ? seasonChallenges.filter((item) => item.status === "open")
        : seasonChallenges,
    [seasonChallenges, effectiveFilter],
  );
  const openCount = seasonChallenges.filter((item) => item.status === "open").length;

  // The challenge list defaults to the full record; "进行中" is a narrowing
  // the user opts into. Finished seasons always show everything.
  useEffect(() => {
    if (!activeSeason) return;
    setFilter("all");
  }, [activeSeason?.id, activeSeason?.closedAt]);

  // Jumped in from the chronicle: show that season's poster straight away.
  useEffect(() => {
    if (focusSeasonId !== null) setSelectedSeasonId(focusSeasonId);
  }, [focusSeasonId]);

  // Jumped in from a capability detail: open that challenge straight away.
  useEffect(() => {
    if (openChallengeId === null) return;
    const target = challenges.find((challenge) => challenge.id === openChallengeId);
    if (target) {
      setSelectedSeasonId(target.seasonId);
      setDetail(target);
    }
    onChallengeOpened?.();
  }, [openChallengeId, challenges, onChallengeOpened]);

  // Season actions live in the module toolbar; the board owns them because it
  // owns the selected season. GrowthView merges this into its own contribution.
  const seasonToolbarActions = useMemo(
    () => (
      <>
        {seasons.length > 1 && (
          <SelectButton
            className="w-56 flex-shrink-0"
            variant="pill"
            align="right"
            value={String(activeSeason?.id ?? "")}
            options={seasonSelectOptions}
            onChange={(value) => setSelectedSeasonId(Number(value))}
            placeholder={t["growth.season.switcher"]}
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={t["growth.newSeason"]}
          aria-label={t["growth.newSeason"]}
          onClick={() => setSeasonModal({ open: true, season: null })}
        >
          <Plus size={15} />
        </Button>
        {activeSeason && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.editSeason"]}
            aria-label={t["growth.editSeason"]}
            onClick={() => setSeasonModal({ open: true, season: activeSeason })}
          >
            <Pencil size={15} />
          </Button>
        )}
        {activeSeason && activeSeason.closedAt === null && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.seasonClose"]}
            aria-label={t["growth.seasonClose"]}
            onClick={() => setSeasonCloseTarget(activeSeason)}
          >
            <Flag size={15} />
          </Button>
        )}
      </>
    ),
    [activeSeason, seasonSelectOptions, seasons.length, t],
  );
  const seasonToolbarContribution = useMemo(
    () => ({ actions: seasonToolbarActions }),
    [seasonToolbarActions],
  );
  useToolbarContribution("growth:challenge-actions", seasonToolbarContribution);

  const handleResolved = (result: GrowthResolveResult) => {
    if (result.capability && result.snapshot) {
      const cap = result.capability;
      showToast(
        t["growth.challengePassedToast"]
          .replace("{name}", cap.name)
          .replace("{level}", levelGrade(cap.level)),
      );
    } else {
      showToast(t["growth.challengeRecordedToast"]);
    }
    setDetail(result.challenge);
    onChanged();
  };

  const removeChallenge = async () => {
    if (!deletingChallenge) return;
    try {
      await window.prism.deleteGrowthChallenge(deletingChallenge.id);
      onChanged();
      setDeletingChallenge(null);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const openEdit = (challenge: GrowthChallenge) => {
    setChallengeModal({ open: true, challenge });
  };

  const openResolve = (challenge: GrowthChallenge) => {
    setResolveTarget(challenge);
  };

  const addWork = () => {
    onNewArtifact({ createdOn: artifactDateForSeason(activeSeason) });
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {activeSeason ? (
        <GrowthSeasonPoster
          season={activeSeason}
          ordinal={seasonOrdinal}
          challenges={challenges}
          onNewChallenge={() => setChallengeModal({ open: true, challenge: null })}
          onOpenChallenge={(challenge) => setDetail(challenge)}
        />
      ) : (
        <GrowthEmptyGuide
          className="py-6"
          icon={<Trophy size={22} />}
          eyebrow={t["growth.guide.eyebrow"]}
          title={t["growth.poster.noSeason"]}
          description={t["growth.poster.noSeasonHint"]}
          steps={[
            { title: t["growth.guide.stepSeason"], description: t["growth.guide.stepSeasonDesc"] },
            {
              title: t["growth.guide.stepChallengeSeason"],
              description: t["growth.guide.stepChallengeSeasonDesc"],
            },
            {
              title: t["growth.guide.stepChallengeResult"],
              description: t["growth.guide.stepChallengeResultDesc"],
            },
          ]}
          primary={{
            label: t["growth.newSeason"],
            onClick: () => setSeasonModal({ open: true, season: null }),
            icon: <Plus size={12} />,
          }}
          hint={t["growth.guide.seasonHint"]}
        />
      )}

      {activeSeason && (
        <section className="mt-4">
          <header className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-caption text-muted">{t["growth.challenges"]}</span>
            <span className="max-w-[220px] truncate text-caption text-faint">
              · {activeSeason.title}
            </span>
            {!filterLocked && (
              <span className="text-caption text-faint tabular-nums">
                {t["growth.challengeOpenCount"].replace("{count}", String(openCount))}
              </span>
            )}
            {!filterLocked && (
              <SegmentedToggle
                value={filter}
                options={[
                  { value: "all", label: t["growth.filter.all"] },
                  { value: "open", label: t["growth.challengeStatus.open"] },
                ]}
                onChange={(value) => setFilter(value as "open" | "all")}
              />
            )}
            <Button
              variant="secondary"
              size="xs"
              className="ml-auto"
              onClick={() => setChallengeModal({ open: true, challenge: null })}
            >
              <Plus size={12} />
              {t["growth.addChallenge"]}
            </Button>
          </header>

          {visibleChallenges.length === 0 ? (
            <GrowthEmptyGuide
              className="py-6"
              icon={<Trophy size={20} />}
              title={t["growth.emptyChallenges"]}
              description={t["growth.guide.emptyChallengesDesc"]}
              steps={[
                {
                  title: t["growth.guide.stepChallengeCapability"],
                  description: t["growth.guide.stepChallengeCapabilityDesc"],
                },
                {
                  title: t["growth.guide.stepChallengeDifficulty"],
                  description: t["growth.guide.stepChallengeDifficultyDesc"],
                },
                {
                  title: t["growth.guide.stepChallengePass"],
                  description: t["growth.guide.stepChallengePassDesc"],
                },
              ]}
              primary={{
                label: t["growth.addChallenge"],
                onClick: () => setChallengeModal({ open: true, challenge: null }),
                icon: <Plus size={12} />,
              }}
            />
          ) : (
            <div className="motion-stagger">
              {visibleChallenges.map((challenge) => {
                const excerpt =
                  challenge.description.trim() || plainTextExcerpt(challenge.body, 100);
                const works = artifacts.filter((artifact) => artifact.challengeId === challenge.id);
                return (
                  <ItemRow
                    key={challenge.id}
                    multiline
                    onPrimaryClick={() => setDetail(challenge)}
                    leading={<span className="mt-0.5 flex-shrink-0"><ChallengeStatusIcon value={challenge.status} /></span>}
                    title={
                      <span className="block">
                        <span
                          className={`block truncate ${
                            challenge.status === "open" ? "text-primary" : "text-secondary"
                          }`}
                        >
                          {challenge.title}
                        </span>
                        {excerpt && (
                          <span className="mt-0.5 line-clamp-2 block text-caption text-faint">
                            {excerpt}
                          </span>
                        )}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-faint">
                          <span className="tabular-nums">{levelGrade(challenge.difficultyLevel)}</span>
                          {challenge.capabilityName && (
                            <span className="truncate">{challenge.capabilityName}</span>
                          )}
                          <span>{t[CHALLENGE_STATUS_KEYS[challenge.status]]}</span>
                          {challenge.resolvedOn && (
                            <span className="tabular-nums">{challenge.resolvedOn}</span>
                          )}
                          {works.length > 0 && (
                            <span className="tabular-nums">{t["growth.challengeWorkCount"].replace("{count}", String(works.length))}</span>
                          )}
                          {!challengeHasContent(challenge) && (
                            <Badge variant="outline" className="text-warning">
                              {t["growth.challengeNeedsContent"]}
                            </Badge>
                          )}
                        </span>
                      </span>
                    }
                    menuItems={
                      challenge.status === "open"
                        ? [
                            {
                              label: t["growth.challengeResolve"],
                              icon: <CheckCircle2 size={14} />,
                              onClick: () => openResolve(challenge),
                            },
                            {
                              label: t["growth.edit"],
                              icon: <Pencil size={14} />,
                              onClick: () => openEdit(challenge),
                            },
                            {
                              label: t["menu.delete"],
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onClick: () => setDeletingChallenge(challenge),
                            },
                          ]
                        : [
                            {
                              label: t["growth.edit"],
                              icon: <Pencil size={14} />,
                              onClick: () => openEdit(challenge),
                            },
                            {
                              label: t["menu.delete"],
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onClick: () => setDeletingChallenge(challenge),
                            },
                          ]
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeSeason && (
        <section className="mt-5">
          <header className="mb-2 flex items-center gap-2">
            <span className="text-caption text-muted">{t["growth.artifacts"]}</span>
            <span className="text-caption tabular-nums text-faint">{seasonArtifacts.length}</span>
            <Button variant="secondary" size="xs" className="ml-auto" onClick={addWork}>
              <Plus size={12} />
              {t["growth.newArtifact"]}
            </Button>
          </header>

          {seasonArtifacts.length === 0 ? (
            <EmptyState size="card" text={t["growth.emptyArtifacts"]} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {seasonArtifacts.map((artifact) => (
                <GrowthArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  onOpen={onOpenArtifact}
                  onEdit={onEditArtifact}
                  onDelete={onDeleteArtifact}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <GrowthChallengeModal
        open={challengeModal.open}
        challenge={challengeModal.challenge}
        capabilities={capabilities}
        domains={domains}
        seasons={seasons}
        defaultSeasonId={activeSeason?.id ?? currentSeason?.id ?? null}
        onClose={() => setChallengeModal({ open: false, challenge: null })}
        onSaved={(saved) => {
          setDetail((current) => (current?.id === saved.id ? saved : current));
          onChanged();
        }}
      />

      <GrowthChallengeDetail
        open={detail !== null}
        challenge={detail}
        artifacts={artifacts}
        tasks={[...tasks.open, ...tasks.completed]}
        predictions={predictions}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        onResolve={openResolve}
        onOpenArtifact={onOpenArtifact}
        onOpenTask={onOpenTask}
        onDeleteTask={onDeleteTask}
        onNewTask={onNewTask}
        onPredictTask={onPredictTask}
        onNewPrediction={onNewPrediction}
        onSettlePrediction={onSettlePrediction}
        onTaskToggled={onTaskToggled}
        onOpenCapability={onOpenCapability}
        onUpdated={setDetail}
        onChanged={onChanged}
      />

      <GrowthResolveModal
        open={resolveTarget !== null}
        challenge={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onResolved={handleResolved}
      />

      <GrowthSeasonModal
        open={seasonModal.open}
        season={seasonModal.season}
        onClose={() => setSeasonModal({ open: false, season: null })}
        onSaved={() => {
          // A new season becomes the current one; leave any historical season
          // the user was browsing so the result is visible.
          if (seasonModal.season === null) setSelectedSeasonId(null);
          onChanged();
        }}
      />

      <GrowthSeasonCloseModal
        open={seasonCloseTarget !== null}
        season={seasonCloseTarget}
        onClose={() => setSeasonCloseTarget(null)}
        onSaved={onChanged}
      />

      <ConfirmDialog
        open={deletingChallenge !== null}
        message={t["growth.deleteChallengeConfirm"]}
        onConfirm={removeChallenge}
        onClose={() => setDeletingChallenge(null)}
      />
    </div>
  );
}
