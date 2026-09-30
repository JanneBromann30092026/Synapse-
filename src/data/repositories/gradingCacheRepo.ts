import { db, type GradingCacheKey } from '../db';
import { parseOrThrow } from '../errors';
import { gradingCacheEntrySchema, type GradingCacheEntryInput } from '../schemas';
import type { CardDirection, GradingCacheEntry, Verdict } from '../types';
import { compact, nowIso } from '../util';

/**
 * Cached AI verdicts per [card, direction, hash of the normalized answer, strictness].
 * Entries of a card are deleted when its front or back changes (cardsRepo.update).
 */
export const gradingCacheRepo = {
  async get(key: GradingCacheKey): Promise<GradingCacheEntry | undefined> {
    return db.gradingCache.get(key);
  },

  async put(input: GradingCacheEntryInput): Promise<GradingCacheEntry> {
    const entry: GradingCacheEntry = compact({
      ...parseOrThrow(gradingCacheEntrySchema, input),
      createdAt: nowIso(),
    });
    await db.gradingCache.put(entry);
    return entry;
  },

  /**
   * Replaces the verdict of every cached entry for this answer (all strictness levels) after
   * the user overrode it. The AI feedback no longer fits and is dropped. Returns the count.
   */
  async overrideVerdict(
    cardId: string,
    direction: CardDirection,
    inputHash: string,
    verdict: Verdict,
  ): Promise<number> {
    return db.transaction('rw', db.gradingCache, async () => {
      const entries = await db.gradingCache
        .where('cardId')
        .equals(cardId)
        .filter((entry) => entry.direction === direction && entry.inputHash === inputHash)
        .toArray();
      await db.gradingCache.bulkPut(
        entries.map((existing) => {
          const entry: GradingCacheEntry = {
            ...existing,
            verdict,
            confidence: 1,
            method: 'override',
          };
          delete entry.feedback;
          return entry;
        }),
      );
      return entries.length;
    });
  },
};
