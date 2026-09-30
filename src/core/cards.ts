/** Pure helpers for flashcards: normalization, tags and multiple answers. */

/**
 * Normalizes card text for duplicate detection: Unicode NFKC (full-width → half-width,
 * compatibility kana), lower case, collapsed whitespace, trimmed.
 */
export function normalizeCardText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
}

/** Separator for several correct answers on the back side: "Haus; Heim; Zuhause". */
export const ANSWER_SEPARATOR = ';';

/** Splits the back side into its accepted answers (trimmed, no empty or duplicate entries). */
export function parseAnswers(back: string): string[] {
  const seen = new Set<string>();
  const answers: string[] = [];
  for (const part of back.split(ANSWER_SEPARATOR)) {
    const answer = part.replace(/\s+/g, ' ').trim();
    const key = normalizeCardText(answer);
    if (!answer || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
}

export const TAG_MAX_LENGTH = 40;

/**
 * Parses tag input like "Verb, #Alltag; N5" into clean tags: split at comma, semicolon or
 * line break, leading "#" removed, inner whitespace collapsed, case-insensitive duplicates
 * dropped (first spelling wins), overly long tags cut.
 */
export function parseTags(input: string): string[] {
  return mergeTags([], input.split(/[,;\n]/));
}

/** Adds new tags to existing ones with the same cleanup rules as parseTags. */
export function mergeTags(existing: readonly string[], additions: readonly string[]): string[] {
  const result = [...existing];
  const seen = new Set(existing.map((tag) => tag.toLocaleLowerCase('de-DE')));
  for (const raw of additions) {
    const tag = raw
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TAG_MAX_LENGTH)
      .trim();
    const key = tag.toLocaleLowerCase('de-DE');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** All tags used in the given cards, sorted alphabetically (German collation). */
export function collectTags(cards: readonly { tags: readonly string[] }[]): string[] {
  const byKey = new Map<string, string>();
  for (const card of cards) {
    for (const tag of card.tags) {
      const key = tag.toLocaleLowerCase('de-DE');
      if (!byKey.has(key)) byKey.set(key, tag);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'de-DE'));
}
