import { replay } from '@/core/scheduling/fsrs';
import type { SynapseDb } from './db';
import type { Answer, CardSchedule } from './types';

/**
 * Card schedules are derived data: always a replay of the card's answers. These helpers keep the
 * cardSchedules table in sync and must run inside a read-write transaction covering
 * `answers` and `cardSchedules`.
 */

/** Above this many cards, refreshSchedules scans all answers instead of an index lookup. */
const BULK_THRESHOLD = 50;

type ScheduleAnswer = Pick<Answer, 'cardId' | 'verdict' | 'answeredAt'>;

function toSchedule(cardId: string, answers: readonly ScheduleAnswer[]): CardSchedule | null {
  const state = replay(answers);
  if (!state) return null;
  return {
    cardId,
    due: new Date(state.dueAt).toISOString(),
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    lastReviewedAt: new Date(state.lastReviewedAt).toISOString(),
  };
}

/** Schedules of all cards that appear in `answers`. */
export function computeSchedules(answers: readonly ScheduleAnswer[]): CardSchedule[] {
  const byCard = new Map<string, ScheduleAnswer[]>();
  for (const answer of answers) {
    const list = byCard.get(answer.cardId);
    if (list) list.push(answer);
    else byCard.set(answer.cardId, [answer]);
  }
  return [...byCard].flatMap(([cardId, list]) => {
    const schedule = toSchedule(cardId, list);
    return schedule ? [schedule] : [];
  });
}

/** Recomputes the schedules of some cards (after new or changed answers). */
export async function refreshSchedules(database: SynapseDb, cardIds: Iterable<string>) {
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return;
  const wanted = new Set(ids);
  // anyOf with many keys is slow; for bulk changes one scan of the table is cheaper.
  const answers =
    ids.length > BULK_THRESHOLD
      ? (await database.answers.toArray()).filter((answer) => wanted.has(answer.cardId))
      : await database.answers.where('cardId').anyOf(ids).toArray();
  const schedules = computeSchedules(answers);
  const scheduled = new Set(schedules.map((schedule) => schedule.cardId));
  await database.cardSchedules.bulkPut(schedules);
  await database.cardSchedules.bulkDelete(ids.filter((id) => !scheduled.has(id)));
}

/** Rebuilds the whole table (after a restore). */
export async function rebuildSchedules(database: SynapseDb) {
  const answers = await database.answers.toArray();
  await database.cardSchedules.clear();
  await database.cardSchedules.bulkPut(computeSchedules(answers));
}
