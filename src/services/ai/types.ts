import type { GradingStrictness, Verdict } from '@/data/types';

export interface GradeRequest {
  /** The side of the card that was asked (question, term, vocabulary). */
  prompt: string;
  /** The expected answer; several accepted answers are separated by semicolons. */
  expected: string;
  notes?: string;
  userAnswer: string;
  strictness: GradingStrictness;
  /** e.g. "Japanisch → Deutsch" or "de" – helps with vocabulary cards. */
  languageHint?: string;
}

export interface GradeResult {
  verdict: Verdict;
  /** 0..1 */
  confidence: number;
  /** One short German sentence (about 140 characters at most). */
  feedback: string;
  model: string;
}

export interface ConnectionTestResult {
  model: string;
  /** Human-readable model name, e.g. "Claude Haiku 4.5". */
  displayName: string;
}

export interface ExplainConnectionRequest {
  a: { front: string; back: string };
  b: { front: string; back: string };
}

export interface ExplainConnectionResult {
  explanation: string;
  model: string;
}

export interface AiCallOptions {
  /** Cancels the request (e.g. when the user leaves the study session). */
  signal?: AbortSignal;
}

/** Exchangeable AI backend. UI code never talks to an SDK directly, only through this. */
export interface AiProvider {
  readonly id: string;
  readonly model: string;
  gradeAnswer(input: GradeRequest, options?: AiCallOptions): Promise<GradeResult>;
  /** Cheap check that key, network and model work (no tokens are generated). */
  testConnection(options?: AiCallOptions): Promise<ConnectionTestResult>;
  /** Explains in at most two German sentences why two brain cards are linked. */
  explainConnection(
    input: ExplainConnectionRequest,
    options?: AiCallOptions,
  ): Promise<ExplainConnectionResult>;
}

export const AI_ERROR_CODES = [
  'NO_API_KEY',
  'DISABLED',
  'OFFLINE',
  'NETWORK',
  'TIMEOUT',
  'ABORTED',
  'RATE_LIMIT',
  'AUTH',
  'MODEL_NOT_FOUND',
  'INVALID_RESPONSE',
  'API_ERROR',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Error with a stable code; the UI maps codes to German messages. Never contains the key. */
export class AiError extends Error {
  override readonly name = 'AiError';

  constructor(
    readonly code: AiErrorCode,
    message: string = code,
    readonly status?: number,
  ) {
    super(message);
  }
}
