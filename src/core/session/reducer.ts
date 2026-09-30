import type { Verdict } from '@/data/types';
import type { LastResult, Piles, SessionAction, SessionState, StartRoundAction } from './types';

export const initialSessionState: SessionState = {
  phase: 'setup',
  sessionId: null,
  projectId: '',
  mode: 'all',
  direction: 'front_to_back',
  gradingMode: 'ai',
  strictness: 'meaning',
  roundNumber: 0,
  cards: {},
  queue: [],
  currentIndex: 0,
  userInput: '',
  presentedAt: null,
  responseTimeMs: null,
  evaluationId: 0,
  selfAssessmentReason: null,
  errorMessage: null,
  lastResult: null,
  piles: { correct: [], incorrect: [] },
  answerIds: {},
  startedAt: null,
};

/** Phases in which a round is running (can be aborted, is worth restoring after a reload). */
export function isActivePhase(phase: SessionState['phase']): boolean {
  return phase !== 'setup' && phase !== 'roundComplete' && phase !== 'aborted';
}

function startRound(state: SessionState, action: StartRoundAction): SessionState {
  if (isActivePhase(state.phase)) return state;
  const cards = Object.fromEntries(action.cards.map((card) => [card.id, card]));
  const seen = new Set<string>();
  // Only known cards, each at most once per round.
  const queue = action.queue.filter((item) => {
    if (!(item.cardId in cards) || seen.has(item.cardId)) return false;
    seen.add(item.cardId);
    return true;
  });
  return {
    ...initialSessionState,
    ...action.options,
    phase: queue.length > 0 ? 'presenting' : 'roundComplete',
    sessionId: action.sessionId,
    roundNumber: action.roundNumber,
    cards,
    queue,
    presentedAt: queue.length > 0 ? action.at : null,
    startedAt: action.startedAt,
    // Keeps ids growing across rounds, so a late result of an old round never matches.
    evaluationId: state.evaluationId,
  };
}

function addToPile(piles: Piles, cardId: string, verdict: Verdict): Piles {
  const correct = piles.correct.filter((id) => id !== cardId);
  const incorrect = piles.incorrect.filter((id) => id !== cardId);
  return verdict === 'correct'
    ? { correct: [...correct, cardId], incorrect }
    : { correct, incorrect: [...incorrect, cardId] };
}

function reveal(
  state: SessionState,
  result: Omit<
    LastResult,
    'cardId' | 'direction' | 'userInput' | 'responseTimeMs' | 'originalVerdict'
  >,
): SessionState {
  const item = state.queue[state.currentIndex];
  if (!item) return state;
  const lastResult: LastResult = {
    cardId: item.cardId,
    direction: item.direction,
    userInput: state.userInput,
    responseTimeMs: state.responseTimeMs ?? 0,
    originalVerdict: result.verdict,
    ...result,
  };
  return {
    ...state,
    phase: 'revealed',
    lastResult,
    selfAssessmentReason: null,
    errorMessage: null,
    piles: addToPile(state.piles, item.cardId, result.verdict),
  };
}

/** Pure state machine of a study round (no React, no browser APIs). */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'START_ROUND':
      return startRound(state, action);

    case 'INPUT_CHANGED':
      if (state.phase !== 'presenting' || state.userInput === action.value) return state;
      return { ...state, userInput: action.value };

    case 'SUBMIT': {
      if (state.phase !== 'presenting') return state;
      const responseTimeMs = Math.max(0, Math.round(action.at - (state.presentedAt ?? action.at)));
      if (state.gradingMode === 'self') {
        return {
          ...state,
          phase: 'selfAssessing',
          responseTimeMs,
          selfAssessmentReason: 'mode_self',
        };
      }
      return {
        ...state,
        phase: 'evaluating',
        responseTimeMs,
        evaluationId: state.evaluationId + 1,
      };
    }

    case 'EVALUATION_SUCCEEDED': {
      if (state.phase !== 'evaluating' || action.requestId !== state.evaluationId) return state;
      const { result } = action;
      if (result.verdict === 'needs_self_assessment') {
        return { ...state, phase: 'selfAssessing', selfAssessmentReason: result.reason };
      }
      return reveal(state, {
        verdict: result.verdict,
        method: result.method,
        ...(result.confidence !== undefined ? { confidence: result.confidence } : {}),
        ...(result.feedback ? { feedback: result.feedback } : {}),
        ...(result.cached !== undefined ? { cached: result.cached } : {}),
      });
    }

    case 'EVALUATION_FAILED':
      if (state.phase !== 'evaluating' || action.requestId !== state.evaluationId) return state;
      return { ...state, phase: 'error', errorMessage: action.message };

    case 'RETRY_EVALUATION':
      if (state.phase !== 'error') return state;
      return {
        ...state,
        phase: 'evaluating',
        errorMessage: null,
        evaluationId: state.evaluationId + 1,
      };

    case 'SELF_ASSESS':
      // From 'error' this is the switch to self assessment instead of retrying.
      if (state.phase !== 'selfAssessing' && state.phase !== 'error') return state;
      return reveal(state, { verdict: action.verdict, method: 'self', confidence: 1 });

    case 'OVERRIDE': {
      const last = state.lastResult;
      if (state.phase !== 'revealed' || !last || last.verdict === action.verdict) return state;
      const lastResult: LastResult = {
        cardId: last.cardId,
        direction: last.direction,
        userInput: last.userInput,
        responseTimeMs: last.responseTimeMs,
        originalVerdict: last.originalVerdict,
        verdict: action.verdict,
        method: 'override',
        confidence: 1,
      };
      return { ...state, lastResult, piles: addToPile(state.piles, last.cardId, action.verdict) };
    }

    case 'NEXT': {
      if (state.phase === 'revealed') return { ...state, phase: 'transitioning' };
      if (state.phase !== 'transitioning') return state;
      const nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.queue.length) {
        return { ...state, phase: 'roundComplete', presentedAt: null };
      }
      return {
        ...state,
        phase: 'presenting',
        currentIndex: nextIndex,
        userInput: '',
        presentedAt: action.at,
        responseTimeMs: null,
        lastResult: null,
      };
    }

    case 'ABORT':
      if (!isActivePhase(state.phase)) return state;
      return { ...state, phase: 'aborted', presentedAt: null };

    case 'ANSWER_SAVED':
      if (action.sessionId !== state.sessionId || !(action.cardId in state.cards)) return state;
      return { ...state, answerIds: { ...state.answerIds, [action.cardId]: action.answerId } };
  }
}
