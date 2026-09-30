/**
 * Normalized Levenshtein similarity: 1 − distance / length of the longer text (0..1).
 * Works on code points (kanji, emoji), uses two typed-array rows (O(min(n, m)) memory).
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  let s = Array.from(a);
  let t = Array.from(b);
  if (s.length === 0 || t.length === 0) return 0;
  // Common prefix and suffix do not change the distance – skip them.
  let start = 0;
  while (start < s.length && start < t.length && s[start] === t[start]) start += 1;
  let endS = s.length;
  let endT = t.length;
  while (endS > start && endT > start && s[endS - 1] === t[endT - 1]) {
    endS -= 1;
    endT -= 1;
  }
  const longest = Math.max(s.length, t.length);
  s = s.slice(start, endS);
  t = t.slice(start, endT);
  if (s.length < t.length) [s, t] = [t, s];
  if (t.length === 0) return 1 - s.length / longest;

  let previous = new Uint32Array(t.length + 1);
  let current = new Uint32Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) previous[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    current[0] = i;
    const char = s[i - 1];
    for (let j = 1; j <= t.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (char === t[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    [previous, current] = [current, previous];
  }
  return 1 - (previous[t.length] ?? 0) / longest;
}
