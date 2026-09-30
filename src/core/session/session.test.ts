import { describe, expect, it } from 'vitest';
import {
  buildNextRound,
  createRound,
  currentCard,
  initialSessionState,
  parseStoredSession,
  roundStats,
  seededRandom,
  serializeSession,
  sessionReducer,
  shuffle,
  shuffleAvoidingFirst,
  type RoundContext,
  type RoundOptions,
  type SessionAction,
  type SessionCard,
  type SessionState,
} from '.';

const cards: SessionCard[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  projectId: 'p1',
  front: `front-${id}`,
  back: `back-${id}`,
}));

const options: RoundOptions = {
  projectId: 'p1',
  mode: 'all',
  direction: 'front_to_back',
  gradingMode: 'ai',
  strictness: 'meaning',
};

function context(overrides: Partial<RoundContext> = {}): RoundContext {
  return {
    random: seededRandom(42),
    at: 1_000,
    startedAt: '2026-09-30T10:00:00.000Z',
    sessionId: 's1',
    ...overrides,
  };
}

function run(state: SessionState, ...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state);
}

function start(
  roundOptions: Partial<RoundOptions> = {},
  roundCards: SessionCard[] = cards,
): SessionState {
  return run(
    initialSessionState,
    createRound({ cards: roundCards, options: { ...options, ...roundOptions } }, context()),
  );
}

/** Submits and resolves the current card with the given verdict via the grading result. */
function answer(state: SessionState, verdict: 'correct' | 'incorrect', at = 2_000): SessionState {
  const submitted = run(state, { type: 'INPUT_CHANGED', value: 'x' }, { type: 'SUBMIT', at });
  return run(
    submitted,
    {
      type: 'EVALUATION_SUCCEEDED',
      requestId: submitted.evaluationId,
      result: { verdict, method: 'exact', confidence: 1 },
    },
    { type: 'NEXT', at },
    { type: 'NEXT', at },
  );
}

function finishRound(verdicts: ('correct' | 'incorrect')[]): SessionState {
  let state = start();
  const byCard = new Map(state.queue.map((item, i) => [item.cardId, verdicts[i] ?? 'correct']));
  for (const item of state.queue) state = answer(state, byCard.get(item.cardId) ?? 'correct');
  return state;
}

describe('shuffle', () => {
  it('is a deterministic permutation with an injected random source', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const first = shuffle(items, seededRandom(7));
    expect(shuffle(items, seededRandom(7))).toEqual(first);
    expect([...first].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('implements Fisher–Yates (random 0 moves the head to the back)', () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
    expect(shuffle([1, 2, 3], () => 0.999)).toEqual([1, 2, 3]);
    expect(shuffle([], () => 0)).toEqual([]);
  });

  it('never puts avoidFirst first when there is more than one item', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(shuffleAvoidingFirst(['a', 'b', 'c'], 'a', seededRandom(seed))[0]).not.toBe('a');
      expect(shuffleAvoidingFirst(['a', 'b'], 'b', seededRandom(seed))).toEqual(['a', 'b']);
    }
    expect(shuffleAvoidingFirst(['a'], 'a', seededRandom(1))).toEqual(['a']);
    expect(shuffleAvoidingFirst(['a', 'b'], undefined, () => 0.999)).toEqual(['a', 'b']);
  });
});

describe('createRound / START_ROUND', () => {
  it('starts presenting the first card of the shuffled queue', () => {
    const state = start();
    expect(state.phase).toBe('presenting');
    expect(state.sessionId).toBe('s1');
    expect(state.roundNumber).toBe(1);
    expect(state.queue).toHaveLength(4);
    expect(state.presentedAt).toBe(1_000);
    expect(state.startedAt).toBe('2026-09-30T10:00:00.000Z');
    expect(roundStats(state)).toMatchObject({ answered: 0, correctPercentage: 0, progress: 0 });
    const current = currentCard(state);
    expect(current?.card.id).toBe(state.queue[0]?.cardId);
    expect(current?.prompt).toBe(`front-${current?.card.id}`);
    expect(current?.expected).toBe(`back-${current?.card.id}`);
  });

  it('shuffles deterministically for the same seed', () => {
    expect(start().queue).toEqual(start().queue);
  });

  it('removes duplicate cards and queue items of unknown cards', () => {
    const action = createRound({ cards: [...cards, cards[0] as SessionCard], options }, context());
    expect(action.cards).toHaveLength(4);
    const state = run(initialSessionState, {
      ...action,
      queue: [...action.queue, action.queue[0]!, { cardId: 'zz', direction: 'front_to_back' }],
    });
    expect(state.queue).toHaveLength(4);
  });

  it('accepts cards of several projects', () => {
    const mixed = [...cards, { id: 'e', projectId: 'p2', front: 'f', back: 'b' }];
    const state = start({ projectId: 'cross' }, mixed);
    expect(state.projectId).toBe('cross');
    expect(new Set(Object.values(state.cards).map((c) => c.projectId))).toEqual(
      new Set(['p1', 'p2']),
    );
  });

  it('completes an empty round immediately with 0 %', () => {
    const state = start({}, []);
    expect(state.phase).toBe('roundComplete');
    expect(roundStats(state)).toEqual({
      totalInRound: 0,
      answered: 0,
      correct: 0,
      incorrect: 0,
      remaining: 0,
      correctPercentage: 0,
      progress: 0,
    });
    expect(currentCard(state)).toBeUndefined();
  });

  it('draws the direction per card for mixed and keeps fixed directions otherwise', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      projectId: 'p1',
      front: `f${i}`,
      back: `b${i}`,
    }));
    const mixed = start({ direction: 'mixed' }, many);
    const directions = new Set(mixed.queue.map((item) => item.direction));
    expect(directions).toEqual(new Set(['front_to_back', 'back_to_front']));
    const reverse = start({ direction: 'back_to_front' }, many);
    expect(reverse.queue.every((item) => item.direction === 'back_to_front')).toBe(true);
    const current = currentCard(reverse);
    expect(current?.prompt).toBe(current?.card.back);
    expect(current?.expected).toBe(current?.card.front);
  });

  it('is ignored while a round is running', () => {
    const state = start();
    expect(sessionReducer(state, createRound({ cards, options }, context()))).toBe(state);
  });
});

describe('a round', () => {
  it('runs through every phase to roundComplete', () => {
    let state = start();
    state = sessionReducer(state, { type: 'INPUT_CHANGED', value: 'back' });
    expect(state.userInput).toBe('back');
    state = sessionReducer(state, { type: 'SUBMIT', at: 3_500 });
    expect(state.phase).toBe('evaluating');
    expect(state.responseTimeMs).toBe(2_500);
    expect(state.evaluationId).toBe(1);
    // Typing is locked while evaluating.
    expect(sessionReducer(state, { type: 'INPUT_CHANGED', value: 'y' })).toBe(state);
    state = sessionReducer(state, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: 1,
      result: { verdict: 'correct', method: 'fuzzy', confidence: 0.9 },
    });
    expect(state.phase).toBe('revealed');
    expect(state.lastResult).toMatchObject({
      cardId: state.queue[0]?.cardId,
      verdict: 'correct',
      method: 'fuzzy',
      confidence: 0.9,
      userInput: 'back',
      responseTimeMs: 2_500,
    });
    expect(roundStats(state)).toMatchObject({ answered: 1, correctPercentage: 25, progress: 0.25 });
    state = sessionReducer(state, { type: 'NEXT', at: 4_000 });
    expect(state.phase).toBe('transitioning');
    state = sessionReducer(state, { type: 'NEXT', at: 4_200 });
    expect(state.phase).toBe('presenting');
    expect(state.currentIndex).toBe(1);
    expect(state.userInput).toBe('');
    expect(state.lastResult).toBeNull();
    expect(state.presentedAt).toBe(4_200);

    state = answer(state, 'incorrect');
    state = answer(state, 'correct');
    state = answer(state, 'correct');
    expect(state.phase).toBe('roundComplete');
    expect(currentCard(state)).toBeUndefined();
    expect(roundStats(state)).toEqual({
      totalInRound: 4,
      answered: 4,
      correct: 3,
      incorrect: 1,
      remaining: 0,
      correctPercentage: 75,
      progress: 1,
    });
    expect(state.piles.incorrect).toEqual([state.queue[1]?.cardId]);
  });

  it('rounds the percentage', () => {
    let state = start({}, cards.slice(0, 3));
    state = answer(state, 'correct');
    expect(roundStats(state).correctPercentage).toBe(33);
    state = answer(state, 'correct');
    expect(roundStats(state).correctPercentage).toBe(67);
  });

  it('keeps the carried answer when the grading result has feedback and cache info', () => {
    let state = run(start(), { type: 'SUBMIT', at: 1_000 });
    state = sessionReducer(state, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: state.evaluationId,
      result: {
        verdict: 'incorrect',
        method: 'ai',
        confidence: 0.8,
        feedback: 'Nah dran',
        cached: true,
      },
    });
    expect(state.lastResult).toMatchObject({ method: 'ai', feedback: 'Nah dran', cached: true });
    expect(state.responseTimeMs).toBe(0);
  });

  it('ignores actions that do not fit the phase', () => {
    const state = start();
    for (const action of [
      { type: 'NEXT', at: 1 },
      { type: 'OVERRIDE', verdict: 'correct' },
      { type: 'SELF_ASSESS', verdict: 'correct' },
      { type: 'RETRY_EVALUATION' },
      {
        type: 'EVALUATION_SUCCEEDED',
        requestId: 0,
        result: { verdict: 'correct', method: 'exact' },
      },
      { type: 'EVALUATION_FAILED', requestId: 0, message: 'x' },
    ] satisfies SessionAction[]) {
      expect(sessionReducer(state, action)).toBe(state);
    }
    expect(sessionReducer(initialSessionState, { type: 'SUBMIT', at: 1 })).toBe(
      initialSessionState,
    );
    expect(sessionReducer(state, { type: 'INPUT_CHANGED', value: '' })).toBe(state);
  });
});

describe('override', () => {
  function revealed(verdict: 'correct' | 'incorrect'): SessionState {
    const submitted = run(start(), { type: 'SUBMIT', at: 1_500 });
    return sessionReducer(submitted, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: submitted.evaluationId,
      result: { verdict, method: 'ai', confidence: 0.7, feedback: 'Knapp daneben' },
    });
  }

  it('moves the card between the piles and marks the result as override', () => {
    let state = revealed('incorrect');
    const cardId = state.lastResult?.cardId;
    expect(state.piles.incorrect).toEqual([cardId]);
    state = sessionReducer(state, { type: 'OVERRIDE', verdict: 'correct' });
    expect(state.piles).toEqual({ correct: [cardId], incorrect: [] });
    expect(state.lastResult).toMatchObject({
      verdict: 'correct',
      method: 'override',
      confidence: 1,
      originalVerdict: 'incorrect',
    });
    expect(state.lastResult?.feedback).toBeUndefined();
    expect(roundStats(state).correctPercentage).toBe(25);
    state = sessionReducer(state, { type: 'OVERRIDE', verdict: 'incorrect' });
    expect(state.piles).toEqual({ correct: [], incorrect: [cardId] });
    expect(state.lastResult?.originalVerdict).toBe('incorrect');
  });

  it('is a no-op for the same verdict and outside revealed', () => {
    const state = revealed('correct');
    expect(sessionReducer(state, { type: 'OVERRIDE', verdict: 'correct' })).toBe(state);
    const moving = sessionReducer(state, { type: 'NEXT', at: 2_000 });
    expect(sessionReducer(moving, { type: 'OVERRIDE', verdict: 'incorrect' })).toBe(moving);
  });
});

describe('self assessment', () => {
  it('is used for grading mode self without any evaluation', () => {
    let state = start({ gradingMode: 'self' });
    state = run(
      state,
      { type: 'INPUT_CHANGED', value: 'meine Antwort' },
      { type: 'SUBMIT', at: 1_300 },
    );
    expect(state.phase).toBe('selfAssessing');
    expect(state.selfAssessmentReason).toBe('mode_self');
    expect(state.evaluationId).toBe(0);
    state = sessionReducer(state, { type: 'SELF_ASSESS', verdict: 'incorrect' });
    expect(state.phase).toBe('revealed');
    expect(state.selfAssessmentReason).toBeNull();
    expect(state.lastResult).toMatchObject({
      verdict: 'incorrect',
      method: 'self',
      confidence: 1,
      userInput: 'meine Antwort',
      responseTimeMs: 300,
    });
    expect(state.piles.incorrect).toHaveLength(1);
  });

  it('is the fallback when the grading service needs a self assessment', () => {
    let state = run(start(), { type: 'SUBMIT', at: 1_000 });
    state = sessionReducer(state, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: state.evaluationId,
      result: { verdict: 'needs_self_assessment', reason: 'offline' },
    });
    expect(state.phase).toBe('selfAssessing');
    expect(state.selfAssessmentReason).toBe('offline');
    state = sessionReducer(state, { type: 'SELF_ASSESS', verdict: 'correct' });
    expect(state.phase).toBe('revealed');
    expect(state.piles.correct).toHaveLength(1);
    // A self-assessed verdict can be corrected like any other.
    state = sessionReducer(state, { type: 'OVERRIDE', verdict: 'incorrect' });
    expect(state.piles.incorrect).toHaveLength(1);
  });
});

describe('errors and retry', () => {
  function failed(): SessionState {
    const submitted = run(start(), { type: 'SUBMIT', at: 1_000 });
    return sessionReducer(submitted, {
      type: 'EVALUATION_FAILED',
      requestId: submitted.evaluationId,
      message: 'Datenbank nicht verfügbar',
    });
  }

  it('goes to error and retries with a new request id', () => {
    let state = failed();
    expect(state.phase).toBe('error');
    expect(state.errorMessage).toBe('Datenbank nicht verfügbar');
    state = sessionReducer(state, { type: 'RETRY_EVALUATION' });
    expect(state.phase).toBe('evaluating');
    expect(state.evaluationId).toBe(2);
    expect(state.errorMessage).toBeNull();
    // The result of the first (failed) request is late now.
    expect(
      sessionReducer(state, {
        type: 'EVALUATION_SUCCEEDED',
        requestId: 1,
        result: { verdict: 'correct', method: 'exact' },
      }),
    ).toBe(state);
    state = sessionReducer(state, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: 2,
      result: { verdict: 'correct', method: 'exact' },
    });
    expect(state.phase).toBe('revealed');
  });

  it('can switch to self assessment instead of retrying', () => {
    const state = sessionReducer(failed(), { type: 'SELF_ASSESS', verdict: 'correct' });
    expect(state.phase).toBe('revealed');
    expect(state.lastResult?.method).toBe('self');
    expect(state.errorMessage).toBeNull();
  });
});

describe('late evaluation results', () => {
  it('are ignored after a newer request, after abort and in the next round', () => {
    const submitted = run(start(), { type: 'SUBMIT', at: 1_000 });
    const late: SessionAction = {
      type: 'EVALUATION_SUCCEEDED',
      requestId: submitted.evaluationId - 1,
      result: { verdict: 'correct', method: 'exact' },
    };
    expect(sessionReducer(submitted, late)).toBe(submitted);

    const aborted = sessionReducer(submitted, { type: 'ABORT' });
    const current: SessionAction = { ...late, requestId: submitted.evaluationId };
    expect(sessionReducer(aborted, current)).toBe(aborted);
    expect(
      sessionReducer(aborted, {
        type: 'EVALUATION_FAILED',
        requestId: submitted.evaluationId,
        message: 'x',
      }),
    ).toBe(aborted);

    // A new round keeps counting request ids, so the old id never matches again.
    const next = run(aborted, createRound({ cards, options }, context()));
    expect(next.evaluationId).toBe(submitted.evaluationId);
    const nextSubmitted = sessionReducer(next, { type: 'SUBMIT', at: 1 });
    expect(nextSubmitted.evaluationId).toBe(submitted.evaluationId + 1);
    expect(sessionReducer(nextSubmitted, current)).toBe(nextSubmitted);
  });
});

describe('abort', () => {
  it('ends a running round from any active phase', () => {
    const presenting = start();
    const evaluating = sessionReducer(presenting, { type: 'SUBMIT', at: 1 });
    for (const state of [presenting, evaluating]) {
      expect(sessionReducer(state, { type: 'ABORT' }).phase).toBe('aborted');
    }
    const aborted = sessionReducer(presenting, { type: 'ABORT' });
    expect(sessionReducer(aborted, { type: 'ABORT' })).toBe(aborted);
    expect(sessionReducer(initialSessionState, { type: 'ABORT' })).toBe(initialSessionState);
    const complete = start({}, []);
    expect(sessionReducer(complete, { type: 'ABORT' })).toBe(complete);
  });

  it('keeps the piles of the answered cards', () => {
    const state = sessionReducer(answer(start(), 'correct'), { type: 'ABORT' });
    expect(state.piles.correct).toHaveLength(1);
    expect(roundStats(state).answered).toBe(1);
  });
});

describe('answer ids', () => {
  it('are stored per card for the current session only', () => {
    const state = start();
    const cardId = state.queue[0]!.cardId;
    const saved = sessionReducer(state, {
      type: 'ANSWER_SAVED',
      sessionId: 's1',
      cardId,
      answerId: 'ans-1',
    });
    expect(saved.answerIds).toEqual({ [cardId]: 'ans-1' });
    expect(
      sessionReducer(state, { type: 'ANSWER_SAVED', sessionId: 'old', cardId, answerId: 'x' }),
    ).toBe(state);
    expect(
      sessionReducer(state, { type: 'ANSWER_SAVED', sessionId: 's1', cardId: 'zz', answerId: 'x' }),
    ).toBe(state);
  });
});

describe('buildNextRound', () => {
  const previous = finishRound(['correct', 'incorrect', 'incorrect', 'correct']);

  it('repeats the wrong pile', () => {
    const action = buildNextRound(previous, 'wrong', context({ sessionId: 's2' }));
    expect(action).not.toBeNull();
    const state = run(previous, action!);
    expect(state.phase).toBe('presenting');
    expect(state.roundNumber).toBe(2);
    expect(state.mode).toBe('wrong');
    expect(state.sessionId).toBe('s2');
    expect(new Set(state.queue.map((item) => item.cardId))).toEqual(
      new Set(previous.piles.incorrect),
    );
    // Every round starts at 0 %.
    expect(roundStats(state)).toMatchObject({ totalInRound: 2, answered: 0, correctPercentage: 0 });
    expect(state.piles).toEqual({ correct: [], incorrect: [] });
    expect(state.answerIds).toEqual({});
  });

  it('repeats the right pile or all cards', () => {
    const right = run(previous, buildNextRound(previous, 'right', context())!);
    expect(new Set(right.queue.map((item) => item.cardId))).toEqual(
      new Set(previous.piles.correct),
    );
    const all = run(previous, buildNextRound(previous, 'all', context())!);
    expect(all.queue).toHaveLength(4);
    expect(all).toMatchObject({
      direction: 'front_to_back',
      gradingMode: 'ai',
      strictness: 'meaning',
    });
  });

  it('never starts with the last card of the previous round', () => {
    const last = previous.queue.at(-1)!.cardId;
    for (let seed = 0; seed < 100; seed++) {
      const action = buildNextRound(previous, 'all', context({ random: seededRandom(seed) }));
      expect(action?.queue[0]?.cardId).not.toBe(last);
    }
  });

  it('returns null for an empty pile', () => {
    const allCorrect = finishRound(['correct', 'correct', 'correct', 'correct']);
    expect(buildNextRound(allCorrect, 'wrong', context())).toBeNull();
    expect(buildNextRound(allCorrect, 'right', context())).not.toBeNull();
    const allWrong = finishRound(['incorrect', 'incorrect', 'incorrect', 'incorrect']);
    expect(buildNextRound(allWrong, 'right', context())).toBeNull();
    expect(buildNextRound(start({}, []), 'all', context())).toBeNull();
  });

  it('draws new directions for mixed rounds', () => {
    let state = start({ direction: 'mixed' });
    for (let i = 0; i < 4; i++) state = answer(state, 'correct');
    const action = buildNextRound(state, 'all', context({ random: seededRandom(3) }));
    expect(action?.options.direction).toBe('mixed');
  });
});

describe('restore after reload', () => {
  it('round-trips a running round through sessionStorage format', () => {
    let state = answer(start({ direction: 'mixed' }), 'incorrect');
    state = run(state, { type: 'INPUT_CHANGED', value: 'halb' }, { type: 'SUBMIT', at: 9_000 });
    const restored = parseStoredSession(serializeSession(state));
    expect(restored).toEqual(state);
    // The restored state continues normally.
    const next = sessionReducer(restored!, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: state.evaluationId,
      result: { verdict: 'correct', method: 'exact' },
    });
    expect(next.phase).toBe('revealed');
    expect(roundStats(next).answered).toBe(2);
  });

  it('keeps revealed results with their optional fields', () => {
    let state = run(start(), { type: 'SUBMIT', at: 1_000 });
    state = sessionReducer(state, {
      type: 'EVALUATION_SUCCEEDED',
      requestId: state.evaluationId,
      result: {
        verdict: 'incorrect',
        method: 'ai',
        confidence: 0.6,
        feedback: 'Fast',
        cached: false,
      },
    });
    expect(parseStoredSession(serializeSession(state))).toEqual(state);
    const complete = finishRound(['correct']);
    expect(parseStoredSession(serializeSession(complete))).toEqual(complete);
  });

  it('rejects missing, broken, foreign and inconsistent snapshots', () => {
    const state = start();
    expect(parseStoredSession(null)).toBeUndefined();
    expect(parseStoredSession('')).toBeUndefined();
    expect(parseStoredSession('{nope')).toBeUndefined();
    expect(parseStoredSession(JSON.stringify({ version: 99, state }))).toBeUndefined();
    expect(
      parseStoredSession(serializeSession({ ...state, phase: 'bogus' } as unknown as SessionState)),
    ).toBeUndefined();
    expect(parseStoredSession(serializeSession(initialSessionState))).toBeUndefined();
    expect(
      parseStoredSession(serializeSession(sessionReducer(state, { type: 'ABORT' }))),
    ).toBeUndefined();
    expect(parseStoredSession(serializeSession({ ...state, currentIndex: 9 }))).toBeUndefined();
    expect(parseStoredSession(serializeSession({ ...state, cards: {} }))).toBeUndefined();
  });
});
