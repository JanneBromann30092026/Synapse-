import { beforeEach, describe, expect, it } from 'vitest';
import { logsRepo } from '../repositories';
import { resetDb } from './testDb';

describe('logsRepo', () => {
  beforeEach(resetDb);

  it('adds entries and lists newest first', async () => {
    await logsRepo.add({ level: 'error', source: 'window', message: 'first' });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await logsRepo.add({ level: 'warn', source: 'console', message: 'second' });
    const entries = await logsRepo.list();
    expect(entries.map((e) => e.message)).toEqual(['second', 'first']);
    expect(entries[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps only the newest entries', async () => {
    for (let i = 0; i < 7; i += 1) {
      await logsRepo.add({ level: 'error', source: 'test', message: `m${i}` }, 5);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const entries = await logsRepo.list();
    expect(entries).toHaveLength(5);
    expect(entries.at(-1)?.message).toBe('m2');
  });

  it('clears the log', async () => {
    await logsRepo.add({ level: 'info', source: 'test', message: 'x' });
    await logsRepo.clear();
    expect(await logsRepo.count()).toBe(0);
  });
});
