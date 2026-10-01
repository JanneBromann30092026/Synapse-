import { seededRandom, type RandomSource } from '@/core/session';
import { sessionsRepo } from '@/data/repositories';
import type { Answer, StudySession } from '@/data/types';

/**
 * Simulated study history for the developer tools (stats screenshots, performance checks):
 * sessions and answers over the last weeks with a plausible learning curve per card.
 */

export interface HistoryCard {
  id: string;
  projectId: string;
}

export interface HistoryOptions {
  /** Epoch ms of "now"; the history ends shortly before. */
  now: number;
  /** How many days back the history starts. */
  days: number;
  seed: number;
  /** Most cards per session. */
  maxCardsPerSession: number;
  /** Share of cards that are never studied (stay "neu"). */
  unstudiedShare: number;
}

export const HISTORY_DEFAULTS: Omit<HistoryOptions, 'now'> = {
  days: 16 * 7,
  seed: 11,
  maxCardsPerSession: 15,
  unstudiedShare: 0.15,
};

/** The last days are studied every day; the day before is skipped (visible streak). */
const STREAK_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CardModel {
  card: HistoryCard;
  /** 0 easy … 1 hard. */
  difficulty: number;
  knowledge: number;
  lastSeen: number | null;
}

function studyProbability(offset: number): number {
  if (offset < STREAK_DAYS) return 1;
  if (offset === STREAK_DAYS) return 0;
  if (offset < 35) return 0.6;
  return 0.3;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))] as T;
}

function sample<T>(items: readonly T[], count: number, random: RandomSource): T[] {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    result.push(...pool.splice(index, 1));
  }
  return result;
}

/** Start of a study session `offset` days ago, in the local evening (always before `now`). */
function sessionStart(now: number, offset: number, random: RandomSource): number {
  if (offset === 0) return now - (40 + random() * 60) * 60_000;
  const date = new Date(now);
  date.setDate(date.getDate() - offset);
  date.setHours(17 + Math.floor(random() * 5), Math.floor(random() * 60), 0, 0);
  return date.getTime();
}

/** Builds the sessions and answers (pure apart from the UUIDs). */
export function simulateHistory(
  cards: readonly HistoryCard[],
  options: HistoryOptions,
): { sessions: StudySession[]; answers: Answer[] } {
  const random = seededRandom(options.seed);
  const models: CardModel[] = cards
    .filter(() => random() >= options.unstudiedShare)
    .map((card) => ({ card, difficulty: random(), knowledge: 0, lastSeen: null }));
  const projectIds = [...new Set(models.map((m) => m.card.projectId))];
  // Earlier projects are studied more often.
  const weighted = projectIds.flatMap((id, index) =>
    Array.from({ length: Math.max(1, projectIds.length - index) }, () => id),
  );
  const sessions: StudySession[] = [];
  const answers: Answer[] = [];
  if (models.length === 0) return { sessions, answers };

  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    if (random() >= studyProbability(offset)) continue;
    const rounds = 1 + (random() < 0.35 ? 1 : 0);
    for (let round = 0; round < rounds; round += 1) {
      const projectId = pick(weighted, random);
      const pool = models.filter((m) => m.card.projectId === projectId);
      const chosen = sample(pool, 5 + Math.floor(random() * options.maxCardsPerSession), random);
      if (chosen.length === 0) continue;
      const sessionId = crypto.randomUUID();
      let time = sessionStart(options.now, offset, random) + round * 50 * 60_000;
      const startedAt = new Date(time).toISOString();
      let correct = 0;
      for (const model of chosen) {
        if (model.lastSeen !== null) {
          // Forgetting since the last time the card was seen.
          model.knowledge *= 0.5 ** ((time - model.lastSeen) / DAY_MS / 20);
        }
        const chance = Math.min(
          0.97,
          Math.max(0.05, model.knowledge + 0.45 - model.difficulty * 0.5),
        );
        const right = random() < chance;
        model.knowledge = Math.min(1, model.knowledge + (right ? 0.18 : 0.1));
        model.lastSeen = time;
        const responseTimeMs = 2500 + Math.floor(random() * 9000);
        time += responseTimeMs + 1500;
        if (right) correct += 1;
        answers.push({
          id: crypto.randomUUID(),
          sessionId,
          cardId: model.card.id,
          directionUsed: 'front_to_back',
          userInput: '',
          verdict: right ? 'correct' : 'incorrect',
          method: 'self',
          confidence: 1,
          responseTimeMs,
          answeredAt: new Date(time).toISOString(),
        });
      }
      sessions.push({
        id: sessionId,
        projectId,
        roundNumber: 1,
        mode: 'all',
        direction: 'front_to_back',
        gradingMode: 'self',
        startedAt,
        finishedAt: new Date(time).toISOString(),
        aborted: false,
        totalCards: chosen.length,
        correctCount: correct,
        incorrectCount: chosen.length - correct,
      });
    }
  }
  return { sessions, answers };
}

/** Simulates a history for the given cards and stores it. Returns the number of answers. */
export async function loadSimulatedHistory(
  cards: readonly HistoryCard[],
  options: Partial<HistoryOptions> = {},
): Promise<{ sessions: number; answers: number }> {
  const { sessions, answers } = simulateHistory(cards, {
    ...HISTORY_DEFAULTS,
    now: Date.now(),
    ...options,
  });
  await sessionsRepo.importHistory(sessions, answers);
  return { sessions: sessions.length, answers: answers.length };
}
