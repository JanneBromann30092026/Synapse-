import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  answersRepo,
  backupRepo,
  cardsRepo,
  projectsRepo,
  scheduleRepo,
  sessionsRepo,
} from '../repositories';
import type { Answer, Card, Project, StudySession } from '../types';
import { resetDb } from './testDb';

const DAY = 24 * 60 * 60 * 1000;
let project: Project;
let cards: Card[];
let session: StudySession;

beforeEach(async () => {
  await resetDb();
  project = await projectsRepo.create({ name: 'Japanisch' });
  cards = await cardsRepo.bulkCreate(project.id, [
    { front: 'Hund', back: 'inu' },
    { front: 'Katze', back: 'neko' },
    { front: 'Vogel', back: 'tori' },
  ]);
  session = await sessionsRepo.create({
    projectId: project.id,
    roundNumber: 1,
    mode: 'due',
    direction: 'front_to_back',
    gradingMode: 'self',
    totalCards: 3,
  });
});

const answer = (cardId: string, verdict: 'correct' | 'incorrect') =>
  answersRepo.create({
    sessionId: session.id,
    cardId,
    directionUsed: 'front_to_back',
    userInput: '',
    verdict,
    method: 'self',
  });

describe('scheduleRepo', () => {
  it('schedules a card with every answer and keeps unanswered cards new', async () => {
    const [hund, katze, vogel] = cards as [Card, Card, Card];
    await answer(hund.id, 'correct');
    await answer(katze.id, 'incorrect');

    const now = Date.now();
    const today = await scheduleRepo.projectDue(project.id, 20, now + 60_000);
    expect(today.due).toEqual([]);
    expect(today.fresh).toEqual([vogel.id]);
    expect(today.roundCardIds).toEqual([vogel.id]);

    // Tomorrow: the wrong card is due, the right one only after a few days.
    const tomorrow = await scheduleRepo.projectDue(project.id, 20, now + 1.5 * DAY);
    expect(tomorrow.due).toEqual([katze.id]);
    expect(tomorrow.roundCardIds).toEqual([katze.id, vogel.id]);
    const later = await scheduleRepo.projectDue(project.id, 0, now + 10 * DAY);
    expect(later.due).toEqual([katze.id, hund.id]);
    expect(later.roundCardIds).toEqual([katze.id, hund.id]);

    const counts = await scheduleRepo.countsByProject(now + 1.5 * DAY);
    expect(counts.get(project.id)).toEqual({ due: 1, fresh: 1 });
  });

  it('an override reschedules the card', async () => {
    const [hund] = cards as [Card];
    const logged = await answer(hund.id, 'correct');
    const before = await db.cardSchedules.get(hund.id);
    await answersRepo.overrideVerdict(logged.id, 'incorrect');
    const after = await db.cardSchedules.get(hund.id);
    expect(Date.parse(after?.due ?? '')).toBeLessThan(Date.parse(before?.due ?? ''));
    expect(Date.parse(after?.due ?? '') - Date.parse(after?.lastReviewedAt ?? '')).toBe(DAY);
  });

  it('imported history and restored backups rebuild the schedules', async () => {
    const [hund, katze] = cards as [Card, Card];
    const old = new Date(Date.now() - 30 * DAY).toISOString();
    const past: StudySession = { ...session, id: crypto.randomUUID(), startedAt: old };
    const answers: Answer[] = [hund, katze].map((card) => ({
      id: crypto.randomUUID(),
      sessionId: past.id,
      cardId: card.id,
      directionUsed: 'front_to_back',
      userInput: '',
      verdict: 'correct',
      method: 'self',
      answeredAt: old,
    }));
    await sessionsRepo.importHistory([past], answers);
    const due = await scheduleRepo.projectDue(project.id, 0);
    expect(due.due.sort()).toEqual([hund.id, katze.id].sort());

    const backup = await backupRepo.collectBackup();
    expect(JSON.stringify(backup)).not.toContain('stability');
    await db.cardSchedules.clear();
    await backupRepo.restore(backup);
    expect((await scheduleRepo.projectDue(project.id, 0)).due.sort()).toEqual(
      [hund.id, katze.id].sort(),
    );
  });

  it('deleting a card removes its schedule', async () => {
    const [hund] = cards as [Card];
    await answer(hund.id, 'correct');
    await cardsRepo.delete(hund.id);
    expect(await db.cardSchedules.count()).toBe(0);
  });
});
