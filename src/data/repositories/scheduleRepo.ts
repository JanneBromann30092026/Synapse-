import { Dexie } from 'dexie';
import { dueCutoff, planDueRound, type DueRound } from '@/core/scheduling/fsrs';
import { db } from '../db';
import type { DueCounts } from '../types';

/** Spaced repetition: which cards are due (schedules are kept in sync by the answer writes). */
export const scheduleRepo = {
  /**
   * Due, new and later cards of a project. `cutoff` = start of the next local day
   * (see dueCutoff); `newLimit` = new cards per "Fällige Karten" round.
   */
  async projectDue(
    projectId: string,
    newLimit: number,
    cutoff = dueCutoff(Date.now()),
  ): Promise<DueRound> {
    return db.transaction('r', [db.cards, db.cardSchedules], async () => {
      const cardIds = await db.cards
        .where('[projectId+createdAt]')
        .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
        .primaryKeys();
      const schedules = await db.cardSchedules.bulkGet(cardIds);
      const dueAt = new Map<string, number>();
      for (const schedule of schedules) {
        if (schedule) dueAt.set(schedule.cardId, Date.parse(schedule.due));
      }
      return planDueRound({ cardIds, dueAt, cutoff, newLimit });
    });
  },

  /** Due and never answered cards per project id (reads only index keys). */
  async countsByProject(cutoff = dueCutoff(Date.now())): Promise<Map<string, DueCounts>> {
    return db.transaction('r', [db.cards, db.cardSchedules], async () => {
      const [projectIds, cardIds, scheduled, due] = await Promise.all([
        db.cards.orderBy('projectId').keys() as Promise<string[]>,
        db.cards.orderBy('projectId').primaryKeys() as Promise<string[]>,
        db.cardSchedules.toCollection().primaryKeys(),
        db.cardSchedules.where('due').below(new Date(cutoff).toISOString()).primaryKeys(),
      ]);
      const scheduledIds = new Set(scheduled);
      const dueIds = new Set(due);
      const counts = new Map<string, DueCounts>();
      cardIds.forEach((cardId, index) => {
        const projectId = projectIds[index];
        if (projectId === undefined) return;
        let entry = counts.get(projectId);
        if (!entry) {
          entry = { due: 0, fresh: 0 };
          counts.set(projectId, entry);
        }
        if (dueIds.has(cardId)) entry.due += 1;
        else if (!scheduledIds.has(cardId)) entry.fresh += 1;
      });
      return counts;
    });
  },
};
