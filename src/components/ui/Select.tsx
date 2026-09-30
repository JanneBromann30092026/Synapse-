import { useId, type ComponentPropsWithRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { controlClass } from './controlClass';
import { Field } from './Field';
import { cn } from './cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> extends Omit<
  ComponentPropsWithRef<'select'>,
  'onChange' | 'value'
> {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Native select (opens the iPadOS picker) in the app's style. */
export function Select<T extends string>({
  label,
  hint,
  error,
  id,
  options,
  value,
  onChange,
  className,
  ...rest
}: SelectProps<T>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <Field id={selectId} label={label} hint={hint} error={error}>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(event) => {
            const option = options.find((o) => o.value === event.target.value);
            if (option) onChange(option.value);
          }}
          className={cn(controlClass(Boolean(error)), 'min-h-12 appearance-none pr-11', className)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-muted"
        />
      </div>
    </Field>
  );
}
