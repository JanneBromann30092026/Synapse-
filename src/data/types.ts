/**
 * Domain types of the local database. All IDs are UUIDs, all timestamps ISO strings in UTC.
 * Booleans are stored as-is but never indexed (IndexedDB cannot index booleans).
 */

/** Project color palette (token names). The actual colors are defined by the design system. */
export const PROJECT_COLORS = [
  'indigo',
  'violet',
  'pink',
  'rose',
  'orange',
  'amber',
  'emerald',
  'teal',
  'sky',
  'slate',
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const STUDY_MODES = ['all', 'wrong', 'right'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const STUDY_DIRECTIONS = ['front_to_back', 'back_to_front', 'mixed'] as const;
export type StudyDirection = (typeof STUDY_DIRECTIONS)[number];

/** The direction a single card was actually asked in (never 'mixed'). */
export const CARD_DIRECTIONS = ['front_to_back', 'back_to_front'] as const;
export type CardDirection = (typeof CARD_DIRECTIONS)[number];

export const GRADING_MODES = ['ai', 'self'] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

export const GRADING_STRICTNESS = ['exact', 'meaning', 'lenient'] as const;
export type GradingStrictness = (typeof GRADING_STRICTNESS)[number];

export const VERDICTS = ['correct', 'incorrect'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const ANSWER_METHODS = ['exact', 'fuzzy', 'ai', 'self', 'override'] as const;
export type AnswerMethod = (typeof ANSWER_METHODS)[number];

export const LINK_KINDS = ['semantic', 'manual'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** projectId of study sessions spanning several projects. */
export const CROSS_PROJECT_ID = 'cross';

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: ProjectColor;
  /** lucide icon name, e.g. "languages". */
  icon?: string;
  includeInBrain: boolean;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  projectId: string;
  front: string;
  back: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  /** A project id or CROSS_PROJECT_ID. */
  projectId: string;
  roundNumber: number;
  mode: StudyMode;
  direction: StudyDirection;
  gradingMode: GradingMode;
  startedAt: string;
  finishedAt?: string;
  aborted: boolean;
  totalCards: number;
  correctCount: number;
  incorrectCount: number;
}

export interface Answer {
  id: string;
  sessionId: string;
  cardId: string;
  directionUsed: CardDirection;
  userInput: string;
  verdict: Verdict;
  method: AnswerMethod;
  /** 0..1 */
  confidence?: number;
  feedback?: string;
  responseTimeMs?: number;
  answeredAt: string;
}

export interface GradingCacheEntry {
  cardId: string;
  direction: CardDirection;
  /** SHA-256 of the normalized user input (hex). */
  inputHash: string;
  strictness: GradingStrictness;
  verdict: Verdict;
  confidence?: number;
  feedback?: string;
  model: string;
  /** 'override' after the user corrected the verdict; absent = AI verdict (not indexed). */
  method?: Extract<AnswerMethod, 'ai' | 'override'>;
  createdAt: string;
}

export interface CardEmbedding {
  cardId: string;
  model: string;
  /** Hash of the embedded text, used to detect stale embeddings. */
  textHash: string;
  vector: Float32Array;
  dim: number;
  createdAt: string;
}

export interface CardLink {
  id: string;
  /** For kind 'semantic', sourceCardId < targetCardId (see normalizeLinkPair). */
  sourceCardId: string;
  targetCardId: string;
  kind: LinkKind;
  weight: number;
  createdAt: string;
}

/** AI explanation why two cards are linked (cache, one per card pair). */
export interface LinkExplanation {
  /** sourceCardId < targetCardId (see normalizeLinkPair). */
  sourceCardId: string;
  targetCardId: string;
  /** Hash of both card texts: an edited card invalidates the explanation. */
  textHash: string;
  explanation: string;
  model: string;
  createdAt: string;
}

export interface GraphPosition {
  /** A card id or project id (project hubs). */
  nodeId: string;
  x: number;
  y: number;
  updatedAt: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Secret {
  key: string;
  value: string;
}

/** Project enriched with derived data for list views. */
export interface ProjectSummary extends Project {
  cardCount: number;
  /** startedAt of the latest study session, if any. */
  lastStudiedAt?: string;
}
