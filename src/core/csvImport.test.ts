import { describe, expect, it } from 'vitest';
import {
  cardsToCsv,
  detectDelimiter,
  htmlToText,
  mapRecords,
  parseAnkiHeader,
  parseCardCsv,
  parseCsv,
  parseTable,
} from './csvImport';

describe('detectDelimiter', () => {
  it('finds comma, semicolon or tab, ignoring quoted text', () => {
    expect(detectDelimiter('a,b,c\n1,2;3')).toBe(',');
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

describe('detectDelimiter across lines', () => {
  it('prefers the delimiter present in most lines', () => {
    // Commas inside the answers of a semicolon file.
    expect(detectDelimiter('Haus;house, home\nBaum;tree\nAuto;car')).toBe(';');
    expect(detectDelimiter('a\tb, c, d\ne\tf')).toBe('\t');
  });
});

describe('parseCsv edge cases', () => {
  it('keeps delimiters and quotes inside quoted fields and reports progress', () => {
    const progress: number[] = [];
    const records = parseCsv('"a;b";"x ""y"""\n"multi\nline";z', ';', {
      onProgress: (p) => progress.push(p),
    });
    expect(records).toEqual([
      { line: 1, fields: ['a;b', 'x "y"'] },
      { line: 2, fields: ['multi\nline', 'z'] },
    ]);
    expect(progress.at(-1)).toBe(1);
  });

  it('handles tab-separated text with empty trailing fields', () => {
    expect(parseCsv('a\tb\t\t\n', '\t')).toEqual([{ line: 1, fields: ['a', 'b', '', ''] }]);
  });
});

describe('parseTable', () => {
  it('suggests the mapping from a header row and the default order otherwise', () => {
    const withHeader = parseTable('Antwort,Frage,Tags\n1,eins,Zahl');
    expect(withHeader.headerDetected).toBe(true);
    expect(withHeader.mapping).toEqual({ front: 1, back: 0, notes: null, tags: 2 });

    const plain = parseTable('Haus;house');
    expect(plain.headerDetected).toBe(false);
    expect(plain.columns).toBe(2);
    expect(plain.mapping).toEqual({ front: 0, back: 1, notes: null, tags: null });
  });

  it('reads Anki text exports (separator, html, space-separated tags)', () => {
    const text =
      '#separator:tab\n#html:true\n#tags column:3\n' +
      'Hund<br>(Tier)\tdog &amp; puppy\tN5 Tiere::Haus\nKatze\t<b>cat</b>\t';
    expect(parseAnkiHeader(text)).toEqual({ delimiter: '\t', html: true, tagsColumn: 2, lines: 3 });
    const table = parseTable(text);
    expect(table.anki).toEqual({ html: true, tagsColumn: 2 });
    expect(table.mapping).toEqual({ front: 0, back: 1, notes: null, tags: 2 });
    const mapped = mapRecords(table, table.mapping, { hasHeader: false });
    expect(mapped.cards).toEqual([
      { front: 'Hund\n(Tier)', back: 'dog & puppy', tags: ['N5', 'Tiere::Haus'] },
      { front: 'Katze', back: 'cat', tags: [] },
    ]);
    expect(mapped.lines).toEqual([4, 5]);
  });

  it('can be forced to another delimiter', () => {
    expect(parseTable('a,b;c', { delimiter: ';' }).records[0]?.fields).toEqual(['a,b', 'c']);
  });
});

describe('mapRecords', () => {
  it('applies any mapping and reports invalid rows with a reason', () => {
    const table = parseTable('x;A;1;t1\ny;;2\nz;B\n;C;3', { delimiter: ';' });
    const result = mapRecords(
      table,
      { front: 1, back: 2, notes: 0, tags: 3 },
      { hasHeader: false, maxTextLength: 1 },
    );
    expect(result.cards).toEqual([
      { front: 'A', back: '1', notes: 'x', tags: ['t1'] },
      { front: 'C', back: '3', tags: [] },
    ]);
    expect(result.lines).toEqual([1, 4]);
    expect(result.invalid).toEqual([
      { line: 2, reason: 'missingFront' },
      { line: 3, reason: 'missingBack' },
    ]);
    const long = mapRecords(
      table,
      { front: 0, back: 1, notes: null, tags: null },
      {
        hasHeader: false,
        maxTextLength: 0,
      },
    );
    expect(long.invalid[0]).toEqual({ line: 1, reason: 'tooLong' });
  });
});

describe('htmlToText', () => {
  it('keeps line breaks and decodes entities', () => {
    expect(htmlToText('<div>a&nbsp;b</div><div>c &#228; &#x263A;</div>')).toBe('a b\nc ä ☺');
  });
});

describe('cardsToCsv', () => {
  it('writes a CSV that parses back to the same cards', () => {
    const cards = [
      {
        front: 'Haus',
        back: 'house; home',
        notes: 'Er sagte "hi",\nzweite Zeile',
        tags: ['A1', 'Nomen'],
      },
      { front: ' Leerzeichen', back: 'x', tags: [] },
    ];
    const csv = cardsToCsv(cards);
    expect(csv.startsWith('\uFEFFfront,back,notes,tags\r\n')).toBe(true);
    expect(parseCardCsv(csv).cards).toEqual([
      cards[0],
      { front: 'Leerzeichen', back: 'x', tags: [] },
    ]);
  });
});
