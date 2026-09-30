/**
 * Text normalization for grading. Pure functions without browser APIs.
 *
 * normalize() produces the base form; comparisonVariants() adds equivalent spellings
 * (without leading German article, umlauts folded, katakana as hiragana). Two answers
 * match exactly when their variant sets overlap.
 */

const TYPOGRAPHIC_QUOTES: [RegExp, string][] = [
  [/[„“”‟«»〝〞＂]/g, '"'],
  [/[‚‘’‛‹›`´]/g, "'"],
];

/** Punctuation that joins word parts ("Eigenkapital-Rendite", "U.S.A.", "geht's"). */
const JOINING_PUNCTUATION = /[.'\-‐‑‒–—]/g;
/** Every other punctuation mark or symbol separates words. */
const SEPARATING_PUNCTUATION = /[\p{P}\p{S}]/gu;

const LEADING_ARTICLE = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines) (?=\S)/;

export interface NormalizeOptions {
  /** Removes a leading German article ("der Hund" → "hund"). */
  stripArticle?: boolean;
}

/**
 * Unicode NFKC (unifies full-/half-width forms), typographic quotes unified, lower case,
 * punctuation removed, whitespace collapsed and trimmed. Text made only of punctuation or
 * symbols (e.g. "+") keeps its symbols, so it can still be compared.
 */
export function normalize(text: string, options: NormalizeOptions = {}): string {
  let value = text.normalize('NFKC');
  for (const [pattern, replacement] of TYPOGRAPHIC_QUOTES) {
    value = value.replace(pattern, replacement);
  }
  value = value.toLocaleLowerCase('de-DE');
  const collapsed = value.replace(/\s+/g, ' ').trim();
  value = collapsed
    .replace(JOINING_PUNCTUATION, '')
    .replace(SEPARATING_PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return collapsed;
  if (options.stripArticle) {
    value = value.replace(LEADING_ARTICLE, '');
  }
  return value;
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** ä→ae, ö→oe, ü→ue, ß→ss – so "Liquiditaet" equals "Liquidität" and "Strasse" "Straße". */
export function foldUmlauts(text: string): string {
  return text.replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char);
}

/** Katakana (U+30A1–U+30F6) → hiragana; the long vowel mark ー stays. */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/** All equivalent comparison forms of a text (unique, base form first). */
export function comparisonVariants(text: string): string[] {
  const variants = new Set<string>();
  for (const base of [normalize(text), normalize(text, { stripArticle: true })]) {
    const umlauts = foldUmlauts(base);
    variants.add(base);
    variants.add(umlauts);
    variants.add(katakanaToHiragana(base));
    variants.add(katakanaToHiragana(umlauts));
  }
  return [...variants];
}

/** The most folded form (article removed, umlauts and kana folded) – used for hashing and similarity. */
export function canonicalForm(text: string): string {
  return katakanaToHiragana(foldUmlauts(normalize(text, { stripArticle: true })));
}
