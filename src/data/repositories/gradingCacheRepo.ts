import { db, type GradingCacheKey } from '../db';
import type { GradingCacheEntry } from '../types';

/** Skeleton; filled in step 7 (grading engine). */
export const gradingCacheRepo = {
  async get(key: GradingCacheKey): Promise<GradingCacheEntry | undefined> {
    return db.gradingCache.get(key);
  },
};
