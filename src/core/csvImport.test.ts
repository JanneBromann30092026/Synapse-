import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCardCsv, parseCsv } from './csvImport';

describe('detectDelimiter', () => {
  it('finds comma, semicolon or tab in the first record, ignoring quoted text', () => {
    expect(detectDelimiter('a,b,c\n1;2;3;4;5')).toBe(',');
    expect(detectDelimiter('"a,b,c";d;e')).toBe(';');
    expect(detectDelimiter('front\tback')).toBe('\t');
    expect(detectDelimiter('nur ein feld')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, line breaks in fields, CRLF and BOM', () => {
    const text = '\uFEFFa,"b, c"\r\n"say ""hi""","zwei\nZeilen"\r\n\r\nx,y';
    expect(parseCsv(text)).toEqual([
      { line: 1, fields: ['a', 'b, c'] },
      { line: 2, fields: ['say "hi"', 'zwei\nZeilen'] },
      { line: 5, fields: ['x', 'y'] },
    ]);
  });

  it('accepts a missing final line break', () => {
    expect(parseCsv('a;b').map((r) => r.fields)).toEqual([['a', 'b']]);
  });
});

describe('parseCardCsv', () => {
  it('maps a header row in any column order, including German names', () => {
    const result = parseCardCsv('Tags;Rückseite;Vorderseite\n"VWL, BIP";Bruttoinlandsprodukt;BIP');
    expect(result).toEqual({
      cards: [{ front: 'BIP', back: 'Bruttoinlandsprodukt', tags: ['VWL', 'BIP'] }],
      invalidRows: [],
    });
  });

  it('uses front, back, notes, tags without header', () => {
    const result = parseCardCsv('Haus\tHaus; Heim\tNomen\tA1, Wohnen\nHund\tdog');
    expect(result.cards).toEqual([
      { front: 'Haus', back: 'Haus; Heim', notes: 'Nomen', tags: ['A1', 'Wohnen'] },
      { front: 'Hund', back: 'dog', tags: [] },
    ]);
  });

  it('reports rows without front or back side', () => {
    const result = parseCardCsv('front,back\nA,1\n,2\nB,\nC,3');
    expect(result.cards.map((c) => c.front)).toEqual(['A', 'C']);
    expect(result.invalidRows).toEqual([3, 4]);
  });
});
