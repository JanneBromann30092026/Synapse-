import { Dexie, type EntityTable, type Table } from 'dexie';
import type {
  Answer,
  Card,
  CardDirection,
  CardEmbedding,
  CardLink,
  GradingCacheEntry,
  GradingStrictness,
  GraphPosition,
  Project,
  Secret,
  Setting,
  StudySession,
} from './types';

export const DB_NAME = 'synapse';

/** Compound primary key of gradingCache: [cardId, direction, inputHash, strictness]. */
export type GradingCacheKey = [string, CardDirection, string, GradingStrictness];

export class SynapseDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  studySessions!: EntityTable<StudySession, 'id'>;
  answers!: EntityTable<Answer, 'id'>;
  gradingCache!: Table<GradingCacheEntry, GradingCacheKey>;
  cardEmbeddings!: EntityTable<CardEmbedding, 'cardId'>;
  cardLinks!: EntityTable<CardLink, 'id'>;
  graphPositions!: EntityTable<GraphPosition, 'nodeId'>;
  settings!: EntityTable<Setting, 'key'>;
  secrets!: EntityTable<Secret, 'key'>;

  constructor(name = DB_NAME) {
    super(name);

    /*
     * Migrations: never change an existing version. Every schema change is a new
     * `this.version(n + 1).stores({...changed tables only}).upgrade(tx => ...)`.
     * Only indexed fields are listed; all other fields are stored anyway.
     */
    this.version(1).stores({
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
    });
  }
}

export const db = new SynapseDb();

export type DbOpenErrorReason = 'unavailable' | 'quota' | 'version' | 'unknown';

export type DbOpenResult = { ok: true } | { ok: false; reason: DbOpenErrorReason };

function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  // Dexie wraps the native error (e.g. OpenFailedError → inner QuotaExceededError).
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    names.push(current.name);
    current = (current as Error & { inner?: unknown }).inner;
  }
  return names;
}

export function classifyOpenError(error: unknown): DbOpenErrorReason {
  const names = errorNames(error);
  if (names.includes('QuotaExceededError')) return 'quota';
  if (names.includes('VersionError')) return 'version';
  if (
    names.includes('MissingAPIError') ||
    names.includes('InvalidStateError') ||
    names.includes('SecurityError') ||
    names.includes('UnknownError')
  ) {
    // No IndexedDB (private mode, disabled storage) or the browser refused access.
    return 'unavailable';
  }
  return 'unknown';
}

/** Opens the database once at startup. Never throws; the UI shows the reason on failure. */
export async function openDatabase(database: SynapseDb = db): Promise<DbOpenResult> {
  try {
    await database.open();
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, reason: classifyOpenError(error) };
  }
}
