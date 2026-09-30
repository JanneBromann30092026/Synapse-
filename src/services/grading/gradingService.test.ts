import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '@/data/__tests__/testDb';
import {
  answersRepo,
  cardsRepo,
  gradingCacheRepo,
  projectsRepo,
  sessionsRepo,
} from '@/data/repositories';
import type { Card } from '@/data/types';
import {
  AiError,
  type AiCallOptions,
  type AiProvider,
  type GradeRequest,
  type GradeResult,
} from '@/services/ai';
import { createGradingService, hashAnswer, type GradingSettings } from './gradingService';

let card: Card;

const AI_ON: GradingSettings = {
  aiProvider: 'anthropic',
  aiModel: 'claude-haiku-4-5-20251001',
  typoTolerance: 0.85,
};

const aiResult: GradeResult = {
  verdict: 'correct',
  confidence: 0.9,
  feedback: 'Richtig – „Wohnhaus“ meint dasselbe.',
  model: 'claude-haiku-4-5-20251001',
};

function fakeProvider(
  grade: (request: GradeRequest, options?: AiCallOptions) => Promise<GradeResult>,
) {
  const gradeAnswer = vi.fn(grade);
  const provider: AiProvider = {
    id: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    gradeAnswer,
    testConnection: () => Promise.reject(new Error('not used')),
  };
  return { provider, gradeAnswer };
}

function service(
  options: {
    settings?: Partial<GradingSettings>;
    provider?: AiProvider;
    providerError?: AiError;
    online?: boolean;
  } = {},
) {
  const createProvider = vi.fn(() =>
    options.providerError
      ? Promise.reject(options.providerError)
      : Promise.resolve(options.provider ?? fakeProvider(() => Promise.resolve(aiResult)).provider),
  );
  const grading = createGradingService({
    loadSettings: () => Promise.resolve({ ...AI_ON, ...options.settings }),
    createProvider,
    isOnline: () => options.online ?? true,
  });
  return { grading, createProvider };
}

const input = (
  userAnswer: string,
  overrides: Partial<{
    direction: 'front_to_back' | 'back_to_front';
    strictness: 'exact' | 'meaning' | 'lenient';
  }> = {},
) => ({
  cardId: card.id,
  direction: overrides.direction ?? ('front_to_back' as const),
  userAnswer,
  strictness: overrides.strictness ?? ('meaning' as const),
});

beforeEach(async () => {
  await resetDb();
  const project = await projectsRepo.create({ name: 'Japanisch' });
  card = await cardsRepo.create(project.id, {
    front: '家',
    back: 'Haus; Heim',
    notes: 'いえ · ie',
  });
});

describe('gradingService.gradeAnswer', () => {
  it('A: decides locally without cache or AI', async () => {
    const { grading, createProvider } = service();
    await expect(grading.gradeAnswer(input('haus'))).resolves.toMatchObject({
      verdict: 'correct',
      method: 'exact',
      confidence: 1,
      cached: false,
    });
    await expect(grading.gradeAnswer(input('keine Ahnung'))).resolves.toMatchObject({
      verdict: 'incorrect',
      method: 'exact',
    });
    await expect(grading.gradeAnswer(input(''))).resolves.toMatchObject({
      verdict: 'incorrect',
      method: 'exact',
    });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('grades the other direction against the front side', async () => {
    const { grading } = service();
    await expect(
      grading.gradeAnswer(input('家', { direction: 'back_to_front' })),
    ).resolves.toMatchObject({ verdict: 'correct', method: 'exact' });
  });

  it('C: asks the AI with the card context and caches the verdict', async () => {
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    const { grading } = service({ provider });
    const outcome = await grading.gradeAnswer(input('Wohnhaus'));

    expect(outcome).toMatchObject({
      verdict: 'correct',
      method: 'ai',
      confidence: 0.9,
      feedback: aiResult.feedback,
      model: aiResult.model,
      cached: false,
    });
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    expect(gradeAnswer).toHaveBeenCalledWith(
      {
        prompt: '家',
        expected: 'Haus; Heim',
        notes: 'いえ · ie',
        userAnswer: 'Wohnhaus',
        strictness: 'meaning',
      },
      undefined,
    );
    const entry = await gradingCacheRepo.get([
      card.id,
      'front_to_back',
      await hashAnswer('Wohnhaus'),
      'meaning',
    ]);
    expect(entry).toMatchObject({ verdict: 'correct', method: 'ai', model: aiResult.model });
  });

  it('B: answers from the cache (also for a differently written answer)', async () => {
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    const { grading } = service({ provider });
    await grading.gradeAnswer(input('Wohnhaus'));
    const second = await grading.gradeAnswer(input('  wohnhaus. '));

    expect(second).toMatchObject({ verdict: 'correct', method: 'ai', cached: true });
    expect(gradeAnswer).toHaveBeenCalledTimes(1);

    // Cache hits also work while AI is off or offline.
    const offline = service({ settings: { aiProvider: 'off' }, online: false });
    await expect(offline.grading.gradeAnswer(input('Wohnhaus'))).resolves.toMatchObject({
      cached: true,
    });
  });

  it('keeps separate cache entries per strictness and direction', async () => {
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    const { grading } = service({ provider });
    await grading.gradeAnswer(input('Wohnhaus'));
    await grading.gradeAnswer(input('Wohnhaus', { strictness: 'exact' }));
    await grading.gradeAnswer(input('Gebäude', { direction: 'back_to_front' }));
    expect(gradeAnswer).toHaveBeenCalledTimes(3);
  });

  it('forgets cached verdicts when the card changes', async () => {
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    const { grading } = service({ provider });
    await grading.gradeAnswer(input('Wohnhaus'));
    await cardsRepo.update(card.id, { back: 'Haus; Heim; Zuhause' });
    await grading.gradeAnswer(input('Wohnhaus'));
    expect(gradeAnswer).toHaveBeenCalledTimes(2);
  });

  it('D: needs self assessment when AI is off, without key or offline', async () => {
    const off = service({ settings: { aiProvider: 'off' } });
    await expect(off.grading.gradeAnswer(input('Wohnhaus'))).resolves.toMatchObject({
      verdict: 'needs_self_assessment',
      method: 'self',
      reason: 'ai_off',
      cached: false,
    });
    expect(off.createProvider).not.toHaveBeenCalled();

    const offline = service({ online: false });
    await expect(offline.grading.gradeAnswer(input('Wohnhaus'))).resolves.toMatchObject({
      reason: 'offline',
    });
    expect(offline.createProvider).not.toHaveBeenCalled();

    const noKey = service({ providerError: new AiError('NO_API_KEY') });
    await expect(noKey.grading.gradeAnswer(input('Wohnhaus'))).resolves.toMatchObject({
      verdict: 'needs_self_assessment',
      reason: 'no_key',
    });
  });

  it('D: falls back to self assessment when the AI fails', async () => {
    for (const code of ['TIMEOUT', 'AUTH', 'RATE_LIMIT', 'INVALID_RESPONSE'] as const) {
      const { provider } = fakeProvider(() => Promise.reject(new AiError(code)));
      const { grading } = service({ provider });
      await expect(grading.gradeAnswer(input('Wohnhaus'))).resolves.toMatchObject({
        verdict: 'needs_self_assessment',
        reason: 'ai_error',
        errorCode: code,
      });
    }
    const { provider } = fakeProvider(() => Promise.reject(new TypeError('boom')));
    await expect(service({ provider }).grading.gradeAnswer(input('x y'))).resolves.toMatchObject({
      reason: 'ai_error',
      errorCode: 'API_ERROR',
    });
    // Nothing was cached.
    const { provider: ok, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    await service({ provider: ok }).grading.gradeAnswer(input('Wohnhaus'));
    expect(gradeAnswer).toHaveBeenCalledTimes(1);
  });

  it('passes the abort signal to the provider', async () => {
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(aiResult));
    const controller = new AbortController();
    await service({ provider }).grading.gradeAnswer({
      ...input('Wohnhaus'),
      signal: controller.signal,
    });
    expect(gradeAnswer.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it('uses the typo tolerance from the settings', async () => {
    const strict = service({ settings: { aiProvider: 'off', typoTolerance: 1 } });
    await expect(strict.grading.gradeAnswer(input('Hauss'))).resolves.toMatchObject({
      verdict: 'needs_self_assessment',
    });
    const tolerant = service({ settings: { aiProvider: 'off', typoTolerance: 0.75 } });
    await expect(tolerant.grading.gradeAnswer(input('Hauss'))).resolves.toMatchObject({
      verdict: 'correct',
      method: 'fuzzy',
    });
  });

  it('rejects unknown cards', async () => {
    await expect(
      service().grading.gradeAnswer({ ...input('x'), cardId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ name: 'RecordNotFoundError' });
  });
});

describe('gradingService.overrideVerdict', () => {
  async function logAnswer(userInput: string, verdict: 'correct' | 'incorrect') {
    const session = await sessionsRepo.create({
      projectId: card.projectId,
      roundNumber: 1,
      mode: 'all',
      direction: 'front_to_back',
      gradingMode: 'ai',
      totalCards: 1,
    });
    return answersRepo.create({
      sessionId: session.id,
      cardId: card.id,
      directionUsed: 'front_to_back',
      userInput,
      verdict,
      method: 'ai',
      confidence: 0.8,
      feedback: 'Falsch – gemeint ist ein Gebäude zum Wohnen.',
    });
  }

  it('marks the answer as override and updates the cached verdict', async () => {
    const incorrect: GradeResult = { ...aiResult, verdict: 'incorrect', feedback: 'Falsch.' };
    const { provider, gradeAnswer } = fakeProvider(() => Promise.resolve(incorrect));
    const { grading } = service({ provider });
    await grading.gradeAnswer(input('Wohnhaus'));
    await grading.gradeAnswer(input('Wohnhaus', { strictness: 'exact' }));
    const answer = await logAnswer('Wohnhaus', 'incorrect');

    const updated = await grading.overrideVerdict({ answerId: answer.id, newVerdict: 'correct' });
    expect(updated).toMatchObject({ verdict: 'correct', method: 'override', confidence: 1 });
    expect(updated.feedback).toBeUndefined();
    expect(await answersRepo.get(answer.id)).toEqual(updated);

    // Both strictness levels now return the corrected verdict – without asking the AI again.
    for (const strictness of ['meaning', 'exact'] as const) {
      await expect(grading.gradeAnswer(input('wohnhaus', { strictness }))).resolves.toMatchObject({
        verdict: 'correct',
        method: 'override',
        cached: true,
      });
    }
    expect(gradeAnswer).toHaveBeenCalledTimes(2);
  });

  it('works without a cache entry and rejects unknown answers', async () => {
    const { grading } = service();
    const answer = await logAnswer('Hütte', 'incorrect');
    await expect(
      grading.overrideVerdict({ answerId: answer.id, newVerdict: 'correct' }),
    ).resolves.toMatchObject({ method: 'override' });
    await expect(
      grading.overrideVerdict({ answerId: crypto.randomUUID(), newVerdict: 'correct' }),
    ).rejects.toMatchObject({ name: 'RecordNotFoundError' });
  });
});
