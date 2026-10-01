/**
 * The Synapse file format (JSON) for backups and exports, validated with zod.
 * Never contains embeddings or secrets (API key); exports also contain no settings.
 */
import { z } from 'zod';
import { LIMITS } from '@/data/schemas';
import {
  ANSWER_METHODS,
  CARD_DIRECTIONS,
  CROSS_PROJECT_ID,
  GRADING_MODES,
  GRADING_STRICTNESS,
  PROJECT_COLORS,
  STUDY_DIRECTIONS,
  STUDY_MODES,
  VERDICTS,
} from '@/data/types';

export const SYNAPSE_FORMAT = 'synapse';
/** Increase when the format changes incompatibly; older files must stay readable. */
export const FORMAT_VERSION = 1;

export const FILE_KINDS = ['backup', 'export'] as const;
export type SynapseFileKind = (typeof FILE_KINDS)[number];

const id = z.uuid();
const timestamp = z.iso.datetime();
const count = z.int().min(0);
const text = (max: number) => z.string().trim().min(1).max(max);

const projectSchema = z.object({
  id,
  name: text(LIMITS.projectName),
  description: z.string().max(LIMITS.projectDescription).optional(),
  color: z.enum(PROJECT_COLORS),
  icon: z
    .string()
    .max(LIMITS.iconName)
    .regex(/^[a-z0-9-]*$/)
    .optional(),
  includeInBrain: z.boolean(),
  sortOrder: z.number(),
  archived: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const cardSchema = z.object({
  id,
  projectId: id,
  front: text(LIMITS.cardText),
  back: text(LIMITS.cardText),
  notes: z.string().max(LIMITS.cardNotes).optional(),
  tags: z.array(z.string().trim().min(1).max(LIMITS.tag)).max(LIMITS.tagsPerCard),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const sessionSchema = z.object({
  id,
  projectId: z.union([id, z.literal(CROSS_PROJECT_ID)]),
  roundNumber: z.int().min(1),
  mode: z.enum(STUDY_MODES),
  direction: z.enum(STUDY_DIRECTIONS),
  gradingMode: z.enum(GRADING_MODES),
  startedAt: timestamp,
  finishedAt: timestamp.optional(),
  aborted: z.boolean(),
  totalCards: count,
  correctCount: count,
  incorrectCount: count,
});

const answerSchema = z.object({
  id,
  sessionId: id,
  cardId: id,
  directionUsed: z.enum(CARD_DIRECTIONS),
  userInput: z.string().max(LIMITS.userInput),
  verdict: z.enum(VERDICTS),
  method: z.enum(ANSWER_METHODS),
  confidence: z.number().min(0).max(1).optional(),
  feedback: z.string().max(LIMITS.feedback).optional(),
  responseTimeMs: count.optional(),
  answeredAt: timestamp,
});

/** Only manual links are stored; semantic links are recomputed from embeddings. */
const linkSchema = z.object({
  id,
  sourceCardId: id,
  targetCardId: id,
  kind: z.literal('manual'),
  weight: z.number(),
  createdAt: timestamp,
});

// --- Backup only ------------------------------------------------------------

const gradingCacheSchema = z.object({
  cardId: id,
  direction: z.enum(CARD_DIRECTIONS),
  inputHash: z.string().min(1).max(128),
  strictness: z.enum(GRADING_STRICTNESS),
  verdict: z.enum(VERDICTS),
  confidence: z.number().min(0).max(1).optional(),
  feedback: z.string().max(LIMITS.feedback).optional(),
  model: z.string().max(LIMITS.modelName),
  method: z.enum(['ai', 'override']).optional(),
  createdAt: timestamp,
});

const graphPositionSchema = z.object({
  nodeId: id,
  x: z.number(),
  y: z.number(),
  updatedAt: timestamp,
});

const linkExplanationSchema = z.object({
  sourceCardId: id,
  targetCardId: id,
  textHash: z.string().max(128),
  explanation: z.string().max(20_000),
  model: z.string().max(LIMITS.modelName),
  createdAt: timestamp,
});

const settingSchema = z.object({
  key: z.string().min(1).max(LIMITS.settingKey),
  value: z.unknown(),
});

const MAX_RECORDS = 1_000_000;
const list = <T extends z.ZodType>(schema: T) => z.array(schema).max(MAX_RECORDS).default([]);

const fileShape = z.object({
  format: z.literal(SYNAPSE_FORMAT),
  version: z.int().min(1).max(FORMAT_VERSION),
  kind: z.enum(FILE_KINDS),
  exportedAt: timestamp,
  appVersion: z.string().max(50).optional(),
  projects: z.array(projectSchema).max(MAX_RECORDS),
  cards: z.array(cardSchema).max(MAX_RECORDS),
  studySessions: list(sessionSchema),
  answers: list(answerSchema),
  cardLinks: list(linkSchema),
  gradingCache: list(gradingCacheSchema),
  graphPositions: list(graphPositionSchema),
  linkExplanations: list(linkExplanationSchema),
  settings: list(settingSchema),
});

function duplicate(values: Iterable<string>): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

/** Validates the structure and that every reference points to a record of the same file. */
export const synapseFileSchema = fileShape.superRefine((file, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  for (const key of ['projects', 'cards', 'studySessions', 'answers', 'cardLinks'] as const) {
    const twice = duplicate(file[key].map((record) => record.id));
    if (twice) issue([key], `duplicate id ${twice}`);
  }
  const projectIds = new Set(file.projects.map((p) => p.id));
  const cardIds = new Set(file.cards.map((c) => c.id));
  const sessionIds = new Set(file.studySessions.map((s) => s.id));
  const nodeIds = new Set([...projectIds, ...cardIds]);

  file.cards.forEach((card, i) => {
    if (!projectIds.has(card.projectId)) issue(['cards', i, 'projectId'], 'unknown project');
  });
  file.studySessions.forEach((session, i) => {
    if (session.projectId !== CROSS_PROJECT_ID && !projectIds.has(session.projectId)) {
      issue(['studySessions', i, 'projectId'], 'unknown project');
    }
  });
  file.answers.forEach((answer, i) => {
    if (!sessionIds.has(answer.sessionId)) issue(['answers', i, 'sessionId'], 'unknown session');
    if (!cardIds.has(answer.cardId)) issue(['answers', i, 'cardId'], 'unknown card');
  });
  file.cardLinks.forEach((link, i) => {
    if (!cardIds.has(link.sourceCardId) || !cardIds.has(link.targetCardId)) {
      issue(['cardLinks', i], 'unknown card');
    }
  });
  file.gradingCache.forEach((entry, i) => {
    if (!cardIds.has(entry.cardId)) issue(['gradingCache', i, 'cardId'], 'unknown card');
  });
  file.linkExplanations.forEach((entry, i) => {
    if (!cardIds.has(entry.sourceCardId) || !cardIds.has(entry.targetCardId)) {
      issue(['linkExplanations', i], 'unknown card');
    }
  });
  file.graphPositions.forEach((position, i) => {
    if (!nodeIds.has(position.nodeId)) issue(['graphPositions', i, 'nodeId'], 'unknown node');
  });
});

export type SynapseFile = z.output<typeof synapseFileSchema>;
export type SynapseFileInput = z.input<typeof synapseFileSchema>;

export type FileErrorCode = 'notJson' | 'notSynapse' | 'newerVersion' | 'invalid';

export type ParsedFile =
  | { ok: true; file: SynapseFile }
  | {
      ok: false;
      code: FileErrorCode;
      /** Path of the first problem, e.g. "cards.3.front". */ path?: string;
    };

/** Whether text looks like JSON (an object), as opposed to CSV. */
export function looksLikeJson(text: string): boolean {
  return /^\s*\{/.test(text.replace(/^\uFEFF/, ''));
}

/** Validates already parsed JSON. */
export function validateSynapseFile(json: unknown): ParsedFile {
  const header = z.object({ format: z.literal(SYNAPSE_FORMAT), version: z.int() }).safeParse(json);
  if (!header.success) return { ok: false, code: 'notSynapse' };
  if (header.data.version > FORMAT_VERSION) return { ok: false, code: 'newerVersion' };
  const result = synapseFileSchema.safeParse(json);
  if (result.success) return { ok: true, file: result.data };
  const first = result.error.issues[0];
  return { ok: false, code: 'invalid', path: first?.path.map(String).join('.') };
}

/** Parses and validates a JSON text. */
export function parseSynapseFile(text: string): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, code: 'notJson' };
  }
  return validateSynapseFile(json);
}

export interface FileSummary {
  kind: SynapseFileKind;
  exportedAt: string;
  projects: { id: string; name: string; cardCount: number }[];
  cardCount: number;
  sessionCount: number;
  answerCount: number;
}

export function summarizeFile(file: SynapseFile): FileSummary {
  const perProject = new Map<string, number>();
  for (const card of file.cards) {
    perProject.set(card.projectId, (perProject.get(card.projectId) ?? 0) + 1);
  }
  return {
    kind: file.kind,
    exportedAt: file.exportedAt,
    projects: [...file.projects]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ id: p.id, name: p.name, cardCount: perProject.get(p.id) ?? 0 })),
    cardCount: file.cards.length,
    sessionCount: file.studySessions.length,
    answerCount: file.answers.length,
  };
}
