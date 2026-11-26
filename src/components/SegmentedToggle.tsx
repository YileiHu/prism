import type { LucideIcon } from "lucide-react";
import { useSlidingThumb } from "./useSlidingThumb";

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
  const activeIndex = options.findIndex((option) => option.value === value);
  const signature = options.map((option) => option.label).join("|");
  const { containerRef, setItemRef, thumb } = useSlidingThumb(activeIndex, signature);

  return (
    <div
      ref={containerRef}
      className={`segmented-toggle relative flex flex-shrink-0 rounded-control border p-[3px] ${className}`}
    >
      {thumb && (
        <span
          aria-hidden
          className="segmented-thumb pointer-events-none absolute left-0 top-0 rounded-[5px] transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
          style={{
            transform: `translate(${thumb.left}px, ${thumb.top}px)`,
            width: thumb.width,
            height: thumb.height,
          }}
        />
      )}
      {options.map(({ value: optionValue, label, icon: Icon, disabled = false }, index) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            ref={setItemRef(index)}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={`segmented-option relative flex items-center gap-1 px-2.5 py-[5px] leading-none text-caption rounded-[5px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
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
