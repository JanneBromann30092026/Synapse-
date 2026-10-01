import { HASH_EMBEDDING_MODEL, hashEmbedding } from '@/core/brain/hashEmbedding';
import {
  EMBEDDING_MODEL,
  type EmbeddingsErrorCode,
  type EmbeddingsRequest,
  type EmbeddingsResponse,
} from '@/workers/embeddingsProtocol';

/** Which embedder computes the vectors: the real model or the developer stand-in. */
export const BRAIN_EMBEDDERS = ['model', 'hash'] as const;
export type BrainEmbedderKind = (typeof BRAIN_EMBEDDERS)[number];

export function embedderModel(kind: BrainEmbedderKind): string {
  return kind === 'model' ? EMBEDDING_MODEL : HASH_EMBEDDING_MODEL;
}

export class EmbedderError extends Error {
  constructor(
    readonly code: EmbeddingsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EmbedderError';
  }
}

/** Download progress over all model files (bytes). */
export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface Embedder {
  readonly model: string;
  /** Loads the model (downloads it once, then from the cache). */
  prepare(onProgress?: (progress: DownloadProgress) => void): Promise<void>;
  /** One normalized vector per text. */
  embed(texts: string[]): Promise<Float32Array[]>;
  /** Frees the memory (terminates the worker). */
  dispose(): void;
}

function splitRows(vectors: Float32Array, dim: number): Float32Array[] {
  const rows: Float32Array[] = [];
  for (let offset = 0; offset + dim <= vectors.length; offset += dim) {
    rows.push(vectors.slice(offset, offset + dim));
  }
  return rows;
}

/** The real model in a Web Worker (transformers.js, WASM). */
export function createModelEmbedder(): Embedder {
  const worker = new Worker(new URL('../../workers/embeddings.worker.ts', import.meta.url), {
    type: 'module',
    name: 'embeddings',
  });
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (rows: Float32Array[]) => void; reject: (error: Error) => void }
  >();
  let ready: {
    resolve: () => void;
    reject: (error: Error) => void;
    onProgress?: (progress: DownloadProgress) => void;
  } | null = null;
  const files = new Map<string, DownloadProgress>();

  const failAll = (error: Error) => {
    ready?.reject(error);
    ready = null;
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<EmbeddingsResponse>) => {
    const data = event.data;
    switch (data.type) {
      case 'progress': {
        files.set(data.file, { loaded: data.loaded, total: data.total });
        let loaded = 0;
        let total = 0;
        for (const file of files.values()) {
          loaded += file.loaded;
          total += file.total;
        }
        ready?.onProgress?.({ loaded, total });
        break;
      }
      case 'ready':
        ready?.resolve();
        ready = null;
        break;
      case 'embeddings':
        pending.get(data.id)?.resolve(splitRows(data.vectors, data.dim));
        pending.delete(data.id);
        break;
      case 'error': {
        const error = new EmbedderError(data.code, data.message);
        if (data.id === undefined) {
          ready?.reject(error);
          ready = null;
        } else {
          pending.get(data.id)?.reject(error);
          pending.delete(data.id);
        }
        break;
      }
    }
  };
  worker.onerror = (event) => {
    event.preventDefault();
    failAll(new EmbedderError('init', event.message || 'Worker error'));
  };

  const send = (request: EmbeddingsRequest) => worker.postMessage(request);

  return {
    model: EMBEDDING_MODEL,
    prepare(onProgress) {
      return new Promise<void>((resolve, reject) => {
        ready = { resolve, reject, onProgress };
        send({ type: 'init' });
      });
    },
    embed(texts) {
      const id = nextId;
      nextId += 1;
      return new Promise<Float32Array[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: 'embedBatch', id, texts });
      });
    },
    dispose() {
      worker.terminate();
      failAll(new EmbedderError('embed', 'Embedder disposed'));
    },
  };
}

/** Developer stand-in: spelling-based vectors, no download (see core/brain/hashEmbedding). */
export function createHashEmbedder(): Embedder {
  return {
    model: HASH_EMBEDDING_MODEL,
    prepare: () => Promise.resolve(),
    embed: (texts) => Promise.resolve(texts.map((text) => hashEmbedding(text))),
    dispose: () => undefined,
  };
}

export function createEmbedder(kind: BrainEmbedderKind): Embedder {
  return kind === 'model' ? createModelEmbedder() : createHashEmbedder();
}
