import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey, shiftDay } from '@/core/activity';
import { simulateHistory, HISTORY_DEFAULTS } from '@/features/dev/historyData';
import { cardsRepo, projectsRepo, sessionsRepo, statsRepo } from '../repositories';
import type { Answer, StudySession, Verdict } from '../types';
import { resetDb } from './testDb';

beforeEach(resetDb);

const NOW = Date.parse('2026-10-01T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function session(id: string, projectId: string, startedAt: string): StudySession {
  return {
    id,
    projectId,
    roundNumber: 1,
    mode: 'all',
    direction: 'front_to_back',
    gradingMode: 'self',
    startedAt,
    finishedAt: startedAt,
    aborted: false,
    totalCards: 1,
    correctCount: 0,
    incorrectCount: 0,
  };
}

function answer(sessionId: string, cardId: string, verdict: Verdict, at: number): Answer {
  return {
    id: crypto.randomUUID(),
    sessionId,
    cardId,
    directionUsed: 'front_to_back',
    userInput: '',
    verdict,
    method: 'self',
    answeredAt: new Date(at).toISOString(),
  };
}

async function seed() {
  const japanese = await projectsRepo.create({ name: 'Japanisch' });
  const bwl = await projectsRepo.create({ name: 'BWL' });
  const archived = await projectsRepo.create({ name: 'Alt' });
  await projectsRepo.update(archived.id, { archived: true });
  const [solid, weak, fresh] = await cardsRepo.bulkCreate(japanese.id, [
    { front: 'Hund', back: 'inu' },
    { front: 'Katze', back: 'neko' },
    { front: 'Neu', back: 'atarashii' },
  ]);
  const [building, once] = await cardsRepo.bulkCreate(bwl.id, [
    { front: 'Bilanz', back: 'x' },
    { front: 'GuV', back: 'y' },
  ]);
  const [old] = await cardsRepo.bulkCreate(archived.id, [{ front: 'Alt', back: 'z' }]);
  if (!solid || !weak || !fresh || !building || !once || !old) throw new Error('seed');
  const s = session(crypto.randomUUID(), japanese.id, new Date(NOW - DAY).toISOString());
  const at = (minutes: number) => NOW - DAY + minutes * 60_000;
  const answers = [
    answer(s.id, solid.id, 'correct', at(1)),
    answer(s.id, solid.id, 'correct', at(2)),
    answer(s.id, weak.id, 'incorrect', at(3)),
    answer(s.id, weak.id, 'incorrect', at(4)),
    answer(s.id, building.id, 'incorrect', at(5)),
    answer(s.id, building.id, 'correct', at(6)),
    answer(s.id, once.id, 'incorrect', at(7)),
    answer(s.id, old.id, 'incorrect', at(8)),
    answer(s.id, old.id, 'incorrect', at(9)),
  ];
  await sessionsRepo.importHistory([s], answers);
  return { japanese, bwl, solid, weak, fresh, building, once, old };
}

describe('statsRepo', () => {
  it('computes mastery per card of a project', async () => {
    const { japanese, solid, weak, fresh } = await seed();
    const masteries = await statsRepo.masteryByProject(japanese.id, NOW);
    expect(masteries.size).toBe(3);
    expect(masteries.get(solid.id)).toMatchObject({ level: 'solid', answerCount: 2 });
    expect(masteries.get(weak.id)).toMatchObject({ level: 'weak', score: 0 });
    expect(masteries.get(fresh.id)).toMatchObject({ level: 'new', answerCount: 0 });
  });

  it('summarizes active projects and lists the hardest cards', async () => {
    const { japanese, bwl, weak, building, once } = await seed();
    const overview = await statsRepo.overview(NOW);
    expect(overview.cardCount).toBe(5);
    expect(overview.counts).toEqual({ new: 1, weak: 2, building: 1, solid: 1 });
    expect(overview.projects.map((p) => [p.project.id, p.cardCount])).toEqual([
      [japanese.id, 3],
      [bwl.id, 2],
    ]);
    expect(overview.projects[1]?.counts).toEqual({ new: 0, weak: 1, building: 1, solid: 0 });
    // ≥ 2 answers, not solid, archived projects left out; lowest score first.
    expect(overview.hardest.map((h) => h.card.id)).toEqual([weak.id, building.id]);
    expect(overview.hardest[0]?.project.id).toBe(japanese.id);
    expect(overview.hardest.some((h) => h.card.id === once.id)).toBe(false);
  });

  it('counts activity per local day with today and the streak', async () => {
    const project = await projectsRepo.create({ name: 'P' });
    const [card] = await cardsRepo.bulkCreate(project.id, [{ front: 'a', back: 'b' }]);
    if (!card) throw new Error('seed');
    const s = session(crypto.randomUUID(), project.id, new Date(NOW).toISOString());
    const answers = [0, 0, 1, 2, 4, 200].map((days) =>
      answer(s.id, card.id, 'correct', NOW - days * DAY),
    );
    await sessionsRepo.importHistory([s], answers);
    const activity = await statsRepo.activity(NOW);
    const today = dayKey(NOW);
    expect(activity.today).toBe(today);
    expect(activity.answersToday).toBe(2);
    expect(activity.streak).toBe(3);
    expect(activity.byDay.get(shiftDay(today, -4))).toBe(1);
    // Older than the heatmap: not loaded.
    expect(activity.byDay.has(shiftDay(today, -200))).toBe(false);
  });

  it('follows a streak beyond the loaded range', async () => {
    const project = await projectsRepo.create({ name: 'P' });
    const [card] = await cardsRepo.bulkCreate(project.id, [{ front: 'a', back: 'b' }]);
    if (!card) throw new Error('seed');
    const s = session(crypto.randomUUID(), project.id, new Date(NOW).toISOString());
    const answers = Array.from({ length: 150 }, (_, days) =>
      answer(s.id, card.id, 'correct', NOW - days * DAY),
    );
    await sessionsRepo.importHistory([s], answers);
    expect((await statsRepo.activity(NOW)).streak).toBe(150);
  });

  it('rejects history whose answers have no session or card', async () => {
    const project = await projectsRepo.create({ name: 'P' });
    const s = session(crypto.randomUUID(), project.id, new Date(NOW).toISOString());
    await expect(
      sessionsRepo.importHistory([s], [answer('other', 'card', 'correct', NOW)]),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      sessionsRepo.importHistory([s], [answer(s.id, 'missing-card', 'correct', NOW)]),
    ).rejects.toMatchObject({ name: 'RecordNotFoundError' });
  });

  it('stays fast with thousands of answers', async () => {
    const projects = await Promise.all(
      ['A', 'B', 'C'].map((name) => projectsRepo.create({ name })),
    );
    const cards = (
      await Promise.all(
        projects.map((project) =>
          cardsRepo.bulkCreate(
            project.id,
            Array.from({ length: 100 }, (_, i) => ({ front: `${project.name} ${i}`, back: 'x' })),
          ),
        ),
      )
    ).flat();
    const history = simulateHistory(cards, {
      ...HISTORY_DEFAULTS,
      now: NOW,
      days: 365,
      maxCardsPerSession: 30,
    });
    expect(history.answers.length).toBeGreaterThan(3000);
    await sessionsRepo.importHistory(history.sessions, history.answers);

    const start = performance.now();
    const [overview, activity] = await Promise.all([
      statsRepo.overview(NOW),
      statsRepo.activity(NOW),
    ]);
    const elapsed = performance.now() - start;
    expect(overview.cardCount).toBe(300);
    expect(Object.values(overview.counts).reduce((a, b) => a + b, 0)).toBe(300);
    expect(overview.counts.new).toBeGreaterThan(0);
    expect(overview.counts.solid).toBeGreaterThan(0);
    expect(overview.counts.weak + overview.counts.building).toBeGreaterThan(0);
    expect(overview.hardest).toHaveLength(10);
    expect(activity.streak).toBe(9);
    // fake-indexeddb is much slower than Safari's IndexedDB; this is a generous upper bound.
    expect(elapsed).toBeLessThan(3000);
  });
});
