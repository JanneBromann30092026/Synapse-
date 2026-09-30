import { canonicalForm, localGrade } from '@/core/grading';
import { RecordNotFoundError } from '@/data/errors';
import { answersRepo, cardsRepo, gradingCacheRepo } from '@/data/repositories';
import type { Answer, AnswerMethod, CardDirection, GradingStrictness, Verdict } from '@/data/types';
import { useSettings } from '@/features/settings/settingsStore';
import {
  AiError,
  getAiProvider,
  type AiConfig,
  type AiErrorCode,
  type AiProvider,
  type AiProviderId,
} from '@/services/ai';

export interface GradeInput {
  cardId: string;
  /** The direction the card was asked in. */
  direction: CardDirection;
  userAnswer: string;
  strictness: GradingStrictness;
  signal?: AbortSignal;
}

/** A verdict was found: locally, in the cache or by the AI. */
export interface GradedOutcome {
  verdict: Verdict;
  method: Exclude<AnswerMethod, 'self'>;
  /** 0..1 */
  confidence: number;
  feedback?: string;
  /** AI model of an AI verdict. */
  model?: string;
  /** Verdict came from the grading cache (no AI call). */
  cached: boolean;
  durationMs: number;
}

export type SelfAssessmentReason = 'ai_off' | 'no_key' | 'offline' | 'ai_error';

/** No automatic verdict possible: the user decides (Richtig/Falsch). */
export interface SelfAssessmentOutcome {
  verdict: 'needs_self_assessment';
  method: 'self';
  reason: SelfAssessmentReason;
  /** Set for reason 'ai_error'. */
  errorCode?: AiErrorCode;
  confidence?: undefined;
  feedback?: undefined;
  cached: false;
  durationMs: number;
}

export type GradingOutcome = GradedOutcome | SelfAssessmentOutcome;

export interface GradingSettings {
  aiProvider: AiProviderId;
  aiModel: string;
  typoTolerance: number;
}

export interface GradingDeps {
  loadSettings: () => Promise<GradingSettings>;
  createProvider: (config: AiConfig) => Promise<AiProvider>;
  isOnline: () => boolean;
  now: () => number;
}

async function loadSettingsFromStore(): Promise<GradingSettings> {
  const state = useSettings.getState();
  if (!state.loaded) await state.load();
  const { aiProvider, aiModel, typoTolerance } = useSettings.getState();
  return { aiProvider, aiModel, typoTolerance };
}

const defaultDeps: GradingDeps = {
  loadSettings: loadSettingsFromStore,
  createProvider: getAiProvider,
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  now: () => performance.now(),
};

/** SHA-256 (hex) of the canonical answer – "Wohnhaus.", "wohnhaus" share one cache entry. */
export async function hashAnswer(userAnswer: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalForm(userAnswer));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reasonFor(code: AiErrorCode): SelfAssessmentReason {
  switch (code) {
    case 'DISABLED':
      return 'ai_off';
    case 'NO_API_KEY':
      return 'no_key';
    case 'OFFLINE':
      return 'offline';
    default:
      return 'ai_error';
  }
}

/**
 * Multi-stage grading:
 * A local rules (exact, typo, empty) → B grading cache → C AI (if enabled, key set, online)
 * → D self assessment (AI off, no key, offline or AI error).
 */
export function createGradingService(overrides: Partial<GradingDeps> = {}) {
  const deps: GradingDeps = { ...defaultDeps, ...overrides };

  async function gradeAnswer(input: GradeInput): Promise<GradingOutcome> {
    const started = deps.now();
    const elapsed = () => Math.max(0, Math.round(deps.now() - started));
    const selfAssessment = (
      reason: SelfAssessmentReason,
      errorCode?: AiErrorCode,
    ): SelfAssessmentOutcome => ({
      verdict: 'needs_self_assessment',
      method: 'self',
      reason,
      ...(errorCode && reason === 'ai_error' ? { errorCode } : {}),
      cached: false,
      durationMs: elapsed(),
    });

    const card = await cardsRepo.get(input.cardId);
    if (!card) throw new RecordNotFoundError('card', input.cardId);
    const [prompt, expected] =
      input.direction === 'front_to_back' ? [card.front, card.back] : [card.back, card.front];
    const settings = await deps.loadSettings();

    // A: local rules.
    const local = localGrade(input.userAnswer, expected, {
      typoTolerance: settings.typoTolerance,
    });
    if (local.verdict !== 'undecided') {
      return {
        verdict: local.verdict,
        method: local.method,
        confidence: local.confidence,
        cached: false,
        durationMs: elapsed(),
      };
    }

    // B: cache.
    const inputHash = await hashAnswer(input.userAnswer);
    const cached = await gradingCacheRepo.get([
      card.id,
      input.direction,
      inputHash,
      input.strictness,
    ]);
    if (cached) {
      return {
        verdict: cached.verdict,
        method: cached.method ?? 'ai',
        confidence: cached.confidence ?? 1,
        ...(cached.feedback ? { feedback: cached.feedback } : {}),
        model: cached.model,
        cached: true,
        durationMs: elapsed(),
      };
    }

    // C: AI – D: self assessment when it cannot be used.
    if (settings.aiProvider === 'off') return selfAssessment('ai_off');
    if (!deps.isOnline()) return selfAssessment('offline');
    try {
      const provider = await deps.createProvider({
        provider: settings.aiProvider,
        model: settings.aiModel,
      });
      const result = await provider.gradeAnswer(
        {
          prompt,
          expected,
          ...(card.notes ? { notes: card.notes } : {}),
          userAnswer: input.userAnswer,
          strictness: input.strictness,
        },
        input.signal ? { signal: input.signal } : undefined,
      );
      try {
        await gradingCacheRepo.put({
          cardId: card.id,
          direction: input.direction,
          inputHash,
          strictness: input.strictness,
          verdict: result.verdict,
          confidence: result.confidence,
          feedback: result.feedback,
          model: result.model,
          method: 'ai',
        });
      } catch {
        // The verdict is still valid; it is just not cached (e.g. storage full).
      }
      return {
        verdict: result.verdict,
        method: 'ai',
        confidence: result.confidence,
        feedback: result.feedback,
        model: result.model,
        cached: false,
        durationMs: elapsed(),
      };
    } catch (error: unknown) {
      if (error instanceof AiError) return selfAssessment(reasonFor(error.code), error.code);
      return selfAssessment('ai_error', 'API_ERROR');
    }
  }

  /**
   * The user corrects a verdict ("Ich lag richtig"): the logged answer gets method 'override'
   * and a cached AI verdict for the same answer is replaced, so it is not repeated.
   */
  async function overrideVerdict(input: {
    answerId: string;
    newVerdict: Verdict;
  }): Promise<Answer> {
    const answer = await answersRepo.get(input.answerId);
    if (!answer) throw new RecordNotFoundError('answer', input.answerId);
    const inputHash = await hashAnswer(answer.userInput);
    const updated = await answersRepo.overrideVerdict(answer.id, input.newVerdict);
    await gradingCacheRepo.overrideVerdict(
      answer.cardId,
      answer.directionUsed,
      inputHash,
      input.newVerdict,
    );
    return updated;
  }

  return { gradeAnswer, overrideVerdict };
}

export type GradingService = ReturnType<typeof createGradingService>;

export const gradingService = createGradingService();
