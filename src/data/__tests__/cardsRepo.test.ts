import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { RecordNotFoundError } from '../errors';
import { cardsRepo, projectsRepo } from '../repositories';
import type { Project } from '../types';
import { resetDb } from './testDb';

let project: Project;

beforeEach(async () => {
  await resetDb();
  project = await projectsRepo.create({ name: 'Japanisch' });
});

describe('cardsRepo', () => {
  it('creates, reads, updates and deletes a card', async () => {
    const card = await cardsRepo.create(project.id, {
      front: ' 犬 ',
      back: 'Hund',
      tags: ['Tiere', 'Tiere', ' N5 '],
    });
    expect(card).toMatchObject({
      projectId: project.id,
      front: '犬',
      back: 'Hund',
      tags: ['Tiere', 'N5'],
    });
    expect(await cardsRepo.get(card.id)).toEqual(card);

    const updated = await cardsRepo.update(card.id, { notes: 'inu' });
    expect(updated).toMatchObject({ front: '犬', notes: 'inu' });

    await cardsRepo.delete(card.id);
    expect(await cardsRepo.get(card.id)).toBeUndefined();
    expect(await cardsRepo.countByProject(project.id)).toBe(0);
  });

  it('requires an existing project', async () => {
    await expect(
      cardsRepo.create(crypto.randomUUID(), { front: 'a', back: 'b' }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('bulk-creates all cards or none', async () => {
    const created = await cardsRepo.bulkCreate(project.id, [
      { front: '1', back: 'eins' },
      { front: '2', back: 'zwei' },
    ]);
    expect(created).toHaveLength(2);
    expect(await cardsRepo.countByProject(project.id)).toBe(2);

    await expect(
      cardsRepo.bulkCreate(project.id, [
        { front: '3', back: 'drei' },
        { front: '4', back: '' },
      ]),
    ).rejects.toMatchObject({ name: 'ValidationError', field: 'back', code: 'required', index: 1 });
    expect(await cardsRepo.countByProject(project.id)).toBe(2);
  });

  it('searches front, back, notes and tags case-insensitively with all terms', async () => {
    await cardsRepo.bulkCreate(project.id, [
      { front: 'Hund', back: 'inu', tags: ['Tiere'] },
      { front: 'Katze', back: 'neko', notes: 'Haustier', tags: ['Tiere'] },
      { front: 'Wasser', back: 'mizu', tags: ['Natur'] },
    ]);
    const search = async (query: string) =>
      (await cardsRepo.listByProject(project.id, { search: query })).map((c) => c.front);

    expect(await search('')).toEqual(['Hund', 'Katze', 'Wasser']);
    expect(await search('NEKO')).toEqual(['Katze']);
    expect(await search('haustier')).toEqual(['Katze']);
    expect(await search('tiere')).toEqual(['Hund', 'Katze']);
    expect(await search('tiere inu')).toEqual(['Hund']);
    expect(await search('xyz')).toEqual([]);
  });

  it('lists only cards of the given project', async () => {
    const other = await projectsRepo.create({ name: 'BWL' });
    await cardsRepo.create(project.id, { front: 'a', back: 'b' });
    await cardsRepo.create(other.id, { front: 'c', back: 'd' });
    expect((await cardsRepo.listByProject(other.id)).map((c) => c.front)).toEqual(['c']);
  });

  it('moves cards to another project', async () => {
    const other = await projectsRepo.create({ name: 'BWL' });
    const [a, b] = await cardsRepo.bulkCreate(project.id, [
      { front: 'a', back: 'a' },
      { front: 'b', back: 'b' },
    ]);
    await cardsRepo.moveToProject([a!.id, b!.id], other.id);
    expect(await cardsRepo.countByProject(project.id)).toBe(0);
    expect(await cardsRepo.countByProject(other.id)).toBe(2);
    await expect(cardsRepo.moveToProject([a!.id], crypto.randomUUID())).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(
      cardsRepo.moveToProject([a!.id, crypto.randomUUID()], project.id),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    expect(await cardsRepo.countByProject(other.id)).toBe(2);
  });

  it('drops cached AI verdicts when the card text changes', async () => {
    const card = await cardsRepo.create(project.id, { front: 'a', back: 'b' });
    await db.gradingCache.put({
      cardId: card.id,
      direction: 'front_to_back',
      inputHash: 'h',
      strictness: 'exact',
      verdict: 'correct',
      model: 'm',
      createdAt: card.createdAt,
    });
    await cardsRepo.update(card.id, { tags: ['x'] });
    expect(await db.gradingCache.count()).toBe(1);
    await cardsRepo.update(card.id, { back: 'c' });
    expect(await db.gradingCache.count()).toBe(0);
  });

  it('validates card fields', async () => {
    await expect(cardsRepo.create(project.id, { front: '', back: 'b' })).rejects.toMatchObject({
      field: 'front',
      code: 'required',
    });
    await expect(
      cardsRepo.create(project.id, {
        front: 'a',
        back: 'b',
        tags: Array.from({ length: 31 }, (_, i) => `t${i}`),
      }),
    ).rejects.toMatchObject({ field: 'tags', code: 'tooLong' });
    await expect(
      cardsRepo.create(project.id, { front: 'a', back: 'b', tags: ['x'.repeat(41)] }),
    ).rejects.toMatchObject({ field: 'tags.0', code: 'tooLong' });
  });

  it('finds duplicates by normalized front side', async () => {
    const other = await projectsRepo.create({ name: 'BWL' });
    const card = await cardsRepo.create(project.id, { front: 'Das  Haus', back: 'house' });
    await cardsRepo.create(other.id, { front: 'Katze', back: 'cat' });

    expect((await cardsRepo.findDuplicate(project.id, ' das haus '))?.id).toBe(card.id);
    expect(await cardsRepo.findDuplicate(project.id, 'das haus', card.id)).toBeUndefined();
    expect(await cardsRepo.findDuplicate(project.id, 'Katze')).toBeUndefined();
    expect(await cardsRepo.findDuplicate(project.id, '   ')).toBeUndefined();
  });

  it('deletes several cards at once', async () => {
    const cards = await cardsRepo.bulkCreate(project.id, [
      { front: '1', back: '1' },
      { front: '2', back: '2' },
      { front: '3', back: '3' },
    ]);
    await cardsRepo.deleteMany([cards[0]!.id, cards[2]!.id]);
    expect((await cardsRepo.listByProject(project.id)).map((c) => c.front)).toEqual(['2']);
  });
});

describe('cardsRepo.importMany', () => {
  it('imports in order and skips duplicate front sides', async () => {
    await cardsRepo.create(project.id, { front: 'Hund', back: 'dog' });
    const result = await cardsRepo.importMany(project.id, [
      { front: 'Katze', back: 'cat' },
      { front: ' hund ', back: 'dog' },
      { front: 'Maus', back: 'mouse', tags: ['Tiere'] },
      { front: 'KATZE', back: 'cat' },
    ]);
    expect(result.created.map((c) => c.front)).toEqual(['Katze', 'Maus']);
    expect(result.skippedDuplicates).toBe(2);
    const list = await cardsRepo.listByProject(project.id);
    expect(list.map((c) => c.front)).toEqual(['Hund', 'Katze', 'Maus']);
  });
});
