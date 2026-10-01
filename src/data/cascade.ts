import type { SynapseDb } from './db';

/**
 * IndexedDB has no ON DELETE CASCADE. These helpers delete dependent records and must run
 * inside a read-write transaction covering all tables returned by the matching *CascadeTables function.
 */

export function cardCascadeTables(database: SynapseDb) {
  return [
    database.cards,
    database.answers,
    database.gradingCache,
    database.cardEmbeddings,
    database.cardLinks,
    database.graphPositions,
    database.linkExplanations,
    database.cardSchedules,
  ];
}

export function projectCascadeTables(database: SynapseDb) {
  return [database.projects, database.studySessions, ...cardCascadeTables(database)];
}

export async function deleteCardsCascade(database: SynapseDb, cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  await Promise.all([
    database.answers.where('cardId').anyOf(cardIds).delete(),
    database.gradingCache.where('cardId').anyOf(cardIds).delete(),
    database.cardEmbeddings.bulkDelete(cardIds),
    database.cardLinks.where('sourceCardId').anyOf(cardIds).delete(),
    database.cardLinks.where('targetCardId').anyOf(cardIds).delete(),
    database.graphPositions.bulkDelete(cardIds),
    database.cardSchedules.bulkDelete(cardIds),
    database.linkExplanations.where('sourceCardId').anyOf(cardIds).delete(),
    database.linkExplanations.where('targetCardId').anyOf(cardIds).delete(),
  ]);
  await database.cards.bulkDelete(cardIds);
}

export async function deleteProjectCascade(database: SynapseDb, projectId: string): Promise<void> {
  const cardIds = await database.cards.where('projectId').equals(projectId).primaryKeys();
  await deleteCardsCascade(database, cardIds);

  const sessionIds = await database.studySessions
    .where('projectId')
    .equals(projectId)
    .primaryKeys();
  await database.answers.where('sessionId').anyOf(sessionIds).delete();
  await database.studySessions.bulkDelete(sessionIds);

  // Project hub node of the brain graph.
  await database.graphPositions.delete(projectId);
  await database.projects.delete(projectId);
}
