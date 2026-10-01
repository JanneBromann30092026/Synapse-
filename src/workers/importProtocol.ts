import type { Delimiter } from '@/core/csvImport';
import type { ImportAnalysis, ImportSource } from '@/core/importAnalysis';

/** Message protocol of src/workers/import.worker.ts. */

export type ImportRequest = {
  type: 'analyze';
  id: number;
  source: ImportSource;
  delimiter?: Delimiter;
};

export type ImportResponse =
  | { type: 'progress'; id: number; progress: number }
  | { type: 'result'; id: number; analysis: ImportAnalysis }
  | { type: 'error'; id: number; message: string };
