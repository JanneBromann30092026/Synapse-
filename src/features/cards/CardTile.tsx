import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, MoreHorizontal } from 'lucide-react';
import { cn, IconButton, projectColor, type MenuAnchor } from '@/components/ui';
import { parseAnswers } from '@/core/cards';
import type { Card, ProjectColor } from '@/data/types';
import { de } from '@/i18n/de';
import { spring, TAP_SCALE } from '@/styles/motion';

const t = de.pages.project;

export interface CardTileProps {
  card: Card;
  color: ProjectColor;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onMenu: (anchor: MenuAnchor) => void;
}

const face =
  'absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border p-4 text-center backface-hidden';

/** Small flashcard in the grid: tap flips it in 3D (a preview of study mode). */
export function CardTile({
  card,
  color,
  selecting,
  selected,
  onToggleSelect,
  onMenu,
}: CardTileProps) {
  const [flipped, setFlipped] = useState(false);
  const answers = parseAnswers(card.back);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={spring.default}
      className="relative list-none perspective-[1200px]"
      data-testid="card-tile"
    >
      <motion.button
        type="button"
        onClick={() => (selecting ? onToggleSelect() : setFlipped((v) => !v))}
        aria-pressed={selecting ? selected : flipped}
        aria-label={selecting ? card.front : `${card.front} – ${t.flipHint}`}
        whileTap={{ scale: TAP_SCALE }}
        transition={spring.snappy}
        className="focus-ring no-callout relative block aspect-[3/2] w-full rounded-xl"
      >
        <motion.span
          className="absolute inset-0 transform-3d"
          animate={{ rotateY: flipped && !selecting ? 180 : 0 }}
          transition={spring.soft}
        >
          <span
            className={cn(
              face,
              'bg-surface shadow-card',
              selected ? 'border-accent' : 'border-line',
            )}
            style={{
              borderTopColor: selected ? undefined : projectColor(color),
              borderTopWidth: 3,
            }}
          >
            <span className="line-clamp-3 text-lg font-semibold break-words text-fg">
              {card.front}
            </span>
            {card.tags[0] && <span className="text-xs text-fg-muted">{card.tags.join(' · ')}</span>}
          </span>
          <span
            className={cn(face, 'rotate-y-180 border-line text-fg')}
            style={{ background: projectColor(color, true) }}
            aria-hidden={!flipped}
          >
            <span className="line-clamp-3 text-base font-semibold break-words">
              {answers.join(' · ')}
            </span>
            {card.notes && (
              <span className="line-clamp-2 text-sm text-fg-secondary">{card.notes}</span>
            )}
          </span>
        </motion.span>
        {selecting && (
          <span
            aria-hidden
            className={cn(
              'absolute top-3 left-3 flex size-6 items-center justify-center rounded-full border-2 bg-surface transition-colors',
              selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
            )}
          >
            {selected && <Check size={14} strokeWidth={3} />}
          </span>
        )}
      </motion.button>
      {!selecting && (
        <IconButton
          icon={MoreHorizontal}
          label={t.cardActions}
          aria-haspopup="menu"
          onClick={(event) => onMenu(event.currentTarget.getBoundingClientRect())}
          className="absolute top-1 right-1"
        />
      )}
    </motion.li>
  );
}
