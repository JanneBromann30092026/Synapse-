import type { Delimiter } from '@/core/csvImport';
import { analyzeImport, type ImportAnalysis, type ImportSource } from '@/core/importAnalysis';
import type { ImportResponse } from '@/workers/importProtocol';

export interface AnalyzeRequest {
  source: ImportSource;
  delimiter?: Delimiter;
  onProgress?: (share: number) => void;
}

/** Parses in a short-lived Web Worker (large files keep the UI responsive). */
function analyzeInWorker({
  source,
  delimiter,
  onProgress,
}: AnalyzeRequest): Promise<ImportAnalysis> {
  return new Promise<ImportAnalysis>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/import.worker.ts', import.meta.url), {
      type: 'module',
      name: 'import',
    });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<ImportResponse>) => {
      const data = event.data;
      if (data.type === 'progress') {
        onProgress?.(data.progress);
      } else if (data.type === 'result') {
        finish();
        resolve(data.analysis);
      } else {
        finish();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(event.message || 'Import worker failed'));
    };
    const transfer = 'bytes' in source ? [source.bytes.buffer] : [];
    worker.postMessage(
      { type: 'analyze', id: 1, source, ...(delimiter ? { delimiter } : {}) },
      transfer,
    );
  });
}

/** Decodes and analyzes an import (file bytes or pasted text), in a worker when available. */
export function analyze(request: AnalyzeRequest): Promise<ImportAnalysis> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(
      analyzeImport(request.source, {
        ...(request.delimiter ? { delimiter: request.delimiter } : {}),
        onProgress: request.onProgress,
      }),
    );
  }
  return analyzeInWorker(request);
}

export async function analyzeFile(
  file: Blob,
  onProgress?: (share: number) => void,
): Promise<ImportAnalysis> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return analyze({ source: { bytes }, onProgress });
}
