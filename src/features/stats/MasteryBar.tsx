import { motion } from 'motion/react';
import { cn } from '@/components/ui';
import type { MasteryCounts } from '@/core/mastery';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { MASTERY_BG, MASTERY_ORDER, totalOf } from './masteryUi';

const t = de.mastery;

export interface MasteryBarProps {
  counts: MasteryCounts;
  size?: 'sm' | 'md';
  /** Counts per level below the bar. */
  legend?: boolean;
  /** Delay of the grow animation (staggered lists). */
  delay?: number;
  className?: string;
}

/** Segmented bar neu / schwach / im Aufbau / sicher; the segments grow in. */
export function MasteryBar({
  counts,
  size = 'md',
  legend = false,
  delay = 0,
  className,
}: MasteryBarProps) {
  const total = totalOf(counts);
  const label = `${t.label}: ${MASTERY_ORDER.map((level) => t.segment(t.levels[level], counts[level])).join(', ')}`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="img"
        aria-label={label}
        className={cn(
          'flex w-full gap-0.5 overflow-hidden rounded-full bg-line',
          size === 'sm' ? 'h-2' : 'h-3',
        )}
      >
        {total > 0 &&
          MASTERY_ORDER.filter((level) => counts[level] > 0).map((level, index) => (
            <motion.div
              key={level}
              data-level={level}
              className={cn(
                'h-full shrink-0 first:rounded-l-full last:rounded-r-full',
                MASTERY_BG[level],
              )}
              initial={{ width: 0 }}
              animate={{ width: `${(counts[level] / total) * 100}%` }}
              transition={{ ...spring.soft, delay: delay + index * 0.06 }}
            />
          ))}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-secondary" aria-hidden>
          {MASTERY_ORDER.map((level) => (
            <li key={level} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', MASTERY_BG[level])} />
              {t.levels[level]}
              <span className="font-semibold text-fg tabular-nums">{counts[level]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
