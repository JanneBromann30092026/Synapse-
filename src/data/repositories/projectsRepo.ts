import { Dexie } from 'dexie';
import { db } from '../db';
import { deleteProjectCascade, projectCascadeTables } from '../cascade';
import { RecordNotFoundError, ValidationError, parseOrThrow } from '../errors';
import {
  projectCreateSchema,
  projectUpdateSchema,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from '../schemas';
import type { Project, ProjectSummary } from '../types';
import { applyPatch, compact, newId, nowIso } from '../util';

const UPDATABLE_KEYS = [
  'name',
  'description',
  'color',
  'icon',
  'includeInBrain',
  'archived',
] as const satisfies readonly (keyof Project)[];

async function lastStudiedAt(projectId: string): Promise<string | undefined> {
  const latest = await db.studySessions
    .where('[projectId+startedAt]')
    .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
    .last();
  return latest?.startedAt;
}

export const projectsRepo = {
  /** All projects (including archived) ordered by sortOrder, with card count and last study date. */
  async list(): Promise<ProjectSummary[]> {
    return db.transaction('r', [db.projects, db.cards, db.studySessions], async () => {
      const projects = await db.projects.orderBy('sortOrder').toArray();
      return Promise.all(
        projects.map(async (project) => {
          const [cardCount, studiedAt] = await Promise.all([
            db.cards.where('projectId').equals(project.id).count(),
            lastStudiedAt(project.id),
          ]);
          return compact({ ...project, cardCount, lastStudiedAt: studiedAt });
        }),
      );
    });
  },

  async count(): Promise<number> {
    return db.projects.count();
  },

  async get(id: string): Promise<Project | undefined> {
    return db.projects.get(id);
  },

  async create(input: ProjectCreateInput): Promise<Project> {
    const data = parseOrThrow(projectCreateSchema, input);
    return db.transaction('rw', db.projects, async () => {
      const last = await db.projects.orderBy('sortOrder').last();
      const now = nowIso();
      const project: Project = compact({
        id: newId(),
        ...data,
        sortOrder: last ? last.sortOrder + 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.projects.add(project);
      return project;
    });
  },

  async update(id: string, input: ProjectUpdateInput): Promise<Project> {
    const data = parseOrThrow(projectUpdateSchema, input);
    return db.transaction('rw', db.projects, async () => {
      const existing = await db.projects.get(id);
      if (!existing) throw new RecordNotFoundError('project', id);
      const project = {
        ...applyPatch(existing, input, data, UPDATABLE_KEYS),
        updatedAt: nowIso(),
      };
      await db.projects.put(project);
      return project;
    });
  },

  /** Deletes the project with all its cards, sessions, answers, cache, embeddings, links and positions. */
  async delete(id: string): Promise<void> {
    await db.transaction('rw', projectCascadeTables(db), () => deleteProjectCascade(db, id));
  },

  /** Sets sortOrder according to the given order. Must contain every project exactly once. */
  async reorder(orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.projects, async () => {
      const existingIds = new Set(await db.projects.toCollection().primaryKeys());
      const unique = new Set(orderedIds);
      if (
        unique.size !== orderedIds.length ||
        unique.size !== existingIds.size ||
        orderedIds.some((projectId) => !existingIds.has(projectId))
      ) {
        throw new ValidationError('orderedIds', 'invalid');
      }
      const now = nowIso();
      await Promise.all(
        orderedIds.map((projectId, index) =>
          db.projects.update(projectId, { sortOrder: index, updatedAt: now }),
        ),
      );
    });
  },
};
