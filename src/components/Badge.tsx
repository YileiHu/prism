import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "warning" | "danger";

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "color"> {
  tone?: BadgeTone;
  palette?: { name: string; bg: string };
  children: ReactNode;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-hover/50 text-tertiary",
  accent: "bg-[var(--accent-muted)] text-[var(--accent-text)]",
  warning: "border border-warning/40 bg-warning/10 text-warning",
  danger: "border border-danger/40 bg-danger/10 text-danger",
};

export default function Badge({
  tone = "neutral",
  palette,
  className = "",
  style,
  children,
  ...rest
}: BadgeProps) {
  const colorStyle: CSSProperties | undefined = palette
    ? { color: palette.name, backgroundColor: palette.bg, ...style }
    : style;

  return (
    <span
      {...rest}
      className={`inline-flex items-center px-1.5 py-0.5 rounded-chip text-meta whitespace-nowrap ${
        palette ? "" : TONE_CLASSES[tone]
      } ${className}`}
      style={colorStyle}
    >
      {children}
    </span>
  );
}
