interface Props {
  checked: boolean;
  className?: string;
}

/**
 * Selection indicator for a row or card in select mode. Purely presentational:
 * the row/card owns the click (see `ItemRow`), so this never nests a button
 * inside a clickable surface. Flat by design: solid accent fill + 1px outline,
 * no raised/inset shadow (an embossed checkbox competes with the row's tint).
 */
export default function SelectionCheck({ checked, className = "" }: Props) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none w-4 h-4 rounded-chip border flex-shrink-0 flex items-center justify-center transition-colors ${
        checked
          ? "bg-accent border-accent"
          : "bg-transparent border-strong/60"
      } ${className}`}
    >
      {checked && (
        <svg viewBox="0 0 16 16" width={11} height={11} fill="none" aria-hidden className="text-on-accent">
          <path
            d="M3.2 8.4l3.1 3.1 6.5-6.9"
            stroke="currentColor"
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
