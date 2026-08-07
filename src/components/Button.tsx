import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-subtle' | 'ghost';
type ButtonSize = 'xs' | 'sm' | 'md' | 'icon-sm' | 'icon-md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs:          'px-3 py-1.5 text-xs gap-1 rounded-lg',
  sm:          'px-4 py-2 text-sm gap-1.5 rounded-lg',
  md:          'px-5 py-2 text-sm gap-1.5 rounded-lg',
  'icon-sm':  'p-1 rounded',
  'icon-md':  'p-2 rounded-lg',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:       'btn-glossy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed',
  secondary:     'text-tertiary hover:text-primary hover:bg-elevated',
  danger:        'bg-red-500 hover:bg-red-600 text-white font-medium',
  'danger-subtle': 'bg-red-400/10 hover:bg-red-400/20 text-red-400',
  ghost:         'text-muted hover:text-secondary hover:bg-hover disabled:opacity-50',
};

const ACTIVE_CLASSES: Partial<Record<ButtonVariant, string>> = {
  secondary: 'bg-[var(--accent-muted)] !text-[var(--accent-text)]',
  ghost:     'bg-[var(--accent-muted)] !text-[var(--accent-text)]',
};

export default function Button({
  variant = 'primary',
  size = 'sm',
  active = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center transition-[color,background-color,border-color,transform] duration-150 flex-shrink-0 active:scale-[0.97]',
    SIZE_CLASSES[size],
    VARIANT_CLASSES[variant],
    active && ACTIVE_CLASSES[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
