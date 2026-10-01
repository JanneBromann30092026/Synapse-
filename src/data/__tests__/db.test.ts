import { Dexie } from 'dexie';
import { describe, expect, it } from 'vitest';
import { classifyOpenError, db, DB_NAME, openDatabase, SynapseDb } from '../db';

describe('database schema', () => {
  it('opens version 5 with all tables', async () => {
    expect(await openDatabase()).toEqual({ ok: true });
    expect(db.name).toBe(DB_NAME);
    expect(db.verno).toBe(5);
    expect(db.tables.map((table) => table.name).sort()).toEqual(
      [
        'answers',
        'cardEmbeddings',
        'cardLinks',
        'cardSchedules',
        'cards',
        'gradingCache',
        'graphPositions',
        'linkExplanations',
        'logs',
        'projects',
        'secrets',
        'settings',
        'snapshots',
        'studySessions',
      ].sort(),
    );
  });

  it('defines the compound and multi-entry indexes', () => {
    const indexes = (name: string) => db.table(name).schema.indexes.map((index) => index.name);
    expect(indexes('cards')).toEqual(
      expect.arrayContaining(['projectId', 'tags', '[projectId+createdAt]']),
    );
    expect(db.table('cards').schema.idxByName['tags']?.multi).toBe(true);
    expect(indexes('answers')).toEqual(
      expect.arrayContaining(['cardId', 'sessionId', 'answeredAt', '[cardId+answeredAt]']),
    );
    expect(db.table('gradingCache').schema.primKey.name).toBe(
      '[cardId+direction+inputHash+strictness]',
    );
    expect(db.table('cardLinks').schema.idxByName['[sourceCardId+targetCardId+kind]']?.unique).toBe(
      true,
    );
    expect(db.table('cardEmbeddings').schema.primKey.name).toBe('cardId');
  });

  it('stores embeddings as Float32Array', async () => {
    await db.cardEmbeddings.put({
      cardId: 'c1',
      model: 'test',
      textHash: 'h',
      vector: new Float32Array([0.5, -1]),
      dim: 2,
      createdAt: new Date().toISOString(),
    });
    const stored = await db.cardEmbeddings.get('c1');
    expect(stored?.vector).toBeInstanceOf(Float32Array);
    expect(Array.from(stored?.vector ?? [])).toEqual([0.5, -1]);
    await db.cardEmbeddings.clear();
  });
});

describe('migrations', () => {
  it('version 5 seeds the card schedules from the existing answers', async () => {
    const name = 'synapse-migration-test';
    // The schema of version 4 as it was shipped (projects … logs, no cardSchedules).
    const v4 = new Dexie(name);
    v4.version(4).stores({
      projects: 'id, sortOrder, name, updatedAt',
      cards: 'id, projectId, *tags, createdAt, updatedAt, [projectId+createdAt]',
      studySessions: 'id, projectId, startedAt, [projectId+startedAt]',
      answers: 'id, sessionId, cardId, answeredAt, [cardId+answeredAt], [sessionId+answeredAt]',
      gradingCache: '[cardId+direction+inputHash+strictness], cardId, createdAt',
      cardEmbeddings: 'cardId, model, textHash',
      cardLinks: 'id, &[sourceCardId+targetCardId+kind], sourceCardId, targetCardId, kind',
      graphPositions: 'nodeId, updatedAt',
      settings: 'key',
      secrets: 'key',
      linkExplanations: '[sourceCardId+targetCardId], sourceCardId, targetCardId',
      snapshots: 'id, createdAt',
      logs: 'id, at',
    });
    await v4.open();
    const answer = (id: string, cardId: string, verdict: string, answeredAt: string) => ({
      id,
      sessionId: 's',
      cardId,
      directionUsed: 'front_to_back',
      userInput: '',
      verdict,
      method: 'self',
      answeredAt,
    });
    await v4
      .table('answers')
      .bulkAdd([
        answer('1', 'a', 'correct', '2026-09-01T10:00:00.000Z'),
        answer('2', 'a', 'correct', '2026-09-04T10:00:00.000Z'),
        answer('3', 'b', 'incorrect', '2026-09-01T10:00:00.000Z'),
      ]);
    v4.close();

    const migrated = new SynapseDb(name);
    await migrated.open();
    const schedules = await migrated.cardSchedules.toArray();
    expect(schedules.map((s) => s.cardId).sort()).toEqual(['a', 'b']);
    const a = schedules.find((s) => s.cardId === 'a');
    expect(a?.reps).toBe(2);
    expect(a?.lastReviewedAt).toBe('2026-09-04T10:00:00.000Z');
    expect(Date.parse(a?.due ?? '')).toBeGreaterThan(Date.parse('2026-09-10T00:00:00.000Z'));
    expect(await migrated.answers.count()).toBe(3);
    migrated.close();
    await Dexie.delete(name);
  });
});

describe('open errors', () => {
  it('opens a database with a newer on-disk version (Dexie 4 tolerates app rollbacks)', async () => {
    const newer = new Dexie('synapse-version-test');
    newer.version(6).stores({ projects: 'id' });
    await newer.open();
    newer.close();
    const older = new SynapseDb('synapse-version-test');
    expect(await openDatabase(older)).toEqual({ ok: true });
    older.close();
    await Dexie.delete('synapse-version-test');
  });

  it('classifies wrapped native errors', () => {
    const named = (name: string, inner?: Error) =>
      Object.assign(new Error('open failed'), { name, inner });
    expect(classifyOpenError(named('OpenFailedError', named('QuotaExceededError')))).toBe('quota');
    expect(classifyOpenError(named('OpenFailedError', named('InvalidStateError')))).toBe(
      'unavailable',
    );
    expect(classifyOpenError(named('MissingAPIError'))).toBe('unavailable');
    expect(classifyOpenError(named('VersionError'))).toBe('version');
    expect(classifyOpenError(new Error('boom'))).toBe('unknown');
    expect(classifyOpenError('not an error')).toBe('unknown');
  });
});
