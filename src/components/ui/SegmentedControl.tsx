import { useId } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/styles/motion';
import { cn } from './cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Single choice with a sliding indicator (shared layoutId). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-full border border-line bg-surface-sunken p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-ring no-callout relative min-h-11 flex-1 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors',
              selected ? 'text-fg' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={spring.default}
                className="absolute inset-0 rounded-full bg-surface-raised shadow-card"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
