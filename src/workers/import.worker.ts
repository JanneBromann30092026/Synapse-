/// <reference lib="webworker" />
import { analyzeImport } from '@/core/importAnalysis';
import type { ImportRequest, ImportResponse } from './importProtocol';

declare const self: DedicatedWorkerGlobalScope;

function post(message: ImportResponse): void {
  self.postMessage(message);
}

// Decoding, CSV parsing and JSON validation of large files without blocking the UI.
self.onmessage = (event: MessageEvent<ImportRequest>) => {
  const { id, source, delimiter } = event.data;
  try {
    const analysis = analyzeImport(source, {
      ...(delimiter ? { delimiter } : {}),
      onProgress: (progress) => post({ type: 'progress', id, progress }),
    });
    post({ type: 'result', id, analysis });
  } catch (error: unknown) {
    post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
