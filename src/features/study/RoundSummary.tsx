import { useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ArrowLeft, ChevronDown, Repeat, RotateCcw, Undo2 } from 'lucide-react';
import { Button, ProgressRing, cn, projectColor } from '@/components/ui';
import { formatDuration, formatSeconds } from '@/core/format';
import { pickVariant, type RoundSummary as Summary, type SummaryItem } from '@/core/session';
import { pileLayoutId, textLang } from '@/core/study/presentation';
import type { StudyMode } from '@/data/types';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { Confetti } from './Confetti';
import { StudyPile } from './StudyPile';

const t = de.pages.study;
const c = t.complete;

const container: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.3, staggerChildren: 0.07 } },
  // Folds together (reverse order) before the next round flies in.
  exit: {
    opacity: 0,
    scale: 0.94,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
      when: 'afterChildren',
      duration: 0.2,
    },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.default },
  exit: { opacity: 0, y: -10, scaleY: 0.85, transition: { duration: 0.16 } },
};

export interface RoundSummaryProps {
  summary: Summary;
  roundNumber: number;
  /** Stable per round: picks the motivation text. */
  seed: string;
  color: string;
  reduced: boolean;
  onRepeat: (mode: StudyMode) => void;
  onLeave: () => void;
}

/** Round end: status ring, figures, motivation, repeat actions and the answered cards. */
export function RoundSummary({
  summary,
  roundNumber,
  seed,
  color,
  reduced,
  onRepeat,
  onLeave,
}: RoundSummaryProps) {
  // Own refs: the piles of the running round may still be fading out.
  const correctPileRef = useRef<HTMLDivElement>(null);
  const incorrectPileRef = useRef<HTMLDivElement>(null);
  const perfect = summary.total > 0 && summary.percentage === 100;
  const motivation = pickVariant(c.motivation[summary.tier], seed);
  const wrong = summary.incorrect;
  const right = summary.correct;
  const noWrongId = useId();
  const noRightId = useId();

  return (
    <motion.div
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      data-testid="study-complete"
      data-percentage={summary.percentage}
      variants={container}
      initial={reduced ? false : 'hidden'}
      animate="show"
      exit={reduced ? { opacity: 0 } : 'exit'}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-[max(1rem,env(safe-area-inset-left))] pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* The piles glide in next to the ring. */}
        <div className="relative flex items-center justify-center gap-6 wide:gap-10">
          <motion.div layoutId={pileLayoutId('incorrect')} layout="position">
            <StudyPile
              kind="incorrect"
              count={wrong}
              targetRef={incorrectPileRef}
              reduced={reduced}
              testId="study-summary-pile-incorrect"
            />
          </motion.div>
          <motion.div
            className="relative flex flex-col items-center gap-2"
            variants={item}
            data-testid="study-complete-ring"
          >
            <ProgressRing
              value={summary.percentage / 100}
              label={t.roundStatus}
              size={168}
              strokeWidth={13}
            />
            {perfect && (
              <Confetti
                colors={[projectColor(color), 'var(--accent)', 'var(--success)', 'var(--warning)']}
                reduced={reduced}
              />
            )}
          </motion.div>
          <motion.div layoutId={pileLayoutId('correct')} layout="position">
            <StudyPile
              kind="correct"
              count={right}
              targetRef={correctPileRef}
              reduced={reduced}
              testId="study-summary-pile-correct"
            />
          </motion.div>
        </div>

        <motion.div className="flex flex-col items-center gap-1 text-center" variants={item}>
          <h2 className="text-2xl font-semibold tracking-tight text-fg wide:text-3xl">
            {c.title(roundNumber)}
          </h2>
          <p className="text-lg text-fg-secondary" data-testid="study-motivation">
            {motivation}
          </p>
          <p className="sr-only">{c.summary(right, wrong)}</p>
        </motion.div>

        <motion.dl
          className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2"
          variants={item}
          data-testid="study-complete-tiles"
        >
          <Tile label={c.tiles.correct} value={String(right)} tone="var(--success)" />
          <Tile label={c.tiles.incorrect} value={String(wrong)} tone="var(--danger)" />
          <Tile label={c.tiles.total} value={String(summary.total)} />
          <Tile label={c.tiles.duration} value={formatDuration(summary.durationMs)} />
          <Tile label={c.tiles.average} value={formatSeconds(summary.averageResponseMs)} />
        </motion.dl>

        <motion.div className="flex flex-col gap-2" variants={item}>
          <div className="grid gap-2 sm:grid-cols-2">
            <RepeatButton
              primary={wrong > 0}
              icon={RotateCcw}
              count={wrong}
              label={c.repeatWrong(wrong)}
              emptyText={c.noWrong}
              emptyId={noWrongId}
              shortcut="1"
              onClick={() => onRepeat('wrong')}
            />
            <RepeatButton
              primary={false}
              icon={Undo2}
              count={right}
              label={c.repeatRight(right)}
              emptyText={c.noRight}
              emptyId={noRightId}
              shortcut="2"
              onClick={() => onRepeat('right')}
            />
            <Button
              size="lg"
              variant={wrong > 0 ? 'secondary' : 'primary'}
              icon={Repeat}
              aria-keyshortcuts="3"
              disabled={summary.total === 0}
              onClick={() => onRepeat('all')}
            >
              {c.repeatAll}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              icon={ArrowLeft}
              aria-keyshortcuts="Escape"
              onClick={onLeave}
            >
              {t.back}
            </Button>
          </div>
          <p className="text-center text-sm text-fg-muted">{c.keyHint}</p>
        </motion.div>

        <motion.div className="flex flex-col gap-3" variants={item}>
          {summary.incorrectItems.length > 0 && (
            <AnswerList
              title={c.incorrectList}
              items={summary.incorrectItems}
              defaultOpen
              testId="study-list-incorrect"
            />
          )}
          {summary.correctItems.length > 0 && (
            <AnswerList
              title={c.correctList}
              items={summary.correctItems}
              defaultOpen={false}
              testId="study-list-correct"
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-line bg-surface-raised px-3 py-3 shadow-soft">
      <dt className="text-sm font-medium text-fg-secondary">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}

interface RepeatButtonProps {
  primary: boolean;
  icon: typeof RotateCcw;
  count: number;
  label: string;
  emptyText: string;
  emptyId: string;
  shortcut: string;
  onClick: () => void;
}

/** Disabled with a visible reason when its pile is empty. */
function RepeatButton({
  primary,
  icon,
  count,
  label,
  emptyText,
  emptyId,
  shortcut,
  onClick,
}: RepeatButtonProps) {
  const empty = count === 0;
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="lg"
        fullWidth
        variant={primary ? 'primary' : 'secondary'}
        icon={icon}
        disabled={empty}
        aria-describedby={empty ? emptyId : undefined}
        aria-keyshortcuts={shortcut}
        onClick={onClick}
      >
        {label}
      </Button>
      {empty && (
        <p id={emptyId} className="text-center text-sm text-fg-muted">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function AnswerList({
  title,
  items,
  defaultOpen,
  testId,
}: {
  title: string;
  items: SummaryItem[];
  defaultOpen: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
      data-testid={testId}
    >
      <button
        type="button"
        className="focus-ring flex min-h-14 w-full items-center gap-3 px-5 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex-1 text-base font-semibold text-fg">{title}</span>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-fg-secondary tabular-nums">
          {items.length}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy}>
          <ChevronDown size={20} aria-hidden className="text-fg-muted" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={panelId}
            className="flex flex-col divide-y divide-line border-t border-line"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.default}
          >
            {items.map((entry) => (
              <AnswerRow key={entry.card.id} entry={entry} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

function AnswerRow({ entry }: { entry: SummaryItem }) {
  const { prompt, expected, result } = entry;
  const correct = result.verdict === 'correct';
  return (
    <li className="flex flex-col gap-1.5 px-5 py-3" data-testid="study-list-item">
      <p className="text-base font-semibold text-fg" lang={textLang(prompt)}>
        {prompt}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <Row label={c.yourAnswer}>
          <span
            className={cn(!correct && 'text-danger', !result.userInput && 'text-fg-muted italic')}
            lang={textLang(result.userInput)}
          >
            {result.userInput || t.noAnswer}
          </span>
        </Row>
        <Row label={c.correctAnswer}>
          <span className="text-fg" lang={textLang(expected)}>
            {expected}
          </span>
        </Row>
        {result.feedback && (
          <Row label={c.feedback}>
            <span className="text-fg-secondary">{result.feedback}</span>
          </Row>
        )}
      </dl>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
