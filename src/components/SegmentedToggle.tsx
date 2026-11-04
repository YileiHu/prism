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
  /** Let every option share the full width equally. */
  stretch?: boolean;
}

export default function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  className = "",
  stretch = false,
}: Props<T>) {
  return (
    <div className={`segmented-toggle flex rounded-control border p-0.5 flex-shrink-0 ${className}`}>
      {options.map(({ value: optionValue, label, icon: Icon }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={`segmented-option flex items-center gap-1 px-2 py-0.5 text-caption rounded-chip transition-colors cursor-pointer ${
              stretch ? "flex-1 justify-center" : ""
            } ${active ? "" : "text-muted hover:text-secondary"}`}
          >
            {Icon && <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
