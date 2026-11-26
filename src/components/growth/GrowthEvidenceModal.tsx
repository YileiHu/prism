import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import DateField from "../DateField";
import SelectButton from "../SelectButton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey } from "../../lib/dates";
import type { GrowthEvidenceKind } from "../../shared/models";
import { EVIDENCE_KINDS, EVIDENCE_KIND_KEYS } from "./labels";

interface Props {
  open: boolean;
  capabilityId: number | null;
  capabilityName: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GrowthEvidenceModal({
  open,
  capabilityId,
  capabilityName,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [kind, setKind] = useState<GrowthEvidenceKind>("feedback");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [happenedOn, setHappenedOn] = useState(() => dateKey(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("feedback");
    setTitle("");
    setDetail("");
    setUrl("");
    setHappenedOn(dateKey(new Date()));
  }, [open]);

  const kindOptions = useMemo(
    () => EVIDENCE_KINDS.map((value) => ({ value, label: t[EVIDENCE_KIND_KEYS[value]] })),
    [t],
  );

  const save = async () => {
    if (capabilityId === null || busy) return;
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await window.prism.addGrowthEvidence(capabilityId, {
        kind,
        title: clean,
        detail: detail.trim(),
        url: url.trim(),
        happenedOn: happenedOn === "" ? null : happenedOn,
      });
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
      title={`${t["growth.addEvidence"]}${capabilityName ? ` · ${capabilityName}` : ""}`}
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="block text-caption text-muted">{t["growth.evidenceKind"]}</span>
            <SelectButton
              value={kind}
              options={kindOptions}
              onChange={(value) => setKind(value as GrowthEvidenceKind)}
              className="w-full"
            />
          </div>
          <label className="block space-y-1">
            <span className="block text-caption text-muted">{t["growth.evidenceDate"]}</span>
            <DateField className="w-full" value={happenedOn} onChange={setHappenedOn} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.evidenceTitle"]}</span>
          <Input
            className="w-full"
            value={title}
            autoFocus
            placeholder={t["growth.evidenceTitlePlaceholder"]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.evidenceDetail"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.evidenceUrl"]}</span>
          <Input
            className="w-full"
            value={url}
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
