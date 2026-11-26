import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import SelectButton from "../SelectButton";
import SegmentedToggle from "../SegmentedToggle";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey, localDateFromStamp } from "../../lib/dates";
import type {
  GrowthCapability,
  GrowthChallenge,
  GrowthEvidence,
  GrowthEvidenceKind,
} from "../../shared/models";
import {
  confidenceBand,
  levelGrade,
  levelScore,
  passedChallengeCount,
  requiredChallengeCount,
} from "../../lib/growth";
import {
  CONFIDENCE_HINT_KEYS,
  CONFIDENCE_NAME_KEYS,
  CONFIDENCE_OPTIONS,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_KEYS,
  LEVEL_NAME_KEYS,
  LEVEL_VALUE_OPTIONS,
} from "./labels";

interface Props {
  open: boolean;
  capability: GrowthCapability | null;
  challenges: GrowthChallenge[];
  onClose: () => void;
  onReviewed: () => void;
}

export default function GrowthReviewModal({ open, capability, challenges, onClose, onReviewed }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [level, setLevel] = useState("1");
  const [confidence, setConfidence] = useState("1");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<GrowthEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<GrowthEvidenceKind>("feedback");
  const [busy, setBusy] = useState(false);

  const capabilityId = capability?.id ?? null;
  const currentLevel = capability?.level ?? 1;

  useEffect(() => {
    if (!open || capabilityId === null) return;
    setLevel(String(currentLevel));
    setConfidence(String(capability?.confidence ?? 1));
    setNote("");
    setNewTitle("");
    setNewKind("feedback");
    setLoading(true);
    let cancelled = false;
    window.prism
      .listGrowthEvidence(capabilityId)
      .then((rows) => { if (!cancelled) setEvidence(rows); })
      .catch(() => { if (!cancelled) setEvidence([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, capabilityId, currentLevel, capability?.confidence]);

  const hasFreshEvidence = evidence.some(
    (row) => !capability?.lastReviewedAt || row.createdAt > capability.lastReviewedAt,
  );
  const canRaise = evidence.length > 0 && hasFreshEvidence;
  const passedChallenges = capability ? passedChallengeCount(challenges, capability.id) : 0;
  const challengeGateOk = (target: number) =>
    target < 3 || passedChallenges >= requiredChallengeCount(target);

  const kindOptions = useMemo(
    () => EVIDENCE_KINDS.map((kind) => ({ value: kind, label: t[EVIDENCE_KIND_KEYS[kind]] })),
    [t],
  );

  const addEvidence = async () => {
    if (capabilityId === null || busy) return;
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const created = await window.prism.addGrowthEvidence(capabilityId, {
        kind: newKind,
        title,
        detail: "",
        url: "",
        happenedOn: dateKey(new Date()),
      });
      setEvidence((rows) => [created, ...rows]);
      setNewTitle("");
      onReviewed();
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (capabilityId === null || busy) return;
    setBusy(true);
    try {
      await window.prism.reviewGrowthCapability(capabilityId, {
        level: Number(level),
        confidence: Number(confidence),
        note,
      });
      onReviewed();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_EVIDENCE_REQUIRED")) {
        showToast(t["growth.evidenceRequired"], "error");
      } else if (message.includes("GROWTH_CHALLENGE_REQUIRED")) {
        showToast(t["growth.challengeRequired"], "error");
      } else if (message.includes("GROWTH_LEVEL_JUMP")) {
        showToast(t["growth.levelJump"], "error");
      } else {
        showToast(t["common.actionFailed"], "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const previewBand = confidenceBand(Number(confidence));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={capability ? t["growth.reviewTitle"].replace("{name}", capability.name) : t["growth.review"]}
      size="lg"
      layout="dialog"
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void submit()}>
            {t["growth.reviewSave"]}
          </Button>
        </>
      }
    >
      {capability && (
        <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-muted">{t["growth.level"]}</span>
                <span className="text-caption tabular-nums text-faint">
                  {levelGrade(Number(level))} {t[LEVEL_NAME_KEYS[Number(level) - 1]]} ·{" "}
                  {levelScore(Number(level))}
                </span>
              </div>
              <SegmentedToggle
                value={level}
                options={LEVEL_VALUE_OPTIONS.map((option) => {
                  const value = Number(option.value);
                  // Same rules the DB enforces: one level per review, evidence
                  // first, and a passed challenge for every level above L2.
                  return {
                    ...option,
                    disabled:
                      value > currentLevel + 1 ||
                      (value > currentLevel && (!canRaise || !challengeGateOk(value))),
                  };
                })}
                onChange={setLevel}
                stretch
                className="w-full"
              />
              <p className="text-caption text-faint">{t["growth.reviewHint"]}</p>
              {Number(level) >= 3 && (
                <p className="text-caption text-faint">
                  {t["growth.reviewChallengeCount"]
                    .replace("{count}", String(passedChallenges))
                    .replace("{need}", String(requiredChallengeCount(Number(level))))}
                  {challengeGateOk(Number(level)) ? "" : ` · ${t["growth.reviewChallengeRequired"]}`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="block text-caption text-muted">{t["growth.confidence"]}</span>
              <SegmentedToggle
                value={confidence}
                options={CONFIDENCE_OPTIONS}
                onChange={setConfidence}
                stretch
                className="w-full"
              />
              <p className="text-caption text-faint">
                {t[CONFIDENCE_NAME_KEYS[Number(confidence)]]}
                {previewBand === null ? "" : ` · ${levelScore(Number(level))} ±${previewBand}`}
                {" · "}
                {t[CONFIDENCE_HINT_KEYS[Number(confidence)]]}
              </p>
            </div>

            <div className="surface-inset space-y-2 rounded-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-caption text-muted">
                  {t["growth.evidence"]} · {t["growth.evidenceCountShort"].replace("{count}", String(evidence.length))}
                </span>
                {!canRaise && (
                  <span className="text-caption text-[var(--accent-text)]">
                    {t["growth.reviewEvidenceRequired"]}
                  </span>
                )}
              </div>
              {loading ? (
                <p className="text-caption text-faint">{t["growth.loading"]}</p>
              ) : evidence.length === 0 ? (
                <p className="text-caption text-faint">{t["growth.emptyEvidence"]}</p>
              ) : (
                <ul className="space-y-1">
                  {evidence.slice(0, 6).map((row) => (
                    <li key={row.id} className="flex items-center gap-2 text-caption text-secondary">
                      <span className="text-faint">{t[EVIDENCE_KIND_KEYS[row.kind]]}</span>
                      <span className="min-w-0 flex-1 truncate">{row.title}</span>
                      <span className="text-faint tabular-nums">{row.happenedOn ?? localDateFromStamp(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  className="min-w-0 flex-1"
                  value={newTitle}
                  placeholder={t["growth.evidenceTitlePlaceholder"]}
                  aria-label={t["growth.evidenceTitle"]}
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addEvidence();
                    }
                  }}
                />
                <SelectButton
                  value={newKind}
                  options={kindOptions}
                  onChange={(value) => setNewKind(value as GrowthEvidenceKind)}
                  className="w-32 flex-shrink-0"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !newTitle.trim()}
                  onClick={() => void addEvidence()}
                >
                  {t["growth.addEvidence"]}
                </Button>
              </div>
            </div>

            <label className="block space-y-1">
              <span className="block text-caption text-muted">{t["growth.reviewNote"]}</span>
              <Textarea
                className="w-full"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
      )}
    </Modal>
  );
}
