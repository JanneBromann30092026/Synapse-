/** AI configuration shared by settings and providers (no SDK import – keeps the SDK out of the main chunk). */

export const AI_PROVIDERS = ['anthropic', 'off'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

/** Default grading model (fast and inexpensive); configurable in the settings. */
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

/** Model IDs: lower-case letters, digits, dots, dashes (e.g. claude-haiku-4-5-20251001). */
export const AI_MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{2,99}$/;

/** Anthropic API keys start with this prefix. */
export const API_KEY_PREFIX = 'sk-ant-';

export const AI_TIMEOUT_MS = 15_000;
