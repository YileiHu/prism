import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Loader2, Plus, Pencil } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Badge from "../Badge";
import ItemRow from "../ItemRow";
import EmptyState from "../EmptyState";
import { Textarea } from "../Input";
import SectionCard from "../SectionCard";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { growthCoverUrl, levelGrade, selfAccuracy } from "../../lib/growth";
import { tagColor } from "../../lib/colors";
import { localDateFromStamp } from "../../lib/dates";
import type {
  GrowthArtifact,
  GrowthChallenge,
  GrowthPrediction,
  GrowthTask,
} from "../../shared/models";
import {
  ARTIFACT_KIND_KEYS,
  ATTRIBUTION_KEYS,
  CHALLENGE_STATUS_KEYS,
  PREDICTION_KIND_COLORS,
  PREDICTION_KIND_KEYS,
} from "./labels";
import type { GrowthPredictionLink, GrowthTaskDefaults } from "./types";
import GrowthTaskRow from "./GrowthTaskRow";
import { ChallengeStatusIcon } from "./GrowthBadges";
import { useGrowthTaskActions } from "./useGrowthTaskActions";

const GrowthMarkdown = lazy(() => import("./GrowthMarkdown"));

interface Props {
  open: boolean;
  challenge: GrowthChallenge | null;
  /** All works, filtered here to the ones this challenge produced. */
  artifacts: GrowthArtifact[];
  /** All tasks, filtered here to this challenge's steps. */
  tasks: GrowthTask[];
  /** All forecasts; the ones about this challenge or its tasks are shown. */
  predictions: GrowthPrediction[];
  onClose: () => void;
  onEdit: (challenge: GrowthChallenge) => void;
  onResolve: (challenge: GrowthChallenge) => void;
  onOpenArtifact: (artifact: GrowthArtifact) => void;
  onOpenTask: (task: GrowthTask) => void;
  onDeleteTask: (task: GrowthTask) => void;
  onNewTask: (defaults: GrowthTaskDefaults) => void;
  onPredictTask: (task: GrowthTask) => void;
  onNewPrediction: (link: GrowthPredictionLink) => void;
  onSettlePrediction: (prediction: GrowthPrediction) => void;
  onTaskToggled: (task: GrowthTask, action: "completed" | "reopened") => void;
  onOpenCapability: (capabilityId: number) => void;
  /** Keep the board's open detail in sync after inline process/reflection edits. */
  onUpdated: (challenge: GrowthChallenge) => void;
  onChanged: () => void;
}

function criteriaLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-caption font-medium text-muted">{label}</h3>
      {children}
    </section>
  );
}

/** Top-level document group: accent rule, label, optional edit action. */
function Group({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-line/40 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <header className="flex items-center gap-2">
        <span className="h-3 w-0.5 flex-shrink-0 rounded-full bg-[var(--accent-border)]" />
        <h3 className="text-caption font-medium text-secondary">{label}</h3>
        {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
      </header>
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap text-body leading-relaxed text-secondary">{children}</p>
  );
}

export default function GrowthChallengeDetail({
  open,
  challenge,
  artifacts,
  onClose,
  onEdit,
  onResolve,
  onOpenArtifact,
  tasks,
  predictions,
  onOpenTask,
  onDeleteTask,
  onNewTask,
  onPredictTask,
  onNewPrediction,
  onSettlePrediction,
  onTaskToggled,
  onOpenCapability,
  onUpdated,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { togglingIds, toggle } = useGrowthTaskActions(onChanged, onTaskToggled);
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const twoColumn = width >= 900;
  const [processEditing, setProcessEditing] = useState(false);
  const [processDraft, setProcessDraft] = useState("");
  const [processSaving, setProcessSaving] = useState(false);
  const [reflectionEditing, setReflectionEditing] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [reflectionSaving, setReflectionSaving] = useState(false);

  useEffect(() => {
    setProcessEditing(false);
    setReflectionEditing(false);
  }, [challenge?.id]);

  useEffect(() => {
    if (!processEditing) setProcessDraft(challenge?.body ?? "");
  }, [challenge?.id, challenge?.body, processEditing]);

  useEffect(() => {
    if (!reflectionEditing) setReflectionDraft(challenge?.reflection ?? "");
  }, [challenge?.id, challenge?.reflection, reflectionEditing]);

  if (!challenge) return null;

  const saveProcess = async () => {
    if (processSaving) return;
    setProcessSaving(true);
    try {
      const updated = await window.prism.updateGrowthChallenge(challenge.id, {
        body: processDraft,
      });
      onUpdated(updated);
      onChanged();
      setProcessEditing(false);
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setProcessSaving(false);
    }
  };

  const saveReflection = async () => {
    if (reflectionSaving) return;
    setReflectionSaving(true);
    try {
      const updated = await window.prism.updateGrowthChallenge(challenge.id, {
        reflection: reflectionDraft,
      });
      onUpdated(updated);
      onChanged();
      setReflectionEditing(false);
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setReflectionSaving(false);
    }
  };

  const criteria = criteriaLines(challenge.criteria);
  const linked = artifacts.filter((artifact) => artifact.challengeId === challenge.id);
  const challengeTasks = [
    ...tasks.filter(
      (task) => task.challenge?.id === challenge.id && task.completedAt === null,
    ),
    ...tasks.filter(
      (task) => task.challenge?.id === challenge.id && task.completedAt !== null,
    ),
  ];
  const challengeTaskIds = new Set(challengeTasks.map((task) => task.id));
  const challengePredictions = predictions.filter(
    (prediction) =>
      prediction.challenge?.id === challenge.id ||
      (prediction.task !== null && challengeTaskIds.has(prediction.task.id)),
  );
  const pendingPredictions = challengePredictions.filter(
    (prediction) => prediction.actual === null,
  );
  const settledPredictions = challengePredictions.filter(
    (prediction) => prediction.actual !== null,
  );
  const scopedAccuracy = selfAccuracy(challengePredictions);
  const hasDefinition = [challenge.description, challenge.goal, challenge.criteria].some(
    (value) => value.trim() !== "",
  );
  const isSettled = challenge.status !== "open";

  const metaRow = (
    <div className="flex flex-wrap items-center gap-2 text-caption text-faint">
      <span className="inline-flex items-center gap-1">
        <ChallengeStatusIcon value={challenge.status} />
        {t[CHALLENGE_STATUS_KEYS[challenge.status]]}
      </span>
      <Badge variant="outline">{levelGrade(challenge.difficultyLevel)}</Badge>
      {challenge.capabilityName && (
        <span className="inline-flex min-w-0 items-center gap-0.5">
          <span className="truncate">{challenge.capabilityName}</span>
          {challenge.capabilityId !== null && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={t["growth.openCapability"]}
              aria-label={t["growth.openCapability"]}
              onClick={() => onOpenCapability(challenge.capabilityId!)}
            >
              <ArrowUpRight size={12} />
            </Button>
          )}
        </span>
      )}
      {challenge.seasonTitle && <span className="truncate">{challenge.seasonTitle}</span>}
      {challenge.resolvedOn && <span className="tabular-nums">{challenge.resolvedOn}</span>}
      {challenge.attribution && (
        <Badge variant="outline">{t[ATTRIBUTION_KEYS[challenge.attribution]]}</Badge>
      )}
    </div>
  );

  const summaryCard = (
    <SectionCard
      title={t["growth.challenge.summary"]}
      tintColor={tagColor("violet")}
      className="flex-shrink-0"
      bodyClassName="p-3"
    >
      {metaRow}
    </SectionCard>
  );

  const processEditAction = !processEditing ? (
    <Button
      variant="ghost"
      size="icon-xs"
      title={t["growth.challengeProcessEdit"]}
      aria-label={t["growth.challengeProcessEdit"]}
      onClick={() => {
        setProcessDraft(challenge.body);
        setProcessEditing(true);
      }}
    >
      <Pencil size={12} />
    </Button>
  ) : undefined;

  const processBody = processEditing ? (
    <div className="space-y-2">
      <Textarea
        autoFocus
        className="w-full"
        rows={8}
        value={processDraft}
        placeholder={t["growth.challengeProcessPlaceholder"]}
        onChange={(event) => setProcessDraft(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={processSaving}
          onClick={() => setProcessEditing(false)}
        >
          {t["growth.cancel"]}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={processSaving}
          onClick={() => void saveProcess()}
        >
          {t["growth.save"]}
        </Button>
      </div>
    </div>
  ) : challenge.body.trim() ? (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 py-2 text-caption text-faint">
          <Loader2 size={14} className="animate-spin" />
          {t["growth.loading"]}
        </div>
      }
    >
      <GrowthMarkdown content={challenge.body} />
    </Suspense>
  ) : (
    <div className="rounded-control border border-dashed border-line/40 px-3 py-4 text-caption text-faint">
      {t["growth.challengeProcessEmpty"]}
    </div>
  );

  const reflectionEditAction = !reflectionEditing ? (
    <Button
      variant="ghost"
      size="icon-xs"
      title={t["growth.challengeReflectionEdit"]}
      aria-label={t["growth.challengeReflectionEdit"]}
      onClick={() => {
        setReflectionDraft(challenge.reflection);
        setReflectionEditing(true);
      }}
    >
      <Pencil size={12} />
    </Button>
  ) : undefined;

  const settlementBody = (
    <>
      {challenge.resultNote.trim() && (
        <Section label={t["growth.challengeResult"]}>
          <Paragraph>{challenge.resultNote}</Paragraph>
        </Section>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <h4 className="text-caption font-medium text-muted">
            {t["growth.challengeReflection"]}
          </h4>
          {reflectionEditAction}
        </div>
        {reflectionEditing ? (
          <div className="space-y-2">
            <Textarea
              autoFocus
              className="w-full"
              rows={6}
              value={reflectionDraft}
              placeholder={t["growth.challengeReflectionPlaceholder"]}
              onChange={(event) => setReflectionDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={reflectionSaving}
                onClick={() => setReflectionEditing(false)}
              >
                {t["growth.cancel"]}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={reflectionSaving}
                onClick={() => void saveReflection()}
              >
                {t["growth.save"]}
              </Button>
            </div>
          </div>
        ) : challenge.reflection.trim() ? (
          <Paragraph>{challenge.reflection}</Paragraph>
        ) : (
          <div className="rounded-control border border-dashed border-line/40 px-3 py-4 text-caption text-faint">
            {t["growth.challengeReflectionEmpty"]}
          </div>
        )}
      </div>
    </>
  );

  const mainContent = (
    <div className="flex flex-col">
      {hasDefinition && (
        <Group label={t["growth.challengeDefinition"]}>
          {challenge.description.trim() && (
            <Section label={t["growth.challengeDescription"]}>
              <Paragraph>{challenge.description}</Paragraph>
            </Section>
          )}

          {challenge.goal.trim() && (
            <Section label={t["growth.challengeGoal"]}>
              <Paragraph>{challenge.goal}</Paragraph>
            </Section>
          )}

          {criteria.length > 0 && (
            <Section label={t["growth.challengeCriteria"]}>
              <ul className="list-disc space-y-1 pl-5 text-body leading-relaxed text-secondary">
                {criteria.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </Section>
          )}
        </Group>
      )}

      <Group
        label={t["growth.challengeProcess"]}
        action={processEditAction}
      >
        {processBody}
      </Group>

      {isSettled && (
        <Group label={t["growth.challengeSettlement"]}>
          {settlementBody}
        </Group>
      )}
    </div>
  );

  const contentCard = (
    <SectionCard
      title={t["growth.challenge.content"]}
      className={twoColumn ? "flex min-h-0 flex-1 flex-col" : ""}
      bodyClassName={twoColumn ? "min-h-0 flex-1 overflow-y-auto p-3" : "p-3"}
    >
      {mainContent}
    </SectionCard>
  );

  const sideSections = (
    <>
      <SectionCard
        title={t["growth.challenge.tasks"]}
        count={challengeTasks.length}
        tintColor={tagColor("green")}
        className={twoColumn ? "flex min-h-0 flex-1 flex-col" : ""}
        headerActions={
          <Button
            variant="ghost"
            size="icon-xs"
            title={t["growth.challenge.addTask"]}
            aria-label={t["growth.challenge.addTask"]}
            onClick={() =>
              onNewTask({ capabilityId: challenge.capabilityId, challengeId: challenge.id })
            }
          >
            <Plus size={14} />
          </Button>
        }
        bodyClassName={twoColumn ? "min-h-0 flex-1 overflow-y-auto p-2" : "p-2"}
      >
        {challengeTasks.length === 0 ? (
          <EmptyState size="card" text={t["growth.challenge.noTasks"]} />
        ) : (
          <div>
            {challengeTasks.map((task) => (
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

      <SectionCard
        title={t["growth.challenge.predictions"]}
        count={challengePredictions.length}
        tintColor={tagColor("blue")}
        className={twoColumn ? "flex min-h-0 flex-1 flex-col" : ""}
        headerActions={
          <Button
            variant="ghost"
            size="icon-xs"
            title={t["growth.predictionAdd"]}
            aria-label={t["growth.predictionAdd"]}
            onClick={() =>
              onNewPrediction({
                capabilityId: challenge.capabilityId,
                challenge: { id: challenge.id, title: challenge.title },
                subject: challenge.title,
              })
            }
          >
            <Plus size={14} />
          </Button>
        }
        bodyClassName={twoColumn ? "min-h-0 flex-1 overflow-y-auto p-2" : "p-2"}
      >
        <p className="px-1 pb-1 text-caption text-faint">
          {t["growth.capability.accuracy"]} ·{" "}
          <span className="tabular-nums text-secondary">
            {scopedAccuracy.score === null ? "—" : scopedAccuracy.score}
          </span>
          {" · "}
          {t["growth.accuracyCount"].replace("{count}", String(scopedAccuracy.count))}
        </p>
        {challengePredictions.length === 0 ? (
          <EmptyState size="card" text={t["growth.challenge.noPredictions"]} />
        ) : (
          <div>
            {pendingPredictions.map((row) => (
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
            {settledPredictions.map((row) => (
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

      {linked.length > 0 && (
        <SectionCard
          title={t["growth.challengeArtifacts"]}
          count={linked.length}
          tintColor={tagColor("gold")}
          className={twoColumn ? "flex min-h-0 flex-1 flex-col" : ""}
          bodyClassName={twoColumn ? "min-h-0 flex-1 overflow-y-auto p-2" : "p-2"}
        >
          <div>
            {linked.map((artifact) => (
              <ItemRow
                key={artifact.id}
                onPrimaryClick={() => onOpenArtifact(artifact)}
                leading={
                  <span className="flex flex-shrink-0 items-center gap-1.5">
                    {artifact.cover && (
                      <img
                        src={growthCoverUrl(artifact.cover)}
                        alt=""
                        className="h-6 w-10 rounded-control object-cover"
                      />
                    )}
                    <Badge variant="outline" className="flex-shrink-0">
                      {t[ARTIFACT_KIND_KEYS[artifact.kind]]}
                    </Badge>
                  </span>
                }
                title={<span className="truncate">{artifact.title}</span>}
                meta={
                  <span className="flex-shrink-0 text-caption tabular-nums text-faint">
                    {artifact.createdOn ?? localDateFromStamp(artifact.createdAt)}
                  </span>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={challenge.title}
      layout="document"
      position="center"
      headerActions={
        <Button
          variant="ghost"
          size="icon-sm"
          title={t["growth.edit"]}
          aria-label={t["growth.edit"]}
          onClick={() => onEdit(challenge)}
        >
          <Pencil size={15} />
        </Button>
      }
      footer={
        challenge.status === "open" ? (
          <Button variant="primary" size="sm" onClick={() => onResolve(challenge)}>
            {t["growth.challengeResolve"]}
          </Button>
        ) : undefined
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${twoColumn ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        {twoColumn ? (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)_380px] gap-6">
            <div className="flex min-h-0 flex-col gap-3">
              {summaryCard}
              {contentCard}
            </div>
            <div className="flex min-h-0 flex-col gap-3">{sideSections}</div>
          </div>
        ) : (
          <div className="space-y-5">
            {summaryCard}
            {contentCard}
            {sideSections}
          </div>
        )}
      </div>
    </Modal>
  );
}
