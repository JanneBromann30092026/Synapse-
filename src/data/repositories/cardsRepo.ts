import { Dexie } from 'dexie';
import { normalizeCardText } from '@/core/cards';
import { db } from '../db';
import { cardCascadeTables, deleteCardsCascade } from '../cascade';
import { RecordNotFoundError, parseOrThrow } from '../errors';
import {
  cardCreateSchema,
  cardUpdateSchema,
  searchQuerySchema,
  type CardCreateInput,
  type CardUpdateInput,
} from '../schemas';
import type { Card } from '../types';
import { applyPatch, compact, newId, nowIso } from '../util';

const UPDATABLE_KEYS = [
  'front',
  'back',
  'notes',
  'tags',
] as const satisfies readonly (keyof Card)[];

export interface CardListOptions {
  /** Whitespace-separated terms; a card matches when every term occurs in front, back, notes or a tag. */
  search?: string;
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('de-DE');
}

function matches(card: Card, terms: string[]): boolean {
  const haystack = normalize([card.front, card.back, card.notes ?? '', ...card.tags].join('\n'));
  return terms.every((term) => haystack.includes(term));
}

async function requireProject(projectId: string): Promise<void> {
  if ((await db.projects.get(projectId)) === undefined) {
    throw new RecordNotFoundError('project', projectId);
  }
}

function buildCard(projectId: string, input: CardCreateInput, now: string, index?: number): Card {
  const data = parseOrThrow(cardCreateSchema, input, index);
  return compact({ id: newId(), projectId, ...data, createdAt: now, updatedAt: now });
}

export const cardsRepo = {
  /** Cards of a project, oldest first, optionally filtered by a search query. */
  async listByProject(projectId: string, options: CardListOptions = {}): Promise<Card[]> {
    const cards = await db.cards
      .where('[projectId+createdAt]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .toArray();
    const query = parseOrThrow(searchQuerySchema, options.search ?? '');
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return terms.length === 0 ? cards : cards.filter((card) => matches(card, terms));
  },

  async get(id: string): Promise<Card | undefined> {
    return db.cards.get(id);
  },

  /** Existing cards among `ids`, in the given order (missing ids are skipped). */
  async getMany(ids: readonly string[]): Promise<Card[]> {
    const cards = await db.cards.bulkGet([...ids]);
    return cards.filter((card): card is Card => card !== undefined);
  },

  async countByProject(projectId: string): Promise<number> {
    return db.cards.where('projectId').equals(projectId).count();
  },

  async create(projectId: string, input: CardCreateInput): Promise<Card> {
    const card = buildCard(projectId, input, nowIso());
    return db.transaction('rw', [db.projects, db.cards], async () => {
      await requireProject(projectId);
      await db.cards.add(card);
      return card;
    });
  },

  /** Creates all cards or none (validation happens before anything is written). */
  async bulkCreate(projectId: string, inputs: CardCreateInput[]): Promise<Card[]> {
    // One millisecond apart, so cards keep the import order (lists sort by createdAt).
    const start = Date.now();
    const cards = inputs.map((input, index) =>
      buildCard(projectId, input, new Date(start + index).toISOString(), index),
    );
    return db.transaction('rw', [db.projects, db.cards], async () => {
      await requireProject(projectId);
      await db.cards.bulkAdd(cards);
      return cards;
    });
  },

  async update(id: string, input: CardUpdateInput): Promise<Card> {
    const data = parseOrThrow(cardUpdateSchema, input);
    return db.transaction('rw', [db.cards, db.gradingCache], async () => {
      const existing = await db.cards.get(id);
      if (!existing) throw new RecordNotFoundError('card', id);
      const card = { ...applyPatch(existing, input, data, UPDATABLE_KEYS), updatedAt: nowIso() };
      if (card.front !== existing.front || card.back !== existing.back) {
        // Cached AI verdicts refer to the old texts.
        await db.gradingCache.where('cardId').equals(id).delete();
      }
      await db.cards.put(card);
      return card;
    });
  },

  /**
   * Another card of the project with the same normalized front side (case, whitespace and
   * full-/half-width insensitive), or undefined.
   */
  async findDuplicate(
    projectId: string,
    front: string,
    excludeCardId?: string,
  ): Promise<Card | undefined> {
    const key = normalizeCardText(front);
    if (!key) return undefined;
    return db.cards
      .where('projectId')
      .equals(projectId)
      .filter((card) => card.id !== excludeCardId && normalizeCardText(card.front) === key)
      .first();
  },

  /** Deletes the card with its answers, grading cache, embedding, links and graph position. */
  async delete(id: string): Promise<void> {
    await db.transaction('rw', cardCascadeTables(db), () => deleteCardsCascade(db, [id]));
  },

  /** Deletes several cards (with all dependent data) in one transaction. */
  async deleteMany(ids: string[]): Promise<void> {
    await db.transaction('rw', cardCascadeTables(db), () => deleteCardsCascade(db, ids));
  },

  async moveToProject(cardIds: string[], targetProjectId: string): Promise<void> {
    await db.transaction('rw', [db.projects, db.cards], async () => {
      await requireProject(targetProjectId);
      const now = nowIso();
      const cards = await db.cards.bulkGet(cardIds);
      cards.forEach((card, index) => {
        if (!card) throw new RecordNotFoundError('card', cardIds[index] ?? '');
      });
      await db.cards
        .where('id')
        .anyOf(cardIds)
        .modify({ projectId: targetProjectId, updatedAt: now });
    });
  },
};
