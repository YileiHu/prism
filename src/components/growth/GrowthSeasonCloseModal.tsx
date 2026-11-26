import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { Textarea } from "../Input";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GrowthSeason } from "../../shared/models";

interface Props {
  open: boolean;
  season: GrowthSeason | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Settlement is its own dialog: the season form stays a pure edit form, and the
 * only irreversible season action gets a separate confirmation surface.
 */
export default function GrowthSeasonCloseModal({ open, season, onClose, onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOutcome(season?.outcome ?? "");
    setBusy(false);
  }, [open, season?.id, season?.outcome]);

  if (!season) return null;

  const closeSeason = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.prism.closeGrowthSeason(season.id, outcome);
      onSaved();
      onClose();
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["growth.seasonClose"]}
      size="md"
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void closeSeason()}>
            {t["growth.seasonClose"]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body text-secondary">{season.title}</p>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.seasonOutcome"]}</span>
          <Textarea
            className="w-full"
            rows={4}
            autoFocus
            value={outcome}
            placeholder={t["growth.seasonOutcomePlaceholder"]}
            onChange={(event) => setOutcome(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
