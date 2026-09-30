import { db } from '../db';
import type { GraphPosition } from '../types';

/** Skeleton; filled in step 13/14 (brain visualization). */
export const graphPositionsRepo = {
  async list(): Promise<GraphPosition[]> {
    return db.graphPositions.toArray();
  },
};
