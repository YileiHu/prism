import type { CSSProperties } from "react";
import { CheckCircle2, Flag, MinusCircle, XCircle } from "lucide-react";
import type {
  GrowthChallengeStatus,
  GrowthHalfLife,
  GrowthPortability,
  GrowthStatus,
} from "../../shared/models";
import { useT } from "../../i18n";
import Badge from "../Badge";
import GlowBadge from "../GlowBadge";
import { CONFIDENCE_NAME_KEYS } from "./labels";

/** One status glyph for challenge rows, posters and detail headers. */
export function ChallengeStatusIcon({ value }: { value: GrowthChallengeStatus }) {
  return value === "passed" ? (
    <CheckCircle2 size={14} className="text-success" />
  ) : value === "failed" ? (
    <XCircle size={14} className="text-danger" />
  ) : value === "abandoned" ? (
    <MinusCircle size={14} className="text-faint" />
  ) : (
    <Flag size={14} className="text-[var(--accent-text)]" />
  );
}

/**
 * Shape carries the category, colour carries the state. Half-life and
 * portability are properties, not good/bad, so they never use accent/danger.
 */
export function HalfLifeBadge({ value }: { value: GrowthHalfLife }) {
  const { t } = useT();
  const mark = value === "long" ? "◆" : value === "mid" ? "◇" : "○";
  const label =
    value === "long"
      ? t["growth.halfLife.long"]
      : value === "mid"
        ? t["growth.halfLife.mid"]
        : t["growth.halfLife.short"];
  return (
    <Badge variant="outline" title={t["growth.halfLife"]} aria-label={label}>
      {mark} {label}
    </Badge>
  );
}

export function PortabilityBadge({ value }: { value: GrowthPortability }) {
  const { t } = useT();
  const mark = value === "high" ? "▲" : "▽";
  const label = value === "high" ? t["growth.portability.high"] : t["growth.portability.low"];
  return (
    <Badge variant="outline" title={t["growth.portability"]} aria-label={label}>
      {mark} {label}
    </Badge>
  );
}

interface ConfidenceBadgeProps {
  /** 0..5 effective confidence. */
  confidence: number;
  /** Half-width of the confidence band; shown in the tooltip only. */
  band?: number | null;
  title?: string;
  className?: string;
}

/**
 * The C0–C5 chip shared by the capability row, its detail panel and the
 * snapshot history. The accent glow scales with confidence; C0 keeps a
 * dashed border because nothing backs the claim yet.
 *
 * It wraps the shared GlowBadge, but its height/glow/border encode the value,
 * so it stays a domain meter rather than a generic label.
 */
export function ConfidenceBadge({
  confidence,
  band = null,
  title,
  className = "",
}: ConfidenceBadgeProps) {
  const { t } = useT();
  const value = Math.max(0, Math.min(5, Math.round(confidence)));
  const label =
    title ??
    `${t[CONFIDENCE_NAME_KEYS[value]]}${band === null ? "" : ` · ±${band}`}`;

  return (
    <GlowBadge
      intensity={value / 5}
      muted={value === 0}
      title={label}
      className={className}
    >
      C{value}
    </GlowBadge>
  );
}

export function StatusBadge({ value }: { value: GrowthStatus }) {
  const { t } = useT();
  const label =
    value === "active"
      ? t["growth.status.active"]
      : value === "observe"
        ? t["growth.status.observe"]
        : t["growth.status.archived"];
  const tone: CSSProperties =
    value === "archived"
      ? {
          borderStyle: "dashed",
          borderColor: "rgb(var(--c-strong) / 0.3)",
          color: "rgb(var(--c-faint))",
        }
      : value === "observe"
        ? {
            borderStyle: "dashed",
            borderColor: "rgb(var(--c-strong) / 0.4)",
            color: "rgb(var(--c-muted))",
          }
        : { borderColor: "var(--accent-border)", color: "var(--accent-text)" };
  return (
    <Badge variant="outline" style={tone}>
      {label}
    </Badge>
  );
}
