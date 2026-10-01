/// <reference lib="webworker" />
import { computeLinks, updateLinks } from '@/core/brain/links';
import type { LinksRequest, LinksResponse } from './linksProtocol';

declare const self: DedicatedWorkerGlobalScope;

function post(message: LinksResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<LinksRequest>) => {
  const { id, job } = event.data;
  try {
    const set = { ids: job.ids, dim: job.dim, matrix: job.matrix };
    const onProgress = (progress: number) => post({ type: 'progress', id, progress });
    const links =
      job.mode === 'full'
        ? computeLinks(set, job.options, { onProgress })
        : updateLinks(set, job.previous, job.changedIds, job.removedIds, job.options, {
            onProgress,
          });
    post({ type: 'result', id, links });
  } catch (error: unknown) {
    post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
