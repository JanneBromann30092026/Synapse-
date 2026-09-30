import { motion } from 'motion/react';
import { spring } from '@/styles/motion';
import { cn } from './cn';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  label: string;
  tone?: 'accent' | 'success' | 'danger' | 'warning';
  className?: string;
}

const TONES = {
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
} as const;

export function ProgressBar({ value, label, tone = 'accent', className }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-line-strong', className)}
    >
      <motion.div
        className={cn('h-full origin-left rounded-full', TONES[tone])}
        initial={false}
        animate={{ scaleX: clamped }}
        transition={spring.soft}
      />
    </div>
  );
}
