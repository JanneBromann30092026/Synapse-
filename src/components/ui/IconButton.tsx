import { motion, type HTMLMotionProps } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { spring, TAP_SCALE } from '@/styles/motion';
import { cn } from './cn';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: LucideIcon;
  /** Accessible name (icon-only buttons need one). */
  label: string;
  variant?: IconButtonVariant;
  size?: 'md' | 'lg';
  active?: boolean;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-fg-secondary hover:bg-accent-soft hover:text-fg',
  secondary: 'bg-surface-raised text-fg border border-line shadow-soft hover:border-line-strong',
  primary: 'bg-accent text-on-accent shadow-[0_8px_24px_-10px_var(--accent-glow)]',
  danger: 'text-danger hover:bg-danger-soft',
};

/** Round icon-only button with a 44 px (md) or 56 px (lg) touch target. */
export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  active = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <motion.button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: TAP_SCALE }}
      transition={spring.snappy}
      className={cn(
        'focus-ring no-callout inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50',
        size === 'md' ? 'size-11' : 'size-14',
        VARIANTS[variant],
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'md' ? 20 : 24} aria-hidden strokeWidth={2.1} />
    </motion.button>
  );
}
