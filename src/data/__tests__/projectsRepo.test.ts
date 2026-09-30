import { beforeEach, describe, expect, it } from 'vitest';
import { RecordNotFoundError, ValidationError } from '../errors';
import { projectsRepo, sessionsRepo } from '../repositories';
import { LIMITS } from '../schemas';
import { resetDb } from './testDb';
import { cardsRepo } from '../repositories';

beforeEach(resetDb);

describe('projectsRepo', () => {
  it('creates projects with defaults, UUID and ISO timestamps', async () => {
    const project = await projectsRepo.create({ name: '  Japanisch  ' });
    expect(project).toMatchObject({
      name: 'Japanisch',
      color: 'indigo',
      includeInBrain: true,
      archived: false,
      sortOrder: 0,
    });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(project.createdAt).toISOString()).toBe(project.createdAt);
    expect(project).not.toHaveProperty('description');
    expect(await projectsRepo.get(project.id)).toEqual(project);
  });

  it('appends new projects at the end and reorders them', async () => {
    const a = await projectsRepo.create({ name: 'A' });
    const b = await projectsRepo.create({ name: 'B' });
    const c = await projectsRepo.create({ name: 'C' });
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);

    await projectsRepo.reorder([c.id, a.id, b.id]);
    expect((await projectsRepo.list()).map((p) => p.name)).toEqual(['C', 'A', 'B']);

    await expect(projectsRepo.reorder([a.id, b.id])).rejects.toBeInstanceOf(ValidationError);
    await expect(projectsRepo.reorder([a.id, a.id, b.id])).rejects.toBeInstanceOf(ValidationError);
  });

  it('lists card count and last study date', async () => {
    const project = await projectsRepo.create({ name: 'BWL' });
    await cardsRepo.bulkCreate(project.id, [
      { front: '1', back: '1' },
      { front: '2', back: '2' },
    ]);
    const empty = await projectsRepo.create({ name: 'Leer' });
    const session = await sessionsRepo.create({
      projectId: project.id,
      roundNumber: 1,
      mode: 'all',
      direction: 'mixed',
      gradingMode: 'ai',
      totalCards: 2,
    });

    const list = await projectsRepo.list();
    expect(list.find((p) => p.id === project.id)).toMatchObject({
      cardCount: 2,
      lastStudiedAt: session.startedAt,
    });
    const emptySummary = list.find((p) => p.id === empty.id);
    expect(emptySummary?.cardCount).toBe(0);
    expect(emptySummary).not.toHaveProperty('lastStudiedAt');
  });

  it('updates only the given fields and removes cleared optional fields', async () => {
    const project = await projectsRepo.create({
      name: 'A',
      description: 'Text',
      icon: 'languages',
    });
    const updated = await projectsRepo.update(project.id, { description: '', archived: true });
    expect(updated).toMatchObject({ name: 'A', icon: 'languages', archived: true });
    expect(updated).not.toHaveProperty('description');
    expect(updated.id).toBe(project.id);
    expect(updated.createdAt).toBe(project.createdAt);
    expect(await projectsRepo.get(project.id)).toEqual(updated);
  });

  it('ignores fields that must not be changed by an update', async () => {
    const project = await projectsRepo.create({ name: 'A' });
    const patch = { name: 'B', id: 'other', createdAt: 'x' } as unknown as { name: string };
    const updated = await projectsRepo.update(project.id, patch);
    expect(updated).toMatchObject({ id: project.id, name: 'B', createdAt: project.createdAt });
  });

  it('validates input with field names', async () => {
    await expect(projectsRepo.create({ name: '   ' })).rejects.toMatchObject({
      name: 'ValidationError',
      field: 'name',
      code: 'required',
    });
    await expect(
      projectsRepo.create({ name: 'x'.repeat(LIMITS.projectName + 1) }),
    ).rejects.toMatchObject({ field: 'name', code: 'tooLong' });
    await expect(
      projectsRepo.create({ name: 'A', color: 'neon' as unknown as 'indigo' }),
    ).rejects.toMatchObject({ field: 'color', code: 'invalid' });
    await expect(projectsRepo.create({ name: 'A', icon: 'Not An Icon' })).rejects.toMatchObject({
      field: 'icon',
    });
    expect(await projectsRepo.count()).toBe(0);
  });

  it('throws RecordNotFoundError for unknown projects', async () => {
    await expect(projectsRepo.update(crypto.randomUUID(), { name: 'X' })).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });
});
