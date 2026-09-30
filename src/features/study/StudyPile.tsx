import { useEffect, useRef, type RefObject } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';
import { cn } from '@/components/ui';
import type { Verdict } from '@/data/types';
import { de } from '@/i18n/de';

const t = de.pages.study;

export interface StudyPileProps {
  kind: Verdict;
  count: number;
  /** The mini card stack (flight target of the cards). */
  targetRef: RefObject<HTMLDivElement | null>;
  reduced: boolean;
  compact?: boolean;
}

/** "Falsch" (red) or "Richtig" (green) pile: offset mini cards and a counter that counts up. */
export function StudyPile({ kind, count, targetRef, reduced, compact = false }: StudyPileProps) {
  const correct = kind === 'correct';
  const color = correct ? 'var(--success)' : 'var(--danger)';
  const soft = correct ? 'var(--success-soft)' : 'var(--danger-soft)';
  const bump = useMotionValue(1);
  const previous = useRef(count);

  // Catches the arriving card with a little rebound.
  useEffect(() => {
    const grew = count > previous.current;
    previous.current = count;
    if (!grew || reduced) return;
    const controls = animate(bump, [1, 1.16, 1], { type: 'spring', stiffness: 520, damping: 14 });
    return () => controls.stop();
  }, [count, reduced, bump]);

  const layers = Math.min(3, count);
  const name = t.piles[kind];

  return (
    <div
      className={cn('flex shrink-0 items-center gap-3', compact ? 'flex-row' : 'flex-col')}
      data-testid={`study-pile-${kind}`}
      role="status"
      aria-label={t.pileLabel(name, count)}
    >
      <motion.div ref={targetRef} className="relative h-12 w-[72px]" style={{ scale: bump }}>
        {layers === 0 && (
          <div
            className="absolute inset-0 rounded-[10px] border-[1.5px] border-dashed"
            style={{ borderColor: color, opacity: 0.45 }}
          />
        )}
        {Array.from({ length: layers }, (_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[10px] border-[1.5px] bg-surface-raised shadow-soft"
            style={{
              borderColor: color,
              background: i === layers - 1 ? soft : undefined,
              transform: `translate(${(layers - 1 - i) * -3}px, ${(layers - 1 - i) * -3}px) rotate(${(layers - 1 - i) * (correct ? 3 : -3)}deg)`,
            }}
          />
        ))}
      </motion.div>
      <div className={cn('flex items-baseline gap-1.5', !compact && 'flex-col items-center gap-0')}>
        <span
          className="relative h-8 min-w-8 overflow-hidden text-center text-2xl font-semibold tabular-nums"
          style={{ color }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={count}
              className="block"
              data-testid={`study-pile-${kind}-count`}
              initial={reduced ? false : { y: '70%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: '-70%', opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="text-sm font-medium text-fg-secondary">{name}</span>
      </div>
    </div>
  );
}
