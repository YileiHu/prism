import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import NumericInput from "./NumericInput";

interface Props {
  /** `null` is the empty field; callers own what an empty value means. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Bounds applied on blur, mirroring the store's own clamp. */
  min?: number;
  max?: number;
  /** 1 keeps the field integral; a fractional step allows one decimal point. */
  step?: number;
  /** Let the user clear the field (commit `null`) instead of restoring `value`. */
  allowEmpty?: boolean;
  suffix?: ReactNode;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const format = (value: number | null) => (value === null ? "" : String(value));

/**
 * A number you commit on blur instead of on every keystroke: the draft stays a
 * string so partial input ("-", "3.") is typeable, then it is parsed, clamped
 * to `min`/`max` and handed back as a number. Clamping lives here so callers
 * never repeat the same `Math.min(max, Math.max(min, …))` dance.
 */
export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  allowEmpty = false,
  suffix,
  invalid = false,
  className,
  placeholder,
  autoFocus,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const [draft, setDraft] = useState(() => format(value));

  useEffect(() => {
    setDraft(format(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (allowEmpty) {
        if (value !== null) onChange(null);
        return;
      }
      setDraft(format(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(format(next));
    if (next !== value) onChange(next);
  };

  return (
    <NumericInput
      className={className}
      suffix={suffix}
      invalid={invalid}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft}
      allowNegative={min !== undefined && min < 0}
      allowDecimal={!Number.isInteger(step)}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(format(value));
      }}
    />
  );
}
