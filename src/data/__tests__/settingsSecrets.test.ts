import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db } from '../db';
import { settingsRepo, secretsRepo } from '../repositories';
import { seedProjectWithHistory } from './fixtures';
import { resetDb } from './testDb';

beforeEach(resetDb);

describe('settingsRepo', () => {
  it('returns the fallback until a value is set', async () => {
    expect(await settingsRepo.get('theme', 'system')).toBe('system');
    await settingsRepo.set('theme', 'dark');
    expect(await settingsRepo.get('theme', 'system')).toBe('dark');
    await settingsRepo.set('typoTolerance', 0.85);
    expect(await settingsRepo.get('typoTolerance', 0)).toBe(0.85);
  });

  it('falls back when the stored value does not match the schema', async () => {
    await settingsRepo.set('theme', 42);
    const schema = z.enum(['system', 'light', 'dark']);
    expect(await settingsRepo.get('theme', 'system', schema)).toBe('system');
  });

  it('rejects empty keys', async () => {
    await expect(settingsRepo.set(' ', 1)).rejects.toMatchObject({
      field: 'value',
      code: 'required',
    });
  });
});

describe('secretsRepo', () => {
  const KEY = 'sk-ant-test-0123456789-secret';

  it('stores, reports and clears the API key', async () => {
    expect(await secretsRepo.has('anthropicApiKey')).toBe(false);
    await secretsRepo.set('anthropicApiKey', `  ${KEY}  `);
    expect(await secretsRepo.has('anthropicApiKey')).toBe(true);
    expect(await secretsRepo.getForInternalUse('anthropicApiKey')).toBe(KEY);
    await secretsRepo.clear('anthropicApiKey');
    expect(await secretsRepo.has('anthropicApiKey')).toBe(false);
    await expect(secretsRepo.set('anthropicApiKey', '  ')).rejects.toMatchObject({
      field: 'value',
    });
  });

  it('never appears in any other table', async () => {
    await seedProjectWithHistory('P');
    await settingsRepo.set('aiModel', 'claude-haiku-4-5-20251001');
    await secretsRepo.set('anthropicApiKey', KEY);

    for (const table of db.tables) {
      if (table.name === 'secrets') continue;
      const rows: unknown[] = await table.toArray();
      const serialized = JSON.stringify(rows, (_key, value: unknown) =>
        value instanceof Float32Array ? Array.from(value) : value,
      );
      expect(serialized, table.name).not.toContain(KEY);
    }
    expect(await db.secrets.count()).toBe(1);
  });
});
