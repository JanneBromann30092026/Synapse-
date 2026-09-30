import { db } from '../db';
import { ValidationError } from '../errors';

/**
 * Secrets (API key) live only in the "secrets" table: never logged, never exported,
 * never shown again in the UI. Only the AI service may read the value.
 */
export const SECRET_KEYS = ['anthropicApiKey'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

const MAX_SECRET_LENGTH = 500;

export const secretsRepo = {
  async set(key: SecretKey, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) throw new ValidationError('value', 'required');
    if (trimmed.length > MAX_SECRET_LENGTH) throw new ValidationError('value', 'tooLong');
    await db.secrets.put({ key, value: trimmed });
  },

  async has(key: SecretKey): Promise<boolean> {
    return (await db.secrets.where('key').equals(key).count()) > 0;
  },

  async clear(key: SecretKey): Promise<void> {
    await db.secrets.delete(key);
  },

  /** Only for src/services/ai/*. UI code must use has() instead. */
  async getForInternalUse(key: SecretKey): Promise<string | undefined> {
    return (await db.secrets.get(key))?.value;
  },
};
