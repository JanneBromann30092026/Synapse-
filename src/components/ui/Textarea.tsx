import { useId, useLayoutEffect, useRef, type ComponentPropsWithRef, type RefObject } from 'react';
import { controlClass } from './controlClass';
import { Field } from './Field';
import { cn } from './cn';

export interface TextareaProps extends Omit<ComponentPropsWithRef<'textarea'>, 'ref'> {
  label?: string;
  hint?: string;
  error?: string;
  /** Maximum height in px before the textarea scrolls. */
  maxHeight?: number;
  /** Access to the element, e.g. to focus it programmatically. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

/** Textarea that grows with its content. */
export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  maxHeight = 320,
  rows = 3,
  value,
  onInput,
  textareaRef,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;

  const resize = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useLayoutEffect(resize, [value, maxHeight, ref]);

  return (
    <Field id={textareaId} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${textareaId}-desc` : undefined}
        onInput={(event) => {
          resize();
          onInput?.(event);
        }}
        className={cn(controlClass(Boolean(error)), 'resize-none py-3 leading-6', className)}
        {...rest}
      />
    </Field>
  );
}
