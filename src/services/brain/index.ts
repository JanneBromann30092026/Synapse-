import { liveQuery, type Subscription } from 'dexie';
import { brainRepo } from '@/data/repositories';
import { useSettings } from '@/features/settings/settingsStore';
import { createBrainSync, createBrainSyncStore, type BrainConfig } from './brainSync';
import { createEmbedder, embedderModel } from './embedder';
import { runLinksInWorker } from './linksClient';
import { isModelCached } from './modelCache';

export function brainConfig(): BrainConfig {
  const { brainEmbedder, brainThreshold, brainTopK } = useSettings.getState();
  return { embedder: brainEmbedder, options: { threshold: brainThreshold, topK: brainTopK } };
}

export const useBrainSync = createBrainSyncStore();

export const brainSync = createBrainSync(
  {
    repo: brainRepo,
    createEmbedder,
    runLinks: runLinksInWorker,
    isModelCached,
    isOnline: () => navigator.onLine,
    getConfig: brainConfig,
  },
  useBrainSync,
);

/** Quiet period after the last card change before the background sync starts. */
export const BACKGROUND_DEBOUNCE_MS = 2000;

/**
 * Keeps the brain current in the background: watches cards/embeddings/link state and runs the
 * sync (debounced) while the app is visible. Never downloads the model; until the user started
 * the download once, only links of already embedded cards are updated.
 */
export function startBrainBackgroundSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let needed = false;
  let subscription: Subscription | undefined;

  const trigger = () => {
    clearTimeout(timer);
    if (!needed) return;
    timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      needed = false;
      void brainSync.run();
    }, BACKGROUND_DEBOUNCE_MS);
  };

  const watch = () => {
    subscription?.unsubscribe();
    const { embedder, options } = brainConfig();
    const model = embedderModel(embedder);
    subscription = liveQuery(() => brainRepo.getEmbeddingStatus(model, options)).subscribe({
      next: (status) => {
        needed = status.linksOutdated || status.pending > 0;
        trigger();
      },
      error: (error: unknown) => console.error('Brain status query failed', error),
    });
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') trigger();
  };

  watch();
  const unsubscribeSettings = useSettings.subscribe((state, previous) => {
    if (
      state.brainEmbedder !== previous.brainEmbedder ||
      state.brainThreshold !== previous.brainThreshold ||
      state.brainTopK !== previous.brainTopK
    ) {
      watch();
    }
  });
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    clearTimeout(timer);
    subscription?.unsubscribe();
    unsubscribeSettings();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export { MODEL_DOWNLOAD_MB, deleteModelCache, isModelCached, modelCacheBytes } from './modelCache';
export { embedderModel, BRAIN_EMBEDDERS, type BrainEmbedderKind } from './embedder';
export type { BrainSyncPhase, BrainSyncState } from './brainSync';
export { createLinkExplainer, linkExplainer, type ExplainedLink } from './explainLink';
