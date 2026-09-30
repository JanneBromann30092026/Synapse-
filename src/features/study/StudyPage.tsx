import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ProgressRing,
  ProjectAvatar,
  Skeleton,
  toast,
  useImeGuard,
} from '@/components/ui';
import { useKeyboardInset } from '@/components/ui/hooks/useKeyboardInset';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { isImeEvent } from '@/core/hotkeys';
import { displayedPiles, fitCard } from '@/core/study/presentation';
import type { Project, Verdict } from '@/data/types';
import { useCards } from '@/features/cards/hooks';
import { useProject } from '@/features/projects/hooks';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { StudyCard, type CardTone, type FlightTarget } from './StudyCard';
import { useLeaveStudy, useStudyLaunch } from './studyLaunch';
import { StudyPile } from './StudyPile';
import { StudySetupSheet, type StudyOptions } from './StudySetupSheet';
import { useElementSize } from './useElementSize';
import { useStudySession, type StudySession } from './useStudySession';

const t = de.pages.study;

/** Piles left and right of the card in landscape; below the card in portrait and Split View. */
const SIDE_PILES_QUERY = '(orientation: landscape) and (min-width: 700px)';

/** Self assessment by button: show the result briefly, then the card flies onto its pile. */
const SELF_ADVANCE_MS = 750;

/** Buttons must not take the focus from the answer field (the iPad keyboard stays open). */
const keepFocus = {
  onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
};

export function StudyPage() {
  const { projectId = '' } = useParams();
  return <StudyScreen key={projectId} projectId={projectId} />;
}

function StudyScreen({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const cards = useCards(projectId);
  const session = useStudySession(projectId);
  const leave = useLeaveStudy();

  // The expanding surface of the "Lernen" button fades into the study background.
  useEffect(() => {
    useStudyLaunch.getState().arrive();
  }, []);

  if (project === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title={t.notFound}
          action={
            <Button variant="secondary" onClick={() => leave(null)}>
              {t.back}
            </Button>
          }
        />
      </div>
    );
  }

  if (project === undefined || cards === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6" aria-busy>
        <Skeleton className="aspect-[3/2] w-full max-w-xl rounded-xl" />
        <span className="sr-only">{t.loading}</span>
      </div>
    );
  }

  return (
    <StudySurface
      project={project}
      cards={cards}
      session={session}
      onLeave={() => leave(project)}
    />
  );
}

interface StudySurfaceProps {
  project: Project;
  cards: NonNullable<ReturnType<typeof useCards>>;
  session: StudySession;
  onLeave: () => void;
}

function StudySurface({ project, cards, session, onLeave }: StudySurfaceProps) {
  const { state, stats, current } = session;
  const { phase } = state;
  const reduced = useReducedMotion();
  const defaults = useSettings();
  const keyboardInset = useKeyboardInset();
  const sidePiles = useMediaQuery(SIDE_PILES_QUERY);
  const ime = useImeGuard();

  const [choice, setChoice] = useState<Partial<StudyOptions>>({});
  const options: StudyOptions = {
    direction: choice.direction ?? defaults.defaultDirection,
    gradingMode: choice.gradingMode ?? defaults.defaultGradingMode,
    strictness: choice.strictness ?? defaults.defaultStrictness,
  };
  const [quitOpen, setQuitOpen] = useState(false);
  const [flight, setFlight] = useState<FlightTarget | null>(null);
  /** Evaluation id for which the user chose "Selbst bewerten" after an error. */
  const [selfAfterError, setSelfAfterError] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const correctPileRef = useRef<HTMLDivElement>(null);
  const incorrectPileRef = useRef<HTMLDivElement>(null);
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const cardSize = fitCard({
    width: Math.max(0, stage.width - 16),
    height: Math.max(0, stage.height - 44),
  });

  const result = state.lastResult;
  const selfFromError = phase === 'error' && selfAfterError === state.evaluationId;
  const assessing = phase === 'selfAssessing' || selfFromError;
  const flipped = assessing || phase === 'revealed' || phase === 'transitioning';
  const tone: CardTone =
    phase === 'evaluating'
      ? 'evaluating'
      : (phase === 'revealed' || phase === 'transitioning') && result
        ? result.verdict
        : assessing
          ? 'self'
          : phase === 'error'
            ? 'error'
            : 'idle';
  const piles = displayedPiles(state);
  const running = phase !== 'setup' && phase !== 'roundComplete' && phase !== 'aborted';

  async function start() {
    // Focus inside the tap, so iPadOS opens the on-screen keyboard.
    inputRef.current?.focus({ preventScroll: true });
    await session.start(
      cards.map(({ id, projectId, front, back }) => ({ id, projectId, front, back })),
      { projectId: project.id, mode: 'all', ...options },
    );
  }

  /** Card flies onto the pile of `verdict`; the second NEXT follows when it arrived. */
  function advance(verdict: Verdict) {
    const pile = (verdict === 'correct' ? correctPileRef : incorrectPileRef).current;
    const rect = pile?.getBoundingClientRect();
    if (rect && !reduced) {
      setFlight({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
      });
    }
    session.next();
  }

  function assess(verdict: Verdict, swiped = false) {
    session.selfAssess(verdict);
    if (swiped) advance(verdict);
  }

  function onSwipe(direction: 'left' | 'right') {
    if (assessing) assess(direction === 'right' ? 'correct' : 'incorrect', true);
    else if (phase === 'revealed' && result) advance(result.verdict);
  }

  function onFlown() {
    setFlight(null);
    session.next();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (phase === 'presenting') session.submit();
    else if (phase === 'revealed' && result) advance(result.verdict);
  }

  // Leaving after the round end or an abort: the next visit starts with the setup again.
  const { reset } = session;
  useEffect(() => () => reset(), [reset]);

  // Without an animation (reduced motion, restored after a reload) the transition ends at once.
  useEffect(() => {
    if (phase === 'transitioning' && !flight) session.next();
  }, [phase, flight, session]);

  // After self assessment by button: short result, then onto the pile.
  const autoAdvance = useEffectEvent(() => {
    const latest = session.state.lastResult;
    if (session.state.phase === 'revealed' && latest?.method === 'self') advance(latest.verdict);
  });
  const selfRevealed = phase === 'revealed' && result?.method === 'self';
  useEffect(() => {
    if (!selfRevealed) return;
    const timer = setTimeout(autoAdvance, reduced ? 300 : SELF_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [selfRevealed, reduced]);

  // The AI failed during the round: say once that the user decides now.
  const toasted = useRef(false);
  const reason = state.selfAssessmentReason;
  useEffect(() => {
    if (phase !== 'selfAssessing' || toasted.current) return;
    if (reason === 'offline' || reason === 'ai_error') {
      toasted.current = true;
      toast.info(t.switchedToSelf);
    }
  }, [phase, reason]);

  // Hardware keyboard: Enter, O, R/F or arrows, Esc (never during IME composition).
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (isImeEvent(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (quitOpen || phase === 'setup') return;
    const inAnswer = event.target === inputRef.current;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      if (running) setQuitOpen(true);
      else onLeave();
      return;
    }
    if (inAnswer && phase === 'presenting') return;
    const target = event.target;
    const onControl =
      !inAnswer && target instanceof HTMLElement && target.closest('button, a, input, textarea');
    if (key === 'enter') {
      if (onControl || inAnswer) return; // the button itself / the form handles it
      event.preventDefault();
      if (phase === 'presenting') inputRef.current?.focus();
      else if (phase === 'revealed' && result) advance(result.verdict);
      return;
    }
    if (key === 'o' && phase === 'revealed' && result) {
      event.preventDefault();
      session.override(result.verdict === 'correct' ? 'incorrect' : 'correct');
    } else if ((key === 'r' || key === 'arrowright') && assessing) {
      event.preventDefault();
      assess('correct');
    } else if ((key === 'f' || key === 'arrowleft') && assessing) {
      event.preventDefault();
      assess('incorrect');
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const onAnswerKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && ime.isComposing(event)) event.preventDefault();
  };

  const complete = phase === 'roundComplete';
  const color = project.color;

  const errorPanel =
    phase === 'error' && !selfFromError ? (
      <div
        className="flex flex-col items-center gap-3 border-t border-line bg-warning-soft px-6 py-4 text-center"
        role="alert"
        data-testid="study-error"
      >
        <div>
          <p className="text-base font-semibold text-fg">{t.errorTitle}</p>
          <p className="text-sm text-fg-secondary">{t.errorText}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" icon={RotateCcw} onClick={session.retry} {...keepFocus}>
            {t.retry}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSelfAfterError(state.evaluationId)}
            {...keepFocus}
          >
            {t.selfAssess}
          </Button>
        </div>
      </div>
    ) : undefined;

  const pileProps = { reduced, compact: !sidePiles };
  const incorrectPile = (
    <StudyPile
      kind="incorrect"
      count={piles.incorrect}
      targetRef={incorrectPileRef}
      {...pileProps}
    />
  );
  const correctPile = (
    <StudyPile kind="correct" count={piles.correct} targetRef={correctPileRef} {...pileProps} />
  );

  return (
    <div
      className="relative flex h-full flex-col"
      style={{ paddingBottom: keyboardInset || undefined }}
      data-testid="study-surface"
      data-phase={phase}
    >
      {/* Top: progress, round, round status and quit */}
      <header className="shrink-0 px-[max(1rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label={t.progress}
            aria-valuemin={0}
            aria-valuemax={stats.totalInRound}
            aria-valuenow={stats.answered}
          >
            <motion.div
              className="h-full w-full origin-left rounded-full bg-accent"
              initial={false}
              animate={{ scaleX: stats.progress }}
              transition={spring.soft}
            />
          </div>
          <div className="flex min-h-14 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              className="-ml-2"
              onClick={() => (running ? setQuitOpen(true) : onLeave())}
              {...keepFocus}
            >
              {t.quit}
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm font-medium text-fg-secondary">
              <ProjectAvatar color={color} icon={project.icon} size={28} />
              <span className="truncate">{project.name}</span>
              {state.roundNumber > 0 && (
                <span className="shrink-0 text-fg-muted" data-testid="study-position">
                  · {t.round(state.roundNumber)} ·{' '}
                  {t.position(
                    Math.min(stats.answered + (running ? 1 : 0), stats.totalInRound),
                    stats.totalInRound,
                  )}
                </span>
              )}
            </div>
            <ProgressRing
              value={stats.correctPercentage / 100}
              label={t.roundStatus}
              size={52}
              strokeWidth={5}
              className="shrink-0"
            />
          </div>
        </div>
      </header>

      {/* Middle: the card between the piles */}
      {complete ? (
        <RoundCompletePlaceholder
          percentage={stats.correctPercentage}
          correct={stats.correct}
          incorrect={stats.incorrect}
          onNewRound={session.reset}
          onLeave={onLeave}
        />
      ) : (
        <div
          className={
            sidePiles
              ? 'flex min-h-0 flex-1 items-center gap-4 px-[max(1.5rem,env(safe-area-inset-left))] py-3'
              : 'flex min-h-0 flex-1 flex-col gap-3 px-[max(1rem,env(safe-area-inset-left))] py-2'
          }
        >
          {sidePiles && incorrectPile}
          <div
            ref={stageRef}
            className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center self-stretch pt-7"
          >
            {current && stage.width > 0 && (
              <StudyCard
                key={`${state.roundNumber}:${state.currentIndex}`}
                prompt={current.prompt}
                expected={current.expected}
                notes={cards.find((card) => card.id === current.card.id)?.notes}
                userInput={state.userInput}
                color={color}
                size={cardSize}
                tone={tone}
                flipped={flipped}
                result={result}
                swipe={assessing ? 'self' : phase === 'revealed' ? 'next' : null}
                onSwipe={onSwipe}
                flight={phase === 'transitioning' ? flight : null}
                onFlown={onFlown}
                reduced={reduced}
                frontExtra={errorPanel}
              />
            )}
            {phase === 'setup' && stage.width > 0 && (
              <div
                aria-hidden
                className="rounded-xl border-[1.5px] border-dashed border-line-strong"
                style={{ width: cardSize.width, height: cardSize.height }}
              />
            )}
          </div>
          {sidePiles ? (
            correctPile
          ) : (
            <div className="mx-auto flex w-full max-w-xl items-center justify-between px-2">
              {incorrectPile}
              {correctPile}
            </div>
          )}
        </div>
      )}

      {/* Bottom: answer field and the actions of the phase */}
      {!complete && (
        <form
          onSubmit={submit}
          className="shrink-0 px-[max(1rem,env(safe-area-inset-left))] pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={keyboardInset ? { paddingBottom: 12 } : undefined}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-2">
            <label className="min-w-56 flex-1">
              <span className="sr-only">{t.answerLabel}</span>
              <input
                ref={inputRef}
                value={state.userInput}
                onChange={(event) => session.setInput(event.target.value)}
                onKeyDown={onAnswerKeyDown}
                {...ime.compositionProps}
                aria-label={t.answerLabel}
                aria-readonly={phase !== 'presenting' && phase !== 'setup'}
                placeholder={t.answerPlaceholder}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={phase === 'revealed' ? 'next' : 'send'}
                data-testid="study-input"
                className="min-h-14 w-full rounded-full border border-line bg-surface-raised px-6 text-lg text-fg shadow-soft outline-none placeholder:text-fg-muted focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] aria-readonly:text-fg-secondary"
              />
            </label>
            <PhaseActions
              phase={phase}
              assessing={assessing}
              selfMode={state.gradingMode === 'self'}
              result={result}
              onAssess={(verdict) => assess(verdict)}
              onOverride={(verdict) => session.override(verdict)}
            />
          </div>
          {assessing && <p className="mt-2 text-center text-sm text-fg-muted">{t.swipeHint}</p>}
        </form>
      )}

      <StudySetupSheet
        open={phase === 'setup'}
        cardCount={cards.length}
        options={options}
        onChange={setChoice}
        onStart={() => void start()}
        onClose={onLeave}
        onBack={onLeave}
      />
      <ConfirmDialog
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        onConfirm={() => {
          session.abort();
          onLeave();
        }}
        title={t.quitTitle}
        message={t.quitMessage}
        confirmLabel={t.quitConfirm}
      />
    </div>
  );
}

interface PhaseActionsProps {
  phase: StudySession['state']['phase'];
  assessing: boolean;
  selfMode: boolean;
  result: StudySession['state']['lastResult'];
  onAssess: (verdict: Verdict) => void;
  onOverride: (verdict: Verdict) => void;
}

function PhaseActions({
  phase,
  assessing,
  selfMode,
  result,
  onAssess,
  onOverride,
}: PhaseActionsProps) {
  if (assessing) {
    return (
      <div className="flex gap-2">
        <Button
          size="lg"
          variant="danger"
          icon={X}
          onClick={() => onAssess('incorrect')}
          {...keepFocus}
        >
          {t.didNotKnow}
        </Button>
        <Button
          size="lg"
          variant="success"
          icon={Check}
          onClick={() => onAssess('correct')}
          {...keepFocus}
        >
          {t.knew}
        </Button>
      </div>
    );
  }
  if ((phase === 'revealed' || phase === 'transitioning') && result) {
    const other: Verdict = result.verdict === 'correct' ? 'incorrect' : 'correct';
    return (
      <div className="flex gap-2">
        {result.method !== 'self' && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => onOverride(other)}
            disabled={phase !== 'revealed'}
            aria-keyshortcuts="O"
            {...keepFocus}
          >
            {other === 'correct' ? t.overrideCorrect : t.overrideIncorrect}
          </Button>
        )}
        <Button
          size="lg"
          type="submit"
          icon={ArrowRight}
          disabled={phase !== 'revealed'}
          aria-keyshortcuts="Enter"
          {...keepFocus}
        >
          {t.next}
        </Button>
      </div>
    );
  }
  const evaluating = phase === 'evaluating';
  return (
    <Button
      size="lg"
      type="submit"
      icon={evaluating ? undefined : selfMode ? Sparkles : Send}
      disabled={phase !== 'presenting'}
      aria-busy={evaluating || undefined}
      data-testid="study-submit"
      {...keepFocus}
    >
      {evaluating ? t.checking : selfMode ? t.reveal : t.check}
    </Button>
  );
}

function RoundCompletePlaceholder({
  percentage,
  correct,
  incorrect,
  onNewRound,
  onLeave,
}: {
  percentage: number;
  correct: number;
  incorrect: number;
  onNewRound: () => void;
  onLeave: () => void;
}) {
  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.default}
      data-testid="study-complete"
    >
      <h2 className="text-3xl font-semibold tracking-tight text-fg">{t.complete.title}</h2>
      <ProgressRing value={percentage / 100} label={t.roundStatus} size={150} strokeWidth={12} />
      <p className="text-lg text-fg-secondary">{t.complete.summary(correct, incorrect)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" icon={RotateCcw} onClick={onNewRound}>
          {t.complete.newRound}
        </Button>
        <Button size="lg" variant="secondary" onClick={onLeave}>
          {t.back}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{t.complete.hint}</p>
    </motion.div>
  );
}
