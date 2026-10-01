import { describe, expect, it } from 'vitest';
import { seededRandom } from '../session';
import { summarizeFrames, FrameRecorder } from './frames';
import {
  buildGraph,
  cardRadius,
  curvePoint,
  fitTransform,
  freeze,
  graphBounds,
  hubRadius,
  idFraction,
  nodeAt,
  seedLayout,
  unfreeze,
  type BrainNode,
  type GraphInput,
} from './graph';
import { placeLabels, priorityCutoff, truncateLabel, LABEL_MIN_ZOOM } from './labels';
import { syntheticGraph } from './synthetic';

const input: GraphInput = {
  projects: [
    { id: 'p1', name: 'Japanisch', color: 'rose' },
    { id: 'p2', name: 'BWL', color: 'sky' },
  ],
  cards: [
    { id: 'a', projectId: 'p1', front: 'Hund', mastery: { level: 'solid' } },
    { id: 'b', projectId: 'p1', front: 'Katze', mastery: { level: 'new' } },
    { id: 'c', projectId: 'p2', front: 'Cashflow', mastery: { level: 'weak' } },
    { id: 'x', projectId: 'gone', front: 'Archiviert', mastery: { level: 'new' } },
  ],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b', kind: 'semantic', weight: 0.8 },
    { id: 'e2', sourceId: 'a', targetId: 'c', kind: 'semantic', weight: 0.6 },
    { id: 'e3', sourceId: 'b', targetId: 'x', kind: 'semantic', weight: 0.9 },
    { id: 'e4', sourceId: 'b', targetId: 'c', kind: 'manual', weight: 1 },
  ],
};

const build = (options: Partial<Parameters<typeof buildGraph>[1]> = {}) =>
  buildGraph(input, {
    positions: new Map(),
    previous: new Map(),
    random: seededRandom(1),
    now: 1000,
    ...options,
  });

const byId = (nodes: BrainNode[]) => new Map(nodes.map((node) => [node.id, node]));

describe('buildGraph', () => {
  it('creates hubs, cards, hub links and the links between known cards', () => {
    const graph = build();
    expect(graph.nodes.map((node) => node.id)).toEqual(['p1', 'p2', 'a', 'b', 'c']);
    const nodes = byId(graph.nodes);
    expect(nodes.get('p1')).toMatchObject({ kind: 'hub', label: 'Japanisch', degree: 2 });
    expect(nodes.get('a')).toMatchObject({
      kind: 'card',
      color: 'rose',
      degree: 2,
      level: 'solid',
    });
    expect(nodes.get('b')?.degree).toBe(2);
    expect(nodes.get('a')?.radius).toBe(cardRadius(2));
    expect(nodes.get('p1')?.radius).toBe(hubRadius(2));

    const links = graph.links.map((link) => [link.id, link.kind, link.cross]);
    expect(links).toEqual([
      ['hub:a', 'hub', false],
      ['hub:b', 'hub', false],
      ['hub:c', 'hub', false],
      ['e1', 'semantic', false],
      ['e2', 'semantic', true],
      ['e4', 'manual', true],
    ]);
    const e1 = graph.links.find((link) => link.id === 'e1');
    expect(e1?.a).toBe(nodes.get('a'));
    expect(e1?.b).toBe(nodes.get('b'));
  });

  it('seeds new nodes free around their hub and fades nothing in on the first build', () => {
    const graph = build();
    expect(graph.free).toBe(5);
    for (const node of graph.nodes) {
      expect(node.fx).toBeUndefined();
      expect(Number.isFinite(node.x)).toBe(true);
      expect(node.bornAt).toBe(0);
    }
  });

  it('pins stored positions', () => {
    const graph = build({
      positions: new Map([
        ['p1', { x: 10, y: 20 }],
        ['a', { x: 30, y: 40 }],
      ]),
    });
    const nodes = byId(graph.nodes);
    expect(nodes.get('a')).toMatchObject({ x: 30, y: 40, fx: 30, fy: 40 });
    expect(nodes.get('p1')).toMatchObject({ fx: 10, fy: 20 });
    expect(graph.free).toBe(3);
  });

  it('reuses previous nodes and places new cards next to a positioned neighbor', () => {
    const first = build();
    freeze(first.nodes);
    const previous = byId(first.nodes);
    const next = buildGraph(
      {
        ...input,
        cards: [
          ...input.cards,
          { id: 'd', projectId: 'p2', front: 'Bilanz', mastery: { level: 'new' } },
        ],
        edges: [
          ...input.edges,
          { id: 'e5', sourceId: 'c', targetId: 'd', kind: 'semantic', weight: 0.9 },
        ],
      },
      { positions: new Map(), previous, random: seededRandom(2), now: 5000 },
    );
    const nodes = byId(next.nodes);
    expect(nodes.get('a')).toBe(previous.get('a'));
    expect(nodes.get('c')?.degree).toBe(3);
    expect(next.free).toBe(1);
    const d = nodes.get('d') as BrainNode;
    const c = nodes.get('c') as BrainNode;
    expect(d.fx).toBeUndefined();
    expect(d.bornAt).toBe(5000);
    expect(Math.hypot((d.x ?? 0) - (c.x ?? 0), (d.y ?? 0) - (c.y ?? 0))).toBeLessThanOrEqual(18);
  });

  it('seedLayout frees everything; freeze and unfreeze pin and release', () => {
    const graph = build();
    freeze(graph.nodes);
    expect(graph.nodes.every((node) => node.fx === node.x)).toBe(true);
    unfreeze(graph.nodes);
    expect(graph.nodes.every((node) => node.fx === undefined)).toBe(true);
    freeze(graph.nodes);
    seedLayout(graph, seededRandom(3));
    expect(graph.nodes.every((node) => node.fx === undefined && Number.isFinite(node.x))).toBe(
      true,
    );
  });
});

describe('geometry', () => {
  const nodes = [
    { id: 'n1', x: 0, y: 0, radius: 5 },
    { id: 'n2', x: 100, y: 50, radius: 10 },
  ] as BrainNode[];

  it('computes bounds including radii', () => {
    expect(graphBounds(nodes)).toEqual({ x0: -5, y0: -5, x1: 110, y1: 60 });
    expect(graphBounds([])).toBeNull();
  });

  it('fits into the free area and shifts the center for uneven paddings', () => {
    const fit = fitTransform(
      { x0: 0, y0: 0, x1: 100, y1: 100 },
      { width: 300, height: 400, padding: { top: 100, right: 0, bottom: 0, left: 0 } },
      { min: 0.1, max: 8 },
    );
    expect(fit.k).toBe(3);
    expect(fit.center.x).toBe(50);
    expect(fit.center.y).toBeCloseTo(50 - 50 / 3);
    const capped = fitTransform(
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      { width: 300, height: 300, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      { min: 0.1, max: 4 },
    );
    expect(capped.k).toBe(4);
  });

  it('finds the node under a point with tolerance', () => {
    expect(nodeAt(nodes, { x: 3, y: 0 }, 0)?.id).toBe('n1');
    expect(nodeAt(nodes, { x: 112, y: 50 }, 0)).toBeNull();
    expect(nodeAt(nodes, { x: 112, y: 50 }, 3)?.id).toBe('n2');
  });

  it('spreads hub distances deterministically per card', () => {
    expect(idFraction('abc')).toBe(idFraction('abc'));
    const values = Array.from({ length: 200 }, (_, i) => idFraction(`card-${i}`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.8);
  });

  it('curves start and end at the nodes', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    expect(curvePoint(a, b, 0.2, 0)).toEqual(a);
    expect(curvePoint(a, b, 0.2, 1)).toEqual(b);
    expect(curvePoint(a, b, 0.2, 0.5).y).toBeCloseTo(10);
  });
});

describe('labels', () => {
  it('truncates long fronts', () => {
    expect(truncateLabel('  Kurz  ')).toBe('Kurz');
    expect(truncateLabel('Eigenkapitalrentabilität der Unternehmung', 12)).toBe('Eigenkapita…');
  });

  it('labels nothing below the zoom threshold', () => {
    const candidate = { id: 'a', x: 0, y: 0, radius: 4, width: 50, height: 18, priority: 1 };
    expect(placeLabels([candidate], { zoom: LABEL_MIN_ZOOM - 0.1 })).toEqual([]);
    expect(placeLabels([candidate], { zoom: LABEL_MIN_ZOOM })).toHaveLength(1);
  });

  it('places by priority and skips overlapping labels', () => {
    const boxes = placeLabels(
      [
        { id: 'low', x: 10, y: 0, radius: 4, width: 60, height: 18, priority: 1 },
        { id: 'high', x: 0, y: 0, radius: 4, width: 60, height: 18, priority: 5 },
        { id: 'far', x: 300, y: 0, radius: 4, width: 60, height: 18, priority: 0 },
      ],
      { zoom: 2 },
    );
    expect(boxes.map((box) => box.id)).toEqual(['high', 'far']);
    expect(boxes[0]).toMatchObject({ x: -30, y: 8, width: 60 });
    const reserved = [{ id: 'hub', x: 280, y: 0, width: 80, height: 30 }];
    expect(
      placeLabels([{ id: 'far', x: 300, y: 0, radius: 4, width: 60, height: 18, priority: 0 }], {
        zoom: 2,
        reserved,
      }),
    ).toEqual([]);
  });

  it('only labels the better connected half when dense', () => {
    expect(priorityCutoff([1, 2, 3])).toBe(-Infinity);
    const many = Array.from({ length: 200 }, (_, i) => i % 10);
    expect(priorityCutoff(many)).toBe(5);
  });
});

describe('syntheticGraph', () => {
  it('creates the requested size with unique links and some cross-project links', () => {
    const data = syntheticGraph({ nodes: 2000, edges: 6000 }, seededRandom(7));
    expect(data.cards).toHaveLength(2000);
    expect(data.edges).toHaveLength(6000);
    expect(new Set(data.edges.map((edge) => `${edge.sourceId}|${edge.targetId}`)).size).toBe(6000);
    const project = new Map(data.cards.map((card) => [card.id, card.projectId]));
    const cross = data.edges.filter(
      (edge) => project.get(edge.sourceId) !== project.get(edge.targetId),
    );
    expect(cross.length).toBeGreaterThan(300);
    expect(cross.length).toBeLessThan(1500);
    const graph = buildGraph(data, {
      positions: new Map(),
      previous: new Map(),
      random: seededRandom(1),
      now: 0,
    });
    expect(graph.links).toHaveLength(2000 + 6000);
  });
});

describe('frames', () => {
  it('summarizes durations and keeps the latest values', () => {
    expect(summarizeFrames([4, 1, 3, 2])).toEqual({ count: 4, mean: 2.5, p50: 2, p95: 4, max: 4 });
    expect(summarizeFrames([]).count).toBe(0);
    const recorder = new FrameRecorder(2);
    recorder.push(1);
    recorder.push(2);
    recorder.push(3);
    expect(recorder.list()).toEqual([2, 3]);
  });
});
