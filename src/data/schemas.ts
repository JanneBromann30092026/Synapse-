import { z } from 'zod';
import {
  ANSWER_METHODS,
  CARD_DIRECTIONS,
  CROSS_PROJECT_ID,
  GRADING_MODES,
  PROJECT_COLORS,
  STUDY_DIRECTIONS,
  STUDY_MODES,
  VERDICTS,
} from './types';

export const LIMITS = {
  projectName: 80,
  projectDescription: 500,
  iconName: 64,
  cardText: 5000,
  cardNotes: 5000,
  tag: 40,
  tagsPerCard: 30,
  userInput: 5000,
  feedback: 2000,
  settingKey: 100,
  searchQuery: 200,
} as const;

const id = z.uuid();

/** Trimmed string; empty strings become undefined (field removed). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const tags = z
  .array(z.string().trim().min(1).max(LIMITS.tag))
  .max(LIMITS.tagsPerCard)
  .transform((values) => [...new Set(values)]);

// --- Projects -------------------------------------------------------------

const projectFields = {
  name: requiredText(LIMITS.projectName),
  description: optionalText(LIMITS.projectDescription),
  color: z.enum(PROJECT_COLORS),
  icon: z
    .string()
    .trim()
    .max(LIMITS.iconName)
    .regex(/^[a-z0-9-]*$/)
    .optional()
    .transform((value) => (value ? value : undefined)),
  includeInBrain: z.boolean(),
  archived: z.boolean(),
};

export const projectCreateSchema = z.object({
  ...projectFields,
  color: projectFields.color.default('indigo'),
  includeInBrain: projectFields.includeInBrain.default(true),
  archived: projectFields.archived.default(false),
});
export type ProjectCreateInput = z.input<typeof projectCreateSchema>;

export const projectUpdateSchema = z.object(projectFields).partial();
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>;

// --- Cards ----------------------------------------------------------------

const cardFields = {
  front: requiredText(LIMITS.cardText),
  back: requiredText(LIMITS.cardText),
  notes: optionalText(LIMITS.cardNotes),
  tags,
};

export const cardCreateSchema = z.object({ ...cardFields, tags: tags.default([]) });
export type CardCreateInput = z.input<typeof cardCreateSchema>;

export const cardUpdateSchema = z.object(cardFields).partial();
export type CardUpdateInput = z.input<typeof cardUpdateSchema>;

export const searchQuerySchema = z.string().max(LIMITS.searchQuery);

// --- Study sessions & answers ---------------------------------------------

const count = z.int().min(0);

export const sessionCreateSchema = z.object({
  projectId: z.union([id, z.literal(CROSS_PROJECT_ID)]),
  roundNumber: z.int().min(1),
  mode: z.enum(STUDY_MODES),
  direction: z.enum(STUDY_DIRECTIONS),
  gradingMode: z.enum(GRADING_MODES),
  totalCards: count,
});
export type SessionCreateInput = z.input<typeof sessionCreateSchema>;

export const sessionResultSchema = z.object({
  correctCount: count,
  incorrectCount: count,
});
export type SessionResultInput = z.input<typeof sessionResultSchema>;

export const answerCreateSchema = z.object({
  sessionId: id,
  cardId: id,
  directionUsed: z.enum(CARD_DIRECTIONS),
  userInput: z.string().max(LIMITS.userInput),
  verdict: z.enum(VERDICTS),
  method: z.enum(ANSWER_METHODS),
  confidence: z.number().min(0).max(1).optional(),
  feedback: optionalText(LIMITS.feedback),
  responseTimeMs: count.optional(),
});
export type AnswerCreateInput = z.input<typeof answerCreateSchema>;

// --- Settings -------------------------------------------------------------

export const settingKeySchema = requiredText(LIMITS.settingKey);
