import type { z } from 'zod';
import { db } from '../db';
import { parseOrThrow } from '../errors';
import { settingKeySchema } from '../schemas';

export const settingsRepo = {
  /**
   * Returns the stored value or the fallback. With a schema, invalid stored values
   * (e.g. from an older app version) also fall back instead of breaking the UI.
   */
  async get<T>(key: string, fallback: T, schema?: z.ZodType<T>): Promise<T> {
    const entry = await db.settings.get(parseOrThrow(settingKeySchema, key));
    if (entry === undefined) return fallback;
    if (!schema) return entry.value as T;
    const result = schema.safeParse(entry.value);
    return result.success ? result.data : fallback;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key: parseOrThrow(settingKeySchema, key), value });
  },

  async remove(key: string): Promise<void> {
    await db.settings.delete(key);
  },
};
