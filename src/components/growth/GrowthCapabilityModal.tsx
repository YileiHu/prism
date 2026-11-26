import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import DateField from "../DateField";
import SelectButton from "../SelectButton";
import SegmentedToggle from "../SegmentedToggle";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { levelScore, levelGrade, confidenceBand } from "../../lib/growth";
import type { GrowthCapability, GrowthDomain } from "../../shared/models";
import {
  CONFIDENCE_HINT_KEYS,
  CONFIDENCE_NAME_KEYS,
  CONFIDENCE_OPTIONS,
  LEVEL_HINT_KEYS,
  LEVEL_NAME_KEYS,
  LEVEL_VALUE_OPTIONS,
} from "./labels";

interface Props {
  open: boolean;
  /** null = create */
  capability: GrowthCapability | null;
  domains: GrowthDomain[];
  capabilities: GrowthCapability[];
  defaultDomainId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GrowthCapabilityModal({
  open,
  capability,
  domains,
  capabilities,
  defaultDomainId,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [domainId, setDomainId] = useState<number | null>(null);
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("2");
  const [confidence, setConfidence] = useState("1");
  const [halfLife, setHalfLife] = useState<"long" | "mid" | "short">("mid");
  const [portability, setPortability] = useState<"high" | "low">("high");
  const [status, setStatus] = useState<"active" | "observe" | "archived">("active");
  const [targetLevel, setTargetLevel] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [evidenceDefinition, setEvidenceDefinition] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (capability) {
      setDomainId(capability.domainId);
      setParentId(capability.parentId === null ? "" : String(capability.parentId));
      setName(capability.name);
      setLevel(String(capability.level));
      setConfidence(String(capability.confidence));
      setHalfLife(capability.halfLife);
      setPortability(capability.portability);
      setStatus(capability.status);
      setTargetLevel(capability.targetLevel === null ? "" : String(capability.targetLevel));
      setTargetDate(capability.targetDate ?? "");
      setEvidenceDefinition(capability.evidenceDefinition);
      setNotes(capability.notes);
    } else {
      setDomainId(defaultDomainId ?? domains[0]?.id ?? null);
      setParentId("");
      setName("");
      setLevel("2");
      setConfidence("1");
      setHalfLife("mid");
      setPortability("high");
      setStatus("active");
      setTargetLevel("");
      setTargetDate("");
      setEvidenceDefinition("");
      setNotes("");
    }
  }, [open, capability, defaultDomainId, domains]);

  const domainOptions = useMemo(
    () => domains.map((domain) => ({ value: String(domain.id), label: domain.name })),
    [domains],
  );
  // Only roots of the same domain can be parents, which caps the tree at two
  // levels; the DB enforces the same rule.
  const parentOptions = useMemo(() => {
    const roots = capabilities.filter(
      (item) =>
        item.domainId === domainId &&
        item.parentId === null &&
        item.id !== (capability?.id ?? -1) &&
        // A root with children cannot become a child itself (would be level 3).
        !capabilities.some((child) => child.parentId === item.id),
    );
    return [
      { value: "", label: t["growth.parentNone"] },
      ...roots.map((item) => ({ value: String(item.id), label: item.name })),
    ];
  }, [capabilities, domainId, capability, t]);
  const targetOptions = useMemo(
    () => [
      { value: "", label: t["growth.targetNone"] },
      ...LEVEL_VALUE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    ],
    [t],
  );

  const levelNumber = Number(level);
  const confidenceNumber = Number(confidence);

  const save = async () => {
    if (busy) return;
    const clean = name.trim();
    if (!clean || domainId === null) return;
    setBusy(true);
    try {
      if (capability) {
        await window.prism.updateGrowthCapability(capability.id, {
          domainId,
          parentId: parentId === "" ? null : Number(parentId),
          name: clean,
          halfLife,
          portability,
          status,
          targetLevel: targetLevel === "" ? null : Number(targetLevel),
          targetDate: targetDate === "" ? null : targetDate,
          evidenceDefinition,
          notes,
        });
      } else {
        await window.prism.createGrowthCapability({
          domainId,
          parentId: parentId === "" ? null : Number(parentId),
          name: clean,
          level: levelNumber,
          confidence: confidenceNumber,
          halfLife,
          portability,
          targetLevel: targetLevel === "" ? null : Number(targetLevel),
          targetDate: targetDate === "" ? null : targetDate,
          evidenceDefinition,
          notes,
        });
      }
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_TREE_DEPTH")) showToast(t["growth.treeDepth"], "error");
      else if (message.includes("GROWTH_TREE_DOMAIN")) showToast(t["growth.treeDomain"], "error");
      else showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={capability ? t["growth.editCapability"] : t["growth.newCapability"]}
      size="lg"
      layout="dialog"
      position="center"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !name.trim() || domainId === null}
            onClick={() => void save()}
          >
            {capability ? t["growth.save"] : t["growth.create"]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.capabilityName"]}</span>
            <Input
              className="w-full"
              value={name}
              autoFocus
              placeholder={t["growth.namePlaceholder"]}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.domain"]}</span>
            <SelectButton
              value={domainId === null ? "" : String(domainId)}
              options={domainOptions}
              onChange={(value) => {
                const next = Number(value);
                setDomainId(next);
                if (parentId !== "") {
                  const stillValid = capabilities.some(
                    (item) => item.id === Number(parentId) && item.domainId === next && item.parentId === null,
                  );
                  if (!stillValid) setParentId("");
                }
              }}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.parent"]}</span>
          <SelectButton
            value={parentId}
            options={parentOptions}
            onChange={setParentId}
            className="w-full"
          />
          <p className="text-caption text-faint">{t["growth.parentHint"]}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-muted">{t["growth.level"]}</span>
            <span className="text-caption text-faint tabular-nums">
              {levelGrade(levelNumber)} {t[LEVEL_NAME_KEYS[levelNumber - 1]]} · {levelScore(levelNumber)}
            </span>
          </div>
          <SegmentedToggle
            value={level}
            options={LEVEL_VALUE_OPTIONS}
            onChange={setLevel}
            stretch
            className="w-full"
          />
          <p className="text-caption text-faint">{t[LEVEL_HINT_KEYS[levelNumber - 1]]}</p>
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
            {t[CONFIDENCE_NAME_KEYS[confidenceNumber]]}
            {confidenceBand(confidenceNumber) === null
              ? ""
              : ` · ${levelScore(levelNumber)} ±${confidenceBand(confidenceNumber)}`}
            {" · "}
            {t[CONFIDENCE_HINT_KEYS[confidenceNumber]]}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.targetLevel"]}</span>
            <SelectButton
              value={targetLevel}
              options={targetOptions}
              onChange={setTargetLevel}
              className="w-full"
            />
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.targetDate"]}</span>
            <DateField className="w-full" value={targetDate} onChange={setTargetDate} />
          </label>
        </div>

        {capability && (
          <div className="space-y-1.5">
            <span className="block text-caption text-muted">{t["growth.status"]}</span>
            <SegmentedToggle
              value={status}
              options={[
                { value: "active", label: t["growth.status.active"] },
                { value: "observe", label: t["growth.status.observe"] },
                { value: "archived", label: t["growth.status.archived"] },
              ]}
              onChange={setStatus}
              stretch
              className="w-full"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <span className="block text-caption text-muted">{t["growth.halfLife"]}</span>
            <SegmentedToggle
              value={halfLife}
              options={[
                { value: "long", label: t["growth.halfLife.long"] },
                { value: "mid", label: t["growth.halfLife.mid"] },
                { value: "short", label: t["growth.halfLife.short"] },
              ]}
              onChange={setHalfLife}
              stretch
              className="w-full"
            />
            <p className="text-caption text-faint">{t["growth.halfLifeHint"]}</p>
          </div>
          <div className="min-w-0 space-y-1.5">
            <span className="block text-caption text-muted">{t["growth.portability"]}</span>
            <SegmentedToggle
              value={portability}
              options={[
                { value: "high", label: t["growth.portability.high"] },
                { value: "low", label: t["growth.portability.low"] },
              ]}
              onChange={setPortability}
              stretch
              className="w-full"
            />
            <p className="text-caption text-faint">{t["growth.portabilityHint"]}</p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.evidenceDefinition"]}</span>
          <Textarea
            className="w-full"
            rows={3}
            value={evidenceDefinition}
            placeholder={t["growth.evidenceDefinitionPlaceholder"]}
            onChange={(event) => setEvidenceDefinition(event.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.notes"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        </div>
    </Modal>
  );
}
