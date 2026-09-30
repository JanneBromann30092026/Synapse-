import { z } from 'zod';
import {
  ANSWER_METHODS,
  CARD_DIRECTIONS,
  GRADING_MODES,
  GRADING_STRICTNESS,
  STUDY_DIRECTIONS,
  STUDY_MODES,
  VERDICTS,
} from '@/data/types';
import { SELF_ASSESSMENT_REASONS, SESSION_PHASES, type SessionState } from './types';

/**
 * Snapshot of a running round for sessionStorage: iOS may reload a PWA that was in the
 * background, the round continues where it was.
 */
const STORAGE_VERSION = 1;

const verdict = z.enum(VERDICTS);

const stateSchema = z.object({
  phase: z.enum(SESSION_PHASES),
  sessionId: z.string().nullable(),
  projectId: z.string(),
  mode: z.enum(STUDY_MODES),
  direction: z.enum(STUDY_DIRECTIONS),
  gradingMode: z.enum(GRADING_MODES),
  strictness: z.enum(GRADING_STRICTNESS),
  roundNumber: z.int().min(0),
  cards: z.record(
    z.string(),
    z.object({ id: z.string(), projectId: z.string(), front: z.string(), back: z.string() }),
  ),
  queue: z.array(z.object({ cardId: z.string(), direction: z.enum(CARD_DIRECTIONS) })),
  currentIndex: z.int().min(0),
  userInput: z.string(),
  presentedAt: z.number().nullable(),
  responseTimeMs: z.number().nullable(),
  evaluationId: z.int().min(0),
  selfAssessmentReason: z.enum(SELF_ASSESSMENT_REASONS).nullable(),
  errorMessage: z.string().nullable(),
  lastResult: z
    .object({
      cardId: z.string(),
      direction: z.enum(CARD_DIRECTIONS),
      userInput: z.string(),
      verdict,
      method: z.enum(ANSWER_METHODS),
      confidence: z.number().optional(),
      feedback: z.string().optional(),
      cached: z.boolean().optional(),
      responseTimeMs: z.number(),
      originalVerdict: verdict,
    })
    .nullable(),
  piles: z.object({ correct: z.array(z.string()), incorrect: z.array(z.string()) }),
  answerIds: z.record(z.string(), z.string()),
  startedAt: z.string().nullable(),
});

const snapshotSchema = z.object({ version: z.literal(STORAGE_VERSION), state: stateSchema });

/** Whether a state is worth keeping across a reload (running or just finished round). */
export function shouldPersist(state: SessionState): boolean {
  return state.phase !== 'setup' && state.phase !== 'aborted';
}

export function serializeSession(state: SessionState): string {
  return JSON.stringify({ version: STORAGE_VERSION, state });
}

/** Parses a stored snapshot; anything invalid or inconsistent yields undefined. */
export function parseStoredSession(raw: string | null | undefined): SessionState | undefined {
  if (!raw) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const state: SessionState = parsed.data.state;
  if (!shouldPersist(state)) return undefined;
  const consistent =
    state.queue.every((item) => item.cardId in state.cards) &&
    (state.phase === 'roundComplete' || state.currentIndex < state.queue.length);
  return consistent ? state : undefined;
}
