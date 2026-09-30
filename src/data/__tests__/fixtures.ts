import { db } from '../db';
import { answersRepo, cardsRepo, projectsRepo, sessionsRepo } from '../repositories';
import type { Card, Project } from '../types';

export async function seedProjectWithHistory(name: string): Promise<{
  project: Project;
  cards: Card[];
}> {
  const project = await projectsRepo.create({ name });
  const cards = await cardsRepo.bulkCreate(project.id, [
    { front: `${name} A`, back: 'a' },
    { front: `${name} B`, back: 'b' },
  ]);
  const session = await sessionsRepo.create({
    projectId: project.id,
    roundNumber: 1,
    mode: 'all',
    direction: 'front_to_back',
    gradingMode: 'self',
    totalCards: cards.length,
  });
  const now = new Date().toISOString();
  for (const card of cards) {
    await answersRepo.create({
      sessionId: session.id,
      cardId: card.id,
      directionUsed: 'front_to_back',
      userInput: 'x',
      verdict: 'correct',
      method: 'self',
    });
    await db.gradingCache.put({
      cardId: card.id,
      direction: 'front_to_back',
      inputHash: 'hash',
      strictness: 'meaning',
      verdict: 'correct',
      model: 'test',
      createdAt: now,
    });
    await db.cardEmbeddings.put({
      cardId: card.id,
      model: 'test',
      textHash: 'h',
      vector: new Float32Array([1, 0]),
      dim: 2,
      createdAt: now,
    });
    await db.graphPositions.put({ nodeId: card.id, x: 1, y: 2, updatedAt: now });
  }
  await db.graphPositions.put({ nodeId: project.id, x: 0, y: 0, updatedAt: now });
  return { project, cards };
}

export async function countAll(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    db.tables.map(async (table) => [table.name, await table.count()] as const),
  );
  return Object.fromEntries(entries);
}
