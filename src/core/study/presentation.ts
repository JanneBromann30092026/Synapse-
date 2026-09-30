import type { RandomSource, SessionState } from '@/core/session';

/**
 * Pure layout and animation helpers of the study screen (no React, no DOM): card size, text
 * size, pile counters, swipe decisions, flight path and particle burst.
 */

export interface Size {
  width: number;
  height: number;
}

export const CARD_RATIO = 3 / 2;
export const CARD_MAX_WIDTH = 680;
export const CARD_MIN_WIDTH = 200;

/** Below this stage height (keyboard visible) the card may get wider than 3 : 2. */
export const COMPACT_STAGE_HEIGHT = 320;
const COMPACT_MAX_RATIO = 2.2;

/**
 * Largest card (width : height ≈ 3 : 2) that fits the stage. It shrinks when the keyboard is up;
 * on low stages it may widen up to 2.2 : 1 so the back side keeps room for its text.
 */
export function fitCard(stage: Size, maxWidth = CARD_MAX_WIDTH): Size {
  const available = Math.min(stage.width, maxWidth);
  if (stage.height < COMPACT_STAGE_HEIGHT && stage.height * CARD_RATIO < available) {
    const height = Math.max(0, Math.round(stage.height));
    const width = Math.round(Math.min(available, height * COMPACT_MAX_RATIO));
    if (width >= CARD_MIN_WIDTH) return { width, height };
  }
  const byHeight = stage.height * CARD_RATIO;
  const width = Math.max(Math.min(CARD_MIN_WIDTH, stage.width), Math.min(available, byHeight));
  return { width: Math.round(width), height: Math.round(width / CARD_RATIO) };
}

const CJK = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/u;

/** Language hint for the card text (Safari then picks Japanese glyphs). */
export function textLang(text: string): 'ja' | undefined {
  return CJK.test(text) ? 'ja' : undefined;
}

/**
 * Font size in px for the question: large for short texts, stepwise smaller for long ones,
 * scaled with the card width (the card gets smaller with the on-screen keyboard).
 */
export function promptFontSize(text: string, cardWidth: number): number {
  const length = [...text.trim()].length;
  const cjk = textLang(text) === 'ja';
  let base: number;
  if (length <= (cjk ? 4 : 12)) base = cjk ? 88 : 48;
  else if (length <= (cjk ? 10 : 30)) base = cjk ? 60 : 38;
  else if (length <= 70) base = 30;
  else if (length <= 140) base = 24;
  else if (length <= 260) base = 20;
  else base = 18;
  const scale = Math.min(1, Math.max(0.55, cardWidth / CARD_MAX_WIDTH));
  return Math.max(16, Math.round(base * scale));
}

export interface PileCounts {
  correct: number;
  incorrect: number;
}

/**
 * Pile counters as shown: the current card only counts once it landed on its pile
 * (its verdict is known from 'revealed' on, the flight ends with 'transitioning').
 */
export function displayedPiles(state: Pick<SessionState, 'phase' | 'piles' | 'lastResult'>) {
  const counts: PileCounts = {
    correct: state.piles.correct.length,
    incorrect: state.piles.incorrect.length,
  };
  const inFlight = state.phase === 'revealed' || state.phase === 'transitioning';
  if (inFlight && state.lastResult) {
    if (state.lastResult.verdict === 'correct') counts.correct -= 1;
    else counts.incorrect -= 1;
  }
  return counts;
}

export const SWIPE_DISTANCE = 110;
export const SWIPE_VELOCITY = 550;

/** Direction of a finished swipe, or null when it was too short and too slow. */
export function swipeDirection(offsetX: number, velocityX: number): 'left' | 'right' | null {
  if (Math.abs(offsetX) >= SWIPE_DISTANCE) return offsetX > 0 ? 'right' : 'left';
  if (Math.abs(velocityX) >= SWIPE_VELOCITY && Math.abs(offsetX) > 24) {
    return velocityX > 0 ? 'right' : 'left';
  }
  return null;
}

export interface Point {
  x: number;
  y: number;
}

/** Keyframes of a slightly curved flight (lifted in the middle) from `from` to `to`. */
export function flightPath(from: Point, to: Point, lift = 80): { x: number[]; y: number[] } {
  const midX = from.x + (to.x - from.x) * 0.5;
  const midY = Math.min(from.y, to.y) + (to.y - from.y) * 0.25 - lift;
  return { x: [from.x, midX, to.x], y: [from.y, midY, to.y] };
}

export interface Particle {
  id: number;
  /** Target offset from the burst center in px. */
  x: number;
  y: number;
  size: number;
  /** Seconds. */
  delay: number;
  /** Index into the green palette. */
  tone: number;
}

/** Small, self-removing burst: evenly spread with a little randomness. */
export function burstParticles(count: number, random: RandomSource, radius = 90): Particle[] {
  const n = Math.max(8, Math.min(14, Math.round(count)));
  return Array.from({ length: n }, (_, id) => {
    const angle = (id / n) * Math.PI * 2 + (random() - 0.5) * 0.5;
    const distance = radius * (0.65 + random() * 0.5);
    return {
      id,
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance),
      size: Math.round(5 + random() * 5),
      delay: Math.round(random() * 60) / 1000,
      tone: id % 3,
    };
  });
}
