import { db } from '../db';
import type { GraphPosition } from '../types';
import { nowIso } from '../util';

export interface NodePosition {
  nodeId: string;
  x: number;
  y: number;
}

/** Layout of the brain graph: one position per card or project hub. */
export const graphPositionsRepo = {
  async list(): Promise<GraphPosition[]> {
    return db.graphPositions.toArray();
  },

  /** Stores the positions (e.g. after the layout settled); non-finite values are skipped. */
  async saveMany(positions: readonly NodePosition[]): Promise<void> {
    const updatedAt = nowIso();
    await db.graphPositions.bulkPut(
      positions
        .filter((position) => Number.isFinite(position.x) && Number.isFinite(position.y))
        .map((position) => ({ ...position, updatedAt })),
    );
  },

  /** Forgets the layout ("Neu anordnen"). */
  async clear(): Promise<void> {
    await db.graphPositions.clear();
  },
};
