import { describe, expect, it } from 'vitest';
import {
  canonicalForm,
  comparisonVariants,
  foldUmlauts,
  katakanaToHiragana,
  localGrade,
  normalize,
  similarity,
  splitAlternatives,
} from '.';

const options = { typoTolerance: 0.85 };

describe('normalize', () => {
  it('lower-cases, trims, collapses whitespace and removes punctuation', () => {
    expect(normalize('  Das   ist  EIN Test!  ')).toBe('das ist ein test');
    expect(normalize('Haus, Hof & Garten?')).toBe('haus hof garten');
  });

  it('joins word parts at hyphens, periods and apostrophes', () => {
    expect(normalize('Eigenkapital-Rendite')).toBe('eigenkapitalrendite');
    expect(normalize('U.S.A.')).toBe('usa');
    expect(normalize('Wie geht’s?')).toBe('wie gehts');
  });

  it('unifies typographic quotes', () => {
    expect(normalize('„Hallo“')).toBe(normalize('"Hallo"'));
    expect(normalize('‚Hallo‘')).toBe(normalize("'Hallo'"));
  });

  it('unifies full- and half-width forms (NFKC)', () => {
    expect(normalize('ＡＢＣ１２３')).toBe('abc123');
    expect(normalize('ｶﾀｶﾅ')).toBe('カタカナ');
    expect(normalize('ねこ　です')).toBe('ねこ です');
  });

  it('removes a leading German article only on request', () => {
    expect(normalize('Der Hund')).toBe('der hund');
    expect(normalize('Der Hund', { stripArticle: true })).toBe('hund');
    expect(normalize('eine Aktie', { stripArticle: true })).toBe('aktie');
    // A lone article stays; words that merely start like one are untouched.
    expect(normalize('die', { stripArticle: true })).toBe('die');
    expect(normalize('Dienst', { stripArticle: true })).toBe('dienst');
  });

  it('keeps answers made only of symbols comparable', () => {
    expect(normalize(' + ')).toBe('+');
    expect(normalize('')).toBe('');
  });
});

describe('comparison variants', () => {
  it('folds umlauts and ß', () => {
    expect(foldUmlauts('größe straße über')).toBe('groesse strasse ueber');
  });

  it('turns katakana into hiragana, keeping the long vowel mark', () => {
    expect(katakanaToHiragana('カタカナ')).toBe('かたかな');
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー');
    expect(katakanaToHiragana('漢字とかな')).toBe('漢字とかな');
  });

  it('contains base form, article-free, umlaut and kana variants', () => {
    expect(comparisonVariants('Die Größe')).toEqual(
      expect.arrayContaining(['die größe', 'die groesse', 'größe', 'groesse']),
    );
    expect(comparisonVariants('ネコ')).toEqual(['ネコ', 'ねこ']);
    expect(canonicalForm('Die Liquidität')).toBe('liquiditaet');
  });
});

describe('splitAlternatives', () => {
  it('splits at semicolons and spaced slashes', () => {
    expect(splitAlternatives('Haus; Heim ;Zuhause')).toEqual(['Haus', 'Heim', 'Zuhause']);
    expect(splitAlternatives('Haus / Heim')).toEqual(['Haus', 'Heim']);
  });

  it('keeps unspaced slashes and drops empty parts and duplicates', () => {
    expect(splitAlternatives('km/h')).toEqual(['km/h']);
    expect(splitAlternatives('Haus;; haus ; HAUS.; ')).toEqual(['Haus']);
    expect(splitAlternatives('')).toEqual([]);
  });
});

describe('similarity', () => {
  it('is 1 for equal and 0 for completely different or empty texts', () => {
    expect(similarity('haus', 'haus')).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', '')).toBe(0);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('is the normalized Levenshtein distance', () => {
    expect(similarity('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7);
    expect(similarity('liquiditat', 'liquiditaet')).toBeCloseTo(1 - 1 / 11);
    expect(similarity('abc', 'abcd')).toBeCloseTo(0.75);
    expect(similarity('flaw', 'lawn')).toBeCloseTo(0.5);
  });

  it('is symmetric and counts code points, not UTF-16 units', () => {
    expect(similarity('rendite', 'rednite')).toBe(similarity('rednite', 'rendite'));
    expect(similarity('𠮷野家', '𠮷野屋')).toBeCloseTo(2 / 3);
    expect(similarity('ねこ', 'ねご')).toBeCloseTo(0.5);
  });

  it('handles long definitions quickly', () => {
    const long = 'Der Cashflow ist der Zufluss liquider Mittel in einer Periode. '.repeat(8);
    const started = performance.now();
    expect(similarity(long, long.replace('Periode', 'Zeitspanne'))).toBeGreaterThan(0.95);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('localGrade', () => {
  it('accepts exact matches after normalization', () => {
    expect(localGrade('haus', 'Haus', options)).toMatchObject({
      verdict: 'correct',
      method: 'exact',
      confidence: 1,
    });
    expect(localGrade('  Haus! ', 'Haus', options)).toMatchObject({ method: 'exact' });
  });

  it('treats umlaut spellings as exact', () => {
    expect(localGrade('Liquiditaet', 'Liquidität', options)).toMatchObject({
      verdict: 'correct',
      method: 'exact',
    });
    expect(localGrade('Strasse', 'Straße', options)).toMatchObject({ method: 'exact' });
    expect(localGrade('Muehle', 'Mühle', options)).toMatchObject({ method: 'exact' });
  });

  it('ignores a missing or added German article', () => {
    expect(localGrade('Hund', 'der Hund', options)).toMatchObject({ method: 'exact' });
    expect(localGrade('die Bilanz', 'Bilanz', options)).toMatchObject({ method: 'exact' });
  });

  it('accepts any of several alternatives, also several at once', () => {
    const back = 'Haus; Heim; Zuhause';
    expect(localGrade('Heim', back, options)).toMatchObject({ matched: 'Heim' });
    expect(localGrade('zuhause', back, options)).toMatchObject({ matched: 'Zuhause' });
    expect(localGrade('Haus, Heim', back, options)).toMatchObject({
      verdict: 'correct',
      method: 'exact',
    });
    expect(localGrade('Haus, Auto', back, options).verdict).toBe('undecided');
  });

  it('accepts small typos in short answers', () => {
    const result = localGrade('Eigenkapitalrendtie', 'Eigenkapitalrendite', options);
    expect(result).toMatchObject({ verdict: 'correct', method: 'fuzzy' });
    expect(result.verdict === 'correct' && result.confidence).toBeGreaterThan(0.85);
    expect(localGrade('Liquiditat', 'Liquidität', options)).toMatchObject({ method: 'fuzzy' });
    expect(localGrade('Abschreibng', 'Abschreibung', options)).toMatchObject({
      method: 'fuzzy',
    });
  });

  it('does not accept typos in very short words or with other numbers', () => {
    expect(localGrade('Hand', 'Hund', options).verdict).toBe('undecided');
    expect(localGrade('1991', '1990', options).verdict).toBe('undecided');
    expect(localGrade('123456780', '123456789', options).verdict).toBe('undecided');
  });

  it('respects the typo tolerance', () => {
    expect(localGrade('Abschreibng', 'Abschreibung', { typoTolerance: 0.95 }).verdict).toBe(
      'undecided',
    );
    expect(localGrade('Abschreibng', 'Abschreibung', { typoTolerance: 1 }).verdict).toBe(
      'undecided',
    );
    expect(localGrade('Abschreibung', 'Abschreibung', { typoTolerance: 1 }).verdict).toBe(
      'correct',
    );
  });

  it('only uses the typo tolerance for answers of up to 4 words', () => {
    const back = 'Zufluss liquider Mittel pro Periode';
    expect(localGrade('Zufluss liquider Mittel pro Periodee', back, options).verdict).toBe(
      'undecided',
    );
    expect(localGrade('Zufluss liquider Mittl', 'Zufluss liquider Mittel', options)).toMatchObject({
      method: 'fuzzy',
    });
  });

  it('matches kana variants', () => {
    expect(localGrade('ネコ', 'ねこ', options)).toMatchObject({ method: 'exact' });
    expect(localGrade('ねこ', 'ネコ', options)).toMatchObject({ method: 'exact' });
    expect(localGrade('ｺｰﾋｰ', 'コーヒー', options)).toMatchObject({ method: 'exact' });
    expect(localGrade('いぬ', 'ねこ', options).verdict).toBe('undecided');
  });

  it('grades empty, punctuation-only and "don’t know" answers as wrong', () => {
    expect(localGrade('', 'Haus', options)).toMatchObject({
      verdict: 'incorrect',
      method: 'exact',
      reason: 'empty',
    });
    expect(localGrade('   ', 'Haus', options)).toMatchObject({ reason: 'empty' });
    expect(localGrade('???', 'Haus', options)).toMatchObject({ reason: 'empty' });
    expect(localGrade('Weiß nicht.', 'Haus', options)).toMatchObject({ reason: 'dont_know' });
    expect(localGrade('keine Ahnung', 'Haus', options)).toMatchObject({ reason: 'dont_know' });
    expect(localGrade('わからない', 'いえ', options)).toMatchObject({ reason: 'dont_know' });
    // …unless that is the expected answer.
    expect(localGrade('keine Ahnung', 'keine Ahnung', options).verdict).toBe('correct');
  });

  it('leaves paraphrases and long definitions undecided', () => {
    const definition =
      'Kennzahl, die den Gewinn ins Verhältnis zum eingesetzten Eigenkapital setzt';
    const result = localGrade('Gewinn geteilt durch Eigenkapital', definition, options);
    expect(result.verdict).toBe('undecided');
    expect(localGrade('Wohnhaus', 'Haus; Heim', options)).toMatchObject({
      verdict: 'undecided',
      closest: 'Haus',
    });
    expect(localGrade(definition, definition, options).verdict).toBe('correct');
  });
});
