import {
  buildNextRound,
  createRound,
  currentCard,
  initialSessionState,
  isActivePhase,
  parseStoredSession,
  roundStats,
  serializeSession,
  sessionReducer,
  shouldPersist,
  type EvaluationResult,
  type LastResult,
  type RandomSource,
  type RoundOptions,
  type SessionAction,
  type SessionCard,
  type SessionState,
  type StartRoundAction,
} from '@/core/session';
import { answersRepo, sessionsRepo } from '@/data/repositories';
import { LIMITS } from '@/data/schemas';
import type { StudyMode, Verdict } from '@/data/types';
import { toast } from '@/components/ui/toastStore';
import { de } from '@/i18n/de';
import { gradingService, type GradingOutcome, type GradingService } from '@/services/grading';

export interface StudyDeps {
  grading: Pick<GradingService, 'gradeAnswer' | 'overrideVerdict'>;
  sessions: Pick<typeof sessionsRepo, 'create' | 'finish' | 'abort'>;
  answers: Pick<typeof answersRepo, 'create'>;
  /** sessionStorage; undefined where it is not available. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
  random: RandomSource;
  /** Epoch ms. */
  now: () => number;
  /** Storage failures never block the round: they are only reported. */
  reportError: (error: unknown) => void;
}

function defaultStorage(): StudyDeps['storage'] {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

const defaultDeps = (): StudyDeps => ({
  grading: gradingService,
  sessions: sessionsRepo,
  answers: answersRepo,
  storage: defaultStorage(),
  random: Math.random,
  now: Date.now,
  reportError: (error) => {
    console.error(error);
    toast.error(de.pages.study.errors.saveFailed);
  },
});

/** sessionStorage key of the round of one study page (project id or 'cross'). */
export function studyStorageKey(scope: string): string {
  return `synapse.study.${scope}`;
}

/** Typing is saved with a short delay; everything else immediately. */
const INPUT_PERSIST_DELAY_MS = 400;

function toEvaluation(outcome: GradingOutcome): EvaluationResult {
  if (outcome.verdict === 'needs_self_assessment') {
    return {
      verdict: 'needs_self_assessment',
      reason: outcome.reason,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}),
    };
  }
  return {
    verdict: outcome.verdict,
    method: outcome.method,
    confidence: outcome.confidence,
    ...(outcome.feedback ? { feedback: outcome.feedback } : {}),
    cached: outcome.cached,
  };
}

/**
 * Binds the pure session reducer to grading and storage: evaluates submitted answers, logs every
 * answer, applies overrides, closes the session row and keeps a snapshot in sessionStorage.
 * Framework-free, so it can be tested without React (useStudySession wraps it).
 */
export function createStudyController(scope: string, overrides: Partial<StudyDeps> = {}) {
  const deps: StudyDeps = { ...defaultDeps(), ...overrides };
  const key = studyStorageKey(scope);
  let state: SessionState = parseStoredSession(readStorage()) ?? initialSessionState;
  const listeners = new Set<() => void>();
  let evaluation: AbortController | undefined;
  /** Pending answer writes per `${sessionId}:${cardId}` (overrides wait for them). */
  const pendingSaves = new Map<string, Promise<string | undefined>>();
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let starting = false;
  let resumed = false;

  function readStorage(): string | null {
    try {
      return deps.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function persistNow(): void {
    if (persistTimer !== undefined) clearTimeout(persistTimer);
    persistTimer = undefined;
    try {
      if (shouldPersist(state)) deps.storage?.setItem(key, serializeSession(state));
      else deps.storage?.removeItem(key);
    } catch {
      // Storage full or disabled: the round keeps running, it just does not survive a reload.
    }
  }

  function schedulePersist(): void {
    if (persistTimer !== undefined) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, INPUT_PERSIST_DELAY_MS);
  }

  function report(error: unknown): void {
    try {
      deps.reportError(error);
    } catch {
      // Reporting must never break the round.
    }
  }

  function dispatch(action: SessionAction): void {
    const previous = state;
    const next = sessionReducer(previous, action);
    if (next === previous) return;
    state = next;
    if (action.type === 'INPUT_CHANGED') schedulePersist();
    else persistNow();
    for (const listener of listeners) listener();
    runEffects(previous, next, action);
  }

  function runEffects(previous: SessionState, next: SessionState, action: SessionAction): void {
    if (
      next.phase === 'evaluating' &&
      (previous.phase !== 'evaluating' || previous.evaluationId !== next.evaluationId)
    ) {
      void evaluate(next);
    }
    if (next.phase === 'revealed' && previous.phase !== 'revealed' && next.lastResult) {
      void saveAnswer(next, next.lastResult);
    }
    if (action.type === 'OVERRIDE' && next.lastResult && next.sessionId) {
      void saveOverride(next.sessionId, next.lastResult.cardId, action.verdict);
    }
    if (next.phase === 'roundComplete' && previous.phase !== 'roundComplete' && next.sessionId) {
      const { correct, incorrect } = roundStats(next);
      const sessionId = next.sessionId;
      void deps.sessions
        .finish(sessionId, { correctCount: correct, incorrectCount: incorrect })
        .catch(report);
    }
    if (next.phase === 'aborted') {
      evaluation?.abort();
      evaluation = undefined;
      if (next.sessionId) {
        const { correct, incorrect } = roundStats(next);
        void deps.sessions
          .abort(next.sessionId, { correctCount: correct, incorrectCount: incorrect })
          .catch(report);
      }
    }
  }

  async function evaluate(snapshot: SessionState): Promise<void> {
    const requestId = snapshot.evaluationId;
    const current = currentCard(snapshot);
    if (!current) return;
    evaluation?.abort();
    const controller = new AbortController();
    evaluation = controller;
    try {
      const outcome = await deps.grading.gradeAnswer({
        cardId: current.card.id,
        direction: current.direction,
        userAnswer: snapshot.userInput,
        strictness: snapshot.strictness,
        signal: controller.signal,
      });
      dispatch({ type: 'EVALUATION_SUCCEEDED', requestId, result: toEvaluation(outcome) });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      console.error(error);
      dispatch({
        type: 'EVALUATION_FAILED',
        requestId,
        message: de.pages.study.errors.evaluationFailed,
      });
    } finally {
      if (evaluation === controller) evaluation = undefined;
    }
  }

  function saveAnswer(snapshot: SessionState, result: LastResult): Promise<string | undefined> {
    const sessionId = snapshot.sessionId;
    if (!sessionId || snapshot.answerIds[result.cardId]) return Promise.resolve(undefined);
    const saveKey = `${sessionId}:${result.cardId}`;
    const existing = pendingSaves.get(saveKey);
    if (existing) return existing;
    const promise = deps.answers
      .create({
        sessionId,
        cardId: result.cardId,
        directionUsed: result.direction,
        userInput: result.userInput.slice(0, LIMITS.userInput),
        verdict: result.verdict,
        method: result.method,
        ...(result.confidence !== undefined ? { confidence: result.confidence } : {}),
        ...(result.feedback ? { feedback: result.feedback.slice(0, LIMITS.feedback) } : {}),
        responseTimeMs: result.responseTimeMs,
      })
      .then((answer) => {
        dispatch({ type: 'ANSWER_SAVED', sessionId, cardId: result.cardId, answerId: answer.id });
        return answer.id;
      })
      .catch((error: unknown) => {
        report(error);
        return undefined;
      })
      .finally(() => pendingSaves.delete(saveKey));
    pendingSaves.set(saveKey, promise);
    return promise;
  }

  async function saveOverride(sessionId: string, cardId: string, verdict: Verdict): Promise<void> {
    // The answer may still be on its way to the database.
    const answerId =
      state.sessionId === sessionId && state.answerIds[cardId]
        ? state.answerIds[cardId]
        : await pendingSaves.get(`${sessionId}:${cardId}`);
    if (!answerId) return;
    try {
      await deps.grading.overrideVerdict({ answerId, newVerdict: verdict });
    } catch (error: unknown) {
      report(error);
    }
  }

  async function beginRound(build: (sessionId: string | null) => StartRoundAction | null) {
    if (starting || isActivePhase(state.phase)) return;
    const preview = build(null);
    if (!preview) return;
    starting = true;
    try {
      let sessionId: string | null = null;
      try {
        const session = await deps.sessions.create({
          projectId: preview.options.projectId,
          roundNumber: preview.roundNumber,
          mode: preview.options.mode,
          direction: preview.options.direction,
          gradingMode: preview.options.gradingMode,
          totalCards: preview.queue.length,
        });
        sessionId = session.id;
      } catch (error: unknown) {
        report(error);
      }
      dispatch({ ...preview, sessionId });
    } finally {
      starting = false;
    }
  }

  function roundContext() {
    const at = deps.now();
    return { random: deps.random, at, startedAt: new Date(at).toISOString(), sessionId: null };
  }

  return {
    getState: (): SessionState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Starts round 1 with any list of cards (also across projects). */
    start: (cards: readonly SessionCard[], options: RoundOptions): Promise<void> =>
      beginRound(() => createRound({ cards, options }, roundContext())),
    /** Follow-up round from the wrong / right pile or all cards; no-op for an empty pile. */
    startNextRound: (mode: StudyMode): Promise<void> =>
      beginRound(() => buildNextRound(state, mode, roundContext())),
    setInput: (value: string) => dispatch({ type: 'INPUT_CHANGED', value }),
    submit: () => dispatch({ type: 'SUBMIT', at: deps.now() }),
    selfAssess: (verdict: Verdict) => dispatch({ type: 'SELF_ASSESS', verdict }),
    override: (verdict: Verdict) => dispatch({ type: 'OVERRIDE', verdict }),
    /** revealed → transitioning; transitioning → next card or roundComplete. */
    next: () => dispatch({ type: 'NEXT', at: deps.now() }),
    retry: () => dispatch({ type: 'RETRY_EVALUATION' }),
    abort: () => dispatch({ type: 'ABORT' }),
    /** Back to the start screen (after the round end or an abort). */
    reset: (): void => {
      if (isActivePhase(state.phase)) return;
      state = initialSessionState;
      persistNow();
      for (const listener of listeners) listener();
    },

    /**
     * Continues work that a reload interrupted (restored snapshot): a pending evaluation runs
     * again, an unsaved answer is logged. Runs once.
     */
    resume: (): void => {
      if (resumed) return;
      resumed = true;
      if (state.phase === 'evaluating') void evaluate(state);
      if (state.phase === 'revealed' && state.lastResult) void saveAnswer(state, state.lastResult);
    },
    /** Writes the snapshot now (app goes to the background, page is hidden). */
    flush: persistNow,
  };
}

export type StudyController = ReturnType<typeof createStudyController>;
