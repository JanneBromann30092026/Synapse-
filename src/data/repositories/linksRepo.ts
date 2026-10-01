import { embeddingText } from '@/core/brain/text';
import { sha256Hex } from '@/core/hash';
import { db } from '../db';
import { RecordNotFoundError, ValidationError } from '../errors';
import type { Card, CardLink, LinkExplanation } from '../types';
import { newId, nowIso } from '../util';

/** Links are undirected; they are always stored with sourceCardId < targetCardId. */
export function normalizeLinkPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Hash of both card texts (pair order independent), invalidates cached explanations. */
export function explanationTextHash(a: Card, b: Card): string {
  const [first, second] = a.id < b.id ? [a, b] : [b, a];
  return sha256Hex(`${embeddingText(first)}\n${embeddingText(second)}`);
}

export const linksRepo = {
  async listByCard(cardId: string): Promise<CardLink[]> {
    const [outgoing, incoming] = await Promise.all([
      db.cardLinks.where('sourceCardId').equals(cardId).toArray(),
      db.cardLinks.where('targetCardId').equals(cardId).toArray(),
    ]);
    return [...outgoing, ...incoming];
  },

  /** Adds a manual link between two cards (idempotent: an existing one is returned). */
  async addManual(cardA: string, cardB: string): Promise<CardLink> {
    if (cardA === cardB) throw new ValidationError('targetCardId', 'invalid');
    const [sourceCardId, targetCardId] = normalizeLinkPair(cardA, cardB);
    return db.transaction('rw', [db.cards, db.cardLinks], async () => {
      const cards = await db.cards.bulkGet([sourceCardId, targetCardId]);
      if (cards.some((card) => card === undefined)) {
        throw new RecordNotFoundError('card', cards[0] ? targetCardId : sourceCardId);
      }
      const existing = await db.cardLinks
        .where('[sourceCardId+targetCardId+kind]')
        .equals([sourceCardId, targetCardId, 'manual'])
        .first();
      if (existing) return existing;
      const link: CardLink = {
        id: newId(),
        sourceCardId,
        targetCardId,
        kind: 'manual',
        weight: 1,
        createdAt: nowIso(),
      };
      await db.cardLinks.add(link);
      return link;
    });
  },

  /** Removes a manual link; semantic links are computed and cannot be removed here. */
  async removeManual(linkId: string): Promise<void> {
    await db.transaction('rw', db.cardLinks, async () => {
      const link = await db.cardLinks.get(linkId);
      if (!link) return;
      if (link.kind !== 'manual') throw new ValidationError('kind', 'invalid');
      await db.cardLinks.delete(linkId);
    });
  },
};

/** Cached AI explanations of brain links (valid while both card texts stay the same). */
export const linkExplanationsRepo = {
  async get(a: Card, b: Card): Promise<LinkExplanation | undefined> {
    const [sourceCardId, targetCardId] = normalizeLinkPair(a.id, b.id);
    const entry = await db.linkExplanations.get([sourceCardId, targetCardId]);
    return entry?.textHash === explanationTextHash(a, b) ? entry : undefined;
  },

  async save(a: Card, b: Card, explanation: string, model: string): Promise<LinkExplanation> {
    const [sourceCardId, targetCardId] = normalizeLinkPair(a.id, b.id);
    const entry: LinkExplanation = {
      sourceCardId,
      targetCardId,
      textHash: explanationTextHash(a, b),
      explanation,
      model,
      createdAt: nowIso(),
    };
    await db.linkExplanations.put(entry);
    return entry;
  },
};
