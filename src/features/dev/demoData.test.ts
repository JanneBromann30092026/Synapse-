import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeCardText } from '@/core/cards';
import { resetDb } from '@/data/__tests__/testDb';
import { cardsRepo, projectsRepo } from '@/data/repositories';
import { DEMO_PROJECTS, loadDemoData } from './demoData';

beforeEach(resetDb);

describe('demo data', () => {
  it('has about 30 cards per project without duplicate front sides', () => {
    for (const project of DEMO_PROJECTS) {
      expect(project.cards.length).toBeGreaterThanOrEqual(28);
      const fronts = project.cards.map((card) => normalizeCardText(card.front));
      expect(new Set(fronts).size).toBe(fronts.length);
    }
  });

  it('contains overlapping terms between BWL and stocks', () => {
    const fronts = (name: string) =>
      new Set(DEMO_PROJECTS.find((p) => p.name === name)?.cards.map((c) => c.front));
    const bwl = fronts('BWL-Grundbegriffe');
    const overlap = [...fronts('Aktien & Börse')].filter((front) => bwl.has(front));
    expect(overlap.length).toBeGreaterThanOrEqual(3);
  });

  it('loads idempotently', async () => {
    const first = await loadDemoData();
    expect(first.projects).toBe(3);
    const second = await loadDemoData();
    expect(second).toEqual({ projects: 0, cards: 0 });

    const projects = await projectsRepo.list();
    expect(projects).toHaveLength(3);
    for (const project of projects) {
      expect(await cardsRepo.countByProject(project.id)).toBe(project.cardCount);
    }
    expect(projects.reduce((sum, p) => sum + p.cardCount, 0)).toBe(first.cards);
  });
});
