import type { CSSProperties, ReactNode } from "react";

interface GlowBadgeProps {
  children: ReactNode;
  /** Shared glow treatment for accent highlights and warning attention. */
  tone?: "accent" | "warning";
  /** 0..1; controls background alpha and glow radius. Defaults to 0.35. */
  intensity?: number;
  /** “Nothing backs this yet”: dashed border, transparent, 50% opacity. */
  muted?: boolean;
  title?: string;
  className?: string;
}

const TONES = {
  accent: {
    text: "var(--accent-text)",
    border: "var(--accent-border)",
    rgb: "var(--accent-rgb)",
  },
  warning: {
    text: "rgb(var(--warning))",
    border: "rgb(var(--warning) / 0.4)",
    rgb: "var(--warning)",
  },
} as const;

export default function GlowBadge({
  children,
  tone = "accent",
  intensity = 0.35,
  muted = false,
  title,
  className = "",
}: GlowBadgeProps) {
  const palette = TONES[tone];
  const strength = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.35;
  const style: CSSProperties = muted
    ? {
        color: palette.text,
        opacity: 0.5,
        borderColor: palette.border,
        borderStyle: "dashed",
        backgroundColor: "transparent",
        boxShadow: "none",
      }
    : {
        color: palette.text,
        borderColor: palette.border,
        backgroundColor: `rgb(${palette.rgb} / ${0.06 + strength * 0.25})`,
        boxShadow: `0 0 ${2 + strength * 11}px rgb(${palette.rgb} / ${
          0.05 + strength * 0.5
        })`,
      };

  return (
    <span
      className={`inline-flex h-5 flex-shrink-0 items-center justify-center whitespace-nowrap rounded-chip border px-1.5 text-meta font-medium leading-none tabular-nums transition-[box-shadow,background-color,border-color,color] duration-200 ${className}`}
      style={style}
      title={title}
      aria-label={title}
    >
      {children}
    </span>
  );
}
