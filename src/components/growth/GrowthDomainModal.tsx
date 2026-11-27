import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import NumberInput from "../NumberInput";
import { TAG_COLORS, type TagColorKey } from "../../lib/colors";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GrowthDomain } from "../../shared/models";
import GrowthThemeSwatches from "./GrowthThemeSwatches";

interface Props {
  open: boolean;
  domains: GrowthDomain[];
  onClose: () => void;
  onSaved: () => void;
}

interface Draft {
  name: string;
  weight: number | null;
  theme: string;
}

/**
 * Domain names and weights are the L1 "allocation" knob: weight is a budget
 * intent and never feeds the capability score, so the sum is only shown, not
 * forced to 1.
 */
export default function GrowthDomainModal({ open, domains, onClose, onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [paletteFor, setPaletteFor] = useState<number | null>(null);
  const triggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<number, Draft> = {};
    for (const domain of domains) {
      next[domain.id] = {
        name: domain.name,
        weight: domain.weight,
        theme: domain.theme,
      };
    }
    setDrafts(next);
    setPaletteFor(null);
  }, [open, domains]);

  const sum = domains.reduce((total, domain) => {
    const value = drafts[domain.id]?.weight ?? domain.weight;
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const domain of domains) {
        const draft = drafts[domain.id];
        if (!draft) continue;
        const name = draft.name.trim();
        if (!name) continue;
        const weight = draft.weight;
        if (weight === null) continue;
        const theme = draft.theme || domain.theme;
        if (
          name === domain.name &&
          Math.abs(weight - domain.weight) < 1e-6 &&
          theme === domain.theme
        ) {
          continue;
        }
        await window.prism.updateGrowthDomain(domain.id, { name, weight, theme });
      }
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
      title={t["growth.editDomains"]}
      position="center"
      size="md"
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
        <p className="text-caption text-faint">{t["growth.weightHint"]}</p>
        <div className="grid grid-cols-[44px_minmax(0,1fr)_88px] gap-x-3 gap-y-2">
          <span />
          <span className="text-caption text-muted">{t["growth.capabilityName"]}</span>
          <span className="text-caption text-muted">{t["growth.domainWeight"]}</span>
          {domains.map((domain) => {
            const draft = drafts[domain.id];
            const theme = (draft?.theme ?? domain.theme) as TagColorKey;
            const palette = TAG_COLORS.find((color) => color.key === theme) ?? TAG_COLORS[0];
            const paletteOpen = paletteFor === domain.id;
            return (
              <div key={domain.id} className="col-span-3 space-y-1.5">
                <div className="grid grid-cols-[44px_minmax(0,1fr)_88px] items-center gap-3">
                  <button
                    ref={(node) => {
                      triggerRefs.current[domain.id] = node;
                    }}
                    type="button"
                    aria-label={t["growth.domainTheme"]}
                    title={t["growth.domainTheme"]}
                    aria-expanded={paletteOpen}
                    aria-controls={paletteOpen ? `growth-domain-palette-${domain.id}` : undefined}
                    onClick={() =>
                      setPaletteFor((previous) => (previous === domain.id ? null : domain.id))
                    }
                    className="inline-flex h-8 w-11 items-center justify-center gap-1 rounded-control p-1 text-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <span
                      className="h-5 w-5 flex-shrink-0 rounded-full ring-1 ring-strong/40"
                      style={{ backgroundColor: palette.bar }}
                    />
                    <ChevronDown
                      size={12}
                      aria-hidden
                      className={`flex-shrink-0 text-faint transition-transform ${
                        paletteOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <Input
                    className="w-full"
                    value={draft?.name ?? domain.name}
                    aria-label={t["growth.capabilityName"]}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [domain.id]: {
                          name: event.target.value,
                          weight: prev[domain.id]?.weight ?? domain.weight,
                          theme: prev[domain.id]?.theme ?? domain.theme,
                        },
                      }))
                    }
                  />
                  <NumberInput
                    className="w-full"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={draft?.weight ?? domain.weight}
                    aria-label={t["growth.domainWeight"]}
                    onChange={(weight) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [domain.id]: {
                          name: prev[domain.id]?.name ?? domain.name,
                          weight,
                          theme: prev[domain.id]?.theme ?? domain.theme,
                        },
                      }))
                    }
                  />
                </div>
                {paletteOpen && (
                  <div
                    id={`growth-domain-palette-${domain.id}`}
                    role="group"
                    aria-label={t["growth.domainTheme"]}
                    className="w-full rounded-control border border-line/60 bg-elevated/40 p-2"
                  >
                    <GrowthThemeSwatches
                      size="md"
                      value={theme}
                      onChange={(key) => {
                        setDrafts((prev) => ({
                          ...prev,
                          [domain.id]: {
                            name: prev[domain.id]?.name ?? domain.name,
                            weight: prev[domain.id]?.weight ?? domain.weight,
                            theme: key,
                          },
                        }));
                        setPaletteFor(null);
                        requestAnimationFrame(() => triggerRefs.current[domain.id]?.focus());
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-caption text-faint">
          {t["growth.weightSum"].replace("{sum}", sum.toFixed(2))}
        </p>
      </div>
    </Modal>
  );
}
