import { Ban } from 'lucide-react';
import { de } from '@/i18n/de';
import { cn } from './cn';
import { PROJECT_ICONS, type ProjectIconName } from './projectIcons';

export interface IconPickerProps {
  value: ProjectIconName | undefined;
  onChange: (icon: ProjectIconName | undefined) => void;
  /** Tint of the selected icon, e.g. projectColor('teal'). */
  color?: string;
  label?: string;
  className?: string;
}

const NAMES = Object.keys(PROJECT_ICONS) as ProjectIconName[];

export function IconPicker({
  value,
  onChange,
  color = 'var(--accent)',
  label = de.ui.iconPicker,
  className,
}: IconPickerProps) {
  const cell = (selected: boolean) =>
    cn(
      'focus-ring no-callout flex size-11 items-center justify-center rounded-md transition-colors',
      selected ? 'bg-accent-soft' : 'text-fg-secondary hover:bg-surface-sunken',
    );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5', className)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === undefined}
        aria-label={de.ui.noIcon}
        title={de.ui.noIcon}
        onClick={() => onChange(undefined)}
        className={cell(value === undefined)}
      >
        <Ban size={20} aria-hidden className="text-fg-muted" />
      </button>
      {NAMES.map((name) => {
        const Icon = PROJECT_ICONS[name];
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            onClick={() => onChange(name)}
            className={cell(selected)}
            style={selected ? { color } : undefined}
          >
            <Icon size={20} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
