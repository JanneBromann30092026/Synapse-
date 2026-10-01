import { beforeEach, describe, expect, it } from 'vitest';
import { settingsRepo } from '@/data/repositories';
import { resetDb } from '@/data/__tests__/testDb';
import { useSettings } from './settingsStore';

describe('settings store', () => {
  beforeEach(resetDb);

  it('keeps a change made while the settings are still loading', async () => {
    await settingsRepo.set('devMode', false);
    await settingsRepo.set('theme', 'dark');
    useSettings.setState({ loaded: false });
    const loading = useSettings.getState().load();
    await useSettings.getState().set('devMode', true);
    await loading;
    expect(useSettings.getState().devMode).toBe(true);
    expect(useSettings.getState().theme).toBe('dark');
    expect(await settingsRepo.get('devMode', false)).toBe(true);
  });
});
