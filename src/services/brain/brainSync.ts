import { create } from 'zustand';
import { shouldRecomputeFully, type LinkOptions } from '@/core/brain/links';
import type { brainRepo } from '@/data/repositories';
import type { LinksJob } from '@/workers/linksProtocol';
import {
  EmbedderError,
  embedderModel,
  type BrainEmbedderKind,
  type DownloadProgress,
  type Embedder,
} from './embedder';
import type { LinksRunner } from './linksClient';

/** Cards per embedding batch: small batches keep the worker's memory low on the iPad. */
export const EMBED_BATCH_SIZE = 16;

export type BrainSyncPhase =
  | 'idle'
  | 'downloading'
  | 'embedding'
  | 'linking'
  | 'done'
  /** Cards wait for embeddings, but the model is not downloaded yet. */
  | 'needsModel'
  | 'error';

export type BrainSyncErrorCode = 'offline' | 'download' | 'init' | 'embed' | 'links';

export interface BrainSyncState {
  phase: BrainSyncPhase;
  download: DownloadProgress | null;
  embedded: { done: number; total: number };
  /** 0..1 */
  linkProgress: number;
  error: BrainSyncErrorCode | null;
  lastRun: { embedded: number; links: 'full' | 'incremental' | 'unchanged' } | null;
}

const INITIAL_STATE: BrainSyncState = {
  phase: 'idle',
  download: null,
  embedded: { done: 0, total: 0 },
  linkProgress: 0,
  error: null,
  lastRun: null,
};

export interface BrainConfig {
  embedder: BrainEmbedderKind;
  options: LinkOptions;
}

export interface RunOptions {
  /** Allows the one-time model download (only on an explicit user action). */
  allowDownload?: boolean;
  /** Recompute all links even if they look current ("Verknüpfungen neu berechnen"). */
  forceFullLinks?: boolean;
}

export interface BrainSyncDeps {
  repo: Pick<
    typeof brainRepo,
    | 'listPending'
    | 'saveEmbeddings'
    | 'getEmbeddingStatus'
    | 'getAllEmbeddings'
    | 'getLinkState'
    | 'getSemanticLinks'
    | 'replaceSemanticLinks'
  >;
  createEmbedder: (kind: BrainEmbedderKind) => Embedder;
  runLinks: LinksRunner;
  isModelCached: () => Promise<boolean>;
  isOnline: () => boolean;
  getConfig: () => BrainConfig;
}

class SyncError extends Error {
  constructor(readonly code: 'offline') {
    super(code);
    this.name = 'SyncError';
  }
}

export function createBrainSyncStore() {
  return create<BrainSyncState>(() => INITIAL_STATE);
}

export type BrainSyncStore = ReturnType<typeof createBrainSyncStore>;

/**
 * Brings embeddings and semantic links up to date: missing/stale embeddings in small
 * batches (worker), then links incrementally or fully (worker). Single flight: a call while
 * running is queued and runs once afterwards with the merged options.
 */
export function createBrainSync(
  deps: BrainSyncDeps,
  store: BrainSyncStore = createBrainSyncStore(),
) {
  let running: Promise<void> | null = null;
  let queued: RunOptions | null = null;
  const set = (patch: Partial<BrainSyncState>) => store.setState(patch);

  async function embedPending(kind: BrainEmbedderKind, model: string, allowDownload: boolean) {
    const pending = await deps.repo.listPending(model);
    if (pending.length === 0) return { embedded: 0, blocked: false };

    const needsDownload = kind === 'model' && !(await deps.isModelCached());
    if (needsDownload && !allowDownload) return { embedded: 0, blocked: true };
    if (needsDownload && !deps.isOnline()) throw new SyncError('offline');

    const embedder = deps.createEmbedder(kind);
    try {
      set({ phase: needsDownload ? 'downloading' : 'embedding', download: null });
      await embedder.prepare((download) => set({ download }));
      set({ phase: 'embedding', embedded: { done: 0, total: pending.length } });
      let done = 0;
      for (let start = 0; start < pending.length; start += EMBED_BATCH_SIZE) {
        const batch = pending.slice(start, start + EMBED_BATCH_SIZE);
        const vectors = await embedder.embed(batch.map((item) => item.text));
        await deps.repo.saveEmbeddings(
          model,
          batch.flatMap((item, index) => {
            const vector = vectors[index];
            return vector ? [{ cardId: item.cardId, textHash: item.textHash, vector }] : [];
          }),
        );
        done += batch.length;
        set({ embedded: { done, total: pending.length } });
      }
      return { embedded: done, blocked: false };
    } finally {
      embedder.dispose();
    }
  }

  async function updateLinks(model: string, options: LinkOptions, force: boolean) {
    const status = await deps.repo.getEmbeddingStatus(model, options);
    if (!status.linksOutdated && !force) return 'unchanged' as const;

    set({ phase: 'linking', linkProgress: 0 });
    const [embeddings, state] = await Promise.all([
      deps.repo.getAllEmbeddings(model),
      deps.repo.getLinkState(),
    ]);
    const ids = new Set(embeddings.ids);
    const sameParams =
      state !== null &&
      state.model === model &&
      state.topK === options.topK &&
      state.threshold === options.threshold;
    const previousIds = new Set(state?.cardIds ?? []);
    const changedIds = embeddings.ids.filter(
      (id, index) =>
        !previousIds.has(id) || (embeddings.createdAt[index] ?? '') > (state?.computedAt ?? ''),
    );
    const removedIds = [...previousIds].filter((id) => !ids.has(id));
    const full =
      force ||
      !sameParams ||
      shouldRecomputeFully(changedIds.length + removedIds.length, embeddings.ids.length);

    const job: LinksJob = {
      ids: embeddings.ids,
      dim: embeddings.dim,
      matrix: embeddings.matrix,
      options,
      mode: full ? 'full' : 'incremental',
      previous: full ? [] : await deps.repo.getSemanticLinks(),
      changedIds: full ? [] : changedIds,
      removedIds: full ? [] : removedIds,
    };
    // Newest embedding taken into account: anything newer marks the links as outdated.
    const computedAt = embeddings.createdAt.reduce((max, value) => (value > max ? value : max), '');
    const links = await deps.runLinks(job, (linkProgress) => set({ linkProgress }));
    await deps.repo.replaceSemanticLinks(links, {
      computedAt,
      model,
      topK: options.topK,
      threshold: options.threshold,
      cardIds: [...ids],
    });
    set({ linkProgress: 1 });
    return job.mode;
  }

  async function runOnce(options: RunOptions): Promise<void> {
    const { embedder: kind, options: linkOptions } = deps.getConfig();
    const model = embedderModel(kind);
    set({ error: null, download: null, linkProgress: 0 });
    try {
      const { embedded, blocked } = await embedPending(kind, model, options.allowDownload ?? false);
      const links = await updateLinks(model, linkOptions, options.forceFullLinks ?? false);
      set({ phase: blocked ? 'needsModel' : 'done', lastRun: { embedded, links } });
    } catch (error: unknown) {
      const code: BrainSyncErrorCode =
        error instanceof SyncError
          ? error.code
          : error instanceof EmbedderError
            ? error.code
            : 'links';
      console.error('Brain sync failed', error);
      set({ phase: 'error', error: code });
    }
  }

  return {
    store,
    /** Resolves when this run (and a queued one) finished; never rejects. */
    run(options: RunOptions = {}): Promise<void> {
      if (running) {
        queued = {
          allowDownload: (queued?.allowDownload ?? false) || (options.allowDownload ?? false),
          forceFullLinks: (queued?.forceFullLinks ?? false) || (options.forceFullLinks ?? false),
        };
        return running;
      }
      running = (async () => {
        let next: RunOptions | null = options;
        while (next) {
          queued = null;
          await runOnce(next);
          next = queued;
        }
        running = null;
      })();
      return running;
    },
    isRunning: () => running !== null,
  };
}

export type BrainSync = ReturnType<typeof createBrainSync>;
