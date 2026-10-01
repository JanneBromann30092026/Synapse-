import { describe, expect, it } from 'vitest';
import {
  MASTERY_HALF_LIFE_DAYS,
  MASTERY_RECENCY_FACTOR,
  MASTERY_WINDOW,
  computeMastery,
  countLevels,
  decayFactor,
  hardestCards,
  masteryLevel,
  weightedCorrectShare,
  type Mastery,
  type MasteryAnswer,
} from './mastery';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** Answers one minute apart, ending `daysAgo` days before NOW. */
function answers(verdicts: string, daysAgo = 0): MasteryAnswer[] {
  const end = NOW - daysAgo * DAY;
  return [...verdicts].map((v, i) => ({
    verdict: v === 'r' ? 'correct' : 'incorrect',
    answeredAt: new Date(end - (verdicts.length - 1 - i) * 60_000).toISOString(),
  }));
}

describe('weightedCorrectShare', () => {
  it('weights newer answers more', () => {
    const recentRight = weightedCorrectShare(answers('fr'));
    const recentWrong = weightedCorrectShare(answers('rf'));
    expect(recentRight).toBeCloseTo(1 / (1 + MASTERY_RECENCY_FACTOR));
    expect(recentWrong).toBeCloseTo(MASTERY_RECENCY_FACTOR / (1 + MASTERY_RECENCY_FACTOR));
    expect(recentRight).toBeGreaterThan(0.5);
    expect(recentWrong).toBeLessThan(0.5);
  });

  it('only counts the last answers of the window', () => {
    const old = 'f'.repeat(20);
    expect(weightedCorrectShare(answers(old + 'r'.repeat(MASTERY_WINDOW)))).toBe(1);
    expect(weightedCorrectShare(answers('r'.repeat(20) + 'f'.repeat(MASTERY_WINDOW)))).toBe(0);
  });

  it('is 0 for no answers', () => {
    expect(weightedCorrectShare([])).toBe(0);
  });
});

describe('decayFactor', () => {
  it('halves after the half-life', () => {
    expect(decayFactor(new Date(NOW).toISOString(), NOW)).toBe(1);
    expect(
      decayFactor(new Date(NOW - MASTERY_HALF_LIFE_DAYS * DAY).toISOString(), NOW),
    ).toBeCloseTo(0.5);
    expect(
      decayFactor(new Date(NOW - 2 * MASTERY_HALF_LIFE_DAYS * DAY).toISOString(), NOW),
    ).toBeCloseTo(0.25);
  });

  it('ignores future timestamps (clock changes) and invalid dates', () => {
    expect(decayFactor(new Date(NOW + DAY).toISOString(), NOW)).toBe(1);
    expect(decayFactor('kaputt', NOW)).toBe(1);
  });
});

describe('computeMastery', () => {
  it('is new without answers', () => {
    expect(computeMastery([], NOW)).toEqual({ score: 0, level: 'new', answerCount: 0 });
  });

  it('is solid when always right recently', () => {
    const m = computeMastery(answers('rrrr'), NOW);
    expect(m.score).toBeCloseTo(1);
    expect(m.level).toBe('solid');
    expect(m.answerCount).toBe(4);
  });

  it('is weak when only wrong', () => {
    const m = computeMastery(answers('fff'), NOW);
    expect(m.score).toBe(0);
    expect(m.level).toBe('weak');
  });

  it('recovers after recent correct answers', () => {
    expect(computeMastery(answers('ffffrr'), NOW).level).toBe('building');
    expect(computeMastery(answers('ffffrrrr'), NOW).level).toBe('solid');
  });

  it('decays from the last correct answer, not the last answer', () => {
    const fresh = computeMastery(answers('rrrr'), NOW);
    const old = computeMastery(answers('rrrr', MASTERY_HALF_LIFE_DAYS), NOW);
    expect(old.score).toBeCloseTo(fresh.score / 2);
    expect(old.level).toBe('building');
    // A wrong answer today does not reset the decay clock of the last correct one.
    const list = [...answers('rrr', MASTERY_HALF_LIFE_DAYS), ...answers('f')];
    const decayed = computeMastery(list, NOW);
    expect(decayed.score).toBeCloseTo(weightedCorrectShare(list) * 0.5);
    expect(decayed.lastAnsweredAt).toBe(list.at(-1)?.answeredAt);
  });

  it('fades a well known card to weak after long without practice', () => {
    expect(computeMastery(answers('rrrrrrrr', 3 * MASTERY_HALF_LIFE_DAYS), NOW).level).toBe('weak');
  });

  it('stays within 0..1', () => {
    for (const pattern of ['r', 'f', 'rf', 'fr', 'rrfrfrrfrr']) {
      const { score } = computeMastery(answers(pattern), NOW);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('handles thousands of answers quickly', () => {
    const many = answers('rf'.repeat(5000));
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) computeMastery(many, NOW);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('masteryLevel', () => {
  it('uses the documented thresholds (0.4 and 0.75 count as building)', () => {
    expect(masteryLevel(0, 0)).toBe('new');
    expect(masteryLevel(0.39, 3)).toBe('weak');
    expect(masteryLevel(0.4, 3)).toBe('building');
    expect(masteryLevel(0.75, 3)).toBe('building');
    expect(masteryLevel(0.76, 3)).toBe('solid');
  });
});

describe('countLevels and hardestCards', () => {
  const item = (id: string, score: number, answerCount: number, last = '2026-09-01') => ({
    id,
    mastery: {
      score,
      answerCount,
      level: masteryLevel(score, answerCount),
      lastAnsweredAt: last,
    } satisfies Mastery,
  });

  it('counts per level', () => {
    const items = [item('a', 0, 0), item('b', 0.1, 2), item('c', 0.5, 2), item('d', 0.9, 2)];
    expect(countLevels(items.map((i) => i.mastery))).toEqual({
      new: 1,
      weak: 1,
      building: 1,
      solid: 1,
    });
  });

  it('picks the lowest scores with enough answers and leaves out solid cards', () => {
    const items = [
      item('once', 0, 1),
      item('solid', 0.9, 5),
      item('mid', 0.5, 3),
      item('low', 0.1, 2),
      item('lowMore', 0.1, 6),
      item('new', 0, 0),
    ];
    expect(hardestCards(items, 10).map((i) => i.id)).toEqual(['lowMore', 'low', 'mid']);
    expect(hardestCards(items, 1).map((i) => i.id)).toEqual(['lowMore']);
  });
});
