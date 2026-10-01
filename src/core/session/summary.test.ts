import { describe, expect, it } from 'vitest';
import {
  createRound,
  initialSessionState,
  motivationTier,
  pickVariant,
  seededRandom,
  sessionReducer,
  summarizeRound,
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

const START_MS = Date.parse('2026-09-30T10:00:00.000Z');

function run(state: SessionState, ...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state);
}

/** Round started at START_MS; each card is answered `responseMs` after it was shown. */
function playRound(verdicts: ('correct' | 'incorrect')[], responseMs: number[]): SessionState {
  let state = run(
    initialSessionState,
    createRound(
      {
        cards: cards.slice(0, verdicts.length),
        options: {
          projectId: 'p1',
          mode: 'all',
          direction: 'front_to_back',
          gradingMode: 'ai',
          strictness: 'meaning',
        },
      },
      {
        random: seededRandom(3),
        at: START_MS,
        startedAt: new Date(START_MS).toISOString(),
        sessionId: 's1',
      },
    ),
  );
  let now = START_MS;
  verdicts.forEach((verdict, i) => {
    now += responseMs[i] ?? 0;
    state = run(
      state,
      { type: 'INPUT_CHANGED', value: `answer-${i}` },
      { type: 'SUBMIT', at: now },
    );
    state = run(
      state,
      {
        type: 'EVALUATION_SUCCEEDED',
        requestId: state.evaluationId,
        result: { verdict, method: 'ai', confidence: 0.9, feedback: `feedback-${i}` },
      },
      { type: 'NEXT', at: now },
    );
    now += 1_000; // reading the result and the flight onto the pile
    state = run(state, { type: 'NEXT', at: now });
  });
  return state;
}

describe('motivationTier', () => {
  it('maps the round status to the four tiers', () => {
    expect(motivationTier(100)).toBe('perfect');
    expect(motivationTier(99)).toBe('great');
    expect(motivationTier(80)).toBe('great');
    expect(motivationTier(79)).toBe('good');
    expect(motivationTier(50)).toBe('good');
    expect(motivationTier(49)).toBe('low');
    expect(motivationTier(0)).toBe('low');
  });
});

describe('pickVariant', () => {
  it('is stable for a seed and stays within the list', () => {
    const variants = ['a', 'b', 'c'];
    expect(pickVariant(variants, 'session-1')).toBe(pickVariant(variants, 'session-1'));
    const picked = new Set(Array.from({ length: 30 }, (_, i) => pickVariant(variants, `s${i}`)));
    expect(picked.size).toBe(3);
    expect(pickVariant([], 'x')).toBeUndefined();
  });
});

describe('summarizeRound', () => {
  it('computes counts, duration and mean response time', () => {
    const state = playRound(
      ['correct', 'incorrect', 'correct', 'correct'],
      [2_000, 4_000, 3_000, 7_000],
    );
    expect(state.phase).toBe('roundComplete');
    const summary = summarizeRound(state);
    expect(summary).toMatchObject({
      total: 4,
      correct: 3,
      incorrect: 1,
      percentage: 75,
      tier: 'good',
      // 16 s answering + 4 × 1 s result and flight
      durationMs: 20_000,
      averageResponseMs: 4_000,
    });
  });

  it('lists wrong and right answers in the asked order with input and feedback', () => {
    const state = playRound(['incorrect', 'correct', 'incorrect'], [1_000, 1_000, 1_000]);
    const { incorrectItems, correctItems } = summarizeRound(state);
    expect(incorrectItems.map((item) => item.card.id)).toEqual(
      state.queue.filter((_, i) => i !== 1).map((item) => item.cardId),
    );
    expect(correctItems).toHaveLength(1);
    const first = incorrectItems[0]!;
    expect(first.prompt).toBe(first.card.front);
    expect(first.expected).toBe(first.card.back);
    expect(first.result.userInput).toBe('answer-0');
    expect(first.result.feedback).toBe('feedback-0');
  });

  it('follows overrides (the card moves to the other list)', () => {
    let state = playRound(['correct', 'correct'], [1_000, 1_000]);
    expect(summarizeRound(state).tier).toBe('perfect');
    // Same round again, but the second answer is corrected to wrong while revealed.
    state = playRound(['correct'], [1_000]);
    const revealed = run(
      {
        ...state,
        phase: 'transitioning',
        currentIndex: 0,
        queue: [...state.queue, ...state.queue],
      },
      { type: 'NEXT', at: START_MS },
    );
    expect(revealed.phase).toBe('presenting');
    const answered = run(revealed, { type: 'SUBMIT', at: START_MS + 1_000 });
    const overridden = run(
      answered,
      {
        type: 'EVALUATION_SUCCEEDED',
        requestId: answered.evaluationId,
        result: { verdict: 'correct', method: 'exact', confidence: 1 },
      },
      { type: 'OVERRIDE', verdict: 'incorrect' },
    );
    const summary = summarizeRound(overridden);
    expect(summary.incorrect).toBe(1);
    expect(summary.incorrectItems[0]?.result.method).toBe('override');
  });

  it('shows the prompt as asked for the reverse direction', () => {
    const state = playRound(['incorrect'], [1_000]);
    const cardId = state.queue[0]!.cardId;
    const reversed: SessionState = {
      ...state,
      results: {
        [cardId]: { ...state.results[cardId]!, direction: 'back_to_front' },
      },
    };
    const item = summarizeRound(reversed).incorrectItems[0]!;
    expect(item.prompt).toBe(`back-${cardId}`);
    expect(item.expected).toBe(`front-${cardId}`);
  });

  it('has no duration or mean time without data', () => {
    const summary = summarizeRound(initialSessionState);
    expect(summary).toMatchObject({
      total: 0,
      percentage: 0,
      durationMs: null,
      averageResponseMs: null,
      tier: 'low',
      incorrectItems: [],
      correctItems: [],
    });
  });

  it('has no duration while the round is running', () => {
    const state = run(playRound(['correct'], [1_000]), {
      ...createRound(
        {
          cards,
          options: {
            projectId: 'p1',
            mode: 'all',
            direction: 'front_to_back',
            gradingMode: 'ai',
            strictness: 'meaning',
          },
          roundNumber: 2,
        },
        { random: seededRandom(1), at: START_MS, startedAt: 'x', sessionId: 's2' },
      ),
    });
    expect(state.phase).toBe('presenting');
    expect(state.results).toEqual({});
    expect(summarizeRound(state).durationMs).toBeNull();
  });
});
