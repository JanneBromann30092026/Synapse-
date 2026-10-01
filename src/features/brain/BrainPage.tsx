import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Download, RotateCw, Sparkles, WifiOff } from 'lucide-react';
import {
  Button,
  cn,
  ConfirmDialog,
  EmptyState,
  ProgressBar,
  Skeleton,
  Spinner,
  Surface,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { useOnline } from '@/app/hooks/useOnline';
import type { Point, Viewport } from '@/core/brain/graph';
import { SYNTHETIC_SIZES, syntheticGraph } from '@/core/brain/synthetic';
import { formatBytes } from '@/core/format';
import { seededRandom } from '@/core/session';
import { useLiveData } from '@/data/live';
import { brainRepo, graphPositionsRepo, type EmbeddingStatus } from '@/data/repositories';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { brainSync, embedderModel, MODEL_DOWNLOAD_MB, useBrainSync } from '@/services/brain';
import { spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import type { BrainGraphHandle } from './BrainGraph';
import { BrainControls, BrainLegend, glass } from './BrainOverlays';
import { BrainGraphModel } from './graphModel';

// Canvas, d3-force and the renderer: own chunk, loaded with the brain.
const BrainGraph = lazy(() => import('./BrainGraph'));

const t = de.pages.brain;
const g = t.graph;

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

/** Free space around the graph when fitting (title on top, controls at the bottom). */
const FIT_PADDING: Viewport['padding'] = { top: 96, right: 40, bottom: 112, left: 40 };
const NO_POSITIONS: ReadonlyMap<string, Point> = new Map();

function useBrainStatus(): EmbeddingStatus | undefined {
  const embedder = useSettings((s) => s.brainEmbedder);
  const threshold = useSettings((s) => s.brainThreshold);
  const topK = useSettings((s) => s.brainTopK);
  const model = embedderModel(embedder);
  return useLiveData(
    () => brainRepo.getEmbeddingStatus(model, { threshold, topK }),
    [model, threshold, topK],
  );
}

/** Developer mode: ?synthetic=2000 shows synthetic data of that size (never stored). */
function useSyntheticSize(): [number | null, (nodes: number | null) => void] {
  const devMode = useSettings((s) => s.devMode);
  const [params, setParams] = useSearchParams();
  const value = Number(params.get('synthetic'));
  const size = devMode && SYNTHETIC_SIZES.some((s) => s.nodes === value) ? value : null;
  const set = (nodes: number | null) =>
    setParams(nodes === null ? {} : { synthetic: String(nodes) }, { replace: true });
  return [size, set];
}

export function BrainPage() {
  const loaded = useSettings((s) => s.loaded);
  const status = useBrainStatus();
  const [syntheticSize] = useSyntheticSize();

  // Opening the brain brings it up to date (without downloading the model).
  useEffect(() => {
    if (loaded) void brainSync.run();
  }, [loaded]);

  if (syntheticSize !== null) return <BrainView status={status ?? null} />;

  if (status === undefined) {
    return (
      <Page title={t.title}>
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-40 w-full rounded-xl" />
          <span className="sr-only">{t.loading}</span>
        </div>
      </Page>
    );
  }

  if (status.total === 0) {
    return (
      <Page title={t.title}>
        <EmptyState title={t.emptyTitle} text={t.emptyText} />
      </Page>
    );
  }

  if (status.current === 0) {
    return (
      <Page title={t.title} width="narrow">
        <motion.div
          data-testid="brain-page"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
        >
          <StatusCard status={status} />
        </motion.div>
      </Page>
    );
  }

  return <BrainView status={status} />;
}

/** The knowledge map: full-bleed canvas with floating title, controls and legend. */
function BrainView({ status }: { status: EmbeddingStatus | null }) {
  const devMode = useSettings((s) => s.devMode);
  const reducedMotion = useReducedMotion();
  const [syntheticSize, setSyntheticSize] = useSyntheticSize();
  const data = useLiveData(() => brainRepo.getGraphData(), []);
  const [positions, setPositions] = useState<ReadonlyMap<string, Point> | null>(null);
  const [model] = useState(() => new BrainGraphModel());
  const graphRef = useRef<BrainGraphHandle>(null);
  const [confirmRearrange, setConfirmRearrange] = useState(false);

  // Stored layout: read once (saving it must not rebuild the graph).
  useEffect(() => {
    let active = true;
    void graphPositionsRepo.list().then((list) => {
      if (active) setPositions(new Map(list.map((p) => [p.nodeId, { x: p.x, y: p.y }])));
    });
    return () => {
      active = false;
    };
  }, []);

  const synthetic = useMemo(() => {
    const size = SYNTHETIC_SIZES.find((s) => s.nodes === syntheticSize);
    if (!size) return null;
    const syntheticModel = new BrainGraphModel();
    return syntheticModel.update(syntheticGraph(size, seededRandom(13)), NO_POSITIONS);
  }, [syntheticSize]);

  const real = useMemo(
    () => (data && positions ? model.update(data, positions) : null),
    [model, data, positions],
  );
  const snapshot = synthetic ?? real;
  const projects = synthetic ? [] : (data?.projects ?? []);
  const semantic = snapshot?.links.filter((link) => link.kind !== 'hub') ?? [];
  const cards = snapshot?.nodes.filter((node) => node.kind === 'card').length ?? 0;
  const pixelRatio = Math.min(2, (snapshot?.nodes.length ?? 0) > 1500 ? 1.5 : 2);

  return (
    <div className="relative h-full overflow-hidden" data-testid="brain-page">
      {snapshot ? (
        <Suspense fallback={null}>
          <BrainGraph
            key={synthetic ? `synthetic-${syntheticSize}` : 'real'}
            snapshot={snapshot}
            persist={!synthetic}
            pixelRatio={pixelRatio}
            reducedMotion={reducedMotion}
            devMode={devMode}
            padding={FIT_PADDING}
            handle={graphRef}
          />
        </Suspense>
      ) : (
        <div className="brain-backdrop absolute inset-0" aria-busy>
          <span className="sr-only">{t.loading}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 px-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className={cn('pointer-events-auto flex flex-col rounded-2xl px-4 py-2.5', glass)}>
          <h1 className="text-lg font-semibold tracking-tight text-fg">{g.title}</h1>
          <p className="text-xs text-fg-secondary tabular-nums" data-testid="brain-stats">
            {g.stats(cards, semantic.length, semantic.filter((link) => link.cross).length)}
          </p>
        </div>
        {synthetic && syntheticSize !== null && (
          <p
            className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-fg"
            data-testid="brain-synthetic"
          >
            {g.syntheticBadge(
              syntheticSize,
              SYNTHETIC_SIZES.find((s) => s.nodes === syntheticSize)?.edges ?? 0,
            )}
          </p>
        )}
        {!synthetic && status && <SyncPill status={status} />}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))]">
          <BrainLegend projects={projects} />
        </div>
        <BrainControls
          onZoomIn={() => graphRef.current?.zoomIn()}
          onZoomOut={() => graphRef.current?.zoomOut()}
          onFit={() => graphRef.current?.fit()}
          onRearrange={() => setConfirmRearrange(true)}
          devMode={devMode}
          syntheticSize={syntheticSize}
          onSynthetic={setSyntheticSize}
        />
      </div>

      <ConfirmDialog
        open={confirmRearrange}
        onClose={() => setConfirmRearrange(false)}
        onConfirm={() => {
          graphRef.current?.rearrange();
          setConfirmRearrange(false);
        }}
        title={g.rearrangeTitle}
        message={g.rearrangeText}
        confirmLabel={g.rearrange}
        variant="primary"
      />
    </div>
  );
}

/** Small status line under the title: analysis running, cards waiting for the model, errors. */
function SyncPill({ status }: { status: EmbeddingStatus }) {
  const phase = useBrainSync((s) => s.phase);
  const error = useBrainSync((s) => s.error);
  const embedded = useBrainSync((s) => s.embedded);
  const embedder = useSettings((s) => s.brainEmbedder);
  const online = useOnline();

  let content: React.ReactNode = null;
  if (phase === 'error' && error) {
    content = (
      <>
        <span className="text-danger">{t.errors[error]}</span>
        <Button
          size="sm"
          variant="secondary"
          icon={RotateCw}
          onClick={() => void brainSync.run({ allowDownload: true })}
        >
          {t.errors.retry}
        </Button>
      </>
    );
  } else if (phase === 'downloading' || phase === 'embedding' || phase === 'linking') {
    content = (
      <>
        <Spinner size={16} />
        <span>
          {phase === 'embedding'
            ? `${t.phase.embedding} ${t.phase.embeddingCount(embedded.done, embedded.total)}`
            : phase === 'downloading'
              ? t.phase.downloading
              : t.phase.linking}
        </span>
      </>
    );
  } else if (status.pending > 0 && embedder === 'model') {
    content = (
      <>
        <span>{g.pending(status.pending)}</span>
        <Button
          size="sm"
          variant="secondary"
          icon={Download}
          disabled={!online}
          onClick={() => void brainSync.run({ allowDownload: true })}
        >
          {g.loadModel}
        </Button>
      </>
    );
  }

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          key="sync"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={spring.default}
          aria-live="polite"
          data-testid="brain-sync"
          className={cn(
            'pointer-events-auto flex max-w-[min(32rem,calc(100vw-2rem))] items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-3.5 text-sm text-fg',
            glass,
          )}
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatusCard({ status }: { status: EmbeddingStatus }) {
  const phase = useBrainSync((s) => s.phase);
  const error = useBrainSync((s) => s.error);
  const embedder = useSettings((s) => s.brainEmbedder);

  if (phase === 'error' && error) {
    return (
      <Surface className="flex flex-col items-start gap-4" data-testid="brain-error">
        <h2 className="text-lg font-semibold text-fg">{t.errors.title}</h2>
        <p className="text-base text-fg-secondary">{t.errors[error]}</p>
        <Button
          icon={RotateCw}
          variant="secondary"
          onClick={() => void brainSync.run({ allowDownload: true })}
        >
          {t.errors.retry}
        </Button>
      </Surface>
    );
  }

  if (phase === 'downloading' || phase === 'embedding' || phase === 'linking') {
    return <ProgressCard />;
  }

  if (status.pending > 0 && embedder === 'model') return <SetupCard />;
  return <ProgressCard />;
}

function SetupCard() {
  const online = useOnline();
  return (
    <Surface className="flex flex-col items-start gap-4" data-testid="brain-setup">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Sparkles size={24} aria-hidden />
      </span>
      <h2 className="text-xl font-semibold text-fg">{t.setup.title}</h2>
      <p className="text-base text-fg-secondary">{t.setup.text(MODEL_DOWNLOAD_MB)}</p>
      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        <WifiOff size={16} aria-hidden className={online ? 'hidden' : 'text-warning'} />
        {online ? t.setup.wifi : t.setup.offline}
      </p>
      <Button
        icon={Download}
        disabled={!online}
        onClick={() => void brainSync.run({ allowDownload: true })}
        data-testid="brain-download"
      >
        {t.setup.action(MODEL_DOWNLOAD_MB)}
      </Button>
    </Surface>
  );
}

function ProgressCard() {
  const phase = useBrainSync((s) => s.phase);
  const download = useBrainSync((s) => s.download);
  const embedded = useBrainSync((s) => s.embedded);
  const linkProgress = useBrainSync((s) => s.linkProgress);

  let title: string;
  let detail: string;
  let value: number;
  if (phase === 'downloading') {
    title = t.phase.downloading;
    value = download && download.total > 0 ? download.loaded / download.total : 0;
    detail =
      download && download.total > 0
        ? t.phase.downloadBytes(formatBytes(download.loaded), formatBytes(download.total))
        : t.phase.downloadStarting;
  } else if (phase === 'embedding') {
    title = t.phase.embedding;
    value = embedded.total > 0 ? embedded.done / embedded.total : 0;
    detail = t.phase.embeddingCount(embedded.done, embedded.total);
  } else {
    title = t.phase.linking;
    value = linkProgress;
    detail = percent.format(linkProgress);
  }

  return (
    <Surface className="flex flex-col gap-4" data-testid="brain-progress" aria-live="polite">
      <div className="flex items-center gap-3">
        <Spinner size={22} />
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
      </div>
      <ProgressBar value={value} label={title} />
      <p className="text-sm text-fg-secondary tabular-nums">{detail}</p>
    </Surface>
  );
}
