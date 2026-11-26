import { useMemo, useState } from "react";
import { Brain, CheckCircle2, MessagesSquare, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "../Button";
import Badge from "../Badge";
import ItemRow from "../ItemRow";
import ConfirmDialog from "../ConfirmDialog";
import { useToolbarContribution } from "../toolbar/ToolbarProvider";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useContextMenu } from "../../lib/useContextMenu";
import type {
  GrowthFeedback,
  GrowthPrediction,
  GrowthSelfModelEntry,
  GrowthSelfSection,
} from "../../shared/models";
import { predictionBias, predictionDelta, settledPredictions, selfAccuracy, weeklyAccuracy } from "../../lib/growth";
import { PREDICTION_KIND_COLORS, PREDICTION_KIND_KEYS } from "./labels";
import type { GrowthSelfViewKey } from "./types";
import { tagColor } from "../../lib/colors";
import GrowthErrorChart from "./GrowthErrorChart";
import GrowthAccuracySpark from "./GrowthAccuracySpark";
import GrowthFeedbackModal from "./GrowthFeedbackModal";
import GrowthEmptyGuide from "./GrowthEmptyGuide";
import GrowthSelfModelPanel from "./GrowthSelfModelPanel";
import GrowthSelfModelModal from "./GrowthSelfModelModal";

type SelfSectionKey = GrowthSelfViewKey;

interface Props {
  predictions: GrowthPrediction[];
  selfModel: GrowthSelfModelEntry[];
  feedback: GrowthFeedback[];
  /** Which 元认知 section is open; the sidebar owns the switch. */
  section: SelfSectionKey;
  /** The module root owns the forecast dialogs so every surface shares them. */
  onNewPrediction: () => void;
  onSettlePrediction: (prediction: GrowthPrediction) => void;
  onChanged: () => void;
}

export default function GrowthSelfView({
  predictions,
  selfModel,
  feedback,
  section,
  onNewPrediction,
  onSettlePrediction,
  onChanged,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { onContextMenu } = useContextMenu();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<GrowthFeedback | null>(null);
  const [selfSection, setSelfSection] = useState<GrowthSelfSection | null>(null);
  const [selfEditing, setSelfEditing] = useState<GrowthSelfModelEntry | null>(null);
  const [selfOpen, setSelfOpen] = useState(false);
  const [deletingSelfModel, setDeletingSelfModel] = useState<GrowthSelfModelEntry | null>(null);
  const [deletingPrediction, setDeletingPrediction] = useState<GrowthPrediction | null>(null);
  const [deletingFeedback, setDeletingFeedback] = useState<GrowthFeedback | null>(null);

  const accuracy = useMemo(() => selfAccuracy(predictions), [predictions]);
  const bias = useMemo(() => predictionBias(predictions), [predictions]);
  const weeks = useMemo(() => weeklyAccuracy(predictions, 8), [predictions]);
  // Pending forecasts stay above the scored list until they get an outcome.
  const pending = useMemo(() => predictions.filter((row) => row.actual === null), [predictions]);
  const settled = useMemo(() => settledPredictions(predictions), [predictions]);

  // The sidebar owns the section switch (three sub-items under 元认知); the
  // toolbar keeps only the active section's one action.
  const toolbar = useMemo(
    () => ({
      actions:
        section === "accuracy" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.predictionAdd"]}
            aria-label={t["growth.predictionAdd"]}
            onClick={onNewPrediction}
          >
            <Plus size={15} />
          </Button>
        ) : section === "manual" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.selfAdd"]}
            aria-label={t["growth.selfAdd"]}
            onClick={() => {
              setSelfEditing(null);
              setSelfOpen(true);
            }}
          >
            <Plus size={15} />
          </Button>
        ) : section === "feedback" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t["growth.feedbackAdd"]}
            aria-label={t["growth.feedbackAdd"]}
            onClick={() => {
              setEditingFeedback(null);
              setFeedbackOpen(true);
            }}
          >
            <Plus size={15} />
          </Button>
        ) : undefined,
    }),
    [t, section],
  );
  useToolbarContribution("growth:self-controls", toolbar);

  const removePrediction = async (id: number) => {
    try {
      await window.prism.deleteGrowthPrediction(id);
      onChanged();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const removeFeedback = async (id: number) => {
    try {
      await window.prism.deleteGrowthFeedback(id);
      onChanged();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const confirmRemovePrediction = async () => {
    if (!deletingPrediction) return;
    await removePrediction(deletingPrediction.id);
  };

  const confirmRemoveFeedback = async () => {
    if (!deletingFeedback) return;
    await removeFeedback(deletingFeedback.id);
  };

  const confirmRemoveSelfModel = async () => {
    if (!deletingSelfModel) return;
    const target = deletingSelfModel;
    try {
      await window.prism.deleteGrowthSelfModel(target.id);
      setSelfOpen(false);
      setSelfEditing(null);
      setDeletingSelfModel(null);
      onChanged();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  };

  const sectionHasContent =
    section === "accuracy"
      ? predictions.length > 0
      : section === "manual"
        ? selfModel.length > 0
        : feedback.length > 0;

  return (
    <div className="h-full">
      <div key={section} className={sectionHasContent ? "growth-rise h-full" : "h-full"}>
      {section === "accuracy" && (
        predictions.length === 0 ? (
          <div className="h-full overflow-y-auto p-4">
            <GrowthEmptyGuide
              icon={<Brain size={22} />}
              eyebrow={t["growth.guide.eyebrow"]}
              title={t["growth.guide.accuracyTitle"]}
              description={t["growth.guide.accuracyDesc"]}
              steps={[
                {
                  title: t["growth.guide.stepPrediction"],
                  description: t["growth.guide.stepPredictionDesc"],
                },
                {
                  title: t["growth.guide.stepSettle"],
                  description: t["growth.guide.stepSettleDesc"],
                },
                {
                  title: t["growth.guide.stepAccuracyReview"],
                  description: t["growth.guide.stepAccuracyReviewDesc"],
                },
              ]}
              primary={{
                label: t["growth.predictionAdd"],
                onClick: onNewPrediction,
                icon: <Plus size={12} />,
              }}
              hint={t["growth.accuracyHint"]}
            />
          </div>
        ) : (
        <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 lg:overflow-hidden">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-caption text-muted">{t["growth.accuracy"]}</span>
            <span className="text-[22px] font-semibold leading-none tabular-nums text-primary">
              {accuracy.score === null ? "—" : accuracy.score}
            </span>
            <span className="text-caption text-faint">
              {t["growth.accuracyCount"].replace("{count}", String(accuracy.count))}
            </span>
            {bias.direction !== "none" && (
              <span className="text-caption text-[var(--accent-text)]">
                {t["growth.accuracyBias"]
                  .replace("{count}", String(bias.count))
                  .replace(
                    "{direction}",
                    bias.direction === "under"
                      ? t["growth.accuracyUnder"]
                      : t["growth.accuracyOver"],
                  )}
              </span>
            )}
          </header>
          <p className="text-caption text-faint">{t["growth.accuracyHint"]}</p>

          <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
            <div className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-hidden">
              <div className="min-h-0 lg:flex-1">
                <GrowthErrorChart predictions={predictions} />
              </div>
              <div className="flex-shrink-0">
                <GrowthAccuracySpark points={weeks} />
                <p className="mt-1 text-caption text-faint">{t["growth.accuracyWeeks"]}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-h-0 lg:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto">
                {pending.length > 0 && (
                    <div>
                      <p className="text-caption text-faint">
                        {t["growth.predictionPendingHint"].replace(
                          "{count}",
                          String(pending.length),
                        )}
                      </p>
                      <div className="mt-1">
                        {pending.map((row) => (
                          <ItemRow
                            key={row.id}
                            tooltip={row.note || undefined}
                            leading={
                              <Badge palette={tagColor(PREDICTION_KIND_COLORS[row.kind])}>
                                {t[PREDICTION_KIND_KEYS[row.kind]]}
                              </Badge>
                            }
                            title={
                              <span className="truncate">
                                {row.subject}
                                {row.capability && (
                                  <span className="ml-1.5 text-caption text-faint">
                                    {row.capability.name}
                                  </span>
                                )}
                              </span>
                            }
                            meta={
                              <span className="flex flex-shrink-0 items-center gap-2 tabular-nums">
                                <span className="text-caption text-secondary">
                                  {t["growth.predictionExpected"]} {row.predicted}
                                </span>
                                <span className="text-caption text-faint">
                                  {row.predictedOn}
                                </span>
                              </span>
                            }
                            onPrimaryClick={() => onSettlePrediction(row)}
                            menuItems={[
                              {
                                label: t["growth.predictionSettle"],
                                icon: <CheckCircle2 size={14} />,
                                onClick: () => onSettlePrediction(row),
                              },
                              {
                                label: t["menu.delete"],
                                icon: <Trash2 size={14} />,
                                danger: true,
                                onClick: () => setDeletingPrediction(row),
                              },
                            ]}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {settled.length > 0 && (
                    <div
                      className={
                        pending.length > 0 ? "border-t border-line/40 pt-3" : undefined
                      }
                    >
                      <p className="text-caption text-faint">
                        {t["growth.predictionDeviationHint"]}
                      </p>
                      <div className="mt-1">
                        {settled.map((row) => {
                          const delta = predictionDelta(row.kind, row.predicted, row.actual);
                          return (
                            <ItemRow
                              key={row.id}
                              tooltip={row.note || undefined}
                              leading={
                                <Badge palette={tagColor(PREDICTION_KIND_COLORS[row.kind])}>
                                  {t[PREDICTION_KIND_KEYS[row.kind]]}
                                </Badge>
                              }
                              title={
                                <span className="truncate">
                                  {row.subject}
                                  {row.capability && (
                                    <span className="ml-1.5 text-caption text-faint">
                                      {row.capability.name}
                                    </span>
                                  )}
                                </span>
                              }
                              meta={
                                <span className="flex flex-shrink-0 items-center gap-2 tabular-nums">
                                  <span className="text-caption text-secondary">
                                    {row.predicted} → {row.actual}
                                  </span>
                                  <span
                                    className={`w-9 text-right text-caption ${
                                      delta.error >= 0.35
                                        ? "text-warning"
                                        : delta.error === 0
                                          ? "text-faint"
                                          : "text-secondary"
                                    }`}
                                  >
                                    {delta.text}
                                  </span>
                                  <span className="text-caption text-faint">
                                    {row.predictedOn}
                                  </span>
                                </span>
                              }
                              menuItems={[
                                {
                                  label: t["menu.delete"],
                                  icon: <Trash2 size={14} />,
                                  danger: true,
                                  onClick: () => setDeletingPrediction(row),
                                },
                              ]}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
            </div>
          </div>
        </div>
        )
      )}

      {section === "manual" && (
        selfModel.length === 0 ? (
          <div className="h-full overflow-y-auto p-4">
            <GrowthEmptyGuide
              icon={<NotebookPen size={22} />}
              eyebrow={t["growth.guide.eyebrow"]}
              title={t["growth.guide.manualTitle"]}
              description={t["growth.guide.manualDesc"]}
              steps={[
                {
                  title: t["growth.guide.stepManualSection"],
                  description: t["growth.guide.stepManualSectionDesc"],
                },
                {
                  title: t["growth.guide.stepManualEvidence"],
                  description: t["growth.guide.stepManualEvidenceDesc"],
                },
                {
                  title: t["growth.guide.stepManualPrune"],
                  description: t["growth.guide.stepManualPruneDesc"],
                },
              ]}
              primary={{
                label: t["growth.selfAdd"],
                onClick: () => {
                  setSelfEditing(null);
                  setSelfOpen(true);
                },
                icon: <Plus size={12} />,
              }}
              hint={t["growth.selfModelHint"]}
            />
          </div>
        ) : (
        <div className="h-full overflow-y-auto p-4">
          <p className="mb-2 text-caption text-faint">{t["growth.selfModelHint"]}</p>
          <GrowthSelfModelPanel
            entries={selfModel}
            value={selfSection}
            onChange={setSelfSection}
            onEdit={(entry) => {
              setSelfEditing(entry);
              setSelfOpen(true);
            }}
            onDelete={setDeletingSelfModel}
          />
        </div>
        )
      )}

      {section === "feedback" && (
        <div className="h-full overflow-y-auto p-4">
          {feedback.length > 0 && (
            <p className="mb-2 text-caption text-faint">{t["growth.feedbackPanelHint"]}</p>
          )}
          {feedback.length === 0 ? (
            <GrowthEmptyGuide
              className="py-6"
              icon={<MessagesSquare size={22} />}
              eyebrow={t["growth.guide.eyebrow"]}
              title={t["growth.guide.feedbackTitle"]}
              description={t["growth.guide.feedbackDesc"]}
              steps={[
                {
                  title: t["growth.guide.stepFeedbackAsk"],
                  description: t["growth.guide.stepFeedbackAskDesc"],
                },
                {
                  title: t["growth.guide.stepFeedbackQuestions"],
                  description: t["growth.guide.stepFeedbackQuestionsDesc"],
                },
                {
                  title: t["growth.guide.stepFeedbackGap"],
                  description: t["growth.guide.stepFeedbackGapDesc"],
                },
              ]}
              primary={{
                label: t["growth.feedbackAdd"],
                onClick: () => {
                  setEditingFeedback(null);
                  setFeedbackOpen(true);
                },
                icon: <Plus size={12} />,
              }}
              hint={t["growth.feedbackPanelHint"]}
            />
          ) : (
            <ul className="motion-stagger space-y-2">
              {feedback.map((row) => (
                <li
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditingFeedback(row);
                    setFeedbackOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setEditingFeedback(row);
                    setFeedbackOpen(true);
                  }}
                  onContextMenu={(event) =>
                    onContextMenu(event, [
                      {
                        label: t["growth.feedbackEdit"],
                        icon: <Pencil size={14} />,
                        onClick: () => {
                          setEditingFeedback(row);
                          setFeedbackOpen(true);
                        },
                      },
                      {
                        label: t["menu.delete"],
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onClick: () => setDeletingFeedback(row),
                      },
                    ])
                  }
                  className="cursor-pointer rounded-card border border-strong/40 bg-surface p-3 transition-colors hover:border-strong/60 hover:bg-elevated/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-control text-primary">
                      {row.source || t["growth.feedbackAnonymous"]}
                    </span>
                    <span className="text-caption text-faint tabular-nums">{row.receivedOn}</span>
                  </div>
                  <dl className="mt-1 grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1 text-caption">
                    {row.strengths && (
                      <>
                        <dt className="text-faint">{t["growth.feedbackStrengths"]}</dt>
                        <dd className="text-secondary">{row.strengths}</dd>
                      </>
                    )}
                    {row.weakness && (
                      <>
                        <dt className="text-faint">{t["growth.feedbackWeakness"]}</dt>
                        <dd className="text-secondary">{row.weakness}</dd>
                      </>
                    )}
                    {row.friction && (
                      <>
                        <dt className="text-faint">{t["growth.feedbackFriction"]}</dt>
                        <dd className="text-secondary">{row.friction}</dd>
                      </>
                    )}
                    {row.calibration && (
                      <>
                        <dt className="text-faint">{t["growth.feedbackCalibration"]}</dt>
                        <dd className="text-[var(--accent-text)]">{row.calibration}</dd>
                      </>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>

      <GrowthFeedbackModal
        open={feedbackOpen}
        feedback={editingFeedback}
        onClose={() => {
          setFeedbackOpen(false);
          setEditingFeedback(null);
        }}
        onSaved={onChanged}
      />
      <GrowthSelfModelModal
        open={selfOpen}
        entry={selfEditing}
        section={selfSection ?? "energy"}
        onClose={() => setSelfOpen(false)}
        onSaved={(entry) => {
          setSelfSection(entry.section);
          onChanged();
        }}
      />

      <ConfirmDialog
        open={deletingSelfModel !== null}
        message={t["growth.deleteSelfModelConfirm"]}
        onConfirm={confirmRemoveSelfModel}
        onClose={() => setDeletingSelfModel(null)}
      />

      <ConfirmDialog
        open={deletingPrediction !== null}
        message={t["growth.deletePredictionConfirm"]}
        onConfirm={confirmRemovePrediction}
        onClose={() => setDeletingPrediction(null)}
      />

      <ConfirmDialog
        open={deletingFeedback !== null}
        message={t["growth.deleteFeedbackConfirm"]}
        onConfirm={confirmRemoveFeedback}
        onClose={() => setDeletingFeedback(null)}
      />
    </div>
  );
}
