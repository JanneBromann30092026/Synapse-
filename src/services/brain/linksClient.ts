import { computeLinks, updateLinks, type SemanticLink } from '@/core/brain/links';
import type { LinksJob, LinksResponse } from '@/workers/linksProtocol';

export type LinksRunner = (
  job: LinksJob,
  onProgress?: (p: number) => void,
) => Promise<SemanticLink[]>;

/** Computes links in a short-lived Web Worker, so the UI stays responsive. */
export const runLinksInWorker: LinksRunner = (job, onProgress) =>
  new Promise<SemanticLink[]>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/links.worker.ts', import.meta.url), {
      type: 'module',
      name: 'links',
    });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<LinksResponse>) => {
      const data = event.data;
      if (data.type === 'progress') {
        onProgress?.(data.progress);
      } else if (data.type === 'result') {
        finish();
        resolve(data.links);
      } else {
        finish();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(event.message || 'Links worker failed'));
    };
    worker.postMessage({ type: 'compute', id: 1, job }, [job.matrix.buffer]);
  });

/** Same computation on the calling thread (unit tests, no Worker in Node). */
export const runLinksInline: LinksRunner = (job, onProgress) => {
  const set = { ids: job.ids, dim: job.dim, matrix: job.matrix };
  return Promise.resolve(
    job.mode === 'full'
      ? computeLinks(set, job.options, { onProgress })
      : updateLinks(set, job.previous, job.changedIds, job.removedIds, job.options, {
          onProgress,
        }),
  );
};
