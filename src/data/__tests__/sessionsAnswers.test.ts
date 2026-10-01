import { beforeEach, describe, expect, it } from 'vitest';
import { RecordNotFoundError } from '../errors';
import { answersRepo, cardsRepo, projectsRepo, sessionsRepo } from '../repositories';
import { CROSS_PROJECT_ID, type Card, type Project } from '../types';
import { resetDb } from './testDb';

let project: Project;
let card: Card;

const sessionInput = (projectId: string) => ({
  projectId,
  roundNumber: 1,
  mode: 'all' as const,
  direction: 'front_to_back' as const,
  gradingMode: 'ai' as const,
  totalCards: 1,
});

beforeEach(async () => {
  await resetDb();
  project = await projectsRepo.create({ name: 'P' });
  card = await cardsRepo.create(project.id, { front: 'a', back: 'b' });
});

describe('sessionsRepo', () => {
  it('creates, finishes and aborts sessions', async () => {
    const session = await sessionsRepo.create(sessionInput(project.id));
    expect(session).toMatchObject({ aborted: false, correctCount: 0, incorrectCount: 0 });
    expect(session).not.toHaveProperty('finishedAt');

    const finished = await sessionsRepo.finish(session.id, { correctCount: 1, incorrectCount: 0 });
    expect(finished).toMatchObject({ aborted: false, correctCount: 1 });
    expect(finished.finishedAt).toBeDefined();

    const next = await sessionsRepo.create({ ...sessionInput(project.id), roundNumber: 2 });
    const aborted = await sessionsRepo.abort(next.id);
    expect(aborted).toMatchObject({ aborted: true, correctCount: 0 });
    expect(aborted.finishedAt).toBeDefined();
  });

  it('returns the latest session of a project, including cross-project sessions', async () => {
    const first = await sessionsRepo.create(sessionInput(project.id));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await sessionsRepo.create({ ...sessionInput(project.id), roundNumber: 2 });
    const cross = await sessionsRepo.create(sessionInput(CROSS_PROJECT_ID));

    expect((await sessionsRepo.getLatestByProject(project.id))?.id).toBe(second.id);
    expect((await sessionsRepo.getLatestByProject(CROSS_PROJECT_ID))?.id).toBe(cross.id);
    expect(first.id).not.toBe(second.id);
    expect(await sessionsRepo.getLatestByProject(crypto.randomUUID())).toBeUndefined();
  });

  it('returns the last completed round, skipping aborted and running ones', async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 5));
    expect(await sessionsRepo.getLastCompleted(project.id)).toBeUndefined();
    const done = await sessionsRepo.create(sessionInput(project.id));
    await sessionsRepo.finish(done.id, { correctCount: 1, incorrectCount: 0 });
    await wait();
    const aborted = await sessionsRepo.create({ ...sessionInput(project.id), roundNumber: 2 });
    await sessionsRepo.abort(aborted.id);
    await wait();
    await sessionsRepo.create({ ...sessionInput(project.id), roundNumber: 3 });
    expect(await sessionsRepo.getLastCompleted(project.id)).toMatchObject({
      id: done.id,
      correctCount: 1,
    });
  });

  it('validates enums and counts', async () => {
    await expect(
      sessionsRepo.create({ ...sessionInput(project.id), mode: 'some' as 'all' }),
    ).rejects.toMatchObject({ field: 'mode', code: 'invalid' });
    await expect(
      sessionsRepo.create({ ...sessionInput('not-a-project-id') }),
    ).rejects.toMatchObject({ field: 'projectId' });
    const session = await sessionsRepo.create(sessionInput(project.id));
    await expect(
      sessionsRepo.finish(session.id, { correctCount: -1, incorrectCount: 0 }),
    ).rejects.toMatchObject({ field: 'correctCount', code: 'tooSmall' });
  });
});

describe('answersRepo', () => {
  it('logs answers and lists them by card and session', async () => {
    const session = await sessionsRepo.create(sessionInput(project.id));
    const answer = await answersRepo.create({
      sessionId: session.id,
      cardId: card.id,
      directionUsed: 'front_to_back',
      userInput: 'b',
      verdict: 'correct',
      method: 'exact',
      confidence: 1,
      responseTimeMs: 1200,
    });
    expect(answer).not.toHaveProperty('feedback');

    expect(await answersRepo.listByCard(card.id)).toEqual([answer]);
    expect(await answersRepo.listBySession(session.id)).toEqual([answer]);
    expect(await answersRepo.listByCard(crypto.randomUUID())).toEqual([]);
  });

  it('rejects answers for unknown sessions or cards and invalid values', async () => {
    const session = await sessionsRepo.create(sessionInput(project.id));
    const base = {
      sessionId: session.id,
      cardId: card.id,
      directionUsed: 'front_to_back' as const,
      userInput: '',
      verdict: 'incorrect' as const,
      method: 'self' as const,
    };
    await expect(
      answersRepo.create({ ...base, cardId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(
      answersRepo.create({ ...base, directionUsed: 'mixed' as 'front_to_back' }),
    ).rejects.toMatchObject({ field: 'directionUsed' });
    await expect(answersRepo.create({ ...base, confidence: 2 })).rejects.toMatchObject({
      field: 'confidence',
      code: 'tooLarge',
    });
  });
});
