import { z } from 'zod';
import { create } from 'zustand';
import { settingsRepo } from '@/data/repositories';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Mirror of theme/motion preferences for the synchronous boot in main.tsx (before IndexedDB is open). */
export const BOOT_PREFS_KEY = 'synapse.bootPrefs';

const schemas = {
  theme: z.enum(THEME_PREFERENCES),
  reduceMotion: z.boolean(),
  devMode: z.boolean(),
  sidebarCollapsed: z.boolean(),
};

export type SettingsValues = { [K in keyof typeof schemas]: z.output<(typeof schemas)[K]> };

const DEFAULTS: SettingsValues = {
  theme: 'system',
  reduceMotion: false,
  devMode: false,
  sidebarCollapsed: false,
};

export const bootPrefsSchema = z.object({
  theme: schemas.theme.catch('system'),
  reduceMotion: schemas.reduceMotion.catch(false),
});
export type BootPrefs = z.output<typeof bootPrefsSchema>;

function writeBootPrefs(values: BootPrefs): void {
  try {
    localStorage.setItem(BOOT_PREFS_KEY, JSON.stringify(values));
  } catch {
    // Private mode or storage disabled: the app still works, only the boot may flash.
  }
}

export function readBootPrefs(): BootPrefs {
  try {
    const raw = localStorage.getItem(BOOT_PREFS_KEY);
    return bootPrefsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return { theme: 'system', reduceMotion: false };
  }
}

interface SettingsState extends SettingsValues {
  loaded: boolean;
  load: () => Promise<void>;
  set: <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => Promise<void>;
}

async function loadSetting<K extends keyof SettingsValues>(key: K): Promise<SettingsValues[K]> {
  const schema = schemas[key] as unknown as z.ZodType<SettingsValues[K]>;
  return settingsRepo.get(key, DEFAULTS[key], schema);
}

/**
 * App-wide UI settings, loaded from the settings table at startup and persisted on change.
 * Theme and reduced motion are additionally mirrored to localStorage for a flash-free boot.
 */
export const useSettings = create<SettingsState>((setState, getState) => ({
  ...DEFAULTS,
  ...readBootPrefs(),
  loaded: false,
  load: async () => {
    const [theme, reduceMotion, devMode, sidebarCollapsed] = await Promise.all([
      loadSetting('theme'),
      loadSetting('reduceMotion'),
      loadSetting('devMode'),
      loadSetting('sidebarCollapsed'),
    ]);
    setState({ theme, reduceMotion, devMode, sidebarCollapsed, loaded: true });
    writeBootPrefs({ theme, reduceMotion });
  },
  set: async (key, value) => {
    setState({ [key]: value } as Pick<SettingsValues, typeof key>);
    const { theme, reduceMotion } = getState();
    writeBootPrefs({ theme, reduceMotion });
    await settingsRepo.set(key, value);
  },
}));
