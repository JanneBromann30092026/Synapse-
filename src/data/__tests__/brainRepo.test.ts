import { beforeEach, describe, expect, it } from 'vitest';
import { HASH_EMBEDDING_MODEL } from '@/core/brain/hashEmbedding';
import { brainRepo, cardsRepo, projectsRepo } from '../repositories';
import { db } from '../db';
import { resetDb } from './testDb';

beforeEach(resetDb);

const MODEL = 'test-model';
const OPTIONS = { topK: 5, threshold: 0.5 };

async function seed() {
  const a = await projectsRepo.create({ name: 'A' });
  const b = await projectsRepo.create({ name: 'B' });
  const hidden = await projectsRepo.create({ name: 'Hidden', includeInBrain: false });
  const [a1, a2] = await cardsRepo.bulkCreate(a.id, [
    { front: 'Hund', back: 'dog' },
    { front: 'Katze', back: 'cat', notes: 'Tier' },
  ]);
  // bulkCreate spaces createdAt by 1 ms from "now"; wait so the next batch sorts after it.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const [b1] = await cardsRepo.bulkCreate(b.id, [{ front: 'Cashflow', back: 'Zufluss' }]);
  await cardsRepo.bulkCreate(hidden.id, [{ front: 'Geheim', back: 'secret' }]);
  return { a, b, hidden, a1: a1!, a2: a2!, b1: b1! };
}

const vector = (...values: number[]) => new Float32Array(values);

describe('brainRepo', () => {
  it('lists pending cards of brain projects only, with text and hash', async () => {
    await seed();
    const pending = await brainRepo.listPending(MODEL);
    expect(pending.map((p) => p.text)).toEqual([
      'Hund — dog',
      'Katze — cat (Tier)',
      'Cashflow — Zufluss',
    ]);
    expect(pending[0]?.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await brainRepo.getEmbeddingStatus(MODEL, OPTIONS)).toEqual({
      total: 3,
      current: 0,
      pending: 3,
      linksOutdated: false,
    });
  });

  it('treats embeddings of another model or old text as stale', async () => {
    const { a1, a2 } = await seed();
    const [p1, p2] = await brainRepo.listPending(MODEL);
    await brainRepo.saveEmbeddings(MODEL, [{ ...p1!, vector: vector(1, 0) }]);
    await brainRepo.saveEmbeddings('other', [{ ...p2!, vector: vector(0, 1) }]);
    let status = await brainRepo.getEmbeddingStatus(MODEL, OPTIONS);
    expect(status).toMatchObject({ current: 1, pending: 2, linksOutdated: true });

    await cardsRepo.update(a1.id, { back: 'Hund (Tier)' });
    status = await brainRepo.getEmbeddingStatus(MODEL, OPTIONS);
    expect(status.current).toBe(0);
    expect((await brainRepo.listPending(MODEL)).map((p) => p.cardId)).toContain(a2.id);
  });

  it('skips embeddings of cards deleted meanwhile', async () => {
    const { a1 } = await seed();
    const [p1] = await brainRepo.listPending(MODEL);
    await cardsRepo.delete(a1.id);
    expect(await brainRepo.saveEmbeddings(MODEL, [{ ...p1!, vector: vector(1, 0) }])).toBe(0);
  });

  it('returns current embeddings as one sorted matrix', async () => {
    await seed();
    const pending = await brainRepo.listPending(MODEL);
    await brainRepo.saveEmbeddings(
      MODEL,
      pending.map((p, i) => ({ ...p, vector: vector(i, i + 1) })),
    );
    const all = await brainRepo.getAllEmbeddings(MODEL);
    expect(all.dim).toBe(2);
    expect(all.ids).toEqual([...all.ids].sort());
    expect(all.matrix).toHaveLength(6);
    expect(all.createdAt).toHaveLength(3);
  });

  it('replaces semantic links and keeps manual links', async () => {
    const { a1, a2, b1 } = await seed();
    const now = new Date().toISOString();
    await db.cardLinks.add({
      id: 'manual',
      sourceCardId: a1.id,
      targetCardId: b1.id,
      kind: 'manual',
      weight: 1,
      createdAt: now,
    });
    const state = { computedAt: now, model: MODEL, topK: 5, threshold: 0.5, cardIds: [] };
    await brainRepo.replaceSemanticLinks(
      [{ sourceId: a2.id, targetId: a1.id, weight: 0.8 }],
      state,
    );
    await brainRepo.replaceSemanticLinks(
      [{ sourceId: a1.id, targetId: b1.id, weight: 0.7 }],
      state,
    );

    const links = await db.cardLinks.toArray();
    expect(links.filter((l) => l.kind === 'manual')).toHaveLength(1);
    const semantic = await brainRepo.getSemanticLinks();
    expect(semantic).toHaveLength(1);
    expect(semantic[0]!.sourceId < semantic[0]!.targetId).toBe(true);
    expect(await brainRepo.getLinkState()).toEqual(state);
  });

  it('builds graph data with hubs, mastery and derived crossProject', async () => {
    const { a, b, a1, a2, b1 } = await seed();
    const now = new Date().toISOString();
    await brainRepo.replaceSemanticLinks(
      [
        { sourceId: a1.id, targetId: a2.id, weight: 0.9 },
        { sourceId: a1.id, targetId: b1.id, weight: 0.6 },
      ],
      { computedAt: now, model: MODEL, topK: 5, threshold: 0.5, cardIds: [] },
    );
    const graph = await brainRepo.getGraphData();
    expect(graph.projects.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(graph.cards).toHaveLength(3);
    expect(graph.cards[0]?.mastery.level).toBe('new');
    expect(graph.edges.map((e) => e.crossProject).sort()).toEqual([false, true]);
    expect(await brainRepo.linkSummary()).toEqual({ links: 2, crossProject: 1 });

    const top = await brainRepo.topCrossProjectLinks();
    expect(top).toHaveLength(1);
    expect(top[0]?.source.project.id).not.toBe(top[0]?.target.project.id);

    // Archived projects leave the brain.
    await projectsRepo.update(b.id, { archived: true });
    expect((await brainRepo.getGraphData()).edges).toHaveLength(1);
  });

  it('cascade removes embeddings and links of deleted cards', async () => {
    const { a1, a2 } = await seed();
    const p1 = (await brainRepo.listPending(HASH_EMBEDDING_MODEL)).find((p) => p.cardId === a1.id);
    await brainRepo.saveEmbeddings(HASH_EMBEDDING_MODEL, [{ ...p1!, vector: vector(1, 0) }]);
    await brainRepo.replaceSemanticLinks([{ sourceId: a1.id, targetId: a2.id, weight: 0.9 }], {
      computedAt: '',
      model: MODEL,
      topK: 5,
      threshold: 0.5,
      cardIds: [],
    });
    await cardsRepo.delete(a1.id);
    expect(await db.cardEmbeddings.count()).toBe(0);
    expect(await db.cardLinks.count()).toBe(0);
  });
});
