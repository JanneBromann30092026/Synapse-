import { describe, expect, it } from 'vitest';
import { collectTags, mergeTags, normalizeCardText, parseAnswers, parseTags } from './cards';

describe('normalizeCardText', () => {
  it('ignores case, surrounding and repeated whitespace', () => {
    expect(normalizeCardText('  Das   Haus ')).toBe('das haus');
    expect(normalizeCardText('Straße')).toBe(
      normalizeCardText('STRASSE'.toLowerCase().replace('ss', 'ß')),
    );
  });

  it('unifies full-width and half-width characters (NFKC)', () => {
    expect(normalizeCardText('ＡＢＣ　１２３')).toBe('abc 123');
    expect(normalizeCardText('ｶﾀｶﾅ')).toBe('カタカナ');
  });

  it('keeps Japanese text otherwise unchanged', () => {
    expect(normalizeCardText('犬')).toBe('犬');
    expect(normalizeCardText('ありがとう')).not.toBe(normalizeCardText('アリガトウ'));
  });
});

describe('parseAnswers', () => {
  it('splits at semicolons and trims', () => {
    expect(parseAnswers('Haus; Heim;Zuhause')).toEqual(['Haus', 'Heim', 'Zuhause']);
  });

  it('drops empty entries and duplicates', () => {
    expect(parseAnswers(' ;Haus;; heim ;  ; Heim ;')).toEqual(['Haus', 'heim']);
    expect(parseAnswers('   ')).toEqual([]);
  });

  it('keeps a single answer and collapses inner whitespace', () => {
    expect(parseAnswers('  der   große Hund ')).toEqual(['der große Hund']);
  });
});

describe('parseTags / mergeTags', () => {
  it('splits at comma, semicolon and newline and strips #', () => {
    expect(parseTags('Verb, #Alltag; N5\nJLPT')).toEqual(['Verb', 'Alltag', 'N5', 'JLPT']);
  });

  it('removes empty and case-insensitive duplicate tags', () => {
    expect(parseTags(' , verb, Verb ,,  VERB ')).toEqual(['verb']);
  });

  it('cuts overly long tags', () => {
    expect(parseTags('x'.repeat(50))[0]).toHaveLength(40);
  });

  it('merges into existing tags without duplicates', () => {
    expect(mergeTags(['Verb'], ['verb', ' Nomen ', '#Alltag'])).toEqual([
      'Verb',
      'Nomen',
      'Alltag',
    ]);
  });
});

describe('collectTags', () => {
  it('returns unique tags sorted in German order', () => {
    expect(
      collectTags([{ tags: ['Übung', 'Verb'] }, { tags: ['verb', 'Alltag'] }, { tags: [] }]),
    ).toEqual(['Alltag', 'Übung', 'Verb']);
  });
});
