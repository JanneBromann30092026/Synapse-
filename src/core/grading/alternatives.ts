import { normalize } from './normalize';

/**
 * Splits an expected answer into its alternatives: at semicolons and at slashes with
 * whitespace around them ("Haus / Heim"); "km/h" stays one answer. Trimmed, empty parts
 * and duplicates (after normalization) dropped.
 */
export function splitAlternatives(expected: string): string[] {
  const seen = new Set<string>();
  const alternatives: string[] = [];
  for (const part of expected.split(/;|\s+\/\s+/)) {
    const alternative = part.replace(/\s+/g, ' ').trim();
    const key = normalize(alternative);
    if (!alternative || seen.has(key)) continue;
    seen.add(key);
    alternatives.push(alternative);
  }
  return alternatives;
}
