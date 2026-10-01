import { cn, Tooltip } from '@/components/ui';
import type { Mastery } from '@/core/mastery';
import { de } from '@/i18n/de';
import { MASTERY_BG, masteryText } from './masteryUi';

const t = de.mastery;

/** Colored dot for the mastery level of a card; tapping shows the explanation (44 px target). */
export function MasteryDot({ mastery, className }: { mastery: Mastery; className?: string }) {
  return (
    <Tooltip content={masteryText(mastery)} showOnTap>
      <button
        type="button"
        aria-label={t.dotLabel(t.levels[mastery.level])}
        data-testid="mastery-dot"
        data-level={mastery.level}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'focus-ring no-callout flex size-11 shrink-0 items-center justify-center rounded-full',
          className,
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full',
            MASTERY_BG[mastery.level],
            mastery.level === 'solid' && 'shadow-[0_0_10px_var(--success-glow)]',
          )}
        />
      </button>
    </Tooltip>
  );
}
