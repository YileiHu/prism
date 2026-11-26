import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import NumberInput from "../NumberInput";
import Badge from "../Badge";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { tagColor } from "../../lib/colors";
import { isPredictionValue, predictionBounds, predictionStep } from "../../lib/growth";
import type { GrowthPrediction } from "../../shared/models";
import { PREDICTION_KIND_COLORS, PREDICTION_KIND_KEYS, PREDICTION_UNIT_KEYS } from "./labels";

interface Props {
  /** The pending forecast to settle; null closes the modal. */
  prediction: GrowthPrediction | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Second half of a prediction: fill in what actually happened. */
export default function GrowthPredictionSettleModal({ prediction, onClose, onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [actual, setActual] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the last forecast around so the exit animation still has a body.
  const [shown, setShown] = useState<GrowthPrediction | null>(prediction);
  const open = prediction !== null;
  const bounds = predictionBounds(shown?.kind ?? "time");
  const invalidActual =
    shown !== null && actual !== null && !isPredictionValue(shown.kind, actual, true);

  useEffect(() => {
    if (!prediction) return;
    setShown(prediction);
    setActual(prediction.actual);
    setBusy(false);
  }, [prediction]);

  const save = async () => {
    if (!prediction || busy) return;
    if (actual === null || !isPredictionValue(prediction.kind, actual, true)) return;
    setBusy(true);
    try {
      await window.prism.settleGrowthPrediction(prediction.id, actual);
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_PREDICTION_RANGE")) {
        showToast(t["growth.predictionRange"], "error");
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
      title={t["growth.predictionSettle"]}
      position="center"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || actual === null || invalidActual}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      {shown && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge palette={tagColor(PREDICTION_KIND_COLORS[shown.kind])}>
              {t[PREDICTION_KIND_KEYS[shown.kind]]}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-body text-primary">{shown.subject}</span>
          </div>
          <div className="flex items-center gap-2 text-caption">
            <span className="text-muted">{t["growth.predictionPredicted"]}</span>
            <span className="tabular-nums text-secondary">{shown.predicted}</span>
            <span className="tabular-nums text-faint">{shown.predictedOn}</span>
          </div>
          <label className="block space-y-1">
            <span className="block text-caption text-muted">{t["growth.predictionActual"]}</span>
            <NumberInput
              className="w-full"
              autoFocus
              step={predictionStep(shown.kind)}
              min={bounds.min}
              max={bounds.max}
              allowEmpty
              value={actual}
              invalid={invalidActual}
              onChange={setActual}
            />
          </label>
          <p className="text-caption text-faint">{t[PREDICTION_UNIT_KEYS[shown.kind]]}</p>
        </div>
      )}
    </Modal>
  );
}
