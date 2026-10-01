/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
// The ONNX runtime binary is served with the app (same origin) instead of the CDN default of
// transformers.js; its JS part is bundled ('onnxruntime-web/wasm', see vite.config.ts).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import {
  EMBEDDING_DTYPE,
  EMBEDDING_MODEL,
  type EmbeddingsRequest,
  type EmbeddingsResponse,
} from './embeddingsProtocol';

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// transformers.js would load the runtime as a blob: module, which the CSP blocks. The
// service worker caches the runtime binary instead (runtimeCaching in vite.config.ts).
env.useWasmCache = false;
const onnx = env.backends.onnx;
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { wasm: ortWasmUrl };
  // Without cross-origin isolation (GitHub Pages) there are no threads anyway.
  onnx.wasm.numThreads = 1;
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function post(message: EmbeddingsResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ProgressInfo {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline('feature-extraction', EMBEDDING_MODEL, {
    dtype: EMBEDDING_DTYPE,
    device: 'wasm',
    progress_callback: (info: ProgressInfo) => {
      if (info.status === 'progress' && info.file && info.total) {
        post({ type: 'progress', file: info.file, loaded: info.loaded ?? 0, total: info.total });
      }
    },
  });
  return extractor;
}

self.onmessage = async (event: MessageEvent<EmbeddingsRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    try {
      await load();
      post({ type: 'ready', model: EMBEDDING_MODEL, device: 'wasm' });
    } catch (error: unknown) {
      extractor = null;
      // Failed fetches (offline, blocked host) surface as TypeError.
      const code = error instanceof TypeError ? 'download' : 'init';
      post({ type: 'error', code, message: message(error) });
    }
    return;
  }

  try {
    const pipe = await load();
    const output = await pipe(request.texts, { pooling: 'mean', normalize: true });
    const vectors = new Float32Array(output.data as Float32Array);
    const dim = output.dims[1] ?? 0;
    post({ type: 'embeddings', id: request.id, dim, vectors }, [vectors.buffer]);
  } catch (error: unknown) {
    post({ type: 'error', id: request.id, code: 'embed', message: message(error) });
  }
};
