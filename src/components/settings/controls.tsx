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

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked}
      onClick={() => onChange(!checked)}
      className={`switch-track relative w-9 h-5 rounded-full transition-colors ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--inset-bg)]"
      }`}
    >
      <span
        className={`switch-thumb absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
        style={{ left: 0 }}
      />
    </button>
  );
}

export function Select({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <SelectButton
      value={value}
      options={options}
      onChange={onChange}
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

export function NumberInput({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-24 text-primary"
      />
      {suffix && <span className="text-caption text-muted">{suffix}</span>}
    </div>
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

