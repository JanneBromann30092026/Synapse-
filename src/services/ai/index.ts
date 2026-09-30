import { secretsRepo } from '@/data/repositories';
import type { AiProviderId } from './config';
import { AiError, type AiCallOptions, type AiProvider, type ConnectionTestResult } from './types';

export { checkApiKey, removeApiKey, saveApiKey, type ApiKeyCheck } from './apiKey';
export { AI_PROVIDERS, DEFAULT_AI_MODEL, type AiProviderId } from './config';
export * from './types';

export interface AiConfig {
  provider: AiProviderId;
  model: string;
}

/**
 * Builds the configured provider. The SDK is loaded on demand (separate chunk), so the app
 * starts without it. Throws AiError DISABLED or NO_API_KEY when AI cannot be used.
 */
export async function getAiProvider(config: AiConfig): Promise<AiProvider> {
  if (config.provider === 'off') throw new AiError('DISABLED');
  const apiKey = await secretsRepo.getForInternalUse('anthropicApiKey');
  if (!apiKey) throw new AiError('NO_API_KEY');
  const { AnthropicProvider } = await import('./anthropicProvider');
  return new AnthropicProvider({ apiKey, model: config.model });
}

export async function testAiConnection(
  config: AiConfig,
  options?: AiCallOptions,
): Promise<ConnectionTestResult> {
  const provider = await getAiProvider(config);
  return provider.testConnection(options);
}
