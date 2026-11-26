import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import SelectButton from "../SelectButton";
import SegmentedToggle from "../SegmentedToggle";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { tagColor } from "../../lib/colors";
import type { GrowthSelfModelEntry, GrowthSelfSection } from "../../shared/models";
import { CONFIDENCE_HINT_KEYS, CONFIDENCE_OPTIONS, SELF_SECTIONS, SELF_SECTION_COLORS, SELF_SECTION_HINT_KEYS, SELF_SECTION_KEYS } from "./labels";

interface Props {
  open: boolean;
  /** Entry being edited; null means "write a new one". */
  entry: GrowthSelfModelEntry | null;
  /** Section preselected when adding. */
  section: GrowthSelfSection;
  onClose: () => void;
  onSaved: (entry: GrowthSelfModelEntry) => void;
}

export default function GrowthSelfModelModal({
  open,
  entry,
  section,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [draftSection, setDraftSection] = useState<GrowthSelfSection>(section);
  const [statement, setStatement] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confidence, setConfidence] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftSection(entry?.section ?? section);
    setStatement(entry?.statement ?? "");
    setEvidence(entry?.evidence ?? "");
    setConfidence(String(entry?.confidence ?? 1));
    setBusy(false);
  }, [open, entry, section]);

  const sectionOptions = useMemo(
    () => SELF_SECTIONS.map((value) => ({ value, label: t[SELF_SECTION_KEYS[value]] })),
    [t],
  );

  const save = async () => {
    const clean = statement.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const saved = entry
        ? await window.prism.updateGrowthSelfModel(entry.id, {
            section: draftSection,
            statement: clean,
            evidence,
            confidence: Number(confidence),
          })
        : await window.prism.addGrowthSelfModel({
            section: draftSection,
            statement: clean,
            evidence,
            confidence: Number(confidence),
          });
      onSaved(saved);
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
      title={entry ? t["growth.edit"] : t["growth.selfAdd"]}
      position="center"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !statement.trim()}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-caption text-muted">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tagColor(SELF_SECTION_COLORS[draftSection]).bar }}
            />
            {t["growth.self.section"]}
          </span>
          <SelectButton
            className="w-full"
            value={draftSection}
            options={sectionOptions}
            onChange={(value) => setDraftSection(value as GrowthSelfSection)}
          />
          <p className="text-caption text-faint">{t[SELF_SECTION_HINT_KEYS[draftSection]]}</p>
        </div>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.self.statement"]}</span>
          <Textarea
            className="w-full"
            rows={3}
            autoFocus
            value={statement}
            placeholder={t["growth.selfStatementPlaceholder"]}
            onChange={(event) => setStatement(event.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.self.evidence"]}</span>
          <Input
            className="w-full"
            value={evidence}
            placeholder={t["growth.selfEvidencePlaceholder"]}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </label>
        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.confidence"]}</span>
          <SegmentedToggle
            className="w-full"
            stretch
            value={confidence}
            options={CONFIDENCE_OPTIONS}
            onChange={setConfidence}
          />
          <p className="text-caption text-faint">
            {t[CONFIDENCE_HINT_KEYS[Number(confidence) as 0 | 1 | 2 | 3 | 4 | 5]]}
          </p>
        </div>
      </div>
    </Modal>
  );
}
