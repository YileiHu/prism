import type { LucideIcon } from "lucide-react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface Props<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: Props<T>) {
  return (
    <div className={`flex rounded-control border border-line/50 p-0.5 flex-shrink-0 ${className}`}>
      {options.map(({ value: optionValue, label, icon: Icon }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={`flex items-center gap-1 px-2 py-0.5 text-caption rounded-chip transition-colors cursor-pointer ${
              active
                ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
                : "text-muted hover:text-secondary"
            }`}
          >
            {Icon && <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
