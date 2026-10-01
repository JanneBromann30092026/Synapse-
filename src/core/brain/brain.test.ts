import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../hash';
import { seededRandom } from '../session';
import { createJsKernel, createSimdKernel } from './dotKernel';
import { hashEmbedding } from './hashEmbedding';
import {
  computeLinks,
  cosineSimilarity,
  shouldRecomputeFully,
  toVectorSet,
  updateLinks,
  type LinkOptions,
  type VectorSet,
} from './links';
import { embeddingText, embeddingTextHash } from './text';

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return values.map((v) => v / norm);
}

function setOf(vectors: Record<string, number[]>): VectorSet {
  const entries = Object.entries(vectors).map(([id, vector]) => ({
    id,
    vector: normalize(vector),
  }));
  return toVectorSet(entries, entries[0]?.vector.length ?? 0);
}

function randomSet(count: number, dim: number, seed: number, prefix = 'c'): VectorSet {
  const random = seededRandom(seed);
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i).padStart(5, '0')}`,
    vector: normalize(Array.from({ length: dim }, () => random() * 2 - 1)),
  }));
  return toVectorSet(entries, dim);
}

describe('sha256Hex', () => {
  it('matches the FIPS test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes UTF-8 (umlauts, Japanese) like crypto.subtle', async () => {
    for (const text of ['Größe — ä', '猫 — Katze (ねこ)', 'x'.repeat(1000)]) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const expected = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(sha256Hex(text)).toBe(expected);
    }
  });
});

describe('embeddingText', () => {
  it('joins front and back, notes in parentheses', () => {
    expect(embeddingText({ front: ' Hund ', back: 'dog' })).toBe('Hund — dog');
    expect(embeddingText({ front: 'Hund', back: 'dog', notes: 'Tier' })).toBe('Hund — dog (Tier)');
    expect(embeddingText({ front: 'Hund', back: 'dog', notes: '  ' })).toBe('Hund — dog');
  });

  it('hash changes with the text only', () => {
    const a = embeddingTextHash({ front: 'Hund', back: 'dog' });
    expect(embeddingTextHash({ front: 'Hund ', back: 'dog' })).toBe(a);
    expect(embeddingTextHash({ front: 'Hund', back: 'dog', notes: 'x' })).not.toBe(a);
  });
});

describe('cosineSimilarity', () => {
  it('handles parallel, orthogonal, opposite and zero vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});

describe('computeLinks', () => {
  const vectors = {
    a: [1, 0, 0],
    b: [0.9, 0.1, 0],
    c: [0.8, 0.3, 0],
    d: [0, 1, 0],
    e: [0, 0, 1],
  };

  it('keeps top-k above the threshold, undirected and deduplicated', () => {
    const links = computeLinks(setOf(vectors), { topK: 1, threshold: 0.5 });
    // a↔b and b↔a are one link; c's best is b; d and e have nobody above 0.5.
    expect(links.map((l) => `${l.sourceId}-${l.targetId}`)).toEqual(['a-b', 'b-c']);
    for (const link of links) {
      expect(link.sourceId < link.targetId).toBe(true);
      expect(link.weight).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('respects the threshold and k', () => {
    const set = setOf(vectors);
    expect(computeLinks(set, { topK: 5, threshold: 0.999 })).toEqual([]);
    const two = computeLinks(set, { topK: 2, threshold: 0 });
    // Everybody keeps at most 2 own neighbors, the union may give a card more links.
    expect(two.length).toBeLessThanOrEqual(5 * 2);
    expect(two.find((l) => l.sourceId === 'a' && l.targetId === 'b')?.weight).toBeCloseTo(
      cosineSimilarity(vectors.a, vectors.b),
      5,
    );
  });

  it('reports progress up to 1', () => {
    const values: number[] = [];
    computeLinks(
      randomSet(50, 8, 1),
      { topK: 3, threshold: 0 },
      { onProgress: (p) => values.push(p) },
    );
    expect(values.at(-1)).toBe(1);
    expect(values).toEqual([...values].sort((x, y) => x - y));
  });

  it('handles empty and single-card sets', () => {
    expect(computeLinks(toVectorSet([], 3), { topK: 5, threshold: 0.5 })).toEqual([]);
    expect(computeLinks(setOf({ a: [1, 0] }), { topK: 5, threshold: 0 })).toEqual([]);
  });

  it('SIMD and JS kernels agree', () => {
    const set = randomSet(200, 16, 5);
    const options = { topK: 4, threshold: 0.2 };
    const simd = computeLinks(set, options);
    const js = computeLinks(set, options, { kernel: createJsKernel });
    expect(simd.map((l) => [l.sourceId, l.targetId])).toEqual(
      js.map((l) => [l.sourceId, l.targetId]),
    );
    simd.forEach((link, i) => expect(link.weight).toBeCloseTo(js[i]?.weight ?? 0, 5));
    // Not a multiple of 4 → no SIMD kernel, JS fallback.
    expect(createSimdKernel({ count: 2, dim: 3, matrix: new Float32Array(6) })).toBeNull();
    expect(computeLinks(setOf({ a: [1, 2, 3], b: [1, 2, 4] }), options)).toHaveLength(1);
  });

  it('links 5000 cards with 384 dimensions in a few seconds', () => {
    const set = randomSet(5000, 384, 7);
    const start = performance.now();
    computeLinks(set, { topK: 5, threshold: 0.1 });
    expect(performance.now() - start).toBeLessThan(5_000);
  }, 30_000);
});

describe('updateLinks', () => {
  const options: LinkOptions = { topK: 3, threshold: 0.05 };

  function mutate(set: VectorSet, changed: string[], seed: number): VectorSet {
    const random = seededRandom(seed);
    const matrix = set.matrix.slice();
    for (const id of changed) {
      const row = set.ids.indexOf(id);
      const vector = normalize(Array.from({ length: set.dim }, () => random() * 2 - 1));
      matrix.set(vector, row * set.dim);
    }
    return { ...set, matrix };
  }

  function without(set: VectorSet, removed: Set<string>): VectorSet {
    const keep = set.ids.flatMap((id, row) => (removed.has(id) ? [] : [row]));
    const matrix = new Float32Array(keep.length * set.dim);
    keep.forEach((row, index) =>
      matrix.set(set.matrix.subarray(row * set.dim, (row + 1) * set.dim), index * set.dim),
    );
    return { ids: keep.map((row) => set.ids[row] as string), dim: set.dim, matrix };
  }

  it.each([
    ['SIMD', undefined],
    ['JS', createJsKernel],
  ] as const)(
    'equals a full computation after changes, additions and removals (%s)',
    (_, kernel) => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const before = randomSet(120, 12, seed);
        const previous = computeLinks(before, options, { kernel });
        const random = seededRandom(seed * 31);
        const changed = before.ids.filter(() => random() < 0.04);
        const removed = new Set(
          before.ids.filter((id) => !changed.includes(id) && random() < 0.03),
        );
        const added = randomSet(3, 12, seed + 1000, 'n');

        const mutated = without(mutate(before, changed, seed + 7), removed);
        const after: VectorSet = {
          ids: [...mutated.ids, ...added.ids],
          dim: 12,
          matrix: new Float32Array([...mutated.matrix, ...added.matrix]),
        };

        const incremental = updateLinks(
          after,
          previous,
          [...changed, ...added.ids],
          removed,
          options,
          { kernel },
        );
        expect(incremental).toEqual(computeLinks(after, options, { kernel }));
      }
    },
  );

  it('without changes returns the previous links', () => {
    const set = randomSet(60, 8, 3);
    const previous = computeLinks(set, options);
    expect(updateLinks(set, previous, [], [], options)).toEqual(previous);
  });

  it('decides between incremental and full recomputation', () => {
    expect(shouldRecomputeFully(5, 1000)).toBe(false);
    expect(shouldRecomputeFully(150, 1000)).toBe(true);
    expect(shouldRecomputeFully(1, 3)).toBe(false);
    expect(shouldRecomputeFully(2, 3)).toBe(true);
  });
});

describe('hashEmbedding', () => {
  it('is normalized, deterministic and similar for shared words', () => {
    const a = hashEmbedding('Cashflow — Zufluss liquider Mittel');
    const b = hashEmbedding('Cashflow — Mittelzufluss');
    const c = hashEmbedding('猫 — Katze');
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(hashEmbedding('Cashflow — Zufluss liquider Mittel')).toEqual(a);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
    expect(hashEmbedding('').every((v) => v === 0)).toBe(true);
  });
});
