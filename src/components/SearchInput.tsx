import { forwardRef, type InputHTMLAttributes } from "react";
import { Search, type LucideIcon } from "lucide-react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (v: string) => void;
  icon?: LucideIcon;
  wrapperClassName?: string;
}

const SearchInput = forwardRef<HTMLInputElement, Props>(({ value, onChange, icon: Icon = Search, wrapperClassName = "", ...rest }, ref) => (
  <div className={`relative ${wrapperClassName}`}>
    <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-elevated border border-strong rounded-full pl-8 pr-3 py-1 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
      {...rest}
    />
  </div>
));

SearchInput.displayName = "SearchInput";

export default SearchInput;
