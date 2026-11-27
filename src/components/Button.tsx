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
  'icon-xs':  'w-6 h-6 rounded-pill',
  'icon-sm':  'w-8 h-8 rounded-control',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:        'border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--primary-button-text)] font-medium enabled:hover:border-[var(--accent)] enabled:hover:bg-[var(--accent-border)] enabled:hover:text-[var(--primary-button-hover-text)] enabled:active:text-[var(--primary-button-hover-text)]',
  secondary:      'border border-line text-secondary hover:border-strong hover:bg-hover/40 hover:text-primary',
  danger:         'border border-danger bg-danger hover:bg-danger/90 text-on-danger font-medium',
  ghost:          'border border-transparent text-muted hover:text-secondary hover:bg-hover',
  'ghost-danger': 'border border-transparent text-danger hover:bg-danger/10',
};

// `active` is a toolbar/toggle concept: only ghost defines a selected look (see ui-kit).


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
  const danger = variant === "danger" || variant === "ghost-danger";
  const flatAction = variant === "primary" || variant === "danger";
  const selected = active && variant === "ghost";
  const classes = [
    'inline-flex items-center justify-center transition-[color,background-color,border-color,transform] duration-150 flex-shrink-0 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    !flatAction && "theme-hover",
    danger && !flatAction && "theme-hover-danger",
    selected && "theme-active theme-hover-accent",
    className,
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} data-active={selected ? "true" : undefined} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
