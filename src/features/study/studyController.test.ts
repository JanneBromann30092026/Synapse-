import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom, type RoundOptions, type SessionCard } from '@/core/session';
import { resetDb } from '@/data/__tests__/testDb';
import { answersRepo, cardsRepo, projectsRepo, sessionsRepo } from '@/data/repositories';
import { createGradingService, type GradingOutcome } from '@/services/grading';
import { createStudyController, studyStorageKey, type StudyDeps } from './studyController';

let cards: SessionCard[];
let options: RoundOptions;

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

/** Local grading only (AI off) – no API calls in tests. */
const localGrading = createGradingService({
  loadSettings: () =>
    Promise.resolve({
      aiProvider: 'off',
      aiModel: 'claude-haiku-4-5-20251001',
      typoTolerance: 0.85,
    }),
});

function setup(overrides: Partial<StudyDeps> = {}) {
  const storage = new MemoryStorage();
  const reportError = vi.fn();
  let clock = 10_000;
  const deps: Partial<StudyDeps> = {
    grading: localGrading,
    storage,
    random: seededRandom(1),
    now: () => (clock += 250),
    reportError,
    ...overrides,
  };
  const controller = createStudyController(options.projectId, deps);
  return { controller, storage, reportError, deps };
}

/** Lets pending promises (grading, IndexedDB writes) settle. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function expectedAnswer(controller: ReturnType<typeof setup>['controller']) {
  const state = controller.getState();
  const item = state.queue[state.currentIndex]!;
  const card = state.cards[item.cardId]!;
  return item.direction === 'front_to_back' ? card.back : card.front;
}

async function answer(controller: ReturnType<typeof setup>['controller'], right: boolean) {
  controller.setInput(right ? expectedAnswer(controller) : 'keine Ahnung');
  controller.submit();
  await settle();
  expect(controller.getState().phase).toBe('revealed');
  controller.next();
  controller.next();
}

beforeEach(async () => {
  await resetDb();
  const project = await projectsRepo.create({ name: 'Japanisch' });
  const created = await cardsRepo.bulkCreate(project.id, [
    { front: '家', back: 'Haus' },
    { front: '水', back: 'Wasser' },
    { front: '犬', back: 'Hund' },
  ]);
  cards = created.map(({ id, projectId, front, back }) => ({ id, projectId, front, back }));
  options = {
    projectId: project.id,
    mode: 'all',
    direction: 'front_to_back',
    gradingMode: 'ai',
    strictness: 'meaning',
  };
});

describe('study controller', () => {
  it('logs a whole round and closes the session with its counts', async () => {
    const { controller, storage, reportError } = setup();
    await controller.start(cards, options);
    const sessionId = controller.getState().sessionId!;
    expect(await sessionsRepo.get(sessionId)).toMatchObject({ totalCards: 3, roundNumber: 1 });

    await answer(controller, true);
    await answer(controller, false);
    await answer(controller, true);
    await settle();

    const state = controller.getState();
    expect(state.phase).toBe('roundComplete');
    const answers = await answersRepo.listBySession(sessionId);
    expect(answers.map((a) => a.verdict).sort()).toEqual(['correct', 'correct', 'incorrect']);
    expect(answers.every((a) => a.method === 'exact' && a.responseTimeMs === 250)).toBe(true);
    expect(Object.keys(state.answerIds)).toHaveLength(3);
    expect(await sessionsRepo.get(sessionId)).toMatchObject({
      correctCount: 2,
      incorrectCount: 1,
      aborted: false,
      finishedAt: expect.any(String) as string,
    });
    expect(reportError).not.toHaveBeenCalled();
    // The finished round stays in sessionStorage until reset.
    expect(storage.items.has(studyStorageKey(options.projectId))).toBe(true);
    controller.reset();
    expect(controller.getState().phase).toBe('setup');
    expect(storage.items.size).toBe(0);
  });

  it('starts follow-up rounds as new sessions and ignores empty piles', async () => {
    const { controller } = setup();
    await controller.start(cards, options);
    for (const right of [true, true, false]) await answer(controller, right);
    await settle();
    const first = controller.getState().sessionId;

    await controller.startNextRound('wrong');
    const state = controller.getState();
    expect(state.roundNumber).toBe(2);
    expect(state.queue).toHaveLength(1);
    expect(state.sessionId).not.toBe(first);
    expect(await sessionsRepo.get(state.sessionId!)).toMatchObject({
      mode: 'wrong',
      roundNumber: 2,
      totalCards: 1,
    });
    await answer(controller, true);
    await settle();
    await controller.startNextRound('wrong');
    expect(controller.getState().phase).toBe('roundComplete');
  });

  it('applies an override to the stored answer, also while it is still being saved', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { controller } = setup({
      answers: {
        create: async (input) => {
          await gate;
          return answersRepo.create(input);
        },
      },
    });
    await controller.start(cards, options);
    controller.setInput('Wohnung');
    controller.submit();
    await settle();
    // AI is off: the user decides.
    expect(controller.getState()).toMatchObject({
      phase: 'selfAssessing',
      selfAssessmentReason: 'ai_off',
    });
    controller.selfAssess('incorrect');
    controller.override('correct');
    release();
    await settle();
    const state = controller.getState();
    const cardId = state.lastResult!.cardId;
    const stored = await answersRepo.get(state.answerIds[cardId]!);
    expect(stored).toMatchObject({ verdict: 'correct', method: 'override', confidence: 1 });
    expect(state.piles.correct).toEqual([cardId]);
  });

  it('uses self assessment without grading in mode self', async () => {
    const gradeAnswer = vi.fn();
    const { controller } = setup({
      grading: { gradeAnswer, overrideVerdict: localGrading.overrideVerdict },
    });
    await controller.start(cards, { ...options, gradingMode: 'self' });
    controller.submit();
    expect(controller.getState().phase).toBe('selfAssessing');
    controller.selfAssess('correct');
    await settle();
    expect(gradeAnswer).not.toHaveBeenCalled();
    const [stored] = await answersRepo.listBySession(controller.getState().sessionId!);
    expect(stored).toMatchObject({ method: 'self', verdict: 'correct', userInput: '' });
  });

  it('goes to error on a failing evaluation and retries', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gradeAnswer = vi
      .fn<() => Promise<GradingOutcome>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        verdict: 'correct',
        method: 'exact',
        confidence: 1,
        cached: false,
        durationMs: 1,
      });
    const { controller } = setup({
      grading: { gradeAnswer, overrideVerdict: localGrading.overrideVerdict },
    });
    await controller.start(cards, options);
    controller.submit();
    await settle();
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      errorMessage: 'Bewertung fehlgeschlagen.',
    });
    controller.retry();
    await settle();
    expect(controller.getState().phase).toBe('revealed');
    expect(gradeAnswer).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('ignores late results and cancels the evaluation on abort', async () => {
    let signal: AbortSignal | undefined;
    let resolve: (outcome: GradingOutcome) => void = () => undefined;
    const gradeAnswer = vi.fn(
      (input: { signal?: AbortSignal }) =>
        new Promise<GradingOutcome>((r) => {
          signal = input.signal;
          resolve = r;
        }),
    );
    const { controller } = setup({
      grading: { gradeAnswer, overrideVerdict: localGrading.overrideVerdict },
    });
    await controller.start(cards, options);
    controller.submit();
    controller.abort();
    expect(signal?.aborted).toBe(true);
    resolve({ verdict: 'correct', method: 'exact', confidence: 1, cached: false, durationMs: 1 });
    await settle();
    const state = controller.getState();
    expect(state.phase).toBe('aborted');
    expect(state.piles.correct).toHaveLength(0);
    expect(await sessionsRepo.get(state.sessionId!)).toMatchObject({
      aborted: true,
      correctCount: 0,
      incorrectCount: 0,
    });
  });

  it('keeps the round running when storing fails', async () => {
    const failing = new Error('QuotaExceededError');
    const { controller, reportError } = setup({
      sessions: {
        create: () => Promise.reject(failing),
        finish: (id, result) => sessionsRepo.finish(id, result),
        abort: (id, result) => sessionsRepo.abort(id, result),
      },
    });
    await controller.start(cards, options);
    expect(controller.getState()).toMatchObject({ phase: 'presenting', sessionId: null });
    await answer(controller, true);
    await settle();
    expect(reportError).toHaveBeenCalledWith(failing);
    expect(controller.getState().piles.correct).toHaveLength(1);

    const second = setup({
      answers: { create: () => Promise.reject(failing) },
    });
    await second.controller.start(cards, options);
    await answer(second.controller, true);
    await settle();
    expect(second.reportError).toHaveBeenCalledWith(failing);
    expect(second.controller.getState().currentIndex).toBe(1);
  });

  it('restores a running round after a reload and finishes the pending evaluation', async () => {
    const first = setup();
    await first.controller.start(cards, { ...options, direction: 'mixed' });
    await answer(first.controller, false);
    first.controller.setInput(expectedAnswer(first.controller));
    // Reload while the answer is being evaluated.
    first.controller.submit();
    const snapshot = first.storage.items.get(studyStorageKey(options.projectId));
    expect(snapshot).toBeDefined();

    const storage = new MemoryStorage();
    storage.setItem(studyStorageKey(options.projectId), snapshot!);
    const restored = createStudyController(options.projectId, {
      ...first.deps,
      storage,
    });
    expect(restored.getState()).toMatchObject({
      phase: 'evaluating',
      currentIndex: 1,
      direction: 'mixed',
    });
    expect(restored.getState().queue).toEqual(first.controller.getState().queue);
    restored.resume();
    restored.resume();
    await settle();
    expect(restored.getState().phase).toBe('revealed');
    expect(restored.getState().piles).toMatchObject({ correct: [expect.any(String) as string] });
  });

  it('saves typing with a delay and on flush', async () => {
    const { controller, storage } = setup();
    await controller.start(cards, options);
    // Only timers are faked: fake-indexeddb needs the real ones, and is done by now.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      controller.setInput('Ha');
      const key = studyStorageKey(options.projectId);
      expect(storage.getItem(key)).not.toContain('"userInput":"Ha"');
      controller.flush();
      expect(storage.getItem(key)).toContain('"userInput":"Ha"');
      controller.setInput('Hau');
      vi.advanceTimersByTime(500);
      expect(storage.getItem(key)).toContain('"userInput":"Hau"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a second round while one is running', async () => {
    const { controller } = setup();
    await Promise.all([controller.start(cards, options), controller.start(cards, options)]);
    const sessionId = controller.getState().sessionId;
    await controller.start(cards, options);
    expect(controller.getState().sessionId).toBe(sessionId);
    expect(await sessionsRepo.getLatestByProject(options.projectId)).toMatchObject({
      id: sessionId,
    });
  });
});
