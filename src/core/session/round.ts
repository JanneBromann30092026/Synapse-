import type { CardDirection, StudyDirection, StudyMode } from '@/data/types';
import { shuffleAvoidingFirst, type RandomSource } from './shuffle';
import type {
  QueueItem,
  RoundOptions,
  RoundStats,
  SessionCard,
  SessionState,
  StartRoundAction,
} from './types';

export interface RoundContext {
  random: RandomSource;
  /** Epoch ms of the start. */
  at: number;
  /** ISO timestamp of the start. */
  startedAt: string;
  /** studySession row of the new round (null if it could not be stored). */
  sessionId: string | null;
}

function directionFor(direction: StudyDirection, random: RandomSource): CardDirection {
  if (direction !== 'mixed') return direction;
  return random() < 0.5 ? 'front_to_back' : 'back_to_front';
}

/**
 * Builds the START_ROUND action for any list of cards (also across projects): shuffled queue,
 * a direction per card and never `avoidFirstCardId` first (if there is more than one card).
 */
export function createRound(
  input: {
    cards: readonly SessionCard[];
    options: RoundOptions;
    roundNumber?: number;
    avoidFirstCardId?: string;
  },
  context: RoundContext,
): StartRoundAction {
  const unique = [...new Map(input.cards.map((card) => [card.id, card])).values()];
  const order = shuffleAvoidingFirst(
    unique.map((card) => card.id),
    input.avoidFirstCardId,
    context.random,
  );
  const queue: QueueItem[] = order.map((cardId) => ({
    cardId,
    direction: directionFor(input.options.direction, context.random),
  }));
  return {
    type: 'START_ROUND',
    sessionId: context.sessionId,
    options: input.options,
    roundNumber: input.roundNumber ?? 1,
    cards: unique,
    queue,
    at: context.at,
    startedAt: context.startedAt,
  };
}

/** Cards a follow-up round in `mode` would ask (the pile, or all cards of the round). */
export function cardsForNextRound(previous: SessionState, mode: StudyMode): SessionCard[] {
  const ids =
    mode === 'wrong'
      ? previous.piles.incorrect
      : mode === 'right'
        ? previous.piles.correct
        : previous.queue.map((item) => item.cardId);
  return ids.flatMap((id) => {
    const card = previous.cards[id];
    return card ? [card] : [];
  });
}

/**
 * Next round from the previous one: wrong / right pile or all cards, reshuffled, roundNumber + 1.
 * Returns null for an empty pile (or an empty previous round).
 */
export function buildNextRound(
  previous: SessionState,
  mode: StudyMode,
  context: RoundContext,
): StartRoundAction | null {
  const cards = cardsForNextRound(previous, mode);
  if (cards.length === 0) return null;
  const lastIndex = Math.min(previous.currentIndex, previous.queue.length - 1);
  const lastCardId = previous.queue[lastIndex]?.cardId;
  return createRound(
    {
      cards,
      options: {
        projectId: previous.projectId,
        mode,
        direction: previous.direction,
        gradingMode: previous.gradingMode,
        strictness: previous.strictness,
      },
      roundNumber: previous.roundNumber + 1,
      ...(lastCardId ? { avoidFirstCardId: lastCardId } : {}),
    },
    context,
  );
}

/** Round status: starts at 0 % in every round. */
export function roundStats(state: SessionState): RoundStats {
  const totalInRound = state.queue.length;
  const correct = state.piles.correct.length;
  const incorrect = state.piles.incorrect.length;
  const answered = correct + incorrect;
  return {
    totalInRound,
    answered,
    correct,
    incorrect,
    remaining: totalInRound - answered,
    correctPercentage: totalInRound === 0 ? 0 : Math.round((correct / totalInRound) * 100),
    progress: totalInRound === 0 ? 0 : answered / totalInRound,
  };
}

export interface CurrentCard {
  card: SessionCard;
  direction: CardDirection;
  /** Side shown as question. */
  prompt: string;
  /** Side the user has to type. */
  expected: string;
}

/** The card currently asked, with its direction (undefined outside a running round). */
export function currentCard(state: SessionState): CurrentCard | undefined {
  if (state.phase === 'setup' || state.phase === 'roundComplete' || state.phase === 'aborted') {
    return undefined;
  }
  const item = state.queue[state.currentIndex];
  const card = item ? state.cards[item.cardId] : undefined;
  if (!item || !card) return undefined;
  const [prompt, expected] =
    item.direction === 'front_to_back' ? [card.front, card.back] : [card.back, card.front];
  return { card, direction: item.direction, prompt, expected };
}
