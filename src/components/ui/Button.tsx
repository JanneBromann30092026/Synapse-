import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { spring, TAP_SCALE } from '@/styles/motion';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[0_8px_24px_-10px_var(--accent-glow)] hover:bg-accent-strong',
  secondary: 'bg-surface-raised text-fg border border-line shadow-soft hover:border-line-strong',
  ghost: 'bg-transparent text-fg-secondary hover:bg-accent-soft hover:text-fg',
  danger: 'bg-danger text-white shadow-[0_8px_24px_-10px_var(--danger-glow)] hover:brightness-110',
  success:
    'bg-success text-white shadow-[0_8px_24px_-10px_var(--success-glow)] hover:brightness-110',
};

// Every size keeps a touch target of at least 44 px.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-sm gap-1.5',
  md: 'min-h-12 px-5 text-base gap-2',
  lg: 'min-h-14 px-7 text-lg gap-2.5',
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <motion.button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      whileTap={inactive ? undefined : { scale: TAP_SCALE }}
      transition={spring.snappy}
      className={cn(
        'focus-ring no-callout inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-[background-color,border-color,color,filter] duration-150 disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={ICON_SIZES[size]} />
      ) : (
        Icon && <Icon size={ICON_SIZES[size]} aria-hidden strokeWidth={2.2} />
      )}
      {children}
    </motion.button>
  );
}
