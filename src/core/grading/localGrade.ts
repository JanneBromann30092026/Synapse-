import { splitAlternatives } from './alternatives';
import { canonicalForm, comparisonVariants } from './normalize';
import { similarity } from './similarity';

/** Typo tolerance only applies to short answers; longer ones go to the AI (or self assessment). */
export const FUZZY_MAX_WORDS = 4;

export interface LocalGradeOptions {
  /** Minimum similarity (0..1) for a typo to still count as correct. 1 = exact matches only. */
  typoTolerance: number;
  maxFuzzyWords?: number;
}

export type LocalGradeResult =
  | { verdict: 'correct'; method: 'exact'; confidence: 1; matched: string }
  | { verdict: 'correct'; method: 'fuzzy'; confidence: number; matched: string; similarity: number }
  | { verdict: 'incorrect'; method: 'exact'; confidence: 1; reason: 'empty' | 'dont_know' }
  | { verdict: 'undecided'; similarity: number; closest?: string };

/** "I don't know" answers (canonical form) – wrong without asking the AI. */
const DONT_KNOW = new Set(
  [
    'weiß nicht',
    'weiß ich nicht',
    'ich weiß nicht',
    'ich weiß es nicht',
    'keine ahnung',
    'kein plan',
    'idk',
    'わからない',
    'わかりません',
    '分からない',
    '分かりません',
    '知らない',
  ].map(canonicalForm),
);

const HAS_CONTENT = /[\p{L}\p{N}]/u;

function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

function matchesExactly(answer: string, alternatives: readonly string[]): string | undefined {
  const variants = new Set(comparisonVariants(answer));
  return alternatives.find((alternative) =>
    comparisonVariants(alternative).some((variant) => variants.has(variant)),
  );
}

/**
 * First grading stage, entirely local:
 * - correct/exact: an alternative matches after normalization (also several alternatives
 *   listed by the user, e.g. "Haus, Heim")
 * - correct/fuzzy: similarity ≥ typo tolerance for a short answer (≤ 4 words, same digits)
 * - incorrect/exact: empty input, only punctuation or "weiß nicht"
 * - otherwise undecided (next stage: cache, AI or self assessment)
 */
export function localGrade(
  userAnswer: string,
  expected: string,
  options: LocalGradeOptions,
): LocalGradeResult {
  if (!userAnswer.trim()) {
    return { verdict: 'incorrect', method: 'exact', confidence: 1, reason: 'empty' };
  }
  const alternatives = splitAlternatives(expected);

  const matched = matchesExactly(userAnswer, alternatives);
  if (matched !== undefined) return { verdict: 'correct', method: 'exact', confidence: 1, matched };

  const parts = userAnswer
    .split(/[;,]|\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const matches = parts.map((part) => matchesExactly(part, alternatives));
    if (matches.every((match) => match !== undefined)) {
      return { verdict: 'correct', method: 'exact', confidence: 1, matched: matches.join('; ') };
    }
  }

  const answer = canonicalForm(userAnswer);
  if (!HAS_CONTENT.test(answer)) {
    return { verdict: 'incorrect', method: 'exact', confidence: 1, reason: 'empty' };
  }
  if (DONT_KNOW.has(answer)) {
    return { verdict: 'incorrect', method: 'exact', confidence: 1, reason: 'dont_know' };
  }

  let best = 0;
  let closest: string | undefined;
  for (const alternative of alternatives) {
    const score = similarity(answer, canonicalForm(alternative));
    if (score > best) {
      best = score;
      closest = alternative;
    }
  }
  const words = answer.split(' ').length;
  if (
    closest !== undefined &&
    words <= (options.maxFuzzyWords ?? FUZZY_MAX_WORDS) &&
    best >= options.typoTolerance &&
    digitsOf(answer) === digitsOf(canonicalForm(closest))
  ) {
    return {
      verdict: 'correct',
      method: 'fuzzy',
      confidence: best,
      matched: closest,
      similarity: best,
    };
  }
  return closest === undefined
    ? { verdict: 'undecided', similarity: 0 }
    : { verdict: 'undecided', similarity: best, closest };
}
