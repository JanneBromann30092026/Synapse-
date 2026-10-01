import { z } from 'zod';
import { create } from 'zustand';
import { settingsRepo } from '@/data/repositories';
import { GRADING_MODES, GRADING_STRICTNESS, STUDY_DIRECTIONS } from '@/data/types';
import { DEFAULT_BRAIN_FILTER, MIN_SIMILARITY_RANGE } from '@/core/brain/interaction';
import { DEFAULT_LINK_OPTIONS, LINK_THRESHOLD, LINK_TOP_K } from '@/core/brain/links';
import { MASTERY_LEVELS } from '@/core/mastery';
import { AI_MODEL_PATTERN, AI_PROVIDERS, DEFAULT_AI_MODEL } from '@/services/ai/config';
import { BRAIN_EMBEDDERS } from '@/services/brain/embedder';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Mirror of theme/motion preferences for the synchronous boot in main.tsx (before IndexedDB is open). */
export const BOOT_PREFS_KEY = 'synapse.bootPrefs';

export const TYPO_TOLERANCE = { min: 0.5, max: 1, step: 0.01, default: 0.85 } as const;

const schemas = {
  // Appearance
  theme: z.enum(THEME_PREFERENCES),
  reduceMotion: z.boolean(),
  sidebarCollapsed: z.boolean(),
  // AI (the API key itself lives in the secrets table, never here)
  aiProvider: z.enum(AI_PROVIDERS),
  aiModel: z.string().trim().regex(AI_MODEL_PATTERN),
  // Study defaults
  defaultStrictness: z.enum(GRADING_STRICTNESS),
  defaultDirection: z.enum(STUDY_DIRECTIONS),
  defaultGradingMode: z.enum(GRADING_MODES),
  typoTolerance: z.number().min(TYPO_TOLERANCE.min).max(TYPO_TOLERANCE.max),
  // Brain
  brainThreshold: z.number().min(LINK_THRESHOLD.min).max(LINK_THRESHOLD.max),
  brainTopK: z.number().int().min(LINK_TOP_K.min).max(LINK_TOP_K.max),
  /** 'hash' = developer stand-in without model download (only offered in developer mode). */
  brainEmbedder: z.enum(BRAIN_EMBEDDERS),
  /** Filter of the brain view (remembered between visits). */
  brainFilter: z.object({
    hiddenProjects: z.array(z.string()).max(500),
    crossOnly: z.boolean(),
    minSimilarity: z.number().min(MIN_SIMILARITY_RANGE.min).max(MIN_SIMILARITY_RANGE.max),
    levels: z.array(z.enum(MASTERY_LEVELS)),
    hideUnlearned: z.boolean(),
  }),
  /** First-start welcome finished or skipped (step 16). */
  onboardingDone: z.boolean(),
  // Developer
  devMode: z.boolean(),
};

export type SettingsValues = { [K in keyof typeof schemas]: z.output<(typeof schemas)[K]> };
export type SettingKey = keyof SettingsValues;

export const SETTINGS_DEFAULTS: SettingsValues = {
  theme: 'system',
  reduceMotion: false,
  sidebarCollapsed: false,
  // Free by default: local grading plus self assessment; the paid AI is opt-in.
  aiProvider: 'off',
  aiModel: DEFAULT_AI_MODEL,
  defaultStrictness: 'meaning',
  defaultDirection: 'front_to_back',
  defaultGradingMode: 'ai',
  typoTolerance: TYPO_TOLERANCE.default,
  brainThreshold: DEFAULT_LINK_OPTIONS.threshold,
  brainTopK: DEFAULT_LINK_OPTIONS.topK,
  brainEmbedder: 'model',
  brainFilter: DEFAULT_BRAIN_FILTER,
  onboardingDone: false,
  devMode: false,
};

const KEYS = Object.keys(schemas) as SettingKey[];

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

/** Validates a value for a setting (e.g. a typed model name). */
export function isValidSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): value is SettingsValues[K] {
  return schemas[key].safeParse(value).success;
}

interface SettingsState extends SettingsValues {
  loaded: boolean;
  /** Time of the last successful save (drives the subtle "Gespeichert" hint). */
  savedAt: number | null;
  load: () => Promise<void>;
  /** Updates the UI immediately and persists; invalid values are ignored (returns false). */
  set: <K extends SettingKey>(key: K, value: SettingsValues[K]) => Promise<boolean>;
}

async function loadSetting<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
  const schema = schemas[key] as unknown as z.ZodType<SettingsValues[K]>;
  return settingsRepo.get(key, SETTINGS_DEFAULTS[key], schema);
}

/**
 * Central settings store: loaded from the settings table at startup, every change is
 * persisted immediately. Theme and reduced motion are mirrored to localStorage for a
 * flash-free boot.
 */
export const useSettings = create<SettingsState>((setState, getState) => ({
  ...SETTINGS_DEFAULTS,
  ...readBootPrefs(),
  loaded: false,
  savedAt: null,
  load: async () => {
    const values = await Promise.all(
      KEYS.map(async (key) => [key, await loadSetting(key)] as const),
    );
    const loaded = Object.fromEntries(values) as SettingsValues;
    setState({ ...loaded, loaded: true });
    writeBootPrefs({ theme: loaded.theme, reduceMotion: loaded.reduceMotion });
  },
  set: async (key, value) => {
    if (!isValidSetting(key, value)) return false;
    setState({ [key]: value } as Pick<SettingsValues, typeof key>);
    const { theme, reduceMotion } = getState();
    writeBootPrefs({ theme, reduceMotion });
    await settingsRepo.set(key, value);
    setState({ savedAt: Date.now() });
    return true;
  },
}));
