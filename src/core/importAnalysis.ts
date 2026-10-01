/** First step of every import: decode a file and recognize Synapse JSON or a CSV/TSV table. */
import {
  looksLikeJson,
  parseSynapseFile,
  summarizeFile,
  type FileErrorCode,
  type FileSummary,
  type SynapseFile,
} from './backup/format';
import { parseTable, type Delimiter, type ImportTable } from './csvImport';
import { decodeText, type TextEncodingName } from './textDecode';

export type ImportAnalysis =
  | { kind: 'table'; table: ImportTable; text: string; encoding: TextEncodingName }
  | { kind: 'synapse'; file: SynapseFile; summary: FileSummary }
  | { kind: 'error'; code: FileErrorCode | 'empty'; path?: string };

export type ImportSource = { bytes: Uint8Array } | { text: string };

export interface AnalyzeOptions {
  delimiter?: Delimiter;
  onProgress?: (share: number) => void;
}

export function analyzeImport(source: ImportSource, options: AnalyzeOptions = {}): ImportAnalysis {
  const { text, encoding } =
    'bytes' in source
      ? decodeText(source.bytes)
      : { text: source.text, encoding: 'utf-8' as const };
  if (text.trim() === '') return { kind: 'error', code: 'empty' };
  if (looksLikeJson(text)) {
    const parsed = parseSynapseFile(text);
    options.onProgress?.(1);
    return parsed.ok
      ? { kind: 'synapse', file: parsed.file, summary: summarizeFile(parsed.file) }
      : { kind: 'error', code: parsed.code, ...(parsed.path ? { path: parsed.path } : {}) };
  }
  const table = parseTable(text, options);
  if (table.records.length === 0) return { kind: 'error', code: 'empty' };
  return { kind: 'table', table, text, encoding };
}
