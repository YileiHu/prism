import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Gauge } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import Badge from "../Badge";
import GlowBadge from "../GlowBadge";
import ItemRow from "../ItemRow";
import EmptyState from "../EmptyState";
import SectionCard from "../SectionCard";
import { SkeletonRows } from "../Skeleton";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type {
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
  GrowthEvidence,
  GrowthPrediction,
  GrowthSnapshot,
  GrowthTask,
  GrowthTasksPayload,
} from "../../shared/models";
import { capabilityDisplay, capabilityGap, levelGrade, selfAccuracy } from "../../lib/growth";
import { tagColor, type TagColorKey } from "../../lib/colors";
import { localDateFromStamp, localDateTimeFromStamp } from "../../lib/dates";
import {
  CHALLENGE_STATUS_KEYS,
  CONFIDENCE_NAME_KEYS,
  EVIDENCE_KIND_KEYS,
  LEVEL_NAME_KEYS,
  PREDICTION_KIND_COLORS,
  PREDICTION_KIND_KEYS,
} from "./labels";
import GrowthLevelBar from "./GrowthLevelBar";
import GrowthStars from "./GrowthStars";
import GrowthTaskRow from "./GrowthTaskRow";
import { useGrowthTaskActions } from "./useGrowthTaskActions";
import type { GrowthPredictionLink, GrowthTaskDefaults } from "./types";
import {
  ConfidenceBadge,
  HalfLifeBadge,
  PortabilityBadge,
  StatusBadge,
} from "./GrowthBadges";

interface Props {
  open: boolean;
  capability: GrowthCapability | null;
  domain: GrowthDomain | null;
  parentName: string | null;
  onClose: () => void;
  onEdit: () => void;
  onReview: () => void;
  onAddEvidence: () => void;
  onChanged: () => void;
  tasks: GrowthTasksPayload;
  challenges: GrowthChallenge[];
  predictions: GrowthPrediction[];
  onOpenTask: (task: GrowthTask) => void;
  onDeleteTask: (task: GrowthTask) => void;
  onNewTask: (defaults: GrowthTaskDefaults) => void;
  onPredictTask: (task: GrowthTask) => void;
  onNewPrediction: (link: GrowthPredictionLink) => void;
  onSettlePrediction: (prediction: GrowthPrediction) => void;
  onOpenChallenge: (challenge: GrowthChallenge) => void;
  onTaskToggled: (task: GrowthTask, action: "completed" | "reopened") => void;
}

function formatStamp(value: string): string {
  return localDateTimeFromStamp(value);
}

export default function GrowthCapabilityCard({
  open,
  capability,
  domain,
  parentName,
  onClose,
  onEdit,
  onReview,
  onAddEvidence,
  onChanged,
  tasks,
  challenges,
  predictions,
  onOpenTask,
  onDeleteTask,
  onNewTask,
  onPredictTask,
  onNewPrediction,
  onSettlePrediction,
  onOpenChallenge,
  onTaskToggled,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { togglingIds, toggle } = useGrowthTaskActions(onChanged, onTaskToggled);
  const [evidence, setEvidence] = useState<GrowthEvidence[]>([]);
  const [snapshots, setSnapshots] = useState<GrowthSnapshot[]>([]);
  const [deletingEvidence, setDeletingEvidence] = useState<GrowthEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  // Wide: both panes stay put and each list scrolls inside its own well.
  // Narrow: the document body scrolls normally.
  const twoColumn = width >= 900;
  const gridLists = twoColumn && width >= 1000;

  const capabilityId = capability?.id ?? null;

  // Switching capability must not show the previous one's rows while the new
  // ones load.
  useEffect(() => {
    setEvidence([]);
    setSnapshots([]);
    if (capabilityId !== null) setLoading(true);
  }, [capabilityId]);

  useEffect(() => {
    if (!open || capabilityId === null) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      window.prism.listGrowthEvidence(capabilityId),
      window.prism.listGrowthSnapshots(capabilityId),
    ])
      .then(([rows, history]) => {
        if (cancelled) return;
        setEvidence(rows);
        setSnapshots(history);
      })
      .catch(() => { /* keep the previous lists */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, capabilityId, capability?.level, capability?.confidence, capability?.evidenceCount]);

  const confirmRemoveEvidence = async () => {
    if (!deletingEvidence) return;
    const target = deletingEvidence;
    try {
      await window.prism.deleteGrowthEvidence(target.id);
      setEvidence((rows) => rows.filter((row) => row.id !== target.id));
      setDeletingEvidence(null);
      onChanged();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const display = capability ? capabilityDisplay(capability) : null;
  const gap = capability ? capabilityGap(capability) : null;
  const relatedOpenAll = capability
    ? tasks.open.filter((task) => task.capability?.id === capability.id)
    : [];
  const relatedDoneAll = capability
    ? tasks.completed.filter((task) => task.capability?.id === capability.id)
    : [];
  const relatedOpen = relatedOpenAll.slice(0, 10);
  const relatedDone = relatedDoneAll.slice(0, 10);
  const relatedCount = relatedOpenAll.length + relatedDoneAll.length;
  const relatedChallenges = capability
    ? challenges.filter((challenge) => challenge.capabilityId === capability.id)
    : [];
  const openChallenges = relatedChallenges.filter((challenge) => challenge.status === "open");
  const resolvedChallenges = relatedChallenges
    .filter((challenge) => challenge.status !== "open")
    .sort((a, b) => (b.resolvedOn ?? "").localeCompare(a.resolvedOn ?? ""))
    .slice(0, 3);
  const visibleChallenges = [...openChallenges.slice(0, 3), ...resolvedChallenges];
  const relatedPredictions = capability
    ? predictions.filter((prediction) => prediction.capability?.id === capability.id)
    : [];
  const pendingPredictions = relatedPredictions.filter((prediction) => prediction.actual === null);
  const settledRelated = relatedPredictions
    .filter((prediction) => prediction.actual !== null)
    .slice(0, 3);
  const scopedAccuracy = selfAccuracy(relatedPredictions);
  const targetLabel = capability
    ? capability.targetLevel === null
      ? t["growth.targetNone"]
      : `${levelGrade(capability.targetLevel)} ${
          t[LEVEL_NAME_KEYS[capability.targetLevel - 1]]
        }${capability.targetDate ? ` · ${capability.targetDate}` : ""}`
    : "";
  const gapLabel = gap === null ? "—" : gap > 0 ? `+${gap}` : String(gap);
  const lastEvidenceLabel = capability?.lastEvidenceAt
    ? localDateFromStamp(capability.lastEvidenceAt)
    : "—";
  const countsLabel = t["growth.capability.counts"]
    .replace("{challenges}", String(relatedChallenges.length))
    .replace("{tasks}", String(relatedCount))
    .replace("{predictions}", String(relatedPredictions.length));

  if (!capability || !display) return null;

  const listClass = twoColumn
    ? gridLists
      ? ""
      : "flex-1"
    : "max-h-[300px] flex-shrink-0";

  const snapshotRows = (
    <>
      {loading && snapshots.length === 0 ? (
        <SkeletonRows count={3} />
      ) : snapshots.length === 0 ? (
        <EmptyState size="card" text={t["growth.emptySnapshots"]} />
      ) : (
        <div>
          {snapshots.map((row) => (
            <ItemRow
              key={row.id}
              leading={
                <span className="w-24 flex-shrink-0 text-caption tabular-nums text-faint">
                  {formatStamp(row.takenAt)}
                </span>
              }
              title={
                <span className="truncate">
                  {row.note || `${levelGrade(row.level)} ${t[LEVEL_NAME_KEYS[row.level - 1]]}`}
                </span>
              }
              meta={
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  <ConfidenceBadge confidence={row.confidence} />
                  <GrowthLevelBar level={row.level} />
                </span>
              }
            />
          ))}
        </div>
      )}
    </>
  );

  const definitionCard =
    capability.evidenceDefinition || capability.notes ? (
      <SectionCard
        title={t["growth.capability.definitionNotes"]}
        className="flex-shrink-0"
        bodyClassName="max-h-[140px] overflow-y-auto p-3 space-y-2"
      >
        {capability.evidenceDefinition && (
          <div>
            <span className="field-label">{t["growth.evidenceDefinition"]}</span>
            <p className="whitespace-pre-wrap text-body leading-relaxed text-secondary">
              {capability.evidenceDefinition}
            </p>
          </div>
        )}
        {capability.notes && (
          <div>
            <span className="field-label">{t["growth.notes"]}</span>
            <p className="whitespace-pre-wrap text-body leading-relaxed text-secondary">
              {capability.notes}
            </p>
          </div>
        )}
      </SectionCard>
    ) : null;

  const summaryCard = (
    <SectionCard
      title={domain?.name ?? t["growth.capability.summary"]}
      count={countsLabel}
      tintColor={domain ? tagColor(domain.theme as TagColorKey) : undefined}
      className="flex-shrink-0"
      bodyClassName="p-3 space-y-3"
    >
      {(parentName || capability.status !== "active" || display.stale) && (
        <div className="flex flex-wrap items-center gap-2">
          {parentName && (
            <span className="min-w-0 truncate text-caption text-faint">
              {t["growth.parent"]} · {parentName}
            </span>
          )}
          {capability.status !== "active" && <StatusBadge value={capability.status} />}
          {display.stale && capability.status !== "archived" && (
            <GlowBadge tone="warning" intensity={0.45}>
              {t["growth.staleShort"]}
            </GlowBadge>
          )}
        </div>
      )}

      {capability.status === "archived" && (
        <p className="text-caption text-faint">{t["growth.archivedHint"]}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="space-y-1.5">
            <GrowthLevelBar
              size="lg"
              level={capability.level}
              band={display.band}
              targetLevel={capability.targetLevel}
              showScale
            />
            <div className="flex items-baseline gap-2">
              <span className="text-body font-medium text-primary">
                {levelGrade(capability.level)} {t[LEVEL_NAME_KEYS[capability.level - 1]]}
              </span>
              <span className="text-caption tabular-nums text-muted">
                {display.score}
                {display.band === null ? "" : ` ±${display.band}`}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="field-label">{t["growth.target"]}</span>
              <span className="block text-caption text-secondary">{targetLabel}</span>
            </div>
            <div>
              <span className="field-label">{t["growth.gap"]}</span>
              <span className="block text-caption tabular-nums text-secondary">
                {gapLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge
              confidence={display.effectiveConfidence}
              band={display.band}
            />
            <GrowthStars
              value={display.effectiveConfidence}
              title={t[CONFIDENCE_NAME_KEYS[display.effectiveConfidence]]}
            />
            <span className="text-caption text-secondary">
              {t[CONFIDENCE_NAME_KEYS[display.effectiveConfidence]]}
            </span>
          </div>
          {display.neverEvidenced ? (
            <p className="text-caption text-faint">
              {t["growth.confidenceNeverEvidenced"]}
            </p>
          ) : display.decayed ? (
            <p className="text-caption text-warning">
              {t["growth.confidenceDecayed"].replace("{from}", String(capability.confidence))}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <HalfLifeBadge value={capability.halfLife} />
            <PortabilityBadge value={capability.portability} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-faint">
            <span>
              {t["growth.evidence"]}{" "}
              <span className="tabular-nums text-secondary">
                {capability.evidenceCount}
              </span>
            </span>
            <span>
              {t["growth.lastEvidence"]}{" "}
              <span className="tabular-nums text-secondary">{lastEvidenceLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const challengesList = (
    <SectionCard
      title={t["growth.capability.challenges"]}
      count={relatedChallenges.length}
      tintColor={tagColor("violet")}
      className={`flex min-h-0 flex-col ${listClass}`}
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-2"
    >
      {visibleChallenges.length === 0 ? (
        <EmptyState size="card" text={t["growth.capability.noChallenges"]} />
      ) : (
        <div>
          {visibleChallenges.map((challenge) => (
            <ItemRow
              key={challenge.id}
              onPrimaryClick={() => onOpenChallenge(challenge)}
              leading={
                <Badge variant="outline" className="flex-shrink-0">
                  {levelGrade(challenge.difficultyLevel)}
                </Badge>
              }
              title={
                <span
                  className={`truncate ${
                    challenge.status === "open" ? "text-primary" : "text-secondary"
                  }`}
                >
                  {challenge.title}
                </span>
              }
              meta={
                <span className="flex-shrink-0 text-caption text-faint">
                  {t[CHALLENGE_STATUS_KEYS[challenge.status]]}
                  {challenge.resolvedOn ? ` · ${challenge.resolvedOn}` : ""}
                </span>
              }
            />
          ))}
        </div>
      )}
    </SectionCard>
  );

  const tasksList = (
    <SectionCard
      title={t["growth.tasks.related"]}
      count={relatedCount}
      tintColor={tagColor("green")}
      className={`flex min-h-0 flex-col ${listClass}`}
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-2"
      headerActions={
        <Button
          variant="ghost"
          size="icon-xs"
          title={t["growth.tasks.new"]}
          aria-label={t["growth.tasks.new"]}
          onClick={() => onNewTask({ capabilityId: capability.id })}
        >
          <Plus size={14} />
        </Button>
      }
    >
      {relatedCount === 0 ? (
        <EmptyState size="card" text={t["growth.tasks.relatedEmpty"]} />
      ) : (
        <div>
          {[...relatedOpen, ...relatedDone].map((task) => (
            <GrowthTaskRow
              key={task.id}
              task={task}
              showCompletedDate
              toggling={togglingIds.has(task.id)}
              onOpen={() => onOpenTask(task)}
              onToggle={() => void toggle(task)}
              onDelete={() => onDeleteTask(task)}
              onPredict={() => onPredictTask(task)}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );

  const predictionsList = (
    <SectionCard
      title={t["growth.capability.predictions"]}
      count={relatedPredictions.length}
      tintColor={tagColor("blue")}
      className={`flex min-h-0 flex-col ${listClass}`}
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-2"
      headerActions={
        <Button
          variant="ghost"
          size="icon-xs"
          title={t["growth.predictionAdd"]}
          aria-label={t["growth.predictionAdd"]}
          onClick={() => onNewPrediction({ capabilityId: capability.id })}
        >
          <Plus size={14} />
        </Button>
      }
    >
      <p className="px-1 pb-1 text-caption text-faint">
        {t["growth.capability.accuracy"]} ·{" "}
        <span className="tabular-nums text-secondary">
          {scopedAccuracy.score === null ? "—" : scopedAccuracy.score}
        </span>
        {" · "}
        {t["growth.accuracyCount"].replace("{count}", String(scopedAccuracy.count))}
      </p>
      {relatedPredictions.length === 0 ? (
        <EmptyState size="card" text={t["growth.capability.noPredictions"]} />
      ) : (
        <div>
          {pendingPredictions.slice(0, 3).map((row) => (
            <ItemRow
              key={row.id}
              tooltip={row.note || undefined}
              leading={
                <Badge palette={tagColor(PREDICTION_KIND_COLORS[row.kind])}>
                  {t[PREDICTION_KIND_KEYS[row.kind]]}
                </Badge>
              }
              title={row.subject}
              meta={
                <span className="flex-shrink-0 text-caption tabular-nums text-faint">
                  {t["growth.predictionExpected"]} {row.predicted} · {row.predictedOn}
                </span>
              }
              onPrimaryClick={() => onSettlePrediction(row)}
            />
          ))}
          {settledRelated.map((row) => (
            <ItemRow
              key={row.id}
              tooltip={row.note || undefined}
              leading={
                <Badge palette={tagColor(PREDICTION_KIND_COLORS[row.kind])}>
                  {t[PREDICTION_KIND_KEYS[row.kind]]}
                </Badge>
              }
              title={row.subject}
              meta={
                <span className="flex-shrink-0 text-caption tabular-nums text-faint">
                  {row.predicted} → {row.actual} · {row.predictedOn}
                </span>
              }
            />
          ))}
        </div>
      )}
    </SectionCard>
  );

  const evidenceList = (
    <SectionCard
      title={t["growth.evidence"]}
      count={evidence.length}
      tintColor={tagColor("gold")}
      className={`flex min-h-0 flex-col ${listClass}`}
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-2"
      headerActions={
        <Button
          variant="ghost"
          size="icon-xs"
          title={t["growth.addEvidence"]}
          aria-label={t["growth.addEvidence"]}
          onClick={onAddEvidence}
        >
          <Plus size={14} />
        </Button>
      }
    >
      {loading && evidence.length === 0 ? (
        <SkeletonRows count={3} />
      ) : evidence.length === 0 ? (
        <EmptyState size="card" text={t["growth.emptyEvidence"]} />
      ) : (
        <div>
          {evidence.map((row) => (
            <ItemRow
              key={row.id}
              multiline
              leading={
                <Badge variant="neutral" className="flex-shrink-0">
                  {t[EVIDENCE_KIND_KEYS[row.kind]]}
                </Badge>
              }
              title={
                <>
                  <span className="block">{row.title}</span>
                  {row.detail && (
                    <span className="mt-0.5 block text-caption text-faint">{row.detail}</span>
                  )}
                </>
              }
              meta={
                <span className="flex-shrink-0 text-caption tabular-nums text-faint">
                  {row.happenedOn ?? localDateFromStamp(row.createdAt)}
                </span>
              }
              menuItems={[
                {
                  label: t["menu.delete"],
                  icon: <Trash2 size={14} />,
                  danger: true,
                  onClick: () => setDeletingEvidence(row),
                },
              ]}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={capability.name}
      layout="document"
      position="center"
      headerActions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.edit"]}
            aria-label={t["growth.edit"]}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.review"]}
            aria-label={t["growth.review"]}
            onClick={onReview}
          >
            <Gauge size={15} />
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${twoColumn ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        <div
          className={
            twoColumn
              ? "grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)_380px] gap-6"
              : "flex flex-col gap-5"
          }
        >
          <div
            className={
              twoColumn ? "flex min-h-0 flex-col gap-3" : "flex flex-col gap-4"
            }
          >
            {summaryCard}

            {definitionCard}

            <div
              className={
                twoColumn
                  ? gridLists
                    ? "grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3"
                    : "flex min-h-0 flex-1 flex-col gap-3"
                  : "flex flex-col gap-3"
              }
            >
              {challengesList}
              {tasksList}
              {predictionsList}
              {evidenceList}
            </div>
          </div>

          <aside
            className={`surface-inset flex min-h-0 flex-col rounded-card border p-2 ${
              twoColumn ? "h-full" : "h-[300px] flex-shrink-0"
            }`}
          >
            <header className="flex flex-shrink-0 items-center gap-2 px-1 pb-2">
              <span className="text-caption text-muted">{t["growth.snapshotHistory"]}</span>
              <span className="text-caption tabular-nums text-faint">{snapshots.length}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">{snapshotRows}</div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={deletingEvidence !== null}
        message={t["growth.deleteEvidenceConfirm"]}
        onConfirm={confirmRemoveEvidence}
        onClose={() => setDeletingEvidence(null)}
      />
    </Modal>
  );
}
