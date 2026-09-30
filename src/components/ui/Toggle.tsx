import { useId } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/styles/motion';
import { cn } from './cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** Switch with label; the whole row is tappable. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: ToggleProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-ring no-callout flex min-h-12 w-full items-center justify-between gap-4 rounded-lg py-2 text-left disabled:opacity-50',
        className,
      )}
    >
      <span className="flex flex-col">
        <span id={`${id}-label`} className="text-base text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="text-sm text-fg-muted">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          'relative flex h-8 w-[52px] shrink-0 items-center rounded-full p-1 transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <motion.span
          layout
          transition={spring.snappy}
          className={cn('size-6 rounded-full bg-white shadow-md', checked && 'ml-auto')}
        />
      </span>
    </button>
  );
}
