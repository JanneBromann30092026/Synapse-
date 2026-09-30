import { secretsRepo } from '@/data/repositories';
import { API_KEY_PREFIX } from './config';

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{16,}$/;

export type ApiKeyCheck = 'ok' | 'empty' | 'format';

/** Removes whitespace that sneaks in when pasting (line breaks, spaces). */
export function normalizeApiKey(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function checkApiKey(raw: string): ApiKeyCheck {
  const key = normalizeApiKey(raw);
  if (!key) return 'empty';
  return key.startsWith(API_KEY_PREFIX) && KEY_PATTERN.test(key) ? 'ok' : 'format';
}

/**
 * Stores the key in the local secrets table. It is never logged, exported or shown again;
 * the UI can only ask whether one is set (secretsRepo.has).
 */
export async function saveApiKey(raw: string): Promise<ApiKeyCheck> {
  const check = checkApiKey(raw);
  if (check !== 'ok') return check;
  await secretsRepo.set('anthropicApiKey', normalizeApiKey(raw));
  return 'ok';
}

export async function removeApiKey(): Promise<void> {
  await secretsRepo.clear('anthropicApiKey');
}
