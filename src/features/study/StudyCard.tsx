import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type PanInfo,
} from 'motion/react';
import { Check, X } from 'lucide-react';
import { cn, projectColor } from '@/components/ui';
import { parseAnswers } from '@/core/cards';
import type { LastResult } from '@/core/session';
import {
  flightPath,
  promptFontSize,
  swipeDirection,
  textLang,
  type Size,
} from '@/core/study/presentation';
import type { ProjectColor, Verdict } from '@/data/types';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { ResultMark } from './ResultMark';

const t = de.pages.study;

export type CardTone = 'idle' | 'evaluating' | 'correct' | 'incorrect' | 'self' | 'error';

/** Viewport position of the pile the card flies to. */
export interface FlightTarget {
  x: number;
  y: number;
  width: number;
}

export interface StudyCardProps {
  prompt: string;
  expected: string;
  notes?: string;
  userInput: string;
  color: ProjectColor;
  size: Size;
  tone: CardTone;
  flipped: boolean;
  result: LastResult | null;
  /** Swipe gesture: 'self' = right knew / left did not, 'next' = any side continues. */
  swipe: 'self' | 'next' | null;
  onSwipe: (direction: 'left' | 'right') => void;
  /** Set to fly onto a pile; onFlown fires when it arrived. */
  flight: FlightTarget | null;
  onFlown: () => void;
  reduced: boolean;
  /** Content on the front side below the question (error message with actions). */
  frontExtra?: ReactNode;
  cardRef?: RefObject<HTMLDivElement | null>;
}

const TONE_BORDER: Record<Exclude<CardTone, 'idle'>, string> = {
  evaluating: 'var(--accent)',
  correct: 'var(--success)',
  incorrect: 'var(--danger)',
  self: 'var(--warning)',
  error: 'var(--warning)',
};

const TONE_GLOW: Record<Exclude<CardTone, 'idle'>, string> = {
  evaluating: 'var(--accent-glow)',
  correct: 'var(--success-glow)',
  incorrect: 'var(--danger-glow)',
  self: 'var(--warning-glow)',
  error: 'var(--warning-glow)',
};

/**
 * The CSS build drops -webkit- prefixes; inline styles keep them for Safari (see .card-face).
 */
const FACE_STYLE: CSSProperties = {
  WebkitBackfaceVisibility: 'hidden',
  backfaceVisibility: 'hidden',
};

const face =
  'card-face absolute inset-0 flex flex-col overflow-hidden rounded-xl border-[1.5px] bg-surface-raised shadow-card transition-[border-color] duration-300';

/**
 * The flashcard of the study round: flies in, shimmers while the answer is evaluated, flips in
 * 3D, shows the result (pop + particles or a damped shake), can be swiped and flies onto a pile.
 * Keyed per card by the parent, so each card runs its entrance once.
 */
export function StudyCard({
  prompt,
  expected,
  notes,
  userInput,
  color,
  size,
  tone,
  flipped,
  result,
  swipe,
  onSwipe,
  flight,
  onFlown,
  reduced,
  frontExtra,
  cardRef,
}: StudyCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(reduced ? 0 : -70);
  const scale = useMotionValue(reduced ? 1 : 0.9);
  const rotate = useMotionValue(reduced ? 0 : -4);
  const opacity = useMotionValue(0);
  const lift = useMotionValue(0);
  const tilt = useTransform(x, [-240, 0, 240], [-7, 0, 7]);
  const knewTint = useTransform(x, [0, 140], [0, 1]);
  const didNotKnowTint = useTransform(x, [-140, 0], [1, 0]);
  const localRef = useRef<HTMLDivElement>(null);
  const ref = cardRef ?? localRef;
  const wasFlipped = useRef(flipped);
  const onFlownRef = useRef(onFlown);
  const widthRef = useRef(size.width);
  useEffect(() => {
    onFlownRef.current = onFlown;
    widthRef.current = size.width;
  });

  // a) Entrance: from above/behind, slightly rotated.
  useEffect(() => {
    if (reduced) {
      const fade = animate(opacity, 1, { duration: 0.2 });
      return () => fade.stop();
    }
    const controls = [
      animate(y, 0, spring.default),
      animate(scale, 1, spring.default),
      animate(rotate, 0, spring.default),
      animate(opacity, 1, { duration: 0.25 }),
    ];
    return () => controls.forEach((c) => c.stop());
  }, [reduced, y, scale, rotate, opacity]);

  // c) Minimal lift while flipping.
  useEffect(() => {
    if (wasFlipped.current === flipped) return;
    wasFlipped.current = flipped;
    if (reduced) return;
    const controls = animate(lift, [0, -10, 0], { duration: 0.6, ease: 'easeInOut' });
    return () => controls.stop();
  }, [flipped, reduced, lift]);

  // e) Result: pop for right, damped shake for wrong (replays after an override).
  const verdict: Verdict | null = tone === 'correct' || tone === 'incorrect' ? tone : null;
  const resultKey = verdict && result ? `${verdict}:${result.method}` : null;
  useEffect(() => {
    if (!resultKey || reduced) return;
    const controls: AnimationPlaybackControls = resultKey.startsWith('correct')
      ? animate(scale, [1, 1.03, 1], { duration: 0.42, delay: 0.22, ease: 'easeOut' })
      : animate(x, [0, -14, 11, -7, 4, -2, 0], { duration: 0.5, delay: 0.22, ease: 'easeOut' });
    return () => controls.stop();
  }, [resultKey, reduced, scale, x]);

  // g) Flight onto the pile on a slightly curved path.
  useEffect(() => {
    if (!flight) return;
    const element = ref.current;
    if (reduced || !element) {
      onFlownRef.current();
      return;
    }
    const rect = element.getBoundingClientRect();
    // Resting center (without the current drag/animation offset).
    const restX = rect.left + rect.width / 2 - x.get();
    const restY = rect.top + rect.height / 2 - y.get();
    const path = flightPath(
      { x: x.get(), y: y.get() },
      { x: flight.x - restX, y: flight.y - restY },
    );
    const targetScale = Math.max(0.06, flight.width / Math.max(1, widthRef.current));
    const direction = flight.x > restX ? 1 : -1;
    const options = { duration: 0.55, ease: 'easeInOut' } as const;
    const controls = [
      animate(x, path.x, { duration: 0.55, ease: 'linear' }),
      animate(y, path.y, { duration: 0.55, ease: ['easeOut', 'easeIn'] }),
      animate(scale, [scale.get(), 0.55, targetScale], options),
      animate(rotate, 10 * direction, options),
      animate(opacity, [1, 1, 0.85], options),
    ];
    let done = false;
    void Promise.all(controls.map((c) => c.finished)).then(() => {
      if (done) return;
      done = true;
      onFlownRef.current();
    });
    return () => {
      done = true;
      controls.forEach((c) => c.stop());
    };
  }, [flight, reduced, ref, x, y, scale, rotate, opacity]);

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const direction = swipeDirection(info.offset.x, info.velocity.x);
    if (direction) onSwipe(direction);
  };

  const answers = parseAnswers(expected);
  const accent = tone === 'idle' ? null : tone;
  const border = accent
    ? TONE_BORDER[accent]
    : `color-mix(in srgb, ${projectColor(color)} 45%, transparent)`;
  const promptSize = promptFontSize(prompt, size.width);
  // Low card (keyboard up): denser back side without the repeated question.
  const compact = size.height < 300;
  const answerSize = Math.max(
    compact ? 17 : 18,
    Math.round(promptFontSize(answers.join(' · '), size.width) * (compact ? 0.62 : 0.8)),
  );

  return (
    <motion.div
      ref={ref}
      data-testid="study-card"
      data-tone={tone}
      data-flipped={flipped}
      className={cn('relative shrink-0 touch-pan-y', swipe && 'cursor-grab active:cursor-grabbing')}
      style={{ x, y, scale, rotate, opacity, width: size.width, height: size.height }}
      drag={swipe ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      dragMomentum={false}
      onDragEnd={onDragEnd}
    >
      {/* Glow behind the card (opacity only). */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1 rounded-[32px] transition-opacity duration-300',
          tone === 'evaluating' && 'card-pulse',
        )}
        style={{
          opacity: accent ? 1 : 0,
          boxShadow: accent ? `0 0 42px 4px ${TONE_GLOW[accent]}` : undefined,
        }}
      />
      {/* b) Evaluating: a light running around the edge. */}
      {tone === 'evaluating' && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] overflow-hidden rounded-[31px]"
        >
          <div className="card-sweep absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      <motion.div className="absolute inset-0" style={{ rotate: tilt, y: lift }}>
        <div className="absolute inset-0 perspective-[1200px]">
          <motion.div
            className="card-3d absolute inset-0"
            style={{ WebkitTransformStyle: 'preserve-3d' }}
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={spring.soft}
          >
            {/* Front: the question */}
            <section
              className={face}
              style={{ ...FACE_STYLE, borderColor: border }}
              aria-hidden={flipped}
              data-testid="study-card-front"
            >
              <div className="scroll-area flex min-h-0 flex-1 flex-col px-8 py-6">
                <p
                  lang={textLang(prompt)}
                  className="m-auto text-center leading-tight font-semibold tracking-tight break-words whitespace-pre-wrap text-fg"
                  style={{ fontSize: promptSize }}
                  data-testid="study-prompt"
                >
                  {prompt}
                </p>
              </div>
              {frontExtra}
            </section>

            {/* Back: answer, notes, the typed answer and feedback */}
            <section
              className={cn(face, 'rotate-y-180')}
              style={{ ...FACE_STYLE, borderColor: border }}
              aria-hidden={!flipped}
              data-testid="study-card-back"
            >
              <div
                className={cn(
                  'scroll-area flex min-h-0 flex-1 flex-col text-center',
                  compact ? 'gap-1.5 px-5 pt-8 pb-3' : 'gap-3 px-7 pt-9 pb-5',
                )}
              >
                {!compact && (
                  <p lang={textLang(prompt)} className="truncate text-sm font-medium text-fg-muted">
                    {prompt}
                  </p>
                )}
                <div className="my-auto flex flex-col gap-1">
                  {!compact && (
                    <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      {t.solution}
                    </span>
                  )}
                  <p
                    lang={textLang(expected)}
                    className="leading-tight font-semibold tracking-tight break-words text-fg"
                    style={{ fontSize: answerSize }}
                    data-testid="study-expected"
                  >
                    {answers.join(' · ')}
                  </p>
                  {notes && (
                    <p
                      lang={textLang(notes)}
                      className={cn(
                        'break-words text-fg-secondary',
                        compact ? 'line-clamp-1 text-sm' : 'text-base',
                      )}
                    >
                      {notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 text-sm">
                  <p className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-fg-secondary">
                    <span className={cn(compact && 'max-w-full truncate')}>
                      {t.yourAnswer}:{' '}
                      <span
                        lang={textLang(userInput)}
                        className={cn(
                          'font-semibold break-words',
                          verdict === 'correct' && 'text-success',
                          verdict === 'incorrect' && 'text-danger',
                          !verdict && 'text-fg',
                        )}
                        data-testid="study-user-answer"
                      >
                        {userInput.trim() || t.noAnswer}
                      </span>
                    </span>
                    {result && verdict && (
                      <span
                        className={cn(
                          'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold',
                          verdict === 'correct'
                            ? 'bg-success-soft text-success'
                            : 'bg-danger-soft text-danger',
                        )}
                        data-testid="study-method"
                      >
                        {verdict === 'incorrect' && result.method === 'exact'
                          ? t.methodGivenUp
                          : t.methods[result.method]}
                      </span>
                    )}
                  </p>
                  {result?.feedback && (
                    <p
                      className={cn('text-fg-secondary italic', compact && 'line-clamp-2')}
                      data-testid="study-feedback"
                    >
                      {result.feedback}
                    </p>
                  )}
                </div>
              </div>
            </section>
          </motion.div>
        </div>

        {/* Swipe feedback while self assessing */}
        {swipe === 'self' && (
          <>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-end rounded-xl bg-success-soft pr-8 text-success"
              style={{ opacity: knewTint }}
            >
              <Check size={48} strokeWidth={2.5} />
            </motion.div>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-start rounded-xl bg-danger-soft pl-8 text-danger"
              style={{ opacity: didNotKnowTint }}
            >
              <X size={48} strokeWidth={2.5} />
            </motion.div>
          </>
        )}
      </motion.div>

      {verdict && <ResultMark key={resultKey} verdict={verdict} reduced={reduced} />}
    </motion.div>
  );
}
