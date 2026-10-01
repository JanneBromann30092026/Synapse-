import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Badge, cn, IconButton, type MenuAnchor } from '@/components/ui';
import { parseAnswers } from '@/core/cards';
import type { Mastery } from '@/core/mastery';
import type { Card } from '@/data/types';
import { MasteryDot } from '@/features/stats/MasteryDot';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

const t = de.pages.project;

/** Width of the actions revealed by swiping left (two 80 px buttons). */
const ACTIONS_WIDTH = 160;
const OPEN_THRESHOLD = 60;
/** Movement before the gesture decides between horizontal swipe and vertical scroll. */
const SLOP_PX = 8;
const FLING_PX_PER_MS = 0.4;

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  base: number;
  active: boolean;
  lastX: number;
  lastTime: number;
  velocity: number;
}

export interface CardRowProps {
  card: Card;
  /** Lasting mastery of the card (dot); undefined while loading. */
  mastery?: Mastery;
  selecting: boolean;
  selected: boolean;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  onDelete: () => void;
  onMenu: (anchor: MenuAnchor) => void;
}

/** List row: tap edits, swipe left reveals edit/delete, "⋯" opens the same actions. */
export function CardRow({
  card,
  mastery,
  selecting,
  selected,
  swipeOpen,
  onSwipeOpenChange,
  onOpen,
  onToggleSelect,
  onDelete,
  onMenu,
}: CardRowProps) {
  const x = useMotionValue(0);
  // Hidden while closed, so the colored buttons do not shine through the rounded corners.
  const actionsOpacity = useTransform(x, [-24, -4], [1, 0]);
  const dragged = useRef(false);

  const settle = (open: boolean) => {
    void animate(x, open ? -ACTIONS_WIDTH : 0, spring.default);
    onSwipeOpenChange(open);
  };

  // Close when another row opens or selection mode starts.
  useEffect(() => {
    if (!swipeOpen && x.get() !== 0) void animate(x, 0, spring.default);
  }, [swipeOpen, x]);

  /*
   * Own pointer handling instead of motion's drag: motion measures the row position once and
   * applies a stale offset after the list was filtered or edited. touch-action: pan-y keeps
   * vertical scrolling native; only clearly horizontal moves become a swipe.
   */
  const gesture = useRef<Gesture | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selecting || (event.pointerType === 'mouse' && event.button !== 0)) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: x.get(),
      active: false,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.active) {
      if (Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
        g.active = true;
        dragged.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > SLOP_PX) {
        gesture.current = null;
        return;
      } else {
        return;
      }
    }
    const dt = event.timeStamp - g.lastTime;
    if (dt > 0) g.velocity = (event.clientX - g.lastX) / dt;
    g.lastX = event.clientX;
    g.lastTime = event.timeStamp;
    // Slight resistance beyond the open position, none to the right.
    const target = g.base + dx;
    x.set(
      Math.min(
        0,
        target < -ACTIONS_WIDTH ? -ACTIONS_WIDTH + (target + ACTIONS_WIDTH) * 0.2 : target,
      ),
    );
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!g.active) return;
    settle(x.get() < -OPEN_THRESHOLD || g.velocity < -FLING_PX_PER_MS);
    // The click that ends a swipe must not open the editor.
    setTimeout(() => {
      dragged.current = false;
    }, 50);
  };

  const onClick = () => {
    if (dragged.current) return;
    if (selecting) onToggleSelect();
    else if (swipeOpen) settle(false);
    else onOpen();
  };

  const answers = parseAnswers(card.back);

  return (
    // No layout animation: its projection would offset the swiping row after list changes.
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={spring.default}
      className="relative list-none overflow-hidden rounded-lg"
      data-testid="card-row"
    >
      {/* Revealed by swiping left */}
      <motion.div style={{ opacity: actionsOpacity }} className="absolute inset-y-0 right-0 flex">
        <button
          type="button"
          tabIndex={swipeOpen ? 0 : -1}
          aria-hidden={!swipeOpen}
          aria-label={t.menu.edit}
          onClick={() => {
            settle(false);
            onOpen();
          }}
          className="flex w-20 flex-col items-center justify-center gap-1 bg-accent text-sm font-medium text-on-accent"
        >
          <Pencil size={18} aria-hidden />
          {t.menu.edit}
        </button>
        <button
          type="button"
          tabIndex={swipeOpen ? 0 : -1}
          aria-hidden={!swipeOpen}
          aria-label={t.menu.delete}
          onClick={() => {
            settle(false);
            onDelete();
          }}
          className="flex w-20 flex-col items-center justify-center gap-1 bg-danger text-sm font-medium text-white"
        >
          <Trash2 size={18} aria-hidden />
          {t.menu.delete}
        </button>
      </motion.div>

      <motion.div
        style={{ x }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cn(
          'no-callout relative flex min-h-16 touch-pan-y items-center gap-3 rounded-lg border bg-surface py-3 pr-2 pl-4 transition-colors',
          selected ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
        )}
      >
        {selecting && (
          <span
            aria-hidden
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
            )}
          >
            {selected && <Check size={14} strokeWidth={3} />}
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selecting ? selected : undefined}
          className="focus-ring flex min-h-11 min-w-0 flex-1 flex-col items-start gap-1 rounded-md text-left"
        >
          <span className="line-clamp-2 text-base font-semibold break-words text-fg">
            {card.front}
          </span>
          <span className="line-clamp-1 text-sm break-words text-fg-secondary">
            {answers.join(' · ')}
          </span>
          {card.tags.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {card.tags.map((tag) => (
                <Badge key={tag} className="h-6 px-2.5">
                  {tag}
                </Badge>
              ))}
            </span>
          )}
        </button>
        {mastery && !selecting && <MasteryDot mastery={mastery} />}
        {!selecting && (
          <IconButton
            icon={MoreHorizontal}
            label={t.cardActions}
            aria-haspopup="menu"
            onClick={(event) => onMenu(event.currentTarget.getBoundingClientRect())}
          />
        )}
      </motion.div>
    </motion.li>
  );
}
