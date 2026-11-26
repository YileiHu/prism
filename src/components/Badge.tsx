import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "neutral" | "outline";

interface BadgeProps extends Omit<HTMLAttributes<HTMLElement>, "color" | "onClick"> {
  variant?: BadgeVariant;
  palette?: { name: string; bg: string };
  children: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-hover/50 text-tertiary",
  outline: "border border-strong/40 bg-tint/[0.05] text-secondary",
};

export default function Badge({
  variant = "neutral",
  palette,
  className = "",
  style,
  children,
  ...rest
}: BadgeProps) {
  const colorStyle: CSSProperties | undefined = palette
    ? { color: palette.name, backgroundColor: palette.bg, ...style }
    : style;
  const classes = [
    "inline-flex h-5 items-center rounded-chip px-1.5 whitespace-nowrap text-meta",
    palette ? "" : VARIANT_CLASSES[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span {...rest} className={classes} style={colorStyle}>
      {children}
    </span>
  );
}
