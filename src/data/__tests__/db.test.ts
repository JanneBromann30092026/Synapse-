import { Dexie } from 'dexie';
import { describe, expect, it } from 'vitest';
import { classifyOpenError, db, DB_NAME, openDatabase, SynapseDb } from '../db';

describe('database schema', () => {
  it('opens version 3 with all tables', async () => {
    expect(await openDatabase()).toEqual({ ok: true });
    expect(db.name).toBe(DB_NAME);
    expect(db.verno).toBe(3);
    expect(db.tables.map((table) => table.name).sort()).toEqual(
      [
        'answers',
        'cardEmbeddings',
        'cardLinks',
        'cards',
        'gradingCache',
        'graphPositions',
        'linkExplanations',
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

describe('open errors', () => {
  it('opens a database with a newer on-disk version (Dexie 4 tolerates app rollbacks)', async () => {
    const newer = new Dexie('synapse-version-test');
    newer.version(5).stores({ projects: 'id' });
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
