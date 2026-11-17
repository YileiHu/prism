import type { ReactNode } from "react";

interface Props {
  /** 0–1; clamped. */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  trackOpacity?: number;
  label?: ReactNode;
  title?: string;
  className?: string;
}

/**
 * Small SVG progress ring shared by the project page, the project sidebar and
 * the Upcoming today card. All colors come from callers (tokens or palette),
 * so the component keeps working in both themes.
 */
export default function GtdProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  color = "var(--accent)",
  trackColor = "rgb(var(--c-line) / 0.55)",
  trackOpacity,
  label,
  title,
  className = "",
}: Props) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className={`relative inline-flex flex-shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeOpacity={trackOpacity}
          strokeWidth={strokeWidth}
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      {label !== undefined && (
        <span className="absolute inset-0 flex items-center justify-center text-meta tabular-nums text-secondary">
          {label}
        </span>
      )}
    </span>
  );
}
