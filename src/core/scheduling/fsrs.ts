/**
 * Spaced repetition with FSRS-5 (Free Spaced Repetition Scheduler, default parameters).
 *
 * Why FSRS instead of SM-2: it models memory per card (stability = days until recall drops to
 * 90 %, difficulty 1..10) and needs fewer reviews for the same retention. It also copes with
 * reviews at any time (early, late, several per day), which happens here all the time because
 * every round – not only "Fällige Karten" – is logged.
 *
 * Synapse only knows right / wrong, so a correct answer counts as "Good" (3) and a wrong one as
 * "Again" (1). The schedule of a card is a pure function of its answer history (replay), so
 * overrides, imports and restores only need a recomputation.
 */

/** FSRS-5 default weights (w0..w18). */
export const FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

/** Target probability of recall when a card becomes due. */
export const DESIRED_RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 36500;

const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type Rating = (typeof RATINGS)[keyof typeof RATINGS];

export interface MemoryState {
  /** Days until the probability of recall drops to 90 %. */
  stability: number;
  /** 1 (easy) .. 10 (hard). */
  difficulty: number;
  reps: number;
  /** Wrong answers after the first one. */
  lapses: number;
  /** Epoch ms of the last answer. */
  lastReviewedAt: number;
  /** Epoch ms when the card should be asked again. */
  dueAt: number;
}

export interface ReviewInput {
  verdict: 'correct' | 'incorrect';
  /** ISO timestamp. */
  answeredAt: string;
}

function clampDifficulty(value: number): number {
  return Math.min(10, Math.max(1, value));
}

function w_(index: number): number {
  return FSRS_WEIGHTS[index] ?? 0;
}

/** Probability of recall after `elapsedDays` with `stability`. */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * Math.max(0, elapsedDays)) / stability) ** DECAY;
}

/** Interval in whole days (1..MAX_INTERVAL_DAYS) for the desired retention. */
export function nextIntervalDays(stability: number, retention = DESIRED_RETENTION): number {
  const days = (stability / FACTOR) * (retention ** (1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
}

function initialStability(rating: Rating): number {
  return Math.max(0.1, w_(rating - 1));
}

function initialDifficulty(rating: Rating): number {
  return w_(4) - Math.exp(w_(5) * (rating - 1)) + 1;
}

function nextDifficulty(difficulty: number, rating: Rating): number {
  const delta = -w_(6) * (rating - 3);
  const damped = difficulty + (delta * (10 - difficulty)) / 9;
  // Mean reversion towards the initial difficulty of "Easy".
  return clampDifficulty(w_(7) * initialDifficulty(4) + (1 - w_(7)) * damped);
}

function recallStability(s: number, d: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? w_(15) : 1;
  const easyBonus = rating === 4 ? w_(16) : 1;
  return (
    s *
    (Math.exp(w_(8)) *
      (11 - d) *
      s ** -w_(9) *
      (Math.exp(w_(10) * (1 - r)) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
}

function forgetStability(s: number, d: number, r: number): number {
  const next = w_(11) * d ** -w_(12) * ((s + 1) ** w_(13) - 1) * Math.exp(w_(14) * (1 - r));
  return Math.min(next, s / Math.exp(w_(17) * w_(18)));
}

function shortTermStability(s: number, rating: Rating): number {
  return s * Math.exp(w_(17) * (rating - 3 + w_(18)));
}

/**
 * Due time after an answer. A wrong answer always comes back the next day (like a relearning
 * step), whatever the remaining stability says; a correct one after the FSRS interval.
 */
function withDue(
  state: Omit<MemoryState, 'dueAt'>,
  rating: Rating,
  retention: number,
): MemoryState {
  const days = rating === RATINGS.again ? 1 : nextIntervalDays(state.stability, retention);
  return { ...state, dueAt: state.lastReviewedAt + days * DAY_MS };
}

/** Applies one answer (`at` epoch ms) to the state of a card (null = never answered). */
export function review(
  state: MemoryState | null,
  rating: Rating,
  at: number,
  retention = DESIRED_RETENTION,
): MemoryState {
  if (!state) {
    return withDue(
      {
        stability: initialStability(rating),
        difficulty: clampDifficulty(initialDifficulty(rating)),
        reps: 1,
        lapses: 0,
        lastReviewedAt: at,
      },
      rating,
      retention,
    );
  }
  const elapsedDays = Math.max(0, at - state.lastReviewedAt) / DAY_MS;
  let stability: number;
  if (elapsedDays < 1) {
    // Same day (e.g. "Falsche wiederholen"): short-term effect only.
    stability = shortTermStability(state.stability, rating);
  } else {
    const r = forgettingCurve(elapsedDays, state.stability);
    stability =
      rating === 1
        ? forgetStability(state.stability, state.difficulty, r)
        : recallStability(state.stability, state.difficulty, r, rating);
  }
  return withDue(
    {
      stability: Math.max(0.1, stability),
      difficulty: nextDifficulty(state.difficulty, rating),
      reps: state.reps + 1,
      lapses: state.lapses + (rating === 1 ? 1 : 0),
      lastReviewedAt: Math.max(at, state.lastReviewedAt),
    },
    rating,
    retention,
  );
}

export function ratingOf(verdict: ReviewInput['verdict']): Rating {
  return verdict === 'correct' ? RATINGS.good : RATINGS.again;
}

/** Schedule of a card from its answers (any order); null for cards without (valid) answers. */
export function replay(
  answers: readonly ReviewInput[],
  retention = DESIRED_RETENTION,
): MemoryState | null {
  const timed = answers
    .map((answer) => ({ verdict: answer.verdict, at: Date.parse(answer.answeredAt) }))
    .filter((answer) => !Number.isNaN(answer.at))
    .sort((a, b) => a.at - b.at);
  let state: MemoryState | null = null;
  for (const answer of timed) state = review(state, ratingOf(answer.verdict), answer.at, retention);
  return state;
}

/** Probability (0..1) that the card is still remembered at `now`. */
export function retrievability(
  state: Pick<MemoryState, 'stability' | 'lastReviewedAt'>,
  now: number,
) {
  return forgettingCurve((now - state.lastReviewedAt) / DAY_MS, state.stability);
}

/**
 * Cards are due for the whole calendar day: everything due before the start of the next local
 * day counts (a card due tonight can be learned in the morning).
 */
export function dueCutoff(now: number): number {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export interface DueRoundInput {
  /** Card ids of the project in creation order (new cards are introduced oldest first). */
  cardIds: readonly string[];
  /** Due time (epoch ms) per answered card. */
  dueAt: ReadonlyMap<string, number>;
  cutoff: number;
  /** Maximum number of never answered cards in one round. */
  newLimit: number;
}

export interface DueRound {
  /** Due cards, most overdue first. */
  due: string[];
  /** All never answered cards (creation order). */
  fresh: string[];
  /** Cards of a "Fällige Karten" round: all due cards plus up to newLimit new ones. */
  roundCardIds: string[];
  /** Earliest due time of the cards that are not due yet. */
  nextDueAt: number | null;
}

/** Splits the cards of a project into due, new and later cards. */
export function planDueRound({ cardIds, dueAt, cutoff, newLimit }: DueRoundInput): DueRound {
  const due: { id: string; at: number }[] = [];
  const fresh: string[] = [];
  let nextDueAt: number | null = null;
  for (const id of cardIds) {
    const at = dueAt.get(id);
    if (at === undefined) fresh.push(id);
    else if (at < cutoff) due.push({ id, at });
    else if (nextDueAt === null || at < nextDueAt) nextDueAt = at;
  }
  due.sort((a, b) => a.at - b.at);
  const dueIds = due.map((item) => item.id);
  return {
    due: dueIds,
    fresh,
    roundCardIds: [...dueIds, ...fresh.slice(0, Math.max(0, newLimit))],
    nextDueAt,
  };
}
