import { describe, expect, it } from 'vitest';
import { seededRandom } from '../session';
import { buildGraph, type BrainGraph, type GraphInput } from './graph';
import {
  activeFilterCount,
  buildAdjacency,
  DEFAULT_BRAIN_FILTER,
  distanceToCurve,
  distanceToSegment,
  filterGraph,
  focusCenter,
  hubNeighborhood,
  hubSummary,
  linkAt,
  neighborhood,
  neighborhoodStudyCards,
  neighborInDirection,
  searchCards,
} from './interaction';

const input: GraphInput = {
  projects: [
    { id: 'p1', name: 'Japanisch', color: 'rose' },
    { id: 'p2', name: 'BWL', color: 'sky' },
  ],
  cards: [
    { id: 'a', projectId: 'p1', front: 'Hund', mastery: { level: 'solid' } },
    { id: 'b', projectId: 'p1', front: 'Katze', mastery: { level: 'new' } },
    { id: 'c', projectId: 'p2', front: 'Cashflow', mastery: { level: 'weak' } },
    { id: 'd', projectId: 'p2', front: 'Eigenkapital', mastery: { level: 'building' } },
  ],
  edges: [
    { id: 'ab', sourceId: 'a', targetId: 'b', kind: 'semantic', weight: 0.8 },
    { id: 'ac', sourceId: 'a', targetId: 'c', kind: 'semantic', weight: 0.6 },
    { id: 'bc', sourceId: 'b', targetId: 'c', kind: 'manual', weight: 1 },
    { id: 'cd', sourceId: 'c', targetId: 'd', kind: 'semantic', weight: 0.9 },
  ],
};

function graph(): BrainGraph {
  const result = buildGraph(input, {
    positions: new Map(),
    previous: new Map(),
    random: seededRandom(3),
    now: 0,
  });
  const at: Record<string, [number, number]> = {
    p1: [-100, 0],
    p2: [100, 0],
    a: [0, 0],
    b: [0, 100],
    c: [100, 100],
    d: [200, 0],
  };
  for (const node of result.nodes) {
    const [x, y] = at[node.id] ?? [0, 0];
    node.x = x;
    node.y = y;
  }
  return result;
}

describe('neighborhood', () => {
  it('lists semantic and manual neighbors, strongest first', () => {
    const adjacency = buildAdjacency(graph().links);
    expect(adjacency.get('a')?.map((n) => n.node.id)).toEqual(['b', 'c']);
    expect(adjacency.get('c')?.map((n) => n.node.id)).toEqual(['b', 'd', 'a']);
    expect(adjacency.has('p1')).toBe(false);
  });

  it('contains the node, its neighbors and the connecting links', () => {
    const adjacency = buildAdjacency(graph().links);
    const focus = neighborhood(adjacency, 'a');
    expect([...focus.nodeIds].sort()).toEqual(['a', 'b', 'c']);
    expect([...focus.linkIds].sort()).toEqual(['ab', 'ac']);
    expect([...neighborhood(adjacency, 'missing').nodeIds]).toEqual(['missing']);
  });

  it('hub focus covers the project cards and their links', () => {
    const focus = hubNeighborhood(graph(), 'p2');
    expect([...focus.nodeIds].sort()).toEqual(['c', 'd', 'p2']);
    expect(focus.linkIds.has('cd')).toBe(true);
    expect(focus.linkIds.has('ac')).toBe(false);
  });
});

describe('neighborhoodStudyCards', () => {
  it('starts with the card, then neighbors by similarity, across projects', () => {
    const adjacency = buildAdjacency(graph().links);
    expect(neighborhoodStudyCards(adjacency, 'c')).toEqual(['c', 'b', 'd', 'a']);
    expect(neighborhoodStudyCards(adjacency, 'c', 2)).toEqual(['c', 'b']);
    expect(neighborhoodStudyCards(adjacency, 'lonely')).toEqual(['lonely']);
  });
});

describe('filter', () => {
  it('default shows everything', () => {
    const g = graph();
    const visible = filterGraph(g, DEFAULT_BRAIN_FILTER);
    expect(visible.nodes).toHaveLength(g.nodes.length);
    expect(visible.links).toHaveLength(g.links.length);
    expect(activeFilterCount(DEFAULT_BRAIN_FILTER)).toBe(0);
  });

  it('hides projects with their hub, cards and links', () => {
    const filter = { ...DEFAULT_BRAIN_FILTER, hiddenProjects: ['p1'] };
    const visible = filterGraph(graph(), filter);
    expect(visible.nodes.map((n) => n.id).sort()).toEqual(['c', 'd', 'p2']);
    expect(visible.links.map((l) => l.id).sort()).toEqual(['cd', 'hub:c', 'hub:d']);
    expect(activeFilterCount(filter)).toBe(1);
  });

  it('cross only keeps cross-project and hub links', () => {
    const visible = filterGraph(graph(), { ...DEFAULT_BRAIN_FILTER, crossOnly: true });
    const ids = visible.links.map((l) => l.id);
    expect(ids).toContain('ac');
    expect(ids).toContain('bc');
    expect(ids).not.toContain('ab');
    expect(ids).not.toContain('cd');
    expect(ids).toContain('hub:a');
  });

  it('minimum similarity hides weak semantic links, never manual ones', () => {
    const visible = filterGraph(graph(), { ...DEFAULT_BRAIN_FILTER, minSimilarity: 0.85 });
    const ids = visible.links.filter((l) => l.kind !== 'hub').map((l) => l.id);
    expect(ids.sort()).toEqual(['bc', 'cd']);
  });

  it('mastery levels and "Ungelernte ausblenden" hide cards', () => {
    const unlearned = filterGraph(graph(), { ...DEFAULT_BRAIN_FILTER, hideUnlearned: true });
    expect(unlearned.nodes.map((n) => n.id)).not.toContain('b');
    expect(unlearned.links.map((l) => l.id)).not.toContain('ab');
    const solidOnly = filterGraph(graph(), { ...DEFAULT_BRAIN_FILTER, levels: ['solid'] });
    expect(solidOnly.nodes.map((n) => n.id).sort()).toEqual(['a', 'p1', 'p2']);
  });
});

describe('link hit test', () => {
  it('distance to segments and curves', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    // Curvature 0.25 on a horizontal link of length 100 bulges 12.5 to the side (y + 12.5).
    expect(
      distanceToCurve({ x: 50, y: 12.5 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 0.25),
    ).toBeLessThan(0.5);
  });

  it('finds the nearest link within the tolerance, ignores hub threads', () => {
    const g = graph();
    // Between a (0,0) and b (0,100).
    expect(linkAt(g.links, { x: 3, y: 50 }, 8, 0)?.id).toBe('ab');
    expect(linkAt(g.links, { x: 30, y: 50 }, 8, 0)).toBeNull();
    // Hub thread p1 (-100,0) – a (0,0): not hit.
    expect(linkAt(g.links, { x: -50, y: 1 }, 8, 0)).toBeNull();
    // Cross link a–c is curved: its midpoint lies curvature × length / 2 to the side.
    const curvature = 0.16;
    expect(linkAt(g.links, { x: 50, y: 50 }, 4, curvature)?.id).not.toBe('ac');
    expect(
      linkAt(g.links, { x: 50 - 50 * curvature, y: 50 + 50 * curvature }, 4, curvature)?.id,
    ).toBe('ac');
  });
});

describe('search', () => {
  const cards = [
    { id: '1', front: 'Eigenkapitalquote', back: 'EK / GK' },
    { id: '2', front: 'Rendite auf Eigenkapital', back: 'ROE' },
    { id: '3', front: 'Cashflow', back: 'Zufluss liquider Mittel, auch vom Eigenkapital' },
    { id: '4', front: 'Hund', back: 'いぬ' },
  ];

  it('ranks front prefix, word start, back matches', () => {
    expect(searchCards(cards, 'eigenkapital').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(searchCards(cards, '  ').map((c) => c.id)).toEqual([]);
    expect(searchCards(cards, 'いぬ').map((c) => c.id)).toEqual(['4']);
    expect(searchCards(cards, 'eigenkapital', 1)).toHaveLength(1);
  });
});

describe('keyboard navigation', () => {
  const candidates = [
    { id: 'right', x: 100, y: 10 },
    { id: 'far-right', x: 300, y: 0 },
    { id: 'down', x: 0, y: 80 },
  ];
  it('picks the neighbor in the direction of the arrow key', () => {
    expect(neighborInDirection({ x: 0, y: 0 }, candidates, 'right')).toBe('right');
    expect(neighborInDirection({ x: 0, y: 0 }, candidates, 'down')).toBe('down');
    expect(neighborInDirection({ x: 0, y: 0 }, candidates, 'left')).toBeNull();
    expect(neighborInDirection({ x: 0, y: 0 }, candidates, 'up')).toBeNull();
  });
});

describe('hub summary and camera', () => {
  it('counts cards, levels and cross-project partners', () => {
    const summary = hubSummary(graph(), 'p2');
    expect(summary.cards).toBe(2);
    expect(summary.levels).toEqual({ new: 0, weak: 1, building: 1, solid: 0 });
    expect(summary.crossTotal).toBe(2);
    expect(summary.crossByProject).toEqual([{ projectId: 'p1', count: 2 }]);
  });

  it('shifts the center when a panel covers one side', () => {
    expect(focusCenter({ x: 10, y: 20 }, { top: 0, right: 400, bottom: 0, left: 0 }, 2)).toEqual({
      x: 110,
      y: 20,
    });
  });
});
