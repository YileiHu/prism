import type { LucideIcon } from "lucide-react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Rendered but not clickable — used when a step needs a precondition. */
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** Stretch the control to the available width (options are equal by default). */
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
    <div
      className={`segmented-toggle relative inline-grid grid-flow-col auto-cols-fr flex-shrink-0 rounded-pill p-[2px] ${stretch ? "w-full" : ""} ${className}`}
    >
      {options.map(({ value: optionValue, label, icon: Icon, disabled = false }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            aria-pressed={active}
            data-active={active ? "true" : undefined}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={`segmented-option relative flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-3 h-[27px] py-0 leading-none text-caption rounded-pill transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${active ? "theme-active" : "text-muted hover:text-secondary"}`}
          >
            {Icon && <Icon size={12} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
