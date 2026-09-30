import { Dexie } from 'dexie';
import { db } from '../db';
import { RecordNotFoundError, parseOrThrow } from '../errors';
import { answerCreateSchema, type AnswerCreateInput } from '../schemas';
import type { Answer, Verdict } from '../types';
import { compact, newId, nowIso } from '../util';

export const answersRepo = {
  /** Logs an answer permanently. Session and card must exist. */
  async create(input: AnswerCreateInput): Promise<Answer> {
    const data = parseOrThrow(answerCreateSchema, input);
    return db.transaction('rw', [db.answers, db.studySessions, db.cards], async () => {
      const [session, card] = await Promise.all([
        db.studySessions.get(data.sessionId),
        db.cards.get(data.cardId),
      ]);
      if (!session) throw new RecordNotFoundError('studySession', data.sessionId);
      if (!card) throw new RecordNotFoundError('card', data.cardId);
      const answer: Answer = compact({ id: newId(), ...data, answeredAt: nowIso() });
      await db.answers.add(answer);
      return answer;
    });
  },

  async get(id: string): Promise<Answer | undefined> {
    return db.answers.get(id);
  },

  /**
   * The user corrected the verdict: method becomes 'override', confidence 1. The AI feedback
   * no longer fits and is removed.
   */
  async overrideVerdict(id: string, verdict: Verdict): Promise<Answer> {
    return db.transaction('rw', db.answers, async () => {
      const existing = await db.answers.get(id);
      if (!existing) throw new RecordNotFoundError('answer', id);
      const answer: Answer = { ...existing, verdict, method: 'override', confidence: 1 };
      delete answer.feedback;
      await db.answers.put(answer);
      return answer;
    });
  },

  /** All answers to a card, oldest first. */
  async listByCard(cardId: string): Promise<Answer[]> {
    return db.answers
      .where('[cardId+answeredAt]')
      .between([cardId, Dexie.minKey], [cardId, Dexie.maxKey])
      .toArray();
  },

  /** All answers of a session in answer order. */
  async listBySession(sessionId: string): Promise<Answer[]> {
    return db.answers
      .where('[sessionId+answeredAt]')
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .toArray();
  },
};
