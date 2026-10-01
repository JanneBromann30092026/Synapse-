import { describe, expect, it, vi } from 'vitest';
import type { Card, LinkExplanation } from '@/data/types';
import { AiError, type AiProvider } from '@/services/ai/types';
import { createLinkExplainer } from './explainLink';

const card = (id: string, front: string): Card => ({
  id,
  projectId: 'p',
  front,
  back: `${front} (Rückseite)`,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function setup(options: { provider?: 'anthropic' | 'off'; online?: boolean } = {}) {
  const store = new Map<string, LinkExplanation>();
  const key = (a: Card, b: Card) => [a.id, b.id].sort().join('|');
  const explainConnection = vi.fn<AiProvider['explainConnection']>(() =>
    Promise.resolve({ explanation: 'Beide beschreiben Geldflüsse.', model: 'm' }),
  );
  const provider: AiProvider = {
    id: 'anthropic',
    model: 'm',
    gradeAnswer: () => Promise.reject(new Error('not used')),
    testConnection: () => Promise.reject(new Error('not used')),
    explainConnection,
  };
  const explainer = createLinkExplainer({
    getConfig: () => ({ provider: options.provider ?? 'anthropic', model: 'm' }),
    createProvider: () => Promise.resolve(provider),
    isOnline: () => options.online ?? true,
    cache: {
      get: (a, b) => Promise.resolve(store.get(key(a, b))),
      save: (a, b, explanation, model) => {
        const entry = {
          sourceCardId: a.id,
          targetCardId: b.id,
          textHash: 'h',
          explanation,
          model,
          createdAt: '',
        };
        store.set(key(a, b), entry);
        return Promise.resolve(entry);
      },
    },
  });
  return { explainer, explainConnection };
}

describe('link explainer', () => {
  it('calls the AI once and serves the cache afterwards', async () => {
    const { explainer, explainConnection } = setup();
    const a = card('a', 'Cashflow');
    const b = card('b', 'Liquidität');
    expect(await explainer.explain(a, b)).toEqual({
      explanation: 'Beide beschreiben Geldflüsse.',
      model: 'm',
      cached: false,
    });
    expect((await explainer.explain(b, a)).cached).toBe(true);
    expect(explainConnection).toHaveBeenCalledTimes(1);
    expect(explainConnection.mock.calls[0]?.[0]).toEqual({
      a: { front: 'Cashflow', back: 'Cashflow (Rückseite)' },
      b: { front: 'Liquidität', back: 'Liquidität (Rückseite)' },
    });
  });

  it('refuses without AI or offline, without calling the provider', async () => {
    const off = setup({ provider: 'off' });
    await expect(off.explainer.explain(card('a', 'A'), card('b', 'B'))).rejects.toMatchObject({
      code: 'DISABLED',
    });
    const offline = setup({ online: false });
    await expect(offline.explainer.explain(card('a', 'A'), card('b', 'B'))).rejects.toBeInstanceOf(
      AiError,
    );
    expect(off.explainConnection).not.toHaveBeenCalled();
    expect(offline.explainConnection).not.toHaveBeenCalled();
  });
});
