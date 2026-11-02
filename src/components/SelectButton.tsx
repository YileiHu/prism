import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { CONTROL_CLASSES } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  align?: "left" | "right";
  side?: "bottom" | "top";
}

export default function SelectButton({
  value,
  options,
  onChange,
  placeholder,
  className = "",
  disabled = false,
  align,
  side,
}: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const muted = value === "" || selected === undefined;

  return (
    <div ref={anchorRef} className={className || "w-52"}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((prev) => !prev); }}
        className={`${CONTROL_CLASSES} w-full flex items-center justify-between gap-3 text-left hover:border-strong`}
      >
        <span className={`truncate ${muted ? "text-muted" : "text-primary"}`}>
          {selected?.label ?? placeholder ?? value}
        </span>
        <ChevronDown size={14} className="text-muted flex-shrink-0" />
      </button>
      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align={align}
        side={side}
        matchWidth
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            active={value === option.value}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </div>
  );
}
