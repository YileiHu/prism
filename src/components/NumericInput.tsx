import type { InputHTMLAttributes, ReactNode } from "react";
import Input from "./Input";

interface Props
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "inputMode"
  > {
  value: string;
  onChange: (value: string) => void;
  /** Allow a leading minus (mood scale, deltas). */
  allowNegative?: boolean;
  /** Allow one decimal point (weights, minutes). */
  allowDecimal?: boolean;
  /** Short unit kept outside the input value ("px", "分钟"). */
  suffix?: ReactNode;
  /** Error treatment: danger border plus `aria-invalid`. */
  invalid?: boolean;
}

/**
 * Number entry without the browser's spinner buttons. The app bans native
 * number inputs (`type="number"`) because the up/down arrows look foreign and
 * silently clamp while typing; this keeps a plain text field and filters the
 * characters instead. Validation stays on the caller/server side.
 *
 * `className` sizes the whole field row (input + suffix), not just the input.
 */
export default function NumericInput({
  value,
  onChange,
  allowNegative = false,
  allowDecimal = false,
  suffix,
  invalid = false,
  className = "",
  disabled,
  ...rest
}: Props) {
  const clean = (raw: string) => {
    const allowed = allowDecimal
      ? allowNegative
        ? /[^0-9.-]/g
        : /[^0-9.]/g
      : allowNegative
        ? /[^0-9-]/g
        : /[^0-9]/g;
    let next = raw.replace(allowed, "");
    if (allowDecimal) {
      const firstDot = next.indexOf(".");
      if (firstDot !== -1) {
        next =
          next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
      }
    }
    if (allowNegative) {
      next = (next.startsWith("-") ? "-" : "") + next.replace(/-/g, "");
    }
    return next;
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Input
        {...rest}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange(clean(event.target.value))}
        className="w-full min-w-0"
      />
      {suffix && (
        <span className={`shrink-0 text-caption text-muted ${disabled ? "opacity-40" : ""}`}>
          {suffix}
        </span>
      )}
    </div>
  );
}
