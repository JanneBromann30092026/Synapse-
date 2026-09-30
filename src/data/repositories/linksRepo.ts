import { db } from '../db';
import type { CardLink } from '../types';

/** Semantic links are undirected; they are always stored with sourceCardId < targetCardId. */
export function normalizeLinkPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Skeleton; filled in steps 12 and 14. */
export const linksRepo = {
  async listByCard(cardId: string): Promise<CardLink[]> {
    const [outgoing, incoming] = await Promise.all([
      db.cardLinks.where('sourceCardId').equals(cardId).toArray(),
      db.cardLinks.where('targetCardId').equals(cardId).toArray(),
    ]);
    return [...outgoing, ...incoming];
  },
};
