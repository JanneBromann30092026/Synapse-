/** Returns a number in [0, 1), like Math.random. Injectable for deterministic tests. */
export type RandomSource = () => number;

/** Fisher–Yates shuffle; returns a new array and leaves the input untouched. */
export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/**
 * Shuffles and makes sure `avoidFirst` is not in the first position (as long as there is more
 * than one item) – a new round never starts with the card that ended the previous one.
 */
export function shuffleAvoidingFirst<T>(
  items: readonly T[],
  avoidFirst: T | undefined,
  random: RandomSource,
): T[] {
  const result = shuffle(items, random);
  if (avoidFirst === undefined || result.length < 2 || result[0] !== avoidFirst) return result;
  // Swap with a random other position so the order stays random.
  const j = 1 + Math.min(result.length - 2, Math.floor(random() * (result.length - 1)));
  result[0] = result[j] as T;
  result[j] = avoidFirst;
  return result;
}

/** Small seeded generator (mulberry32) for tests and reproducible rounds. */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
