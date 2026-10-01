import { Dexie } from 'dexie';
import { db } from '../db';
import { RecordNotFoundError, ValidationError, parseOrThrow } from '../errors';
import {
  sessionCreateSchema,
  sessionResultSchema,
  type SessionCreateInput,
  type SessionResultInput,
} from '../schemas';
import type { Answer, StudySession } from '../types';
import { refreshSchedules } from '../scheduling';
import { newId, nowIso } from '../util';

async function close(
  id: string,
  changes: Pick<StudySession, 'aborted'> & Partial<SessionResultInput>,
): Promise<StudySession> {
  return db.transaction('rw', db.studySessions, async () => {
    const existing = await db.studySessions.get(id);
    if (!existing) throw new RecordNotFoundError('studySession', id);
    const session: StudySession = { ...existing, ...changes, finishedAt: nowIso() };
    await db.studySessions.put(session);
    return session;
  });
}

export const sessionsRepo = {
  async create(input: SessionCreateInput): Promise<StudySession> {
    const data = parseOrThrow(sessionCreateSchema, input);
    const session: StudySession = {
      id: newId(),
      ...data,
      startedAt: nowIso(),
      aborted: false,
      correctCount: 0,
      incorrectCount: 0,
    };
    await db.studySessions.add(session);
    return session;
  },

  async get(id: string): Promise<StudySession | undefined> {
    return db.studySessions.get(id);
  },

  /** Marks the round as completed with its final counts. */
  async finish(id: string, result: SessionResultInput): Promise<StudySession> {
    return close(id, { ...parseOrThrow(sessionResultSchema, result), aborted: false });
  },

  /** Marks the round as aborted; counts are optional (progress so far). */
  async abort(id: string, result?: SessionResultInput): Promise<StudySession> {
    const counts = result ? parseOrThrow(sessionResultSchema, result) : {};
    return close(id, { ...counts, aborted: true });
  },

  /** Most recently started session of a project (or of CROSS_PROJECT_ID). */
  async getLatestByProject(projectId: string): Promise<StudySession | undefined> {
    return db.studySessions
      .where('[projectId+startedAt]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .last();
  },

  /** Most recent completed (not aborted) round of a project, e.g. for "Letzte Runde: 85 %". */
  async getLastCompleted(projectId: string): Promise<StudySession | undefined> {
    return db.studySessions
      .where('[projectId+startedAt]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .reverse()
      .filter((session) => !session.aborted && session.finishedAt !== undefined)
      .first();
  },

  /**
   * Writes finished sessions with their answers as they are (timestamps included), all or
   * nothing. Used by the developer tools to simulate a study history; every answer must belong
   * to one of the sessions and to an existing card.
   */
  async importHistory(sessions: StudySession[], answers: Answer[]): Promise<void> {
    const sessionIds = new Set(sessions.map((session) => session.id));
    const index = answers.findIndex((answer) => !sessionIds.has(answer.sessionId));
    if (index !== -1) throw new ValidationError('sessionId', 'invalid', index);
    await db.transaction(
      'rw',
      [db.studySessions, db.answers, db.cards, db.cardSchedules],
      async () => {
        const cardIds = [...new Set(answers.map((answer) => answer.cardId))];
        const cards = await db.cards.bulkGet(cardIds);
        const missing = cards.findIndex((card) => card === undefined);
        if (missing !== -1) throw new RecordNotFoundError('card', cardIds[missing] ?? '');
        await db.studySessions.bulkAdd(sessions);
        await db.answers.bulkAdd(answers);
        await refreshSchedules(db, cardIds);
      },
    );
  },
};
