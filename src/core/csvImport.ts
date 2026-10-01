/** Pure CSV/TSV parsing for importing flashcards (front, back, notes, tags). */
import { normalizeCardText, parseTags } from './cards';

export interface ImportedCard {
  front: string;
  back: string;
  notes?: string;
  tags: string[];
}

export interface CardImportResult {
  cards: ImportedCard[];
  /** 1-based line numbers (of the record start) that had no front or back side. */
  invalidRows: number[];
}

const DELIMITERS = [',', ';', '\t'] as const;

/** Picks the delimiter that occurs most often outside quotes in the first record. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best: string = ',';
  for (const [delimiter, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

export interface CsvRecord {
  line: number;
  fields: string[];
}

/** RFC 4180 parser: quoted fields with "" escapes and line breaks, CRLF or LF, optional BOM. */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): CsvRecord[] {
  const text = input.replace(/^\uFEFF/, '');
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    if (fields.some((f) => f.trim() !== '')) records.push({ line: recordLine, fields });
    fields = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

type Column = keyof ImportedCard;

const HEADER_NAMES: Record<Column, readonly string[]> = {
  front: ['front', 'vorderseite', 'frage', 'question'],
  back: ['back', 'rückseite', 'rueckseite', 'antwort', 'answer'],
  notes: ['notes', 'notizen', 'notiz', 'kontext'],
  tags: ['tags', 'tag', 'schlagwörter'],
};

function headerColumns(fields: string[]): Map<Column, number> | null {
  const columns = new Map<Column, number>();
  fields.forEach((field, index) => {
    const name = normalizeCardText(field);
    for (const [column, names] of Object.entries(HEADER_NAMES) as [Column, readonly string[]][]) {
      if (names.includes(name) && !columns.has(column)) columns.set(column, index);
    }
  });
  return columns.has('front') && columns.has('back') ? columns : null;
}

const DEFAULT_COLUMNS = new Map<Column, number>([
  ['front', 0],
  ['back', 1],
  ['notes', 2],
  ['tags', 3],
]);

/**
 * Turns CSV/TSV text into cards. A header row (front/back/notes/tags or the German names)
 * is detected and may order the columns freely; without one the order is front, back,
 * notes, tags. Rows without front or back side are reported, not imported.
 */
export function parseCardCsv(text: string): CardImportResult {
  const records = parseCsv(text);
  const first = records[0];
  const header = first ? headerColumns(first.fields) : null;
  const columns = header ?? DEFAULT_COLUMNS;
  const cards: ImportedCard[] = [];
  const invalidRows: number[] = [];

  for (const record of header ? records.slice(1) : records) {
    const get = (column: Column) => {
      const index = columns.get(column);
      return index === undefined ? '' : (record.fields[index] ?? '').trim();
    };
    const front = get('front');
    const back = get('back');
    if (!front || !back) {
      invalidRows.push(record.line);
      continue;
    }
    const notes = get('notes');
    cards.push({ front, back, ...(notes ? { notes } : {}), tags: parseTags(get('tags')) });
  }
  return { cards, invalidRows };
}
