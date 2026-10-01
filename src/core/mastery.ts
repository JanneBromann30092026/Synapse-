/**
 * Mastery of a card: a lasting 0..1 score from its logged answers (unlike the round status,
 * which only counts the current round).
 *
 * 1. Recency-weighted share of correct answers among the last MASTERY_WINDOW answers: the
 *    newest answer has weight 1, each older one MASTERY_RECENCY_FACTOR times the previous.
 * 2. Time decay: the share is multiplied by 0.5^(days since the last correct answer /
 *    MASTERY_HALF_LIFE_DAYS), so knowledge that was not confirmed for a long time fades.
 */

/** Number of most recent answers that count. */
export const MASTERY_WINDOW = 8;
/** Weight ratio between an answer and the next newer one (0..1; lower = recency matters more). */
export const MASTERY_RECENCY_FACTOR = 0.7;
/** After this many days without a correct answer the score is halved. */
export const MASTERY_HALF_LIFE_DAYS = 30;
/** Below this score a card is "schwach". */
export const MASTERY_WEAK_BELOW = 0.4;
/** Above this score a card is "sicher" (0.4–0.75 inclusive: "im Aufbau"). */
export const MASTERY_SOLID_ABOVE = 0.75;

export const MASTERY_LEVELS = ['new', 'weak', 'building', 'solid'] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

/** What mastery needs from an answer. */
export interface MasteryAnswer {
  verdict: 'correct' | 'incorrect';
  /** ISO timestamp. */
  answeredAt: string;
}

export interface Mastery {
  /** 0..1 (0 for cards without answers). */
  score: number;
  level: MasteryLevel;
  answerCount: number;
  /** ISO timestamp of the last answer. */
  lastAnsweredAt?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Level of a score; cards without answers are always "new". */
export function masteryLevel(score: number, answerCount: number): MasteryLevel {
  if (answerCount === 0) return 'new';
  if (score < MASTERY_WEAK_BELOW) return 'weak';
  if (score > MASTERY_SOLID_ABOVE) return 'solid';
  return 'building';
}

/** Recency-weighted share of correct answers (answers oldest first), without time decay. */
export function weightedCorrectShare(answers: readonly MasteryAnswer[]): number {
  const recent = answers.slice(-MASTERY_WINDOW);
  let weight = 1;
  let total = 0;
  let correct = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    total += weight;
    if (recent[i]?.verdict === 'correct') correct += weight;
    weight *= MASTERY_RECENCY_FACTOR;
  }
  return total === 0 ? 0 : correct / total;
}

/** Decay factor 0..1 for the time since the last correct answer (1 for "just now" or future). */
export function decayFactor(lastCorrectAt: string, now: number): number {
  const time = Date.parse(lastCorrectAt);
  if (Number.isNaN(time)) return 1;
  const days = Math.max(0, now - time) / DAY_MS;
  return 0.5 ** (days / MASTERY_HALF_LIFE_DAYS);
}

/**
 * Mastery of one card from its answers (chronological, oldest first).
 * `now` is epoch ms (injected for tests).
 */
export function computeMastery(
  answers: readonly MasteryAnswer[],
  now: number = Date.now(),
): Mastery {
  const answerCount = answers.length;
  if (answerCount === 0) return { score: 0, level: 'new', answerCount: 0 };
  let lastCorrectAt: string | undefined;
  for (let i = answerCount - 1; i >= 0; i -= 1) {
    const answer = answers[i];
    if (answer?.verdict === 'correct') {
      lastCorrectAt = answer.answeredAt;
      break;
    }
  }
  const share = weightedCorrectShare(answers);
  const score = lastCorrectAt === undefined ? 0 : share * decayFactor(lastCorrectAt, now);
  return {
    score,
    level: masteryLevel(score, answerCount),
    answerCount,
    lastAnsweredAt: answers[answerCount - 1]?.answeredAt,
  };
}

export type MasteryCounts = Record<MasteryLevel, number>;

export function emptyMasteryCounts(): MasteryCounts {
  return { new: 0, weak: 0, building: 0, solid: 0 };
}

/** Number of cards per level. */
export function countLevels(masteries: Iterable<Pick<Mastery, 'level'>>): MasteryCounts {
  const counts = emptyMasteryCounts();
  for (const { level } of masteries) counts[level] += 1;
  return counts;
}

/**
 * Hardest cards: lowest score among cards with at least `minAnswers` answers that are not
 * solid yet. Ties: more answers first (proven difficult), then older last answer.
 */
export function hardestCards<T extends { mastery: Mastery }>(
  items: readonly T[],
  limit: number,
  minAnswers = 2,
): T[] {
  return items
    .filter((item) => item.mastery.answerCount >= minAnswers && item.mastery.level !== 'solid')
    .sort(
      (a, b) =>
        a.mastery.score - b.mastery.score ||
        b.mastery.answerCount - a.mastery.answerCount ||
        (a.mastery.lastAnsweredAt ?? '').localeCompare(b.mastery.lastAnsweredAt ?? ''),
    )
    .slice(0, limit);
}
