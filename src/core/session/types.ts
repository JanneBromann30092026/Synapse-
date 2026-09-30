import type {
  AnswerMethod,
  CardDirection,
  GradingMode,
  GradingStrictness,
  StudyDirection,
  StudyMode,
  Verdict,
} from '@/data/types';

/**
 * setup → presenting → evaluating → revealed → transitioning → presenting … → roundComplete.
 * evaluating may branch to selfAssessing (no automatic verdict) or error (retry / self assess);
 * every active phase can go to aborted.
 */
export const SESSION_PHASES = [
  'setup',
  'presenting',
  'evaluating',
  'selfAssessing',
  'error',
  'revealed',
  'transitioning',
  'roundComplete',
  'aborted',
] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

/** Snapshot of a card for the round (edits during the round do not change the question). */
export interface SessionCard {
  id: string;
  projectId: string;
  front: string;
  back: string;
}

/** A card of the queue with the direction it is asked in (drawn per card for 'mixed'). */
export interface QueueItem {
  cardId: string;
  direction: CardDirection;
}

export interface RoundOptions {
  /** A project id or CROSS_PROJECT_ID. */
  projectId: string;
  mode: StudyMode;
  direction: StudyDirection;
  gradingMode: GradingMode;
  strictness: GradingStrictness;
}

/** Why the user decides the verdict themselves. */
export const SELF_ASSESSMENT_REASONS = [
  'mode_self',
  'ai_off',
  'no_key',
  'offline',
  'ai_error',
  'evaluation_error',
] as const;
export type SelfAssessmentReason = (typeof SELF_ASSESSMENT_REASONS)[number];

/** What the grading service found (mirrors GradingOutcome without timing details). */
export type EvaluationResult =
  | {
      verdict: Verdict;
      method: Exclude<AnswerMethod, 'self'>;
      confidence?: number;
      feedback?: string;
      cached?: boolean;
    }
  | {
      verdict: 'needs_self_assessment';
      reason: Exclude<SelfAssessmentReason, 'mode_self' | 'evaluation_error'>;
      errorCode?: string;
    };

/** Result of the current (last answered) card. */
export interface LastResult {
  cardId: string;
  direction: CardDirection;
  userInput: string;
  verdict: Verdict;
  method: AnswerMethod;
  confidence?: number;
  feedback?: string;
  cached?: boolean;
  responseTimeMs: number;
  /** The verdict before a correction by the user (OVERRIDE). */
  originalVerdict: Verdict;
}

export interface Piles {
  correct: string[];
  incorrect: string[];
}

export interface SessionState extends RoundOptions {
  phase: SessionPhase;
  /** studySession row of this round; null while not persisted (storage failure). */
  sessionId: string | null;
  roundNumber: number;
  cards: Record<string, SessionCard>;
  /** Shuffled cards of this round. */
  queue: QueueItem[];
  currentIndex: number;
  userInput: string;
  /** Epoch ms when the current card was shown; the response time runs until SUBMIT. */
  presentedAt: number | null;
  /** Response time of the submitted answer (ms). */
  responseTimeMs: number | null;
  /** Id of the running evaluation; results with another id are late and ignored. */
  evaluationId: number;
  selfAssessmentReason: SelfAssessmentReason | null;
  errorMessage: string | null;
  lastResult: LastResult | null;
  piles: Piles;
  /** Logged answer per card id (set once the answer is stored). */
  answerIds: Record<string, string>;
  /** ISO timestamp of the round start. */
  startedAt: string | null;
}

export interface StartRoundAction {
  type: 'START_ROUND';
  sessionId: string | null;
  options: RoundOptions;
  roundNumber: number;
  cards: SessionCard[];
  /** Already shuffled (see createRound / buildNextRound). */
  queue: QueueItem[];
  /** Epoch ms. */
  at: number;
  startedAt: string;
}

export type SessionAction =
  | StartRoundAction
  | { type: 'INPUT_CHANGED'; value: string }
  | { type: 'SUBMIT'; at: number }
  | { type: 'EVALUATION_SUCCEEDED'; requestId: number; result: EvaluationResult }
  | { type: 'EVALUATION_FAILED'; requestId: number; message: string }
  | { type: 'RETRY_EVALUATION' }
  | { type: 'SELF_ASSESS'; verdict: Verdict }
  | { type: 'OVERRIDE'; verdict: Verdict }
  | { type: 'NEXT'; at: number }
  | { type: 'ABORT' }
  | { type: 'ANSWER_SAVED'; sessionId: string; cardId: string; answerId: string };

export interface RoundStats {
  totalInRound: number;
  answered: number;
  correct: number;
  incorrect: number;
  remaining: number;
  /** 0–100, rounded; 0 for an empty round. */
  correctPercentage: number;
  /** 0–1 */
  progress: number;
}
