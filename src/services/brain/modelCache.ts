import { EMBEDDING_MODEL, MODEL_CACHE_NAME } from '@/workers/embeddingsProtocol';

/** Cache Storage name of the runtime files (workbox runtimeCaching in vite.config.ts). */
export const RUNTIME_CACHE_NAME = 'synapse-onnx-runtime';

/** Approximate one-time download (model weights + tokenizer + runtime), for the notice. */
export const MODEL_DOWNLOAD_MB = 140;

function hasCaches(): boolean {
  return typeof caches !== 'undefined';
}

async function modelRequests(): Promise<readonly Request[]> {
  if (!hasCaches() || !(await caches.has(MODEL_CACHE_NAME))) return [];
  const cache = await caches.open(MODEL_CACHE_NAME);
  return (await cache.keys()).filter((request) => request.url.includes(EMBEDDING_MODEL));
}

/** True when the model weights are in the browser cache (no download needed). */
export async function isModelCached(): Promise<boolean> {
  try {
    const requests = await modelRequests();
    return requests.some((request) => request.url.endsWith('.onnx'));
  } catch {
    return false;
  }
}

/** Bytes of the cached model files and runtime (from content-length or the bodies). */
export async function modelCacheBytes(): Promise<number> {
  if (!hasCaches()) return 0;
  let total = 0;
  try {
    for (const name of [MODEL_CACHE_NAME, RUNTIME_CACHE_NAME]) {
      if (!(await caches.has(name))) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const length = Number(response?.headers.get('content-length'));
        total +=
          Number.isFinite(length) && length > 0 ? length : ((await response?.blob())?.size ?? 0);
      }
    }
  } catch {
    // Cache Storage unavailable: report what we have.
  }
  return total;
}

/** Deletes the downloaded model and runtime; embeddings and links stay in the database. */
export async function deleteModelCache(): Promise<void> {
  if (!hasCaches()) return;
  await Promise.all([caches.delete(MODEL_CACHE_NAME), caches.delete(RUNTIME_CACHE_NAME)]);
}
