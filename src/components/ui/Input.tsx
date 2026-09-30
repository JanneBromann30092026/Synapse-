import { useId, type ComponentPropsWithRef } from 'react';
import { controlClass } from './controlClass';
import { Field } from './Field';
import { cn } from './cn';

export interface InputProps extends ComponentPropsWithRef<'input'> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-desc` : undefined}
        className={cn(controlClass(Boolean(error)), 'min-h-12', className)}
        {...rest}
      />
    </Field>
  );
}
