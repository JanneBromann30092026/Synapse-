import { countByDay, dayKey, studyStreak } from '@/core/activity';
import {
  computeMastery,
  countLevels,
  hardestCards,
  type Mastery,
  type MasteryAnswer,
  type MasteryCounts,
} from '@/core/mastery';
import { db } from '../db';
import type { Answer, Card, Project } from '../types';

/** Days of activity the stats page shows (16 weeks plus the started week). */
export const ACTIVITY_DAYS = 16 * 7 + 7;
/** How many cards "Schwierigste Karten" lists. */
export const HARDEST_LIMIT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardMastery {
  card: Card;
  mastery: Mastery;
}

export interface ProjectMasterySummary {
  project: Project;
  cardCount: number;
  counts: MasteryCounts;
}

export interface StatsOverview {
  cardCount: number;
  counts: MasteryCounts;
  /** Active (not archived) projects in their sort order. */
  projects: ProjectMasterySummary[];
  hardest: (CardMastery & { project: Project })[];
}

export interface ActivityStats {
  /** Answers per local day ("YYYY-MM-DD"), at least for the last ACTIVITY_DAYS days. */
  byDay: Map<string, number>;
  today: string;
  answersToday: number;
  /** Days in a row with answers (see studyStreak). */
  streak: number;
}

/** Answers grouped per card id, each list oldest first. */
function groupByCard(answers: readonly Answer[]): Map<string, MasteryAnswer[]> {
  const byCard = new Map<string, MasteryAnswer[]>();
  for (const answer of answers) {
    let list = byCard.get(answer.cardId);
    if (!list) {
      list = [];
      byCard.set(answer.cardId, list);
    }
    list.push(answer);
  }
  for (const list of byCard.values()) {
    list.sort((a, b) => (a.answeredAt < b.answeredAt ? -1 : a.answeredAt > b.answeredAt ? 1 : 0));
  }
  return byCard;
}

function masteries(cards: readonly Card[], answers: readonly Answer[], now: number): CardMastery[] {
  const byCard = groupByCard(answers);
  return cards.map((card) => ({ card, mastery: computeMastery(byCard.get(card.id) ?? [], now) }));
}

/**
 * Mastery and activity derived from the answer log. Reads use the existing indexes
 * (cards.projectId, answers.cardId, answers.answeredAt); activity only reads index keys.
 */
export const statsRepo = {
  /** Mastery of every card of a project, keyed by card id. */
  async masteryByProject(projectId: string, now = Date.now()): Promise<Map<string, Mastery>> {
    return db.transaction('r', [db.cards, db.answers], async () => {
      const cards = await db.cards.where('projectId').equals(projectId).toArray();
      const answers =
        cards.length === 0
          ? []
          : await db.answers
              .where('cardId')
              .anyOf(cards.map((card) => card.id))
              .toArray();
      return new Map(masteries(cards, answers, now).map((m) => [m.card.id, m.mastery]));
    });
  },

  /** Mastery of all cards of active projects: totals, per project and the hardest cards. */
  async overview(now = Date.now()): Promise<StatsOverview> {
    return db.transaction('r', [db.projects, db.cards, db.answers], async () => {
      const [projects, cards, answers] = await Promise.all([
        db.projects.orderBy('sortOrder').toArray(),
        db.cards.toArray(),
        db.answers.toArray(),
      ]);
      const active = projects.filter((project) => !project.archived);
      const projectById = new Map(active.map((project) => [project.id, project]));
      const all = masteries(
        cards.filter((card) => projectById.has(card.projectId)),
        answers,
        now,
      );
      const perProject = new Map<string, Mastery[]>(active.map((project) => [project.id, []]));
      for (const { card, mastery } of all) perProject.get(card.projectId)?.push(mastery);
      return {
        cardCount: all.length,
        counts: countLevels(all.map((m) => m.mastery)),
        projects: active.map((project) => {
          const list = perProject.get(project.id) ?? [];
          return { project, cardCount: list.length, counts: countLevels(list) };
        }),
        hardest: hardestCards(all, HARDEST_LIMIT).map((item) => ({
          ...item,
          project: projectById.get(item.card.projectId) as Project,
        })),
      };
    });
  },

  /** Answers per local day, answers today and the streak. Reads only answeredAt index keys. */
  async activity(now = Date.now()): Promise<ActivityStats> {
    const today = dayKey(now);
    // One extra day: UTC timestamps vs. local days.
    const from = new Date(now - (ACTIVITY_DAYS + 1) * DAY_MS).toISOString();
    const recent = (await db.answers.where('answeredAt').aboveOrEqual(from).keys()) as string[];
    let byDay = countByDay(recent);
    let streak = studyStreak(byDay, today);
    // The streak reaches past the loaded range: count it on the whole log.
    if (streak >= ACTIVITY_DAYS) {
      byDay = countByDay((await db.answers.orderBy('answeredAt').keys()) as string[]);
      streak = studyStreak(byDay, today);
    }
    return { byDay, today, answersToday: byDay.get(today) ?? 0, streak };
  },
};
