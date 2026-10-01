/**
 * Pure CSV/TSV parsing for importing flashcards (front, back, notes, tags): delimiter and
 * header detection, Anki text exports, column mapping and validation of the resulting rows.
 */
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

export const DELIMITERS = [',', ';', '\t'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Lines inspected for delimiter detection. */
const DETECT_LINES = 20;

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === delimiter) count++;
  }
  return count;
}

/**
 * Picks the delimiter that splits the first lines most consistently: the one that occurs in
 * the most lines, then most often overall. Quoted text is ignored; comma is the fallback.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .slice(0, DETECT_LINES);
  let best: Delimiter = ',';
  let bestScore: [number, number] = [0, 0];
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const score: [number, number] = [
      counts.filter((count) => count > 0).length,
      counts.reduce((sum, count) => sum + count, 0),
    ];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export interface CsvRecord {
  line: number;
  fields: string[];
}

export interface ParseProgress {
  /** Called now and then with the share of the text parsed so far (0..1). */
  onProgress?: (share: number) => void;
}

const PROGRESS_STEP = 200_000;

/** RFC 4180 parser: quoted fields with "" escapes and line breaks, CRLF or LF, optional BOM. */
export function parseCsv(
  input: string,
  delimiter: string = detectDelimiter(input),
  { onProgress }: ParseProgress = {},
): CsvRecord[] {
  const text = input.replace(/^\uFEFF/, '');
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let nextProgress = PROGRESS_STEP;

  const endRecord = () => {
    fields.push(field);
    if (fields.some((f) => f.trim() !== '')) records.push({ line: recordLine, fields });
    fields = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    if (onProgress && i >= nextProgress) {
      onProgress(i / text.length);
      nextProgress += PROGRESS_STEP;
    }
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
  onProgress?.(1);
  return records;
}

// --- Anki text export -------------------------------------------------------

export interface AnkiHeader {
  delimiter?: Delimiter;
  html: boolean;
  /** 0-based column of the space-separated Anki tags. */
  tagsColumn?: number;
  /** Number of header lines ("#key:value") at the start of the text. */
  lines: number;
}

const ANKI_SEPARATORS: Record<string, Delimiter> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  '\t': '\t',
  ',': ',',
  ';': ';',
};

/**
 * Reads the "#separator:tab", "#html:true", "#tags column:3" lines Anki (2.1.55+) puts at the
 * top of a text export. Returns null when the text has no such header.
 */
export function parseAnkiHeader(text: string): AnkiHeader | null {
  const header: AnkiHeader = { html: false, lines: 0 };
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const match = /^#([a-z ]+):(.*)$/i.exec(line);
    if (!match) break;
    header.lines++;
    const key = (match[1] ?? '').trim().toLowerCase();
    const value = (match[2] ?? '').trim();
    if (key === 'separator') {
      const delimiter = ANKI_SEPARATORS[value.toLowerCase()] ?? ANKI_SEPARATORS[value];
      if (delimiter) header.delimiter = delimiter;
    } else if (key === 'html') {
      header.html = value.toLowerCase() === 'true';
    } else if (key === 'tags column') {
      const column = Number.parseInt(value, 10);
      if (column >= 1) header.tagsColumn = column - 1;
    }
  }
  return header.lines > 0 ? header : null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Turns simple Anki HTML into plain text: line breaks kept, tags removed, entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Tables and column mapping ---------------------------------------------

/** A parsed file before the user maps its columns. */
export interface ImportTable {
  delimiter: Delimiter;
  records: CsvRecord[];
  /** Number of columns of the widest record. */
  columns: number;
  /** Whether the first record looks like a header row. */
  headerDetected: boolean;
  /** Mapping suggested from the header row (or the default column order). */
  mapping: ColumnMapping;
  /** Set for Anki text exports. */
  anki?: Pick<AnkiHeader, 'html' | 'tagsColumn'>;
}

/** 0-based column per card field; null = not imported. */
export interface ColumnMapping {
  front: number;
  back: number;
  notes: number | null;
  tags: number | null;
}

type Column = keyof ColumnMapping;

const HEADER_NAMES: Record<Column, readonly string[]> = {
  front: ['front', 'vorderseite', 'frage', 'question', 'begriff', 'term'],
  back: ['back', 'rückseite', 'rueckseite', 'antwort', 'answer', 'definition'],
  notes: ['notes', 'notizen', 'notiz', 'kontext', 'hinweis'],
  tags: ['tags', 'tag', 'schlagwörter', 'schlagworte'],
};

/** Mapping from a header row, or null when the row has no front and back column names. */
export function headerMapping(fields: readonly string[]): ColumnMapping | null {
  const found = new Map<Column, number>();
  fields.forEach((field, index) => {
    const name = normalizeCardText(field);
    for (const [column, names] of Object.entries(HEADER_NAMES) as [Column, readonly string[]][]) {
      if (names.includes(name) && !found.has(column)) found.set(column, index);
    }
  });
  const front = found.get('front');
  const back = found.get('back');
  if (front === undefined || back === undefined) return null;
  return { front, back, notes: found.get('notes') ?? null, tags: found.get('tags') ?? null };
}

/** front, back, notes, tags in this order, as far as the columns exist. */
export function defaultMapping(columns: number): ColumnMapping {
  return {
    front: 0,
    back: Math.min(1, Math.max(columns - 1, 0)),
    notes: columns > 2 ? 2 : null,
    tags: columns > 3 ? 3 : null,
  };
}

export interface TableOptions extends ParseProgress {
  /** Forces a delimiter instead of detecting it. */
  delimiter?: Delimiter;
}

/** Parses CSV/TSV text (also Anki text exports) into a table with a suggested mapping. */
export function parseTable(text: string, options: TableOptions = {}): ImportTable {
  const anki = parseAnkiHeader(text);
  const body = anki
    ? text
        .split(/\r\n|\n|\r/)
        .slice(anki.lines)
        .join('\n')
    : text;
  const delimiter = options.delimiter ?? anki?.delimiter ?? detectDelimiter(body);
  const records = parseCsv(body, delimiter, options).map((record) =>
    anki ? { ...record, line: record.line + anki.lines } : record,
  );
  const columns = records.reduce((max, record) => Math.max(max, record.fields.length), 0);
  const first = records[0];
  const header = first && !anki ? headerMapping(first.fields) : null;
  let mapping = header ?? defaultMapping(columns);
  if (anki?.tagsColumn !== undefined && anki.tagsColumn < columns) {
    mapping = {
      ...mapping,
      tags: anki.tagsColumn,
      notes: mapping.notes === anki.tagsColumn ? null : mapping.notes,
    };
  }
  return {
    delimiter,
    records,
    columns,
    headerDetected: header !== null,
    mapping,
    ...(anki ? { anki: { html: anki.html, tagsColumn: anki.tagsColumn } } : {}),
  };
}

export type InvalidRowReason = 'missingFront' | 'missingBack' | 'tooLong';

export interface InvalidRow {
  line: number;
  reason: InvalidRowReason;
}

export interface MappedCards {
  cards: ImportedCard[];
  /** Line number of each card's record (same order as cards). */
  lines: number[];
  invalid: InvalidRow[];
}

export interface MapOptions {
  /** Skips the first record (header row). */
  hasHeader: boolean;
  /** Maximum length of front, back and notes; longer rows are reported. */
  maxTextLength?: number;
}

/** Applies a column mapping. Rows without front or back side (or too long) are reported. */
export function mapRecords(
  table: Pick<ImportTable, 'records' | 'anki'>,
  mapping: ColumnMapping,
  { hasHeader, maxTextLength = Number.POSITIVE_INFINITY }: MapOptions,
): MappedCards {
  const result: MappedCards = { cards: [], lines: [], invalid: [] };
  const clean = (value: string) => (table.anki?.html ? htmlToText(value) : value.trim());
  const records = hasHeader ? table.records.slice(1) : table.records;
  for (const record of records) {
    const get = (index: number | null) => (index === null ? '' : clean(record.fields[index] ?? ''));
    const front = get(mapping.front);
    const back = get(mapping.back);
    const notes = get(mapping.notes);
    const rawTags = mapping.tags === null ? '' : (record.fields[mapping.tags] ?? '');
    // Anki separates tags with spaces (hierarchies use "::").
    const tags =
      table.anki && mapping.tags === table.anki.tagsColumn
        ? parseTags(rawTags.trim().split(/\s+/).join(','))
        : parseTags(rawTags);
    if (!front) {
      result.invalid.push({ line: record.line, reason: 'missingFront' });
    } else if (!back) {
      result.invalid.push({ line: record.line, reason: 'missingBack' });
    } else if (
      front.length > maxTextLength ||
      back.length > maxTextLength ||
      notes.length > maxTextLength
    ) {
      result.invalid.push({ line: record.line, reason: 'tooLong' });
    } else {
      result.cards.push({ front, back, ...(notes ? { notes } : {}), tags });
      result.lines.push(record.line);
    }
  }
  return result;
}

/**
 * Turns CSV/TSV text into cards with the detected mapping. A header row (front/back/notes/tags
 * or the German names) may order the columns freely; without one the order is front, back,
 * notes, tags. Rows without front or back side are reported, not imported.
 */
export function parseCardCsv(text: string): CardImportResult {
  const table = parseTable(text);
  const mapped = mapRecords(table, table.mapping, { hasHeader: table.headerDetected });
  return { cards: mapped.cards, invalidRows: mapped.invalid.map((row) => row.line) };
}

// --- Export -----------------------------------------------------------------

function csvField(value: string): string {
  return /[",\n\r]/.test(value) || value !== value.trim()
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

/**
 * Cards as CSV with header "front,back,notes,tags" (comma, CRLF, UTF-8 BOM so Excel and
 * Numbers read umlauts correctly). Tags are joined with ", " – parseTags splits them again.
 */
export function cardsToCsv(cards: readonly ImportedCard[]): string {
  const rows = [['front', 'back', 'notes', 'tags']];
  for (const card of cards) {
    rows.push([card.front, card.back, card.notes ?? '', card.tags.join(', ')]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
