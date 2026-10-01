/** Message protocol of src/workers/embeddings.worker.ts. */

/** Multilingual sentence embeddings (German, English, Japanese …), 384 dimensions. */
export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBEDDING_DIM = 384;
/** Quantized weights (onnx/model_quantized.onnx). */
export const EMBEDDING_DTYPE = 'q8';
/** Name of the Cache Storage cache transformers.js keeps model files in. */
export const MODEL_CACHE_NAME = 'transformers-cache';

export type EmbeddingsRequest =
  { type: 'init' } | { type: 'embedBatch'; id: number; texts: string[] };

export type EmbeddingsErrorCode = 'download' | 'init' | 'embed';

export type EmbeddingsResponse =
  /** Download progress of one model file (bytes). */
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; model: string; device: 'wasm' }
  /** Row-major vectors (texts.length × dim), transferred. */
  | { type: 'embeddings'; id: number; dim: number; vectors: Float32Array }
  | { type: 'error'; id?: number; code: EmbeddingsErrorCode; message: string };
