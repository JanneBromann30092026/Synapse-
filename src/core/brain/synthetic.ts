import { MASTERY_LEVELS, type MasteryLevel } from '../mastery';
import type { RandomSource } from '../session/shuffle';
import { PROJECT_COLORS } from '@/data/types';
import type { GraphInput, GraphInputCard, GraphInputEdge } from './graph';

/** Sizes offered in developer mode (performance targets of the brain). */
export const SYNTHETIC_SIZES = [
  { nodes: 2000, edges: 6000 },
  { nodes: 3000, edges: 10000 },
] as const;

/** Share of synthetic links that connect two projects. */
const CROSS_SHARE = 0.12;
/** Mastery levels in roughly the proportions of a real learning history. */
const LEVEL_WEIGHTS: Record<MasteryLevel, number> = {
  new: 0.25,
  weak: 0.2,
  building: 0.3,
  solid: 0.25,
};

function pickLevel(random: RandomSource): MasteryLevel {
  let r = random();
  for (const level of MASTERY_LEVELS) {
    r -= LEVEL_WEIGHTS[level];
    if (r < 0) return level;
  }
  return 'solid';
}

/**
 * Synthetic brain data for performance tests (never stored): `nodes` cards in up to 8
 * projects and `edges` semantic links. Most links connect cards that are close in their
 * project's order, which gives clusters with sub-structure like real embeddings.
 */
export function syntheticGraph(
  size: { nodes: number; edges: number },
  random: RandomSource,
  projectCount = 8,
): GraphInput {
  const projects = Array.from({ length: projectCount }, (_, index) => ({
    id: `synthetic-project-${index}`,
    name: `Projekt ${index + 1}`,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length] ?? 'indigo',
  }));
  const byProject: GraphInputCard[][] = projects.map(() => []);
  const cards: GraphInputCard[] = [];
  for (let index = 0; index < size.nodes; index++) {
    const projectIndex = index % projectCount;
    const card: GraphInputCard = {
      id: `synthetic-card-${index}`,
      projectId: (projects[projectIndex] as { id: string }).id,
      front: `Karte ${index + 1}`,
      mastery: { level: pickLevel(random) },
    };
    cards.push(card);
    byProject[projectIndex]?.push(card);
  }

  const edges: GraphInputEdge[] = [];
  const seen = new Set<string>();
  const maxEdges = Math.min(size.edges, (size.nodes * (size.nodes - 1)) / 2);
  let attempts = 0;
  while (edges.length < maxEdges && attempts < maxEdges * 20) {
    attempts += 1;
    let a: GraphInputCard | undefined;
    let b: GraphInputCard | undefined;
    if (random() < CROSS_SHARE) {
      a = cards[Math.floor(random() * cards.length)];
      b = cards[Math.floor(random() * cards.length)];
      if (a?.projectId === b?.projectId) continue;
    } else {
      const list = byProject[Math.floor(random() * projectCount)] ?? [];
      const i = Math.floor(random() * list.length);
      const offset = 1 + Math.floor(random() * random() * 24);
      a = list[i];
      b = list[(i + offset) % Math.max(1, list.length)];
    }
    if (!a || !b || a === b) continue;
    const [sourceId, targetId] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const key = `${sourceId}|${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: `synthetic-link-${edges.length}`,
      sourceId,
      targetId,
      kind: 'semantic',
      weight: 0.55 + random() * 0.4,
    });
  }
  return { projects, cards, edges };
}
