import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import DateField from "../DateField";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey } from "../../lib/dates";
import type { GrowthFeedback } from "../../shared/models";

interface Props {
  open: boolean;
  /** Present = edit an existing round; null = add a new one. */
  feedback: GrowthFeedback | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GrowthFeedbackModal({ open, feedback, onClose, onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [source, setSource] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weakness, setWeakness] = useState("");
  const [friction, setFriction] = useState("");
  const [calibration, setCalibration] = useState("");
  const [receivedOn, setReceivedOn] = useState(() => dateKey(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(feedback?.source ?? "");
    setStrengths(feedback?.strengths ?? "");
    setWeakness(feedback?.weakness ?? "");
    setFriction(feedback?.friction ?? "");
    setCalibration(feedback?.calibration ?? "");
    setReceivedOn(feedback?.receivedOn ?? dateKey(new Date()));
  }, [open, feedback?.id]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const input = {
        source,
        strengths,
        weakness,
        friction,
        calibration,
        receivedOn,
      };
      if (feedback) await window.prism.updateGrowthFeedback(feedback.id, input);
      else await window.prism.addGrowthFeedback(input);
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_FEEDBACK_EMPTY")) {
        showToast(t["growth.feedbackEmpty"], "error");
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
      title={feedback ? t["growth.feedbackEdit"] : t["growth.feedbackAdd"]}
      size="lg"
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-caption text-faint">{t["growth.feedbackHint"]}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.feedbackSource"]}</span>
            <Input
              className="w-full"
              value={source}
              placeholder={t["growth.feedbackSourcePlaceholder"]}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.feedbackDate"]}</span>
            <DateField className="w-full" value={receivedOn} onChange={setReceivedOn} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.feedbackStrengths"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.feedbackWeakness"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={weakness}
            onChange={(event) => setWeakness(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.feedbackFriction"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={friction}
            onChange={(event) => setFriction(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.feedbackCalibration"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={calibration}
            placeholder={t["growth.feedbackCalibrationPlaceholder"]}
            onChange={(event) => setCalibration(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
