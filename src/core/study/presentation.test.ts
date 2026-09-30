import { describe, expect, it } from 'vitest';
import { initialSessionState, seededRandom } from '@/core/session';
import {
  burstParticles,
  CARD_MAX_WIDTH,
  displayedPiles,
  fitCard,
  flightPath,
  promptFontSize,
  swipeDirection,
  textLang,
} from './presentation';

describe('fitCard', () => {
  it('keeps 3:2 and the maximum width on large stages', () => {
    expect(fitCard({ width: 1100, height: 700 })).toEqual({ width: CARD_MAX_WIDTH, height: 453 });
  });

  it('shrinks with the keyboard and widens a little on very low stages', () => {
    expect(fitCard({ width: 900, height: 400 })).toEqual({ width: 600, height: 400 });
    expect(fitCard({ width: 900, height: 240 })).toEqual({ width: 528, height: 240 });
    expect(fitCard({ width: 400, height: 240 })).toEqual({ width: 400, height: 240 });
  });

  it('fits narrow stages (Split View)', () => {
    expect(fitCard({ width: 460, height: 700 })).toEqual({ width: 460, height: 307 });
  });

  it('never gets smaller than the minimum, unless the stage is narrower', () => {
    expect(fitCard({ width: 800, height: 60 }).width).toBe(200);
    expect(fitCard({ width: 150, height: 60 }).width).toBe(150);
  });
});

describe('text', () => {
  it('detects Japanese', () => {
    expect(textLang('犬')).toBe('ja');
    expect(textLang('ありがとう')).toBe('ja');
    expect(textLang('Hund')).toBeUndefined();
  });

  it('gets smaller step by step for longer texts', () => {
    const sizes = [
      'Hund',
      'Eigenkapitalrendite',
      'Was versteht man unter dem Begriff Cashflow?',
      'x'.repeat(120),
      'x'.repeat(200),
      'x'.repeat(400),
    ].map((text) => promptFontSize(text, CARD_MAX_WIDTH));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1] ?? 0);
  });

  it('shows short Japanese larger and scales with the card', () => {
    expect(promptFontSize('犬', CARD_MAX_WIDTH)).toBeGreaterThan(promptFontSize('Hund', 680));
    expect(promptFontSize('Hund', 340)).toBeLessThan(promptFontSize('Hund', 680));
    expect(promptFontSize('x'.repeat(500), 100)).toBe(16);
  });
});

describe('displayedPiles', () => {
  const base = {
    ...initialSessionState,
    piles: { correct: ['a', 'b'], incorrect: ['c'] },
  };

  it('counts the current card only after its flight', () => {
    const lastResult = {
      cardId: 'b',
      direction: 'front_to_back' as const,
      userInput: '',
      verdict: 'correct' as const,
      method: 'exact' as const,
      responseTimeMs: 0,
      originalVerdict: 'correct' as const,
    };
    expect(displayedPiles({ ...base, phase: 'revealed', lastResult })).toEqual({
      correct: 1,
      incorrect: 1,
    });
    expect(displayedPiles({ ...base, phase: 'presenting', lastResult: null })).toEqual({
      correct: 2,
      incorrect: 1,
    });
    expect(
      displayedPiles({
        ...base,
        phase: 'transitioning',
        lastResult: { ...lastResult, cardId: 'c', verdict: 'incorrect' },
      }),
    ).toEqual({ correct: 2, incorrect: 0 });
  });
});

describe('swipeDirection', () => {
  it('needs distance or speed', () => {
    expect(swipeDirection(140, 0)).toBe('right');
    expect(swipeDirection(-140, 0)).toBe('left');
    expect(swipeDirection(40, 0)).toBeNull();
    expect(swipeDirection(40, 900)).toBe('right');
    expect(swipeDirection(10, -900)).toBeNull();
  });
});

describe('animation helpers', () => {
  it('flies on a lifted curve', () => {
    const path = flightPath({ x: 0, y: 0 }, { x: 300, y: 100 });
    expect(path.x).toEqual([0, 150, 300]);
    expect(path.y[0]).toBe(0);
    expect(path.y[2]).toBe(100);
    expect(path.y[1]).toBeLessThan(0);
  });

  it('bursts 8 to 14 particles deterministically', () => {
    expect(burstParticles(3, seededRandom(1))).toHaveLength(8);
    expect(burstParticles(40, seededRandom(1))).toHaveLength(14);
    expect(burstParticles(12, seededRandom(7))).toEqual(burstParticles(12, seededRandom(7)));
  });
});
