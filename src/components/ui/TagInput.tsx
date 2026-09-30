import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X } from 'lucide-react';
import { mergeTags, parseTags } from '@/core/cards';
import { spring } from '@/styles/motion';
import { cn } from './cn';
import { useImeGuard } from './hooks/useImeGuard';

export interface TagInputProps {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Existing tags offered as one-tap chips. */
  suggestions?: string[];
  suggestionsLabel?: string;
  removeLabel: (tag: string) => string;
  className?: string;
}

/** Chip input: Enter, comma or semicolon adds a tag (IME-safe); Backspace on empty removes the last. */
export function TagInput({
  label,
  value,
  onChange,
  placeholder,
  suggestions = [],
  suggestionsLabel,
  removeLabel,
  className,
}: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const ime = useImeGuard();

  const commit = (text: string) => {
    const next = mergeTags(value, parseTags(text));
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const lowerValue = new Set(value.map((tag) => tag.toLocaleLowerCase('de-DE')));
  const openSuggestions = suggestions.filter(
    (tag) => !lowerValue.has(tag.toLocaleLowerCase('de-DE')),
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="px-1 text-sm font-medium text-fg-secondary">
        {label}
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-sunken px-2 py-1.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
        <AnimatePresence initial={false}>
          {value.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={spring.snappy}
              className="flex h-10 items-center gap-0.5 rounded-full bg-accent-soft pl-3.5 text-sm font-medium text-accent"
            >
              {tag}
              <button
                type="button"
                aria-label={removeLabel(tag)}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="focus-ring flex size-10 items-center justify-center rounded-full hover:bg-accent-soft"
              >
                <X size={14} aria-hidden />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id={id}
          value={draft}
          placeholder={value.length === 0 ? placeholder : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="enter"
          {...ime.compositionProps}
          onChange={(event) => {
            const text = event.target.value;
            // A typed or pasted separator commits the tag immediately.
            if (/[,;\n]/.test(text)) commit(text);
            else setDraft(text);
          }}
          onKeyDown={(event) => {
            if (ime.isComposing(event)) return;
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && draft.trim()) {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          className="min-h-9 min-w-32 flex-1 bg-transparent px-2 text-base text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {openSuggestions.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-1 pt-1"
          aria-label={suggestionsLabel}
        >
          {openSuggestions.slice(0, 12).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(mergeTags(value, [tag]))}
              // Keep the keyboard open while picking suggestions.
              onMouseDown={(event) => event.preventDefault()}
              className="focus-ring flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm text-fg-secondary hover:border-accent hover:text-accent"
            >
              <Plus size={13} aria-hidden />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
