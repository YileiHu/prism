import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import NumberInput from "../NumberInput";
import DateField from "../DateField";
import SegmentedToggle from "../SegmentedToggle";
import SelectButton from "../SelectButton";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey } from "../../lib/dates";
import { capabilityGroupsByDomain } from "../../lib/capabilityGroups";
import { isPredictionValue, predictionBounds, predictionStep } from "../../lib/growth";
import { PREDICTION_UNIT_KEYS } from "./labels";
import type { GrowthPredictionLink } from "./types";
import type {
  GrowthCapability,
  GrowthDomain,
  GrowthPredictionKind,
} from "../../shared/models";

interface Props {
  open: boolean;
  /** Context the forecast is created from; null for the global entry point. */
  link: GrowthPredictionLink | null;
  capabilities: GrowthCapability[];
  domains: GrowthDomain[];
  onClose: () => void;
  onSaved: () => void;
}

const KIND_OPTIONS = [
  { value: "time", label: "growth.predictionKind.time" },
  { value: "difficulty", label: "growth.predictionKind.difficulty" },
  { value: "mood", label: "growth.predictionKind.mood" },
] as const;

interface Context {
  kind: "challenge" | "task";
  id: number;
  title: string;
  /** The context's own capability, if it has one. */
  capabilityId: number | null;
}

export default function GrowthPredictionModal({
  open,
  link,
  capabilities,
  domains,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [kind, setKind] = useState<GrowthPredictionKind>("time");
  const [subject, setSubject] = useState("");
  const [predicted, setPredicted] = useState<number | null>(null);
  const [predictedOn, setPredictedOn] = useState(() => dateKey(new Date()));
  const [note, setNote] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [context, setContext] = useState<Context | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const contextCapability = link?.capabilityId ?? null;
    const nextContext: Context | null = link?.challenge
      ? {
          kind: "challenge",
          id: link.challenge.id,
          title: link.challenge.title,
          capabilityId: contextCapability,
        }
      : link?.task
        ? {
            kind: "task",
            id: link.task.id,
            title: link.task.title,
            capabilityId: contextCapability,
          }
        : null;
    setKind("time");
    setSubject(link?.subject ?? nextContext?.title ?? "");
    setPredicted(null);
    setPredictedOn(dateKey(new Date()));
    setNote("");
    setCapabilityId(contextCapability === null ? "" : String(contextCapability));
    setContext(nextContext);
  }, [open, link]);

  const groups = useMemo(
    () => capabilityGroupsByDomain(capabilities, domains),
    [capabilities, domains],
  );

  const kindOptions = useMemo(
    () => KIND_OPTIONS.map((option) => ({ value: option.value, label: t[option.label] })),
    [t],
  );

  const unitHint = t[PREDICTION_UNIT_KEYS[kind]];
  const bounds = predictionBounds(kind);
  const invalidPredicted = predicted !== null && !isPredictionValue(kind, predicted);

  const applyCapability = (next: string) => {
    setCapabilityId(next);
    // The context supplies the capability; changing the anchor to something
    // else would contradict the linked challenge/task (the store rejects it).
    if (context && next !== "" && context.capabilityId !== null && String(context.capabilityId) !== next) {
      setContext(null);
    }
  };

  const save = async () => {
    if (busy) return;
    const clean = subject.trim();
    if (!clean || predicted === null || !isPredictionValue(kind, predicted)) return;
    setBusy(true);
    try {
      await window.prism.addGrowthPrediction({
        kind,
        subject: clean,
        predicted,
        actual: null,
        predictedOn,
        note,
        capabilityId: capabilityId ? Number(capabilityId) : null,
        challengeId: context?.kind === "challenge" ? context.id : null,
        taskId: context?.kind === "task" ? context.id : null,
      });
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_PREDICTION_RANGE")) {
        showToast(t["growth.predictionRange"], "error");
      } else if (message.includes("GROWTH_LINK_CAPABILITY") || message.includes("GROWTH_PREDICTION_LINK")) {
        showToast(t["growth.linkCapabilityMismatch"], "error");
      } else {
        showToast(t["common.actionFailed"], "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["growth.predictionAdd"]}
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !subject.trim() || predicted === null || invalidPredicted}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.predictionKind"]}</span>
          <SegmentedToggle
            value={kind}
            options={kindOptions}
            onChange={(value) => setKind(value as GrowthPredictionKind)}
            stretch
            className="w-full"
          />
        </div>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.predictionSubject"]}</span>
          <Input
            className="w-full"
            autoFocus
            value={subject}
            placeholder={t["growth.predictionSubjectPlaceholder"]}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>

        {context && (
          <div className="flex items-center gap-2 rounded-control border border-strong/40 px-2 py-1.5">
            <Badge variant="outline" className="flex-shrink-0">
              {context.kind === "challenge"
                ? t["growth.prediction.contextChallenge"]
                : t["growth.prediction.contextTask"]}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-caption text-secondary">
              {context.title}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              title={t["common.remove"]}
              aria-label={t["common.remove"]}
              onClick={() => setContext(null)}
            >
              <X size={12} />
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.prediction.capability"]}</span>
          <SelectButton
            value={capabilityId}
            groups={groups}
            emptyLabel={t["growth.prediction.capabilityNone"]}
            onChange={applyCapability}
            className="w-full"
            placeholder={t["growth.prediction.capabilityNone"]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.predictionPredicted"]}</span>
            <NumberInput
              className="w-full"
              step={predictionStep(kind)}
              min={bounds.min}
              max={bounds.max}
              allowEmpty
              value={predicted}
              invalid={invalidPredicted}
              onChange={setPredicted}
            />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.predictionDate"]}</span>
            <DateField className="w-full" value={predictedOn} onChange={setPredictedOn} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.notes"]}</span>
          <Input
            className="w-full"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p className="text-caption text-faint">{unitHint}</p>
        <p className="text-caption text-faint">{t["growth.predictionForecastHint"]}</p>
      </div>
    </Modal>
  );
}
