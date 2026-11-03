import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-subtle' | 'ghost' | 'ghost-danger' | 'info';
type ButtonSize = 'xs' | 'sm' | 'md' | 'icon-xs' | 'icon-sm' | 'icon-md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs:          'px-3 py-1.5 text-caption gap-1 rounded-control',
  sm:          'px-4 py-2 text-body gap-1.5 rounded-control',
  md:          'px-5 py-2 text-body gap-1.5 rounded-control',
  'icon-xs':  'p-0.5 rounded-chip',
  'icon-sm':  'w-8 h-8 rounded-control',
  'icon-md':  'w-9 h-9 rounded-control',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:        'surface-raised text-[var(--accent-text)] font-medium enabled:hover:bg-[var(--accent-muted)]',
  secondary:      'text-tertiary hover:text-primary hover:bg-elevated',
  danger:         'surface-raised-fill bg-danger hover:bg-danger/90 text-on-danger font-medium',
  'danger-subtle': 'bg-danger/10 hover:bg-danger/20 text-danger',
  ghost:          'text-muted hover:text-secondary hover:bg-hover',
  'ghost-danger': 'text-danger hover:bg-danger/10',
  info:           'bg-info/10 hover:bg-info/20 text-info',
};

const ACTIVE_CLASSES: Partial<Record<ButtonVariant, string>> = {
  primary:        'ring-2 ring-inset ring-[var(--accent-text)]',
  secondary:      'bg-[var(--accent-muted)] !text-[var(--accent-text)]',
  danger:         'ring-2 ring-inset ring-[var(--on-danger)]',
  'danger-subtle': 'bg-danger/20 text-danger',
  ghost:          'bg-[var(--accent-muted)] !text-[var(--accent-text)]',
  'ghost-danger': 'bg-danger/15 text-danger',
  info:           'bg-info/20 text-info',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'sm',
    active = false,
    className = '',
    children,
    ...props
  },
  ref,
) {
  const classes = [
    'inline-flex items-center justify-center transition-[color,background-color,border-color,transform] duration-150 flex-shrink-0 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    active && ACTIVE_CLASSES[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
