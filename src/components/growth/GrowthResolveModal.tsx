import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { Textarea } from "../Input";
import SegmentedToggle from "../SegmentedToggle";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GrowthChallenge, GrowthResolveResult } from "../../shared/models";

interface Props {
  open: boolean;
  challenge: GrowthChallenge | null;
  onClose: () => void;
  onResolved: (result: GrowthResolveResult) => void;
}

type Outcome = "passed" | "failed" | "abandoned";

export default function GrowthResolveModal({ open, challenge, onClose, onResolved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [outcome, setOutcome] = useState<Outcome>("passed");
  const [attribution, setAttribution] = useState<"stats" | "buff">("stats");
  const [note, setNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOutcome("passed");
    setAttribution("stats");
    setNote("");
    setReflection(challenge?.reflection ?? "");
  }, [open, challenge?.id, challenge?.reflection]);

  const submit = async () => {
    if (!challenge || busy) return;
    setBusy(true);
    try {
      const result = await window.prism.resolveGrowthChallenge(challenge.id, {
        status: outcome,
        attribution: outcome === "passed" ? attribution : null,
        resultNote: note,
        reflection,
      });
      onResolved(result);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_ATTRIBUTION_REQUIRED")) {
        showToast(t["growth.attributionRequired"], "error");
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
      title={
        challenge
          ? t["growth.resolveTitle"].replace("{name}", challenge.title)
          : t["growth.challengeResolve"]
      }
      size="md"
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void submit()}>
            {t["growth.challengeResolve"]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className="block text-caption text-muted">{t["growth.challengeResult"]}</span>
          <SegmentedToggle
            value={outcome}
            options={[
              { value: "passed", label: t["growth.challengePass"] },
              { value: "failed", label: t["growth.challengeFail"] },
              { value: "abandoned", label: t["growth.challengeAbandon"] },
            ]}
            onChange={setOutcome}
            stretch
            className="w-full"
          />
        </div>

        {outcome === "passed" && (
          <div className="space-y-1.5">
            <span className="block text-caption text-muted">{t["growth.attribution"]}</span>
            <SegmentedToggle
              value={attribution}
              options={[
                { value: "stats", label: t["growth.attribution.stats"] },
                { value: "buff", label: t["growth.attribution.buff"] },
              ]}
              onChange={setAttribution}
              stretch
              className="w-full"
            />
            <p className="text-caption text-faint">{t["growth.attributionHint"]}</p>
          </div>
        )}

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.resultNote"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={note}
            placeholder={t["growth.resultNotePlaceholder"]}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.challengeReflection"]}</span>
          <Textarea
            className="w-full"
            rows={6}
            value={reflection}
            placeholder={t["growth.challengeReflectionPlaceholder"]}
            onChange={(event) => setReflection(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
