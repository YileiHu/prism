interface Props {
  /** 0..5 confidence. */
  value: number;
  className?: string;
  title?: string;
  /** Filled-star colour; defaults to the accent text token. */
  color?: string;
}

/** Confidence rendered as five stars; C0 is a single hollow star. */
export default function GrowthStars({ value, className = "", title, color }: Props) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className={`inline-flex items-center gap-px text-caption leading-none ${className}`}
      title={title}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < filled ? (color ? "" : "text-[var(--accent-text)]") : "text-faint"}
          style={index < filled && color ? { color } : undefined}
        >
          {index < filled ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
