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
  primary:       'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed',
  secondary:     'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
  danger:        'bg-red-500 hover:bg-red-600 text-white font-medium',
  'danger-subtle': 'bg-red-400/10 hover:bg-red-400/20 text-red-400',
  ghost:         'text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-50',
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
    'inline-flex items-center justify-center transition-colors flex-shrink-0',
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
