import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Input from "../Input";
import SelectButton, { type SelectOption } from "../SelectButton";

export type { SelectOption };

export function SettingRow({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3 bg-surface rounded-control border border-line/50">
      <div className="min-w-0">
        <div className="text-body font-medium text-secondary">{label}</div>
        {description && <p className="text-caption text-muted mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function SettingBlock({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3 bg-surface rounded-control border border-line/50">
      <div className="text-body font-medium text-secondary">{label}</div>
      {description && <p className="text-caption text-muted mt-0.5 mb-2.5">{description}</p>}
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch-track flex h-5 w-9 items-center rounded-full p-px transition-colors ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--inset-bg)]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span
        className={`switch-thumb h-4 w-4 flex-shrink-0 rounded-full transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function Select({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <SelectButton
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      className={className || "w-52"}
    />
  );
}

export function TextField({
  value,
  onCommit,
  placeholder,
  mono = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") setDraft(value);
      }}
      placeholder={placeholder}
      className={`w-full ${mono ? "font-mono" : ""}`}
    />
  );
}

// Slider previews while dragging and persists on release/keyup. The displayed
// value tracks the draft so the label updates during the drag.
export function Slider({
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  const progress = max > min ? ((draft - min) / (max - min)) * 100 : 0;
  return (
    <div className="flex items-center gap-3 w-64">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        style={{ "--slider-progress": `${progress}%` } as CSSProperties}
        className="flex-1 cursor-pointer"
      />
      <span className="w-16 text-right text-caption text-tertiary tabular-nums">
        {format ? format(draft) : draft}
      </span>
    </div>
  );
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-section font-semibold text-primary mb-1">{title}</h3>
      {description && <p className="text-caption text-muted">{description}</p>}
    </div>
  );
}

