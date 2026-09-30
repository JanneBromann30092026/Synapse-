import { roundStats } from './round';
import type { LastResult, SessionCard, SessionState } from './types';

/** Motivation tiers of the round end: 100 %, ≥ 80 %, ≥ 50 %, < 50 %. */
export const MOTIVATION_TIERS = ['perfect', 'great', 'good', 'low'] as const;
export type MotivationTier = (typeof MOTIVATION_TIERS)[number];

export function motivationTier(percentage: number): MotivationTier {
  if (percentage >= 100) return 'perfect';
  if (percentage >= 80) return 'great';
  if (percentage >= 50) return 'good';
  return 'low';
}

/** Stable pick from a list of variants (same seed → same text, also after a reload). */
export function pickVariant<T>(variants: readonly T[], seed: string): T | undefined {
  if (variants.length === 0) return undefined;
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return variants[hash % variants.length];
}

export interface SummaryItem {
  card: SessionCard;
  /** Side that was asked. */
  prompt: string;
  /** Side the user had to type. */
  expected: string;
  result: LastResult;
}

export interface RoundSummary {
  total: number;
  correct: number;
  incorrect: number;
  /** 0–100, rounded. */
  percentage: number;
  /** Start to end of the round; null if unknown. */
  durationMs: number | null;
  /** Mean response time of the answered cards; null without answers. */
  averageResponseMs: number | null;
  tier: MotivationTier;
  /** In the order they were asked. */
  incorrectItems: SummaryItem[];
  correctItems: SummaryItem[];
}

/** Round end figures from the session state (pure, works for any phase). */
export function summarizeRound(state: SessionState): RoundSummary {
  const stats = roundStats(state);
  const items: SummaryItem[] = [];
  for (const item of state.queue) {
    const card = state.cards[item.cardId];
    const result = state.results[item.cardId];
    if (!card || !result) continue;
    const [prompt, expected] =
      result.direction === 'front_to_back' ? [card.front, card.back] : [card.back, card.front];
    items.push({ card, prompt, expected, result });
  }
  const times = items.map((item) => item.result.responseTimeMs);
  const started = state.startedAt ? Date.parse(state.startedAt) : Number.NaN;
  const durationMs =
    state.completedAt !== null && Number.isFinite(started)
      ? Math.max(0, state.completedAt - started)
      : null;
  return {
    total: stats.totalInRound,
    correct: stats.correct,
    incorrect: stats.incorrect,
    percentage: stats.correctPercentage,
    durationMs,
    averageResponseMs:
      times.length === 0 ? null : Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length),
    tier: motivationTier(stats.correctPercentage),
    incorrectItems: items.filter((item) => item.result.verdict === 'incorrect'),
    correctItems: items.filter((item) => item.result.verdict === 'correct'),
  };
}
