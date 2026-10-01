import { LOG_LIMIT, type LogLevel } from '@/core/errorLog';
import { db } from '../db';
import type { LogEntry } from '../types';
import { newId, nowIso } from '../util';

export interface NewLogEntry {
  level: LogLevel;
  source: string;
  /** Already redacted (src/core/errorLog.ts). */
  message: string;
  detail?: string;
}

/** Local error log: keeps the newest LOG_LIMIT entries. Never contains secrets. */
export const logsRepo = {
  async add(entry: NewLogEntry, limit: number = LOG_LIMIT): Promise<void> {
    await db.transaction('rw', db.logs, async () => {
      await db.logs.add({ id: newId(), at: nowIso(), ...entry });
      const excess = (await db.logs.count()) - limit;
      if (excess > 0) {
        const oldest = await db.logs.orderBy('at').limit(excess).primaryKeys();
        await db.logs.bulkDelete(oldest);
      }
    });
  },

  /** Newest first. */
  async list(): Promise<LogEntry[]> {
    return db.logs.orderBy('at').reverse().toArray();
  },

  async count(): Promise<number> {
    return db.logs.count();
  },

  async clear(): Promise<void> {
    await db.logs.clear();
  },
};
