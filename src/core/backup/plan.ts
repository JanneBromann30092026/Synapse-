/**
 * Plans the import of a Synapse file into an existing database: which records are added,
 * which ids must change because they already exist, and how same-named projects are handled.
 * Pure – the repository reads the existing state, calls planImport and writes the result.
 */
import { normalizeCardText } from '@/core/cards';
import {
  CROSS_PROJECT_ID,
  type Answer,
  type Card,
  type CardLink,
  type Project,
  type StudySession,
} from '@/data/types';
import type { SynapseFile } from './format';

/** What happens to a project of the file whose name already exists. */
export const CONFLICT_STRATEGIES = ['merge', 'new', 'skip'] as const;
export type ConflictStrategy = (typeof CONFLICT_STRATEGIES)[number];

export interface ExistingState {
  projects: readonly Pick<Project, 'id' | 'name' | 'sortOrder'>[];
  /** Fronts of the existing cards by project (for merging). */
  cards: readonly Pick<Card, 'id' | 'projectId' | 'front'>[];
  /** Every id already used by projects, cards, sessions, answers or links. */
  usedIds: ReadonlySet<string>;
  /** "source|target" of existing manual links. */
  manualLinkPairs: ReadonlySet<string>;
}

export interface ImportOptions {
  /** Strategy per conflicting project (file project id); default 'merge'. */
  strategies?: Readonly<Record<string, ConflictStrategy>>;
  /** Imports study sessions and answers. */
  includeHistory: boolean;
  newId: () => string;
}

export interface ProjectOutcome {
  /** Name in the file. */
  name: string;
  action: 'created' | 'merged' | 'skipped';
  /** Name in the database afterwards (differs for 'new' on a conflict). */
  targetName: string;
  cardsAdded: number;
  duplicatesSkipped: number;
}

export interface ImportPlan {
  projects: Project[];
  cards: Card[];
  studySessions: StudySession[];
  answers: Answer[];
  cardLinks: CardLink[];
  outcomes: ProjectOutcome[];
}

function nameKey(name: string): string {
  return normalizeCardText(name);
}

/** Projects of the file whose name already exists (case-insensitive), by file project id. */
export function findConflicts(
  file: Pick<SynapseFile, 'projects'>,
  existing: Pick<ExistingState, 'projects'>,
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const project of existing.projects) {
    if (!byName.has(nameKey(project.name))) byName.set(nameKey(project.name), project.id);
  }
  const conflicts = new Map<string, string>();
  for (const project of file.projects) {
    const match = byName.get(nameKey(project.name));
    if (match) conflicts.set(project.id, match);
  }
  return conflicts;
}

/** "Name (2)", "Name (3)" … – the first one not taken. */
export function uniqueName(name: string, taken: ReadonlySet<string>, maxLength = 80): string {
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, maxLength - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

export function planImport(
  file: SynapseFile,
  existing: ExistingState,
  options: ImportOptions,
): ImportPlan {
  const used = new Set(existing.usedIds);
  const freshId = (oldId: string) => {
    let next = oldId;
    while (used.has(next)) next = options.newId();
    used.add(next);
    return next;
  };

  const conflicts = findConflicts(file, existing);
  const takenNames = new Set(existing.projects.map((p) => nameKey(p.name)));
  const maxOrder = existing.projects.reduce((max, p) => Math.max(max, p.sortOrder), -1);
  // Into an empty database the sort order stays as it was (exact round trip), otherwise new
  // projects are appended in their file order.
  const keepOrder = existing.projects.length === 0;

  const plan: ImportPlan = {
    projects: [],
    cards: [],
    studySessions: [],
    answers: [],
    cardLinks: [],
    outcomes: [],
  };

  /** File project id → database project id (absent = skipped). */
  const projectMap = new Map<string, string>();
  const outcomeByProject = new Map<string, ProjectOutcome>();
  /** Database project id → normalized front → card id (for duplicate detection on merge). */
  const frontsByProject = new Map<string, Map<string, string>>();
  for (const card of existing.cards) {
    let fronts = frontsByProject.get(card.projectId);
    if (!fronts) frontsByProject.set(card.projectId, (fronts = new Map<string, string>()));
    const key = normalizeCardText(card.front);
    if (!fronts.has(key)) fronts.set(key, card.id);
  }

  const sortedProjects = [...file.projects].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const project of sortedProjects) {
    const conflict = conflicts.get(project.id);
    const strategy = conflict ? (options.strategies?.[project.id] ?? 'merge') : 'new';
    const outcome: ProjectOutcome = {
      name: project.name,
      action: 'created',
      targetName: project.name,
      cardsAdded: 0,
      duplicatesSkipped: 0,
    };
    outcomeByProject.set(project.id, outcome);
    plan.outcomes.push(outcome);

    if (conflict && strategy === 'skip') {
      outcome.action = 'skipped';
      continue;
    }
    if (conflict && strategy === 'merge') {
      outcome.action = 'merged';
      outcome.targetName = existing.projects.find((p) => p.id === conflict)?.name ?? project.name;
      projectMap.set(project.id, conflict);
      continue;
    }
    const name = takenNames.has(nameKey(project.name))
      ? uniqueName(project.name, takenNames)
      : project.name;
    takenNames.add(nameKey(name));
    const newProjectId = freshId(project.id);
    projectMap.set(project.id, newProjectId);
    outcome.targetName = name;
    plan.projects.push({
      ...project,
      id: newProjectId,
      name,
      sortOrder: keepOrder ? project.sortOrder : maxOrder + 1 + plan.projects.length,
    });
    frontsByProject.set(newProjectId, new Map());
  }

  /** File card id → database card id (a new one or the existing duplicate it was merged into). */
  const cardMap = new Map<string, string>();
  for (const card of file.cards) {
    const projectId = projectMap.get(card.projectId);
    const outcome = outcomeByProject.get(card.projectId);
    if (projectId === undefined || !outcome) continue;
    const fronts = frontsByProject.get(projectId) ?? new Map<string, string>();
    frontsByProject.set(projectId, fronts);
    const key = normalizeCardText(card.front);
    const duplicateOf = outcome.action === 'merged' ? fronts.get(key) : undefined;
    if (duplicateOf !== undefined) {
      cardMap.set(card.id, duplicateOf);
      outcome.duplicatesSkipped++;
      continue;
    }
    const cardId = freshId(card.id);
    cardMap.set(card.id, cardId);
    if (!fronts.has(key)) fronts.set(key, cardId);
    plan.cards.push({ ...card, id: cardId, projectId });
    outcome.cardsAdded++;
  }

  if (options.includeHistory) {
    const answersBySession = new Map<string, Answer[]>();
    for (const answer of file.answers) {
      const cardId = cardMap.get(answer.cardId);
      if (cardId === undefined || existing.usedIds.has(answer.id)) continue;
      const list = answersBySession.get(answer.sessionId) ?? [];
      list.push({ ...answer, cardId });
      answersBySession.set(answer.sessionId, list);
    }
    for (const session of file.studySessions) {
      // A session that already exists was imported before: neither it nor its answers again.
      if (existing.usedIds.has(session.id)) continue;
      const cross = session.projectId === CROSS_PROJECT_ID;
      const projectId = cross ? CROSS_PROJECT_ID : projectMap.get(session.projectId);
      const answers = answersBySession.get(session.id) ?? [];
      if (projectId === undefined || (cross && answers.length === 0)) continue;
      const sessionId = freshId(session.id);
      plan.studySessions.push({ ...session, id: sessionId, projectId });
      for (const answer of answers) {
        plan.answers.push({ ...answer, id: freshId(answer.id), sessionId });
      }
    }
  }

  const pairs = new Set(existing.manualLinkPairs);
  for (const link of file.cardLinks) {
    const a = cardMap.get(link.sourceCardId);
    const b = cardMap.get(link.targetCardId);
    if (a === undefined || b === undefined || a === b) continue;
    const [sourceCardId, targetCardId] = a < b ? [a, b] : [b, a];
    const pair = `${sourceCardId}|${targetCardId}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    plan.cardLinks.push({ ...link, id: freshId(link.id), sourceCardId, targetCardId });
  }

  return plan;
}
