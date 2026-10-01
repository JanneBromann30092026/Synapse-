import { z } from 'zod';
import { embeddingText, embeddingTextHash } from '@/core/brain/text';
import type { LinkOptions, SemanticLink } from '@/core/brain/links';
import { computeMastery, type Mastery } from '@/core/mastery';
import { db } from '../db';
import type { Card, CardLink, LinkKind, Project } from '../types';
import { newId, nowIso } from '../util';
import { masteries } from './statsRepo';

/** settings row that remembers what the stored semantic links were computed from. */
export const LINK_STATE_KEY = 'brain.linkState';

const linkStateSchema = z.object({
  computedAt: z.string(),
  model: z.string(),
  topK: z.number(),
  threshold: z.number(),
  /** Cards that took part in the computation (detects added and removed cards). */
  cardIds: z.array(z.string()),
});
export type LinkState = z.output<typeof linkStateSchema>;

export interface EmbeddingStatus {
  /** Cards of brain projects. */
  total: number;
  /** Cards with an embedding of the current model and text. */
  current: number;
  /** Cards that still need an embedding (new, changed text or other model). */
  pending: number;
  /** The stored links do not match the current embeddings or options. */
  linksOutdated: boolean;
}

export interface PendingCard {
  cardId: string;
  text: string;
  textHash: string;
}

export interface EmbeddingMatrix {
  ids: string[];
  dim: number;
  matrix: Float32Array;
  /** createdAt of each embedding (same order as ids). */
  createdAt: string[];
}

export interface GraphCardNode {
  id: string;
  projectId: string;
  front: string;
  back: string;
  mastery: Mastery;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: LinkKind;
  weight: number;
  /** Derived on load: the two cards belong to different projects. */
  crossProject: boolean;
}

export interface GraphData {
  /** Project hub nodes. */
  projects: Project[];
  cards: GraphCardNode[];
  edges: GraphEdge[];
}

export interface CardDetailLink {
  linkId: string;
  kind: LinkKind;
  weight: number;
  card: Card;
  project: Project;
  crossProject: boolean;
}

export interface CardDetail {
  card: Card;
  project: Project;
  mastery: Mastery;
  /** Last answers, newest first. */
  recent: { id: string; verdict: 'correct' | 'incorrect'; answeredAt: string }[];
  /** Linked brain cards, most similar first (manual links count as 1). */
  links: CardDetailLink[];
}

/** Number of answers shown as history in the brain detail panel. */
export const DETAIL_RECENT_ANSWERS = 12;

export interface CrossProjectLink {
  weight: number;
  source: { card: Card; project: Project };
  target: { card: Card; project: Project };
}

/** Projects shown in the brain: includeInBrain and not archived. */
export function isBrainProject(project: Project): boolean {
  return project.includeInBrain && !project.archived;
}

async function brainProjects(): Promise<Project[]> {
  const projects = await db.projects.orderBy('sortOrder').toArray();
  return projects.filter(isBrainProject);
}

async function brainCards(projects: readonly Project[]): Promise<Card[]> {
  if (projects.length === 0) return [];
  return db.cards
    .where('projectId')
    .anyOf(projects.map((project) => project.id))
    .toArray();
}

async function readLinkState(): Promise<LinkState | null> {
  const entry = await db.settings.get(LINK_STATE_KEY);
  const parsed = linkStateSchema.safeParse(entry?.value);
  return parsed.success ? parsed.data : null;
}

function sameIds(a: readonly string[], b: ReadonlySet<string>): boolean {
  return a.length === b.size && a.every((id) => b.has(id));
}

/**
 * Read-only queries run without an explicit transaction: they are reactive via liveQuery
 * anyway, and helper calls (brainProjects → brainCards) inside a read transaction let Chrome
 * commit it early (PrematureCommitError) when a step issues no IndexedDB request.
 */
function readQuery<T>(query: () => Promise<T>): Promise<T> {
  return query();
}

/**
 * Embeddings and semantic links of the brain. Embeddings are kept when a project leaves
 * the brain (cheap to re-include); links only ever connect cards of brain projects.
 */
export const brainRepo = {
  /** How many cards still need an embedding and whether the links are up to date. */
  async getEmbeddingStatus(model: string, options: LinkOptions): Promise<EmbeddingStatus> {
    return readQuery(async () => {
      const cards = await brainCards(await brainProjects());
      const embeddings = await db.cardEmbeddings.bulkGet(cards.map((card) => card.id));
      const currentIds = new Set<string>();
      let latest = '';
      cards.forEach((card, index) => {
        const embedding = embeddings[index];
        if (embedding?.model === model && embedding.textHash === embeddingTextHash(card)) {
          currentIds.add(card.id);
          if (embedding.createdAt > latest) latest = embedding.createdAt;
        }
      });
      const state = await readLinkState();
      const linksOutdated =
        state === null
          ? currentIds.size > 0
          : state.model !== model ||
            state.topK !== options.topK ||
            state.threshold !== options.threshold ||
            latest > state.computedAt ||
            !sameIds(state.cardIds, currentIds);
      return {
        total: cards.length,
        current: currentIds.size,
        pending: cards.length - currentIds.size,
        linksOutdated,
      };
    });
  },

  /** Cards of brain projects without a current embedding, in creation order. */
  async listPending(model: string, limit = Infinity): Promise<PendingCard[]> {
    return readQuery(async () => {
      const cards = await brainCards(await brainProjects());
      cards.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      const embeddings = await db.cardEmbeddings.bulkGet(cards.map((card) => card.id));
      const pending: PendingCard[] = [];
      for (const [index, card] of cards.entries()) {
        if (pending.length >= limit) break;
        const textHash = embeddingTextHash(card);
        const embedding = embeddings[index];
        if (embedding?.model !== model || embedding.textHash !== textHash) {
          pending.push({ cardId: card.id, text: embeddingText(card), textHash });
        }
      }
      return pending;
    });
  },

  /** Stores embeddings; cards deleted in the meantime are skipped. */
  async saveEmbeddings(
    model: string,
    items: readonly { cardId: string; textHash: string; vector: Float32Array }[],
  ): Promise<number> {
    return db.transaction('rw', [db.cards, db.cardEmbeddings, db.settings], async () => {
      const existing = await db.cards.bulkGet(items.map((item) => item.cardId));
      // Strictly newer than the last link computation, even within the same millisecond:
      // "createdAt > computedAt" is how outdated links are detected.
      const stored = linkStateSchema.safeParse((await db.settings.get(LINK_STATE_KEY))?.value);
      const state = stored.success ? stored.data : null;
      const now = Date.now();
      const after = state?.computedAt ? Date.parse(state.computedAt) + 1 : 0;
      const createdAt = new Date(Math.max(now, after)).toISOString();
      const records = items
        .filter((_, index) => existing[index] !== undefined)
        .map((item) => ({
          cardId: item.cardId,
          model,
          textHash: item.textHash,
          vector: item.vector,
          dim: item.vector.length,
          createdAt,
        }));
      await db.cardEmbeddings.bulkPut(records);
      return records.length;
    });
  },

  /** Current embeddings of all brain cards as one matrix (input of the link computation). */
  async getAllEmbeddings(model: string): Promise<EmbeddingMatrix> {
    return readQuery(async () => {
      const cards = await brainCards(await brainProjects());
      const embeddings = await db.cardEmbeddings.bulkGet(cards.map((card) => card.id));
      const rows: { id: string; vector: Float32Array; createdAt: string }[] = [];
      cards.forEach((card, index) => {
        const embedding = embeddings[index];
        if (embedding?.model === model && embedding.textHash === embeddingTextHash(card)) {
          rows.push({ id: card.id, vector: embedding.vector, createdAt: embedding.createdAt });
        }
      });
      rows.sort((a, b) => (a.id < b.id ? -1 : 1));
      const dim = rows[0]?.vector.length ?? 0;
      const matrix = new Float32Array(rows.length * dim);
      rows.forEach((row, index) => matrix.set(row.vector, index * dim));
      return {
        ids: rows.map((row) => row.id),
        dim,
        matrix,
        createdAt: rows.map((row) => row.createdAt),
      };
    });
  },

  async getLinkState(): Promise<LinkState | null> {
    return readLinkState();
  },

  async getSemanticLinks(): Promise<SemanticLink[]> {
    const links = await db.cardLinks.where('kind').equals('semantic').toArray();
    return links.map((link) => ({
      sourceId: link.sourceCardId,
      targetId: link.targetCardId,
      weight: link.weight,
    }));
  },

  /** Replaces all semantic links in one transaction; manual links stay untouched. */
  async replaceSemanticLinks(links: readonly SemanticLink[], state: LinkState): Promise<void> {
    await db.transaction('rw', [db.cardLinks, db.settings], async () => {
      await db.cardLinks.where('kind').equals('semantic').delete();
      const createdAt = nowIso();
      await db.cardLinks.bulkAdd(
        links.map((link): CardLink => ({
          id: newId(),
          sourceCardId: link.sourceId < link.targetId ? link.sourceId : link.targetId,
          targetCardId: link.sourceId < link.targetId ? link.targetId : link.sourceId,
          kind: 'semantic',
          weight: link.weight,
          createdAt,
        })),
      );
      await db.settings.put({ key: LINK_STATE_KEY, value: linkStateSchema.parse(state) });
    });
  },

  /** Forgets all embeddings and semantic links (e.g. after switching the embedding model). */
  async clearSemanticData(): Promise<void> {
    await db.transaction('rw', [db.cardEmbeddings, db.cardLinks, db.settings], async () => {
      await db.cardEmbeddings.clear();
      await db.cardLinks.where('kind').equals('semantic').delete();
      await db.settings.delete(LINK_STATE_KEY);
    });
  },

  /** Brain projects as hubs, their cards with mastery, and all links between those cards. */
  async getGraphData(now = Date.now()): Promise<GraphData> {
    return readQuery(async () => {
      const projects = await brainProjects();
      const cards = await brainCards(projects);
      const cardIds = cards.map((card) => card.id);
      const [answers, outgoing] = await Promise.all([
        cardIds.length === 0 ? [] : db.answers.where('cardId').anyOf(cardIds).toArray(),
        cardIds.length === 0 ? [] : db.cardLinks.where('sourceCardId').anyOf(cardIds).toArray(),
      ]);
      const projectOf = new Map(cards.map((card) => [card.id, card.projectId]));
      return {
        projects,
        cards: masteries(cards, answers, now).map(({ card, mastery }) => ({
          id: card.id,
          projectId: card.projectId,
          front: card.front,
          back: card.back,
          mastery,
        })),
        edges: outgoing
          .filter((link) => projectOf.has(link.targetCardId))
          .map((link) => ({
            id: link.id,
            sourceId: link.sourceCardId,
            targetId: link.targetCardId,
            kind: link.kind,
            weight: link.weight,
            crossProject: projectOf.get(link.sourceCardId) !== projectOf.get(link.targetCardId),
          })),
      };
    });
  },

  /** Everything the detail panel shows for a card; undefined when it left the brain. */
  async getCardDetail(cardId: string, now = Date.now()): Promise<CardDetail | undefined> {
    return readQuery(async () => {
      const card = await db.cards.get(cardId);
      if (!card) return undefined;
      const project = await db.projects.get(card.projectId);
      if (!project || !isBrainProject(project)) return undefined;
      const [answers, outgoing, incoming] = await Promise.all([
        db.answers.where('[cardId+answeredAt]').between([cardId, ''], [cardId, '\uffff']).toArray(),
        db.cardLinks.where('sourceCardId').equals(cardId).toArray(),
        db.cardLinks.where('targetCardId').equals(cardId).toArray(),
      ]);
      const links = [...outgoing, ...incoming];
      const otherIds = links.map((link) =>
        link.sourceCardId === cardId ? link.targetCardId : link.sourceCardId,
      );
      const others = await db.cards.bulkGet(otherIds);
      const projectIds = [...new Set(others.flatMap((other) => (other ? [other.projectId] : [])))];
      const projects = await db.projects.bulkGet(projectIds);
      const projectById = new Map(
        projects.flatMap((p) => (p && isBrainProject(p) ? [[p.id, p] as const] : [])),
      );
      const mastery = masteries([card], answers, now)[0]?.mastery ?? computeMastery([], now);
      return {
        card,
        project,
        mastery,
        recent: answers
          .slice(-DETAIL_RECENT_ANSWERS)
          .reverse()
          .map((answer) => ({
            id: answer.id,
            verdict: answer.verdict,
            answeredAt: answer.answeredAt,
          })),
        links: links
          .flatMap((link, index): CardDetailLink[] => {
            const other = others[index];
            const otherProject = other ? projectById.get(other.projectId) : undefined;
            if (!other || !otherProject) return [];
            return [
              {
                linkId: link.id,
                kind: link.kind,
                weight: link.weight,
                card: other,
                project: otherProject,
                crossProject: otherProject.id !== project.id,
              },
            ];
          })
          .sort((a, b) => b.weight - a.weight || a.card.front.localeCompare(b.card.front, 'de')),
      };
    });
  },

  /** Link counts of the brain (semantic links between brain cards). */
  async linkSummary(): Promise<{ links: number; crossProject: number }> {
    const data = await this.getGraphData();
    const semantic = data.edges.filter((edge) => edge.kind === 'semantic');
    return {
      links: semantic.length,
      crossProject: semantic.filter((edge) => edge.crossProject).length,
    };
  },

  /** Strongest semantic links between cards of different projects. */
  async topCrossProjectLinks(limit = 10): Promise<CrossProjectLink[]> {
    return readQuery(async () => {
      const projects = await brainProjects();
      const projectById = new Map(projects.map((project) => [project.id, project]));
      const cards = await brainCards(projects);
      const cardById = new Map(cards.map((card) => [card.id, card]));
      const links = await db.cardLinks.where('kind').equals('semantic').toArray();
      return links
        .flatMap((link): CrossProjectLink[] => {
          const source = cardById.get(link.sourceCardId);
          const target = cardById.get(link.targetCardId);
          if (!source || !target || source.projectId === target.projectId) return [];
          return [
            {
              weight: link.weight,
              source: { card: source, project: projectById.get(source.projectId) as Project },
              target: { card: target, project: projectById.get(target.projectId) as Project },
            },
          ];
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, limit);
    });
  },
};
