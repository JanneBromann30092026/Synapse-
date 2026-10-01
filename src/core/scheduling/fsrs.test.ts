import { describe, expect, it } from 'vitest';
import {
  dueCutoff,
  forgettingCurve,
  nextIntervalDays,
  planDueRound,
  RATINGS,
  replay,
  retrievability,
  review,
} from './fsrs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-09-01T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('FSRS', () => {
  it('recall probability is 90 % after `stability` days', () => {
    expect(forgettingCurve(0, 5)).toBe(1);
    expect(forgettingCurve(5, 5)).toBeCloseTo(0.9, 6);
    expect(nextIntervalDays(5)).toBe(5);
    expect(nextIntervalDays(0.2)).toBe(1);
    expect(nextIntervalDays(1e9)).toBe(36500);
  });

  it('first answer: right → a few days, wrong → tomorrow', () => {
    const good = review(null, RATINGS.good, T0);
    expect(good.stability).toBeCloseTo(3.173, 3);
    expect(good.dueAt).toBe(T0 + 3 * DAY);
    expect(good).toMatchObject({ reps: 1, lapses: 0, lastReviewedAt: T0 });
    const again = review(null, RATINGS.again, T0);
    expect(again.dueAt).toBe(T0 + DAY);
    expect(again.difficulty).toBeGreaterThan(good.difficulty);
  });

  it('intervals grow with every correct answer on time', () => {
    let state = review(null, RATINGS.good, T0);
    const intervals: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = review(state, RATINGS.good, state.dueAt);
      intervals.push((next.dueAt - next.lastReviewedAt) / DAY);
      state = next;
    }
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1] ?? 0);
    }
    expect(intervals[0]).toBeGreaterThanOrEqual(8);
  });

  it('a wrong answer after a long interval resets to a short one and counts a lapse', () => {
    let state = review(null, RATINGS.good, T0);
    state = review(state, RATINGS.good, state.dueAt);
    state = review(state, RATINGS.good, state.dueAt);
    const before = state.stability;
    const lapsed = review(state, RATINGS.again, state.dueAt);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(before / 3);
    // Forgotten cards come back the next day.
    expect(lapsed.dueAt - lapsed.lastReviewedAt).toBe(DAY);
  });

  it('same-day repetitions only have a short-term effect', () => {
    const first = review(null, RATINGS.again, T0);
    const again = review(first, RATINGS.good, T0 + 10 * 60 * 1000);
    expect(again.stability).toBeGreaterThan(first.stability);
    expect(again.stability).toBeLessThan(first.stability * 2);
    expect(again.lapses).toBe(0);
  });

  it('replays answers in time order and ignores invalid dates', () => {
    const answers = [
      { verdict: 'correct' as const, answeredAt: iso(T0 + 3 * DAY) },
      { verdict: 'incorrect' as const, answeredAt: iso(T0) },
      { verdict: 'correct' as const, answeredAt: 'kaputt' },
    ];
    const replayed = replay(answers);
    const manual = review(review(null, RATINGS.again, T0), RATINGS.good, T0 + 3 * DAY);
    expect(replayed).toEqual(manual);
    expect(replay([])).toBeNull();
  });

  it('retrievability falls over time', () => {
    const state = review(null, RATINGS.good, T0);
    expect(retrievability(state, T0)).toBe(1);
    expect(retrievability(state, T0 + 30 * DAY)).toBeLessThan(retrievability(state, T0 + DAY));
  });
});

describe('due round', () => {
  it('cutoff is the start of the next local day', () => {
    const now = new Date(2026, 8, 1, 8, 30).getTime();
    expect(dueCutoff(now)).toBe(new Date(2026, 8, 2, 0, 0).getTime());
    expect(dueCutoff(new Date(2026, 8, 1, 23, 59).getTime())).toBe(new Date(2026, 8, 2).getTime());
  });

  it('splits due, new and later cards', () => {
    const cutoff = T0;
    const plan = planDueRound({
      cardIds: ['n1', 'late', 'd2', 'n2', 'd1', 'n3', 'soon'],
      dueAt: new Map([
        ['late', T0 + 5 * DAY],
        ['soon', T0 + DAY],
        ['d1', T0 - 3 * DAY],
        ['d2', T0 - DAY],
      ]),
      cutoff,
      newLimit: 2,
    });
    expect(plan.due).toEqual(['d1', 'd2']);
    expect(plan.fresh).toEqual(['n1', 'n2', 'n3']);
    expect(plan.roundCardIds).toEqual(['d1', 'd2', 'n1', 'n2']);
    expect(plan.nextDueAt).toBe(T0 + DAY);
    expect(planDueRound({ cardIds: ['n1'], dueAt: new Map(), cutoff, newLimit: 0 })).toEqual({
      due: [],
      fresh: ['n1'],
      roundCardIds: [],
      nextDueAt: null,
    });
  });
});
