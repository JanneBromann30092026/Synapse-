import { cn } from './cn';

/** Shared look of text inputs, textareas and selects. */
export const controlClass = (invalid: boolean) =>
  cn(
    'w-full rounded-lg border bg-surface-sunken px-4 text-base text-fg placeholder:text-fg-muted transition-[border-color,box-shadow] duration-150 outline-none',
    'focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
    invalid ? 'border-danger' : 'border-line hover:border-line-strong',
  );
