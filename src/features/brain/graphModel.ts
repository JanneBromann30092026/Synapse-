import {
  buildGraph,
  unfreeze,
  type BrainGraph,
  type BrainNode,
  type GraphInput,
  type Point,
} from '@/core/brain/graph';

export interface GraphSnapshot extends BrainGraph {
  /** Nodes the simulation still has to place. */
  free: number;
  /** Increases with every rebuild (new graphData object for force-graph). */
  version: number;
}

/**
 * Keeps the node objects of the brain across data updates: a new card or link does not move
 * the existing layout, only new nodes are placed. When many links arrive after the layout was
 * made (e.g. the first embeddings finished), the layout relaxes once from its positions.
 */
export class BrainGraphModel {
  private nodes = new Map<string, BrainNode>();
  private snapshot: GraphSnapshot | null = null;
  private layoutLinks = 0;
  private lastInput: GraphInput | null = null;
  private lastPositions: ReadonlyMap<string, Point> | null = null;

  update(input: GraphInput, positions: ReadonlyMap<string, Point>): GraphSnapshot {
    if (this.snapshot && input === this.lastInput && positions === this.lastPositions) {
      return this.snapshot;
    }
    this.lastInput = input;
    this.lastPositions = positions;
    const result = buildGraph(input, {
      positions,
      previous: this.nodes,
      random: Math.random,
      now: performance.now(),
    });
    this.nodes = new Map(result.nodes.map((node) => [node.id, node]));
    const semantic = result.links.filter((link) => link.kind !== 'hub').length;
    let free = result.free;
    if (this.snapshot === null) {
      this.layoutLinks = semantic;
    } else if (semantic > this.layoutLinks * 1.5 + 10) {
      // The layout was made with far fewer links: let it settle again.
      unfreeze(result.nodes);
      free = result.nodes.length;
      this.layoutLinks = semantic;
    }
    this.snapshot = {
      nodes: result.nodes,
      links: result.links,
      free,
      version: (this.snapshot?.version ?? 0) + 1,
    };
    return this.snapshot;
  }
}
