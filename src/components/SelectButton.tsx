import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { CONTROL_CLASSES } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface Props {
  value: string;
  /** Flat list. Ignored when `groups` is provided. */
  options?: SelectOption[];
  /** Sectioned list: long capability/project lists are grouped by domain. */
  groups?: SelectGroup[];
  /** Adds a first item that clears the value, e.g. "none". */
  emptyLabel?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Replaces the trigger's accessible name, which is otherwise just the value. */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  align?: "left" | "right";
  side?: "bottom" | "top";
  /** `pill` is the compact toolbar capsule; `default` is the form field. */
  variant?: "default" | "pill";
}

export default function SelectButton({
  value,
  options,
  groups,
  emptyLabel,
  onChange,
  placeholder,
  ariaLabel,
  className = "",
  disabled = false,
  align,
  side,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const allOptions = groups ? groups.flatMap((group) => group.options) : (options ?? []);
  const selected = allOptions.find((option) => option.value === value);
  const muted = value === "" || selected === undefined;
  const triggerLabel =
    selected?.label ?? (value === "" ? emptyLabel : undefined) ?? placeholder ?? value;

  const renderOption = (option: SelectOption) => (
    <DropdownMenuItem
      key={option.value}
      onClick={() => {
        onChange(option.value);
        setOpen(false);
      }}
      active={value === option.value}
    >
      <span className="min-w-0 flex-1 break-words text-left">{option.label}</span>
    </DropdownMenuItem>
  );

  const emptyItem =
    emptyLabel !== undefined ? (
      <DropdownMenuItem
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
        active={value === ""}
      >
        <span className="min-w-0 flex-1 break-words text-left">{emptyLabel}</span>
      </DropdownMenuItem>
    ) : null;
  return (
    <div ref={anchorRef} className={className || "w-52"}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        title={triggerLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
        className={
          variant === "pill"
            ? "theme-hover field-inset flex h-7 w-full items-center justify-between gap-2 rounded-pill border px-3 text-caption leading-none text-left transition-colors hover:border-strong"
            : `theme-hover ${CONTROL_CLASSES} w-full flex items-center justify-between gap-3 text-left hover:border-strong`
        }
      >
        <span className={`truncate ${muted ? "text-muted" : "text-primary"}`}>
          {triggerLabel}
        </span>
        <ChevronDown size={variant === "pill" ? 12 : 14} className="text-muted flex-shrink-0" />
      </button>
      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align={align}
        side={side}
        matchWidth
        padding={groups ? "none" : "default"}
        className={groups ? "pb-1" : ""}
      >
        {emptyItem && (groups ? <div className="px-1 pt-1">{emptyItem}</div> : emptyItem)}
        {groups
          ? groups.map((group, index) => (
              <div key={group.label}>
                <div
                  className={`sticky top-0 z-10 bg-elevated px-3 pb-1 pt-2 text-meta text-faint ${
                    index === 0 && emptyLabel === undefined ? "rounded-t-control" : ""
                  }`}
                >
                  {group.label}
                </div>
                <div className="px-1">{group.options.map(renderOption)}</div>
              </div>
            ))
          : (options ?? []).map(renderOption)}
      </DropdownMenu>
    </div>
  );
}
