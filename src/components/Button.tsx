import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger';
type ButtonSize = 'xs' | 'sm' | 'icon-xs' | 'icon-sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs:          'px-3 py-1.5 text-caption gap-1 rounded-control',
  sm:          'px-4 py-2 text-body gap-1.5 rounded-control',
  'icon-xs':  'w-6 h-6 rounded-full',
  'icon-sm':  'w-8 h-8 rounded-control',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:        'surface-raised text-[var(--accent-text)] font-medium enabled:hover:bg-[var(--accent-muted)]',
  secondary:      'text-secondary ring-1 ring-inset ring-line hover:text-primary hover:bg-hover/40 hover:ring-strong',
  danger:         'surface-raised-fill bg-danger hover:bg-danger/90 text-on-danger font-medium',
  ghost:          'text-muted hover:text-secondary hover:bg-hover',
  'ghost-danger': 'text-danger hover:bg-danger/10',
};

// `active` is a toolbar/toggle concept: only ghost defines a selected look (see ui-kit).
const GHOST_ACTIVE_CLASSES = 'bg-[var(--accent-muted)] !text-[var(--accent-text)]';

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
    active && variant === 'ghost' && GHOST_ACTIVE_CLASSES,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
