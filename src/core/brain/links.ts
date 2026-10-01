import { createKernel, type DotKernel, type VectorMatrix } from './dotKernel';

/**
 * Semantic links between cards from their embeddings.
 *
 * Every card keeps its top-k most similar cards above a threshold. The links are the union of
 * those lists: undirected, deduplicated (source < target) and weighted with the similarity.
 * Vectors are L2-normalized, so the cosine similarity is the dot product.
 */

export interface LinkOptions {
  /** Maximum number of neighbors each card keeps (2–10). */
  topK: number;
  /** Minimum cosine similarity of a link (inclusive). */
  threshold: number;
}

export const DEFAULT_LINK_OPTIONS: LinkOptions = { topK: 5, threshold: 0.55 };
export const LINK_TOP_K = { min: 2, max: 10 } as const;
export const LINK_THRESHOLD = { min: 0.3, max: 0.95 } as const;

export interface SemanticLink {
  /** Always sourceId < targetId. */
  sourceId: string;
  targetId: string;
  /** Cosine similarity. */
  weight: number;
}

/** All vectors in one contiguous matrix: row i (dim values) belongs to ids[i]. */
export interface VectorSet {
  ids: string[];
  dim: number;
  matrix: Float32Array;
}

/** Called with 0..1 while links are computed. */
export type ProgressCallback = (progress: number) => void;

/** Picks the dot product implementation (tests compare JS and SIMD). */
export type KernelFactory = (vectors: VectorMatrix) => DotKernel;

export interface ComputeOptions {
  onProgress?: ProgressCallback;
  kernel?: KernelFactory;
}

function kernelFor(set: VectorSet, factory: KernelFactory = createKernel): DotKernel {
  return factory({ count: set.ids.length, dim: set.dim, matrix: set.matrix });
}

/**
 * Up to this share of changed or removed cards an incremental update is used; above it a full
 * recomputation is cheaper (incremental touches every row near a changed card).
 */
export const INCREMENTAL_MAX_SHARE = 0.1;

export function shouldRecomputeFully(dirtyCount: number, total: number): boolean {
  return dirtyCount > Math.max(1, total * INCREMENTAL_MAX_SHARE);
}

/** Cosine similarity of two arbitrary vectors (0 for zero vectors). */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('Vectors differ in length');
  let dotSum = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    dotSum += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dotSum / Math.sqrt(normA * normB);
}

/** Best k neighbors of one row, sorted by similarity (desc), ties by id (asc). */
class TopK {
  readonly sims: number[] = [];
  readonly rows: number[] = [];

  constructor(
    private readonly k: number,
    private readonly ids: readonly string[],
  ) {}

  private better(sim: number, row: number, index: number): boolean {
    const other = this.sims[index] as number;
    if (sim !== other) return sim > other;
    return (this.ids[row] as string) < (this.ids[this.rows[index] as number] as string);
  }

  offer(sim: number, row: number): void {
    const count = this.sims.length;
    if (count === this.k && !this.better(sim, row, count - 1)) return;
    let index = count === this.k ? count - 1 : count;
    // Shift worse entries one place down (k ≤ 10, insertion sort is the fastest option).
    while (index > 0 && this.better(sim, row, index - 1)) {
      if (index < this.k) {
        this.sims[index] = this.sims[index - 1] as number;
        this.rows[index] = this.rows[index - 1] as number;
      }
      index -= 1;
    }
    this.sims[index] = sim;
    this.rows[index] = row;
    if (this.sims.length > this.k) {
      this.sims.length = this.k;
      this.rows.length = this.k;
    }
  }
}

function validate(set: VectorSet, options: LinkOptions): void {
  if (set.matrix.length !== set.ids.length * set.dim) {
    throw new Error('Matrix size does not match ids × dim');
  }
  if (!Number.isInteger(options.topK) || options.topK < 1) throw new Error('topK must be ≥ 1');
}

/** Union of all top-k lists as deduplicated links, sorted by (sourceId, targetId). */
function collectLinks(set: VectorSet, lists: readonly TopK[]): SemanticLink[] {
  const byKey = new Map<string, SemanticLink>();
  lists.forEach((list, row) => {
    const id = set.ids[row] as string;
    list.rows.forEach((neighbor, index) => {
      const other = set.ids[neighbor] as string;
      const [sourceId, targetId] = id < other ? [id, other] : [other, id];
      const key = `${sourceId}\u0000${targetId}`;
      if (!byKey.has(key)) {
        byKey.set(key, { sourceId, targetId, weight: list.sims[index] as number });
      }
    });
  });
  return [...byKey.values()].sort((a, b) =>
    a.sourceId === b.sourceId
      ? a.targetId < b.targetId
        ? -1
        : 1
      : a.sourceId < b.sourceId
        ? -1
        : 1,
  );
}

/** Progress is reported at most every ~2 % (posting messages is not free). */
function progressReporter(total: number, onProgress?: ProgressCallback) {
  let lastReported = -1;
  return (done: number) => {
    if (!onProgress) return;
    const value = total === 0 ? 1 : done / total;
    if (value - lastReported >= 0.02 || value >= 1) {
      lastReported = value;
      onProgress(Math.min(1, value));
    }
  };
}

/** Full computation over all pairs (each pair once). */
export function computeLinks(
  set: VectorSet,
  options: LinkOptions,
  { onProgress, kernel: factory }: ComputeOptions = {},
): SemanticLink[] {
  validate(set, options);
  const n = set.ids.length;
  const kernel = kernelFor(set, factory);
  const sims = new Float32Array(Math.max(1, n));
  const lists = set.ids.map(() => new TopK(options.topK, set.ids));
  const totalPairs = (n * (n - 1)) / 2;
  const report = progressReporter(totalPairs, onProgress);
  let done = 0;
  for (let i = 0; i < n; i += 1) {
    const listI = lists[i] as TopK;
    kernel.dotRange(i, i + 1, n, sims);
    for (let j = i + 1; j < n; j += 1) {
      const sim = sims[j - i - 1] as number;
      if (sim >= options.threshold) {
        listI.offer(sim, j);
        (lists[j] as TopK).offer(sim, i);
      }
    }
    done += n - 1 - i;
    report(done);
  }
  report(totalPairs);
  return collectLinks(set, lists);
}

/**
 * Incremental update after a few cards changed (new or re-embedded) or were removed.
 * `previous` must have been computed with the same options. The result equals computeLinks
 * on the new set (ties aside):
 * - Changed cards and cards linked to a changed/removed card get a full row scan.
 * - Every other card keeps its own top-k (the best k of its previous links; a card's own
 *   top-k is exactly that, because any linked card more similar than its k-th neighbor would
 *   be in it) and only compares against the changed cards.
 */
export function updateLinks(
  set: VectorSet,
  previous: readonly SemanticLink[],
  changedIds: Iterable<string>,
  removedIds: Iterable<string>,
  options: LinkOptions,
  { onProgress, kernel: factory }: ComputeOptions = {},
): SemanticLink[] {
  validate(set, options);
  const n = set.ids.length;
  const kernel = kernelFor(set, factory);
  const sims = new Float32Array(Math.max(1, n));
  const rowOf = new Map(set.ids.map((id, row) => [id, row]));
  const dirty = new Set([...changedIds, ...removedIds]);
  const changedRows = [...new Set(changedIds)]
    .map((id) => rowOf.get(id))
    .filter((row): row is number => row !== undefined);

  const neighbors = new Map<string, { id: string; weight: number }[]>();
  const addNeighbor = (id: string, other: string, weight: number) => {
    let list = neighbors.get(id);
    if (!list) {
      list = [];
      neighbors.set(id, list);
    }
    list.push({ id: other, weight });
  };
  for (const link of previous) {
    addNeighbor(link.sourceId, link.targetId, link.weight);
    addNeighbor(link.targetId, link.sourceId, link.weight);
  }

  // Rows that need a full scan: changed cards and cards next to a dirty or vanished card.
  const fullRows = new Set(changedRows);
  for (let row = 0; row < n; row += 1) {
    const list = neighbors.get(set.ids[row] as string);
    if (list?.some((neighbor) => dirty.has(neighbor.id) || !rowOf.has(neighbor.id))) {
      fullRows.add(row);
    }
  }

  const lists = set.ids.map(() => new TopK(options.topK, set.ids));
  const total = fullRows.size * n + (n - fullRows.size) * changedRows.length;
  const report = progressReporter(total, onProgress);
  let done = 0;

  for (let row = 0; row < n; row += 1) {
    const list = lists[row] as TopK;
    if (fullRows.has(row)) {
      kernel.dotRange(row, 0, n, sims);
      for (let other = 0; other < n; other += 1) {
        if (other === row) continue;
        const sim = sims[other] as number;
        if (sim >= options.threshold) list.offer(sim, other);
      }
      done += n;
    } else {
      for (const neighbor of neighbors.get(set.ids[row] as string) ?? []) {
        list.offer(neighbor.weight, rowOf.get(neighbor.id) as number);
      }
      for (const other of changedRows) {
        const sim = kernel.dot(row, other);
        if (sim >= options.threshold) list.offer(sim, other);
      }
      done += changedRows.length;
    }
    report(done);
  }
  report(total);
  return collectLinks(set, lists);
}

/** Packs vectors into one matrix (rows in the order of ids). */
export function toVectorSet(
  entries: readonly { id: string; vector: ArrayLike<number> }[],
  dim: number,
): VectorSet {
  const matrix = new Float32Array(entries.length * dim);
  entries.forEach((entry, row) => {
    if (entry.vector.length !== dim) throw new Error(`Vector of ${entry.id} has wrong dimension`);
    matrix.set(entry.vector, row * dim);
  });
  return { ids: entries.map((entry) => entry.id), dim, matrix };
}
