import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '@/data/__tests__/testDb';
import { secretsRepo } from '@/data/repositories';
import { checkApiKey, getAiProvider, removeApiKey, saveApiKey } from './index';

beforeEach(resetDb);

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

describe('AI service', () => {
  it('validates API keys', () => {
    expect(checkApiKey('')).toBe('empty');
    expect(checkApiKey('hello')).toBe('format');
    expect(checkApiKey('sk-ant-short')).toBe('format');
    expect(checkApiKey(`  ${KEY}\n`)).toBe('ok');
  });

  it('stores only valid keys, without surrounding whitespace', async () => {
    expect(await saveApiKey('not a key')).toBe('format');
    expect(await secretsRepo.has('anthropicApiKey')).toBe(false);
    expect(await saveApiKey(` ${KEY} `)).toBe('ok');
    expect(await secretsRepo.getForInternalUse('anthropicApiKey')).toBe(KEY);
    await removeApiKey();
    expect(await secretsRepo.has('anthropicApiKey')).toBe(false);
  });

  it('refuses to build a provider when AI is off or no key is set', async () => {
    await expect(getAiProvider({ provider: 'off', model: 'x' })).rejects.toMatchObject({
      code: 'DISABLED',
    });
    await expect(
      getAiProvider({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }),
    ).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });
  });

  it('builds the Anthropic provider with the configured model', async () => {
    await saveApiKey(KEY);
    const provider = await getAiProvider({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(provider.id).toBe('anthropic');
    expect(provider.model).toBe('claude-haiku-4-5-20251001');
  });
});
