import type { LinkOptions, SemanticLink } from '@/core/brain/links';

/** Message protocol of src/workers/links.worker.ts. */

export interface LinksJob {
  ids: string[];
  dim: number;
  /** Row-major vectors (ids.length × dim), transferred. */
  matrix: Float32Array;
  options: LinkOptions;
  /** Full recomputation, or an update of `previous` after the listed changes. */
  mode: 'full' | 'incremental';
  previous: SemanticLink[];
  changedIds: string[];
  removedIds: string[];
}

export type LinksRequest = { type: 'compute'; id: number; job: LinksJob };

export type LinksResponse =
  | { type: 'progress'; id: number; progress: number }
  | { type: 'result'; id: number; links: SemanticLink[] }
  | { type: 'error'; id: number; message: string };
