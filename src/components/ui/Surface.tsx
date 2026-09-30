import type { ComponentPropsWithRef } from 'react';
import { cn } from './cn';

export interface SurfaceProps extends ComponentPropsWithRef<'div'> {
  /** raised: floating elements (menus, cards on cards); default: sections and cards. */
  tone?: 'default' | 'raised' | 'sunken';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'lg' | 'xl';
}

const TONES = {
  default: 'bg-surface shadow-card',
  raised: 'bg-surface-raised shadow-float',
  sunken: 'bg-surface-sunken',
} as const;

const PADDINGS = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

/** Rounded container with a fine border and soft shadow. */
export function Surface({
  tone = 'default',
  padding = 'md',
  radius = 'xl',
  className,
  ...rest
}: SurfaceProps) {
  return (
    <div
      className={cn(
        'border border-line',
        radius === 'xl' ? 'rounded-xl' : 'rounded-lg',
        TONES[tone],
        PADDINGS[padding],
        className,
      )}
      {...rest}
    />
  );
}
