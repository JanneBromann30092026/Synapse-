import type { MasteryLevel } from '../mastery';
import type { RandomSource } from '../session/shuffle';
import type { LinkKind, ProjectColor } from '@/data/types';

/**
 * Graph model of the brain visualization: project hubs and card nodes, their links and the
 * forces of the layout. Pure (no canvas, no React); node objects are reused between updates
 * so the force simulation keeps their positions.
 */

export interface GraphInputProject {
  id: string;
  name: string;
  color: ProjectColor;
}

export interface GraphInputCard {
  id: string;
  projectId: string;
  front: string;
  mastery: { level: MasteryLevel };
}

export interface GraphInputEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: LinkKind;
  weight: number;
}

export interface GraphInput {
  projects: readonly GraphInputProject[];
  cards: readonly GraphInputCard[];
  edges: readonly GraphInputEdge[];
}

export interface BrainNode {
  id: string;
  kind: 'hub' | 'card';
  projectId: string;
  color: ProjectColor;
  /** Hub: project name, card: front side. */
  label: string;
  /** Card: semantic + manual links; hub: number of cards. */
  degree: number;
  /** Hubs count as 'solid' (always bright). */
  level: MasteryLevel;
  /** Radius in graph units. */
  radius: number;
  /** performance.now() when the node appeared (fade in); 0 = visible from the start. */
  bornAt: number;
  // Written by d3-force.
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export type BrainLinkKind = 'hub' | LinkKind;

export interface BrainLink {
  id: string;
  /** Node ids on input; d3-force replaces them with the node objects. */
  source: string | BrainNode;
  target: string | BrainNode;
  /** The same nodes, resolved once (the renderer never looks them up). */
  a: BrainNode;
  b: BrainNode;
  kind: BrainLinkKind;
  /** Similarity 0..1 (hub links: 1). */
  weight: number;
  /** Semantic/manual link between cards of different projects. */
  cross: boolean;
}

export interface BrainGraph {
  nodes: BrainNode[];
  links: BrainLink[];
}

export interface Point {
  x: number;
  y: number;
}

/** Card radius grows slightly with the number of links. */
export function cardRadius(degree: number): number {
  return 3 + Math.min(4, Math.sqrt(degree) * 1.2);
}

export function hubRadius(cardCount: number): number {
  return 10 + Math.min(10, Math.sqrt(cardCount) * 1.3);
}

/** Brightness of a node by mastery: core opacity and glow strength (0..1). */
export const MASTERY_STYLE: Record<MasteryLevel, { core: number; glow: number }> = {
  new: { core: 0.38, glow: 0 },
  weak: { core: 0.6, glow: 0.18 },
  building: { core: 0.82, glow: 0.45 },
  solid: { core: 1, glow: 0.95 },
};

/** Radius of the disc in which the cards of a project are seeded around their hub. */
export function clusterSpread(cardCount: number): number {
  return 14 + 12 * Math.sqrt(cardCount);
}

/** Hub positions on a circle that leaves room for every cluster. */
export function hubRing(projectCount: number, maxCardCount: number): number {
  if (projectCount <= 1) return 0;
  return (clusterSpread(maxCardCount) * 1.35) / Math.sin(Math.PI / projectCount);
}

export function hubSeed(index: number, count: number, ring: number): Point {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count);
  return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
}

/** Random point in a disc (uniform by area). */
export function pointInDisc(center: Point, radius: number, random: RandomSource): Point {
  const angle = random() * 2 * Math.PI;
  const distance = Math.sqrt(random()) * radius;
  return { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance };
}

function positionOf(node: BrainNode | undefined): Point | null {
  return node && node.x !== undefined && node.y !== undefined ? { x: node.x, y: node.y } : null;
}

function pin(node: BrainNode, point: Point): void {
  node.x = point.x;
  node.y = point.y;
  node.fx = point.x;
  node.fy = point.y;
  node.vx = 0;
  node.vy = 0;
}

function place(node: BrainNode, point: Point): void {
  node.x = point.x;
  node.y = point.y;
  node.fx = undefined;
  node.fy = undefined;
  node.vx = 0;
  node.vy = 0;
}

function addTo(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export interface BuildOptions {
  /** Stored positions (graphPositions) by node id. */
  positions: ReadonlyMap<string, Point>;
  /** Nodes of the previous build: reused (keeps position and pin). */
  previous: ReadonlyMap<string, BrainNode>;
  random: RandomSource;
  /** performance.now(); new nodes get it as bornAt when a previous graph existed. */
  now: number;
}

export interface BuildResult extends BrainGraph {
  /** Nodes without a position yet (the simulation has to place them). */
  free: number;
}

/**
 * Builds the graph: reuses previous nodes, places stored positions pinned and seeds new
 * nodes near a positioned neighbor or their hub (free, so the simulation settles them).
 */
export function buildGraph(input: GraphInput, options: BuildOptions): BuildResult {
  const { positions, previous, random, now } = options;
  const fadeIn = previous.size > 0;
  const projectIds = new Set(input.projects.map((project) => project.id));
  const cards = input.cards.filter((card) => projectIds.has(card.projectId));
  const cardIds = new Set(cards.map((card) => card.id));
  const edges = input.edges.filter(
    (edge) =>
      edge.sourceId !== edge.targetId && cardIds.has(edge.sourceId) && cardIds.has(edge.targetId),
  );

  const degree = new Map<string, number>();
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
    degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    addTo(neighbors, edge.sourceId, edge.targetId);
    addTo(neighbors, edge.targetId, edge.sourceId);
  }
  const cardsPerProject = new Map<string, number>();
  for (const card of cards) {
    cardsPerProject.set(card.projectId, (cardsPerProject.get(card.projectId) ?? 0) + 1);
  }

  let free = 0;
  const reuse = (id: string, create: () => BrainNode): BrainNode => {
    const old = previous.get(id);
    const fresh = create();
    if (!old) return fresh;
    // Keep identity and simulation state, refresh the descriptive fields.
    old.kind = fresh.kind;
    old.projectId = fresh.projectId;
    old.color = fresh.color;
    old.label = fresh.label;
    old.degree = fresh.degree;
    old.level = fresh.level;
    old.radius = fresh.radius;
    return old;
  };

  const ring = hubRing(input.projects.length, Math.max(0, ...cardsPerProject.values()));
  const hubs = new Map<string, BrainNode>();
  input.projects.forEach((project, index) => {
    const count = cardsPerProject.get(project.id) ?? 0;
    const hub = reuse(project.id, () => ({
      id: project.id,
      kind: 'hub',
      projectId: project.id,
      color: project.color,
      label: project.name,
      degree: count,
      level: 'solid',
      radius: hubRadius(count),
      bornAt: fadeIn ? now : 0,
    }));
    if (!previous.has(project.id)) {
      const stored = positions.get(project.id);
      if (stored) {
        pin(hub, stored);
      } else {
        place(hub, hubSeed(index, input.projects.length, ring));
        free += 1;
      }
    } else if (hub.fx === undefined) {
      free += 1;
    }
    hubs.set(project.id, hub);
  });

  const nodes: BrainNode[] = [...hubs.values()];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pending = new Set<BrainNode>();
  for (const card of cards) {
    const node = reuse(card.id, () => ({
      id: card.id,
      kind: 'card',
      projectId: card.projectId,
      color: (hubs.get(card.projectId) as BrainNode).color,
      label: card.front,
      degree: degree.get(card.id) ?? 0,
      level: card.mastery.level,
      radius: cardRadius(degree.get(card.id) ?? 0),
      bornAt: fadeIn ? now : 0,
    }));
    if (!previous.has(card.id)) {
      const stored = positions.get(card.id);
      if (stored) pin(node, stored);
      else pending.add(node);
    } else if (node.fx === undefined) {
      free += 1;
    }
    nodes.push(node);
    byId.set(node.id, node);
  }

  // New cards: next to an already positioned neighbor, otherwise around their hub.
  for (const node of pending) {
    const neighbor = (neighbors.get(node.id) ?? [])
      .map((id) => byId.get(id))
      .find((other) => other !== undefined && other !== node && !pending.has(other));
    const anchor = positionOf(neighbor);
    const hub = hubs.get(node.projectId) as BrainNode;
    const point = anchor
      ? pointInDisc(anchor, 18, random)
      : pointInDisc(positionOf(hub) ?? { x: 0, y: 0 }, clusterSpread(hub.degree), random);
    place(node, point);
    free += 1;
  }

  const links: BrainLink[] = [];
  for (const node of nodes) {
    if (node.kind !== 'card') continue;
    const hub = hubs.get(node.projectId) as BrainNode;
    links.push({
      id: `hub:${node.id}`,
      source: node.id,
      target: hub.id,
      a: node,
      b: hub,
      kind: 'hub',
      weight: 1,
      cross: false,
    });
  }
  for (const edge of edges) {
    const a = byId.get(edge.sourceId) as BrainNode;
    const b = byId.get(edge.targetId) as BrainNode;
    links.push({
      id: edge.id,
      source: a.id,
      target: b.id,
      a,
      b,
      kind: edge.kind,
      weight: edge.weight,
      cross: a.projectId !== b.projectId,
    });
  }

  return { nodes, links, free };
}

/** Seeds a fresh layout ("Neu anordnen"): hubs on a ring, cards around their hub, all free. */
export function seedLayout(graph: BrainGraph, random: RandomSource): void {
  const hubs = graph.nodes.filter((node) => node.kind === 'hub');
  const ring = hubRing(hubs.length, Math.max(0, ...hubs.map((hub) => hub.degree)));
  const hubById = new Map<string, BrainNode>();
  hubs.forEach((hub, index) => {
    place(hub, hubSeed(index, hubs.length, ring));
    hubById.set(hub.id, hub);
  });
  for (const node of graph.nodes) {
    if (node.kind !== 'card') continue;
    const hub = hubById.get(node.projectId);
    const center = positionOf(hub) ?? { x: 0, y: 0 };
    place(node, pointInDisc(center, clusterSpread(hub?.degree ?? 1), random));
  }
}

/** Fixes every node at its current position (layout frozen after settling). */
export function freeze(nodes: readonly BrainNode[]): void {
  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    pin(node, { x: node.x, y: node.y });
  }
}

/** Releases all pins so the simulation can relax the layout from the current positions. */
export function unfreeze(nodes: readonly BrainNode[]): void {
  for (const node of nodes) {
    node.fx = undefined;
    node.fy = undefined;
  }
}

// Forces (d3-force accessors). Distances in graph units.

/** Stable pseudo-random 0..1 per id (FNV-1a + fmix32), so a layout does not depend on load order. */
export function idFraction(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Final avalanche (murmur3 fmix32): similar ids still spread over the whole range.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function linkDistance(link: BrainLink): number {
  // Varying distances to the hub: a cloud instead of a ring of equally spaced cards.
  if (link.kind === 'hub')
    return (16 + Math.sqrt(link.b.degree) * 6) * (0.35 + idFraction(link.a.id));
  if (link.cross) return 70;
  return 18 + (1 - link.weight) * 40;
}

export function linkStrength(link: BrainLink): number {
  if (link.kind === 'hub') return 0.12;
  if (link.kind === 'manual') return 0.2;
  if (link.cross) return 0.015 + link.weight * 0.03;
  return 0.08 + link.weight * 0.25;
}

export function chargeStrength(node: BrainNode): number {
  return node.kind === 'hub' ? -140 : -18;
}

/** Bounding box of nodes including their radius, or null without positioned nodes. */
export function graphBounds(
  nodes: readonly BrainNode[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    x0 = Math.min(x0, node.x - node.radius);
    y0 = Math.min(y0, node.y - node.radius);
    x1 = Math.max(x1, node.x + node.radius);
    y1 = Math.max(y1, node.y + node.radius);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

export interface Viewport {
  width: number;
  height: number;
  /** Space kept free at the edges (controls, safe areas). */
  padding: { top: number; right: number; bottom: number; left: number };
}

/** Zoom and center that fit the bounds into the free part of the viewport. */
export function fitTransform(
  bounds: { x0: number; y0: number; x1: number; y1: number },
  viewport: Viewport,
  zoomRange: { min: number; max: number },
): { k: number; center: Point } {
  const { padding } = viewport;
  const width = Math.max(1, viewport.width - padding.left - padding.right);
  const height = Math.max(1, viewport.height - padding.top - padding.bottom);
  const k = Math.min(
    zoomRange.max,
    Math.max(
      zoomRange.min,
      Math.min(
        width / Math.max(1, bounds.x1 - bounds.x0),
        height / Math.max(1, bounds.y1 - bounds.y0),
      ),
    ),
  );
  // The free area is off-center when the paddings differ: shift the center accordingly.
  const cx = (bounds.x0 + bounds.x1) / 2 - (padding.left - padding.right) / 2 / k;
  const cy = (bounds.y0 + bounds.y1) / 2 - (padding.top - padding.bottom) / 2 / k;
  return { k, center: { x: cx, y: cy } };
}

/** Nearest node whose disc (plus tolerance) contains the point, preferring cards over hubs. */
export function nodeAt(
  nodes: readonly BrainNode[],
  point: Point,
  tolerance: number,
): BrainNode | null {
  let best: BrainNode | null = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    const distance = Math.hypot(node.x - point.x, node.y - point.y) - node.radius;
    if (distance <= tolerance && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/** Point on the quadratic curve of a cross-project link (t = 0..1). */
export function curvePoint(a: Point, b: Point, curvature: number, t: number): Point {
  const control = curveControl(a, b, curvature);
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

/** Control point: the midpoint pushed sideways by curvature × length. */
export function curveControl(a: Point, b: Point, curvature: number): Point {
  return {
    x: (a.x + b.x) / 2 - (b.y - a.y) * curvature,
    y: (a.y + b.y) / 2 + (b.x - a.x) * curvature,
  };
}
