import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { cardsRepo, projectsRepo } from '../repositories';
import { countAll, seedProjectWithHistory } from './fixtures';
import { resetDb } from './testDb';

beforeEach(resetDb);

describe('cascading delete', () => {
  it('deleting a project removes all dependent records but leaves other projects intact', async () => {
    const doomed = await seedProjectWithHistory('Weg');
    const kept = await seedProjectWithHistory('Bleibt');
    const [doomedCard] = doomed.cards;
    const [keptCard] = kept.cards;
    // A cross-project link from the kept project into the doomed one.
    await db.cardLinks.add({
      id: crypto.randomUUID(),
      sourceCardId: keptCard!.id,
      targetCardId: doomedCard!.id,
      kind: 'semantic',
      weight: 0.9,
      createdAt: new Date().toISOString(),
    });
    const before = await countAll();

    await projectsRepo.delete(doomed.project.id);

    expect(await countAll()).toEqual({
      ...before,
      projects: 1,
      cards: 2,
      studySessions: 1,
      answers: 2,
      gradingCache: 2,
      cardEmbeddings: 2,
      cardLinks: 0,
      cardSchedules: 2,
      // 2 cards + 1 project hub of the kept project.
      graphPositions: 3,
    });
    expect(await projectsRepo.get(kept.project.id)).toBeDefined();
    expect(await cardsRepo.countByProject(kept.project.id)).toBe(2);
  });

  it('deleting a card removes its answers, cache, embedding, links and position', async () => {
    const { cards } = await seedProjectWithHistory('P');
    const [a, b] = cards;
    await db.cardLinks.add({
      id: crypto.randomUUID(),
      sourceCardId: a!.id,
      targetCardId: b!.id,
      kind: 'manual',
      weight: 1,
      createdAt: new Date().toISOString(),
    });

    await cardsRepo.delete(a!.id);

    const counts = await countAll();
    expect(counts).toMatchObject({
      cards: 1,
      answers: 1,
      gradingCache: 1,
      cardEmbeddings: 1,
      cardLinks: 0,
      cardSchedules: 1,
      graphPositions: 2,
      studySessions: 1,
    });
    expect(await db.answers.where('cardId').equals(a!.id).count()).toBe(0);
  });

  it('enforces unique links per pair and kind', async () => {
    const { cards } = await seedProjectWithHistory('P');
    const link = {
      sourceCardId: cards[0]!.id,
      targetCardId: cards[1]!.id,
      kind: 'semantic' as const,
      weight: 0.5,
      createdAt: new Date().toISOString(),
    };
    await db.cardLinks.add({ id: crypto.randomUUID(), ...link });
    await expect(db.cardLinks.add({ id: crypto.randomUUID(), ...link })).rejects.toMatchObject({
      name: 'ConstraintError',
    });
    await db.cardLinks.add({ id: crypto.randomUUID(), ...link, kind: 'manual' });
    expect(await db.cardLinks.count()).toBe(2);
  });
});
