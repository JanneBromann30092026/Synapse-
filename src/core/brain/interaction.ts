import { normalizeCardText } from '../cards';
import {
  countLevels,
  emptyMasteryCounts,
  MASTERY_LEVELS,
  type MasteryCounts,
  type MasteryLevel,
} from '../mastery';
import {
  curvePoint,
  type BrainGraph,
  type BrainLink,
  type BrainNode,
  type Point,
  type Viewport,
} from './graph';

/**
 * Interaction logic of the brain (pure): neighborhoods for the focus mode, filters, hit tests
 * for links, search, keyboard navigation and project summaries.
 */

// Neighborhood -----------------------------------------------------------------------------

export interface Neighbor {
  node: BrainNode;
  link: BrainLink;
}

/** Semantic and manual neighbors of every card, strongest link first (hub links excluded). */
export function buildAdjacency(links: readonly BrainLink[]): Map<string, Neighbor[]> {
  const adjacency = new Map<string, Neighbor[]>();
  const add = (from: BrainNode, to: BrainNode, link: BrainLink) => {
    const list = adjacency.get(from.id);
    if (list) list.push({ node: to, link });
    else adjacency.set(from.id, [{ node: to, link }]);
  };
  for (const link of links) {
    if (link.kind === 'hub') continue;
    add(link.a, link.b, link);
    add(link.b, link.a, link);
  }
  for (const list of adjacency.values()) {
    list.sort((x, y) => y.link.weight - x.link.weight || (x.node.id < y.node.id ? -1 : 1));
  }
  return adjacency;
}

export interface Neighborhood {
  /** The node itself and its direct neighbors. */
  nodeIds: Set<string>;
  /** Links between the node and its neighbors. */
  linkIds: Set<string>;
}

/** Focus set of a card: itself, its direct neighbors and the links to them. */
export function neighborhood(
  adjacency: ReadonlyMap<string, readonly Neighbor[]>,
  id: string,
): Neighborhood {
  const nodeIds = new Set([id]);
  const linkIds = new Set<string>();
  for (const { node, link } of adjacency.get(id) ?? []) {
    nodeIds.add(node.id);
    linkIds.add(link.id);
  }
  return { nodeIds, linkIds };
}

/** Focus set of a project hub: the hub, its cards and their hub threads. */
export function hubNeighborhood(graph: BrainGraph, hubId: string): Neighborhood {
  const nodeIds = new Set([hubId]);
  const linkIds = new Set<string>();
  for (const link of graph.links) {
    if (link.kind === 'hub' && link.b.id === hubId) {
      nodeIds.add(link.a.id);
      linkIds.add(link.id);
    } else if (link.kind !== 'hub' && link.a.projectId === hubId && link.b.projectId === hubId) {
      linkIds.add(link.id);
    }
  }
  return { nodeIds, linkIds };
}

/** Upper bound of cards in a "Nachbarschaft lernen" round. */
export const NEIGHBORHOOD_STUDY_MAX = 30;

/** Cards of a "Nachbarschaft lernen" round: the card first, then its neighbors by similarity. */
export function neighborhoodStudyCards(
  adjacency: ReadonlyMap<string, readonly Neighbor[]>,
  cardId: string,
  max = NEIGHBORHOOD_STUDY_MAX,
): string[] {
  const ids = [cardId];
  for (const { node } of adjacency.get(cardId) ?? []) {
    if (ids.length >= max) break;
    if (node.kind === 'card' && !ids.includes(node.id)) ids.push(node.id);
  }
  return ids;
}

// Filter ------------------------------------------------------------------------------------

export interface BrainFilter {
  /** Projects whose hub and cards are hidden. */
  hiddenProjects: string[];
  /** Hide links within a project (hub threads stay). */
  crossOnly: boolean;
  /** Hide semantic links below this similarity (display only, nothing is recomputed). */
  minSimilarity: number;
  /** Mastery levels that are shown. */
  levels: MasteryLevel[];
  /** Hide cards that were never studied ("neu"). */
  hideUnlearned: boolean;
}

export const MIN_SIMILARITY_RANGE = { min: 0.3, max: 0.95, step: 0.05 } as const;

export const DEFAULT_BRAIN_FILTER: BrainFilter = {
  hiddenProjects: [],
  crossOnly: false,
  minSimilarity: MIN_SIMILARITY_RANGE.min,
  levels: [...MASTERY_LEVELS],
  hideUnlearned: false,
};

/** Number of filter criteria that differ from the default (badge on the filter button). */
export function activeFilterCount(filter: BrainFilter): number {
  let count = filter.hiddenProjects.length > 0 ? 1 : 0;
  if (filter.crossOnly) count += 1;
  if (filter.minSimilarity > MIN_SIMILARITY_RANGE.min) count += 1;
  if (MASTERY_LEVELS.some((level) => !filter.levels.includes(level))) count += 1;
  if (filter.hideUnlearned) count += 1;
  return count;
}

/** Whether a card passes the node criteria of the filter. */
export function cardVisible(node: BrainNode, filter: BrainFilter): boolean {
  if (filter.hiddenProjects.includes(node.projectId)) return false;
  if (node.kind === 'hub') return true;
  if (filter.hideUnlearned && node.level === 'new') return false;
  return filter.levels.includes(node.level);
}

/** Whether a link is shown (both ends visible plus the link criteria). */
export function linkVisible(
  link: BrainLink,
  filter: BrainFilter,
  visible: ReadonlySet<string>,
): boolean {
  if (!visible.has(link.a.id) || !visible.has(link.b.id)) return false;
  if (link.kind === 'hub') return true;
  if (filter.crossOnly && !link.cross) return false;
  if (link.kind === 'semantic' && link.weight < filter.minSimilarity) return false;
  return true;
}

/** The visible part of the graph (same node and link objects). */
export function filterGraph(graph: BrainGraph, filter: BrainFilter): BrainGraph {
  const nodes = graph.nodes.filter((node) => cardVisible(node, filter));
  const visible = new Set(nodes.map((node) => node.id));
  const links = graph.links.filter((link) => linkVisible(link, filter, visible));
  return { nodes, links };
}

// Hit test for links -------------------------------------------------------------------------

/** Distance from p to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const CURVE_STEPS = 16;

/** Distance from p to a quadratic link curve (approximated by short segments). */
export function distanceToCurve(p: Point, a: Point, b: Point, curvature: number): number {
  let best = Infinity;
  let previous = a;
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const next = curvePoint(a, b, curvature, i / CURVE_STEPS);
    best = Math.min(best, distanceToSegment(p, previous, next));
    previous = next;
  }
  return best;
}

const at = (node: BrainNode): Point => ({ x: node.x ?? 0, y: node.y ?? 0 });

/**
 * Nearest card link within the tolerance (graph units). Cross-project links are curved
 * (same curvature as drawn); hub threads are never hit.
 */
export function linkAt(
  links: readonly BrainLink[],
  point: Point,
  tolerance: number,
  curvature: number,
): BrainLink | null {
  let best: BrainLink | null = null;
  let bestDistance = tolerance;
  for (const link of links) {
    if (link.kind === 'hub') continue;
    const a = at(link.a);
    const b = at(link.b);
    // Cheap reject: outside the bounding box (curves bulge out by curvature × length).
    const bulge = link.cross ? Math.hypot(b.x - a.x, b.y - a.y) * curvature : 0;
    const pad = tolerance + bulge;
    if (
      point.x < Math.min(a.x, b.x) - pad ||
      point.x > Math.max(a.x, b.x) + pad ||
      point.y < Math.min(a.y, b.y) - pad ||
      point.y > Math.max(a.y, b.y) + pad
    ) {
      continue;
    }
    const distance = link.cross
      ? distanceToCurve(point, a, b, curvature)
      : distanceToSegment(point, a, b);
    if (distance <= bestDistance) {
      best = link;
      bestDistance = distance;
    }
  }
  return best;
}

// Search ------------------------------------------------------------------------------------

export interface SearchableCard {
  id: string;
  front: string;
  back: string;
}

/** Live search over front and back: matches at the start of the front rank first. */
export function searchCards<T extends SearchableCard>(
  cards: readonly T[],
  query: string,
  limit = 20,
): T[] {
  const needle = normalizeCardText(query);
  if (!needle) return [];
  const ranked: { card: T; rank: number }[] = [];
  for (const card of cards) {
    const front = normalizeCardText(card.front);
    let rank: number;
    if (front.startsWith(needle)) rank = 0;
    else if (front.includes(` ${needle}`) || front.includes(`-${needle}`)) rank = 1;
    else if (front.includes(needle)) rank = 2;
    else if (normalizeCardText(card.back).includes(needle)) rank = 3;
    else continue;
    ranked.push({ card, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.card.front.length - b.card.front.length ||
      a.card.front.localeCompare(b.card.front, 'de'),
  );
  return ranked.slice(0, limit).map((entry) => entry.card);
}

// Keyboard navigation -----------------------------------------------------------------------

export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Neighbor to jump to with an arrow key: within ±80° of the direction, preferring small
 * angles and short distances. Null when no neighbor lies in that direction.
 */
export function neighborInDirection(
  origin: Point,
  candidates: readonly { id: string; x: number; y: number }[],
  direction: Direction,
): string | null {
  const dir = DIRECTION_VECTORS[direction];
  let best: string | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    const cos = (dx * dir.x + dy * dir.y) / distance;
    if (cos < Math.cos((80 * Math.PI) / 180)) continue;
    const angle = Math.acos(Math.min(1, cos));
    const score = distance * (1 + angle * 2);
    if (score < bestScore) {
      bestScore = score;
      best = candidate.id;
    }
  }
  return best;
}

// Project summary ---------------------------------------------------------------------------

export interface HubSummary {
  cards: number;
  levels: MasteryCounts;
  /** Cross-project links (semantic and manual) of this project's cards. */
  crossTotal: number;
  /** Partner projects, most links first. */
  crossByProject: { projectId: string; count: number }[];
}

export function hubSummary(graph: BrainGraph, projectId: string): HubSummary {
  const cards = graph.nodes.filter((node) => node.kind === 'card' && node.projectId === projectId);
  const partners = new Map<string, number>();
  let crossTotal = 0;
  for (const link of graph.links) {
    if (link.kind === 'hub' || !link.cross) continue;
    const other =
      link.a.projectId === projectId
        ? link.b.projectId
        : link.b.projectId === projectId
          ? link.a.projectId
          : null;
    if (other === null) continue;
    crossTotal += 1;
    partners.set(other, (partners.get(other) ?? 0) + 1);
  }
  return {
    cards: cards.length,
    levels: cards.length > 0 ? countLevels(cards) : emptyMasteryCounts(),
    crossTotal,
    crossByProject: [...partners]
      .map(([id, count]) => ({ projectId: id, count }))
      .sort((a, b) => b.count - a.count || (a.projectId < b.projectId ? -1 : 1)),
  };
}

// Camera ------------------------------------------------------------------------------------

/** Center for the camera so that the point lands in the middle of the free part of the view. */
export function focusCenter(point: Point, padding: Viewport['padding'], k: number): Point {
  return {
    x: point.x - (padding.left - padding.right) / 2 / k,
    y: point.y - (padding.top - padding.bottom) / 2 / k,
  };
}
