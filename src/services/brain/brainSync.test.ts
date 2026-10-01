import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeLinks } from '@/core/brain/links';
import { HASH_EMBEDDING_MODEL } from '@/core/brain/hashEmbedding';
import { brainRepo, cardsRepo, projectsRepo } from '@/data/repositories';
import { db } from '@/data/db';
import { resetDb } from '@/data/__tests__/testDb';
import type { LinksJob } from '@/workers/linksProtocol';
import { createBrainSync, type BrainConfig, type BrainSyncDeps } from './brainSync';
import { createHashEmbedder, type Embedder } from './embedder';
import { runLinksInline } from './linksClient';

beforeEach(resetDb);

const DEMO = [
  { front: 'Cashflow', back: 'Zufluss liquider Mittel' },
  { front: 'Eigenkapitalrendite', back: 'Gewinn im Verhältnis zum Eigenkapital' },
  { front: 'Eigenkapitalquote', back: 'Anteil Eigenkapital an der Bilanzsumme' },
  { front: 'Umsatz', back: 'Erlöse aus Verkäufen' },
];

function setup(overrides: Partial<BrainSyncDeps> = {}, config?: Partial<BrainConfig>) {
  const jobs: LinksJob['mode'][] = [];
  const disposals: ReturnType<typeof vi.fn>[] = [];
  const deps: BrainSyncDeps = {
    repo: brainRepo,
    createEmbedder: () => {
      const embedder = createHashEmbedder();
      const dispose = vi.fn();
      disposals.push(dispose);
      return { ...embedder, dispose } satisfies Embedder;
    },
    runLinks: (job, onProgress) => {
      jobs.push(job.mode);
      return runLinksInline(job, onProgress);
    },
    isModelCached: () => Promise.resolve(false),
    isOnline: () => true,
    getConfig: () => ({
      embedder: 'hash',
      options: { topK: 3, threshold: 0.2 },
      ...config,
    }),
    ...overrides,
  };
  return { sync: createBrainSync(deps), jobs, disposals };
}

async function seed() {
  const bwl = await projectsRepo.create({ name: 'BWL' });
  const stocks = await projectsRepo.create({ name: 'Aktien' });
  const bwlCards = await cardsRepo.bulkCreate(bwl.id, DEMO.slice(0, 3));
  const stockCards = await cardsRepo.bulkCreate(stocks.id, [
    { front: 'Cashflow', back: 'Geldzufluss eines Unternehmens' },
    DEMO[3]!,
  ]);
  return { bwl, stocks, cards: [...bwlCards, ...stockCards] };
}

describe('brainSync', () => {
  it('embeds all cards in batches, links them and disposes the embedder', async () => {
    await seed();
    const { sync, jobs, disposals } = setup();
    await sync.run();
    const state = sync.store.getState();
    expect(state.phase).toBe('done');
    expect(state.lastRun).toEqual({ embedded: 5, links: 'full' });
    expect(jobs).toEqual(['full']);
    expect(disposals[0]).toHaveBeenCalled();

    const status = await brainRepo.getEmbeddingStatus(HASH_EMBEDDING_MODEL, {
      topK: 3,
      threshold: 0.2,
    });
    expect(status).toEqual({ total: 5, current: 5, pending: 0, linksOutdated: false });
    const top = await brainRepo.topCrossProjectLinks();
    expect(top[0]?.source.card.front).toBe('Cashflow');
    expect(top[0]?.target.card.front).toBe('Cashflow');
  });

  it('does nothing the second time and updates incrementally after an edit', async () => {
    const { cards } = await seed();
    // Many cards, so one change stays below the incremental limit.
    const extra = await projectsRepo.create({ name: 'Mehr' });
    await cardsRepo.bulkCreate(
      extra.id,
      Array.from({ length: 40 }, (_, i) => ({ front: `Begriff ${i}`, back: `Erklärung ${i}` })),
    );
    const { sync, jobs } = setup();
    await sync.run();
    await sync.run();
    expect(sync.store.getState().lastRun).toEqual({ embedded: 0, links: 'unchanged' });

    await cardsRepo.update(cards[3]!.id, { back: 'Umsatzerlöse aus Verkäufen' });
    await sync.run();
    expect(sync.store.getState().lastRun).toEqual({ embedded: 1, links: 'incremental' });
    expect(jobs).toEqual(['full', 'incremental']);

    // The incremental result equals a full computation.
    const all = await brainRepo.getAllEmbeddings(HASH_EMBEDDING_MODEL);
    const expected = computeLinks(all, { topK: 3, threshold: 0.2 });
    const stored = await brainRepo.getSemanticLinks();
    const key = (l: { sourceId: string; targetId: string }) => `${l.sourceId}-${l.targetId}`;
    expect(stored.map(key).sort()).toEqual(expected.map(key).sort());
  });

  it('recomputes fully when options change or when forced', async () => {
    await seed();
    let threshold = 0.2;
    const { sync, jobs } = setup({
      getConfig: () => ({ embedder: 'hash', options: { topK: 3, threshold } }),
    });
    await sync.run();
    threshold = 0.3;
    await sync.run();
    await sync.run({ forceFullLinks: true });
    expect(jobs).toEqual(['full', 'full', 'full']);
  });

  it('removes links of projects that leave the brain', async () => {
    const { stocks } = await seed();
    const { sync } = setup();
    await sync.run();
    expect((await brainRepo.linkSummary()).crossProject).toBeGreaterThan(0);
    await projectsRepo.update(stocks.id, { includeInBrain: false });
    await sync.run();
    expect(await brainRepo.linkSummary()).toMatchObject({ crossProject: 0 });
    expect((await db.cardLinks.toArray()).every((link) => link.kind === 'semantic')).toBe(true);
  });

  it('never downloads the model without permission', async () => {
    await seed();
    const createEmbedder = vi.fn(createHashEmbedder);
    const { sync } = setup({ createEmbedder }, { embedder: 'model' });
    await sync.run();
    expect(createEmbedder).not.toHaveBeenCalled();
    expect(sync.store.getState().phase).toBe('needsModel');
  });

  it('reports offline before a download and embedder errors', async () => {
    await seed();
    const offline = setup({ isOnline: () => false }, { embedder: 'model' });
    await offline.sync.run({ allowDownload: true });
    expect(offline.sync.store.getState()).toMatchObject({ phase: 'error', error: 'offline' });

    const { EmbedderError } = await import('./embedder');
    const failing = setup({
      createEmbedder: () => ({
        model: 'x',
        prepare: () => Promise.reject(new EmbedderError('download', 'blocked')),
        embed: () => Promise.resolve([]),
        dispose: () => undefined,
      }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await failing.sync.run({ allowDownload: true });
    consoleError.mockRestore();
    expect(failing.sync.store.getState()).toMatchObject({ phase: 'error', error: 'download' });
  });

  it('queues a call made while running and runs it once', async () => {
    await seed();
    const { sync, jobs } = setup();
    const first = sync.run();
    const second = sync.run({ forceFullLinks: true });
    const third = sync.run({ forceFullLinks: true });
    await Promise.all([first, second, third]);
    expect(jobs).toEqual(['full', 'full']);
    expect(sync.isRunning()).toBe(false);
  });
});
