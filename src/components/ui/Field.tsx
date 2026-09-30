import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FieldProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label, hint and error text around a form control. */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="px-1 text-sm font-medium text-fg-secondary">
          {label}
        </label>
      )}
      {children}
      {(error ?? hint) && (
        <p
          id={`${id}-desc`}
          className={cn('px-1 text-sm', error ? 'text-danger' : 'text-fg-muted')}
          role={error ? 'alert' : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
