/**
 * Deterministic stand-in for the real embedding model (developer mode, E2E tests, screenshots):
 * character trigrams and words hashed into a fixed-size vector, L2-normalized. It only captures
 * spelling overlap, not meaning, but exercises the whole pipeline without the model download.
 */

export const HASH_EMBEDDING_MODEL = 'dev/hash-trigrams';
export const HASH_EMBEDDING_DIM = 384;

/** FNV-1a, 32 bit. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function features(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const result: string[] = [];
  for (const word of words) {
    result.push(`w:${word}`);
    const padded = ` ${word} `;
    const chars = Array.from(padded);
    for (let i = 0; i + 3 <= chars.length; i += 1) result.push(chars.slice(i, i + 3).join(''));
  }
  return result;
}

export function hashEmbedding(text: string, dim = HASH_EMBEDDING_DIM): Float32Array {
  const vector = new Float32Array(dim);
  for (const feature of features(text)) {
    const hash = fnv1a(feature);
    const weight = feature.startsWith('w:') ? 2 : 1;
    vector[hash % dim] = (vector[hash % dim] as number) + (hash & 0x80000000 ? -weight : weight);
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm);
    for (let i = 0; i < dim; i += 1) vector[i] = (vector[i] as number) * scale;
  }
  return vector;
}
