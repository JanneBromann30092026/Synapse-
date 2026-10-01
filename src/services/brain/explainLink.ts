import { linkExplanationsRepo } from '@/data/repositories';
import type { Card } from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import { AiError, getAiProvider, type AiConfig, type AiProvider } from '@/services/ai';

export interface ExplainedLink {
  explanation: string;
  model: string;
  cached: boolean;
}

export interface LinkExplainerDeps {
  getConfig: () => AiConfig;
  createProvider: (config: AiConfig) => Promise<AiProvider>;
  isOnline: () => boolean;
  cache: Pick<typeof linkExplanationsRepo, 'get' | 'save'>;
}

/**
 * "Warum hängen die zusammen?": cached explanation of a link, otherwise one AI call whose
 * result is stored (per card pair, until one of the two cards is edited).
 */
export function createLinkExplainer(deps: LinkExplainerDeps) {
  return {
    async explain(a: Card, b: Card, signal?: AbortSignal): Promise<ExplainedLink> {
      const cached = await deps.cache.get(a, b);
      if (cached) return { explanation: cached.explanation, model: cached.model, cached: true };
      const config = deps.getConfig();
      if (config.provider === 'off') throw new AiError('DISABLED');
      if (!deps.isOnline()) throw new AiError('OFFLINE');
      const provider = await deps.createProvider(config);
      const result = await provider.explainConnection(
        { a: { front: a.front, back: a.back }, b: { front: b.front, back: b.back } },
        { signal },
      );
      await deps.cache.save(a, b, result.explanation, result.model);
      return { ...result, cached: false };
    },
  };
}

export const linkExplainer = createLinkExplainer({
  getConfig: () => {
    const { aiProvider, aiModel } = useSettings.getState();
    return { provider: aiProvider, model: aiModel };
  },
  createProvider: getAiProvider,
  isOnline: () => navigator.onLine,
  cache: linkExplanationsRepo,
});
