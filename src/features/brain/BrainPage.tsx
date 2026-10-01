import { useEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Download, Link2, RotateCw, Sparkles, WifiOff } from 'lucide-react';
import {
  Button,
  EmptyState,
  ProgressBar,
  ProjectAvatar,
  Skeleton,
  Spinner,
  Surface,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { useOnline } from '@/app/hooks/useOnline';
import { formatBytes } from '@/core/format';
import { useLiveData } from '@/data/live';
import { brainRepo, type CrossProjectLink, type EmbeddingStatus } from '@/data/repositories';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { brainSync, embedderModel, MODEL_DOWNLOAD_MB, useBrainSync } from '@/services/brain';
import { spring } from '@/styles/motion';

const t = de.pages.brain;

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

const appear = (index: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...spring.soft, delay: index * 0.06 },
});

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

export function BrainPage() {
  const loaded = useSettings((s) => s.loaded);
  const status = useBrainStatus();

  // Opening the brain brings it up to date (without downloading the model).
  useEffect(() => {
    if (loaded) void brainSync.run();
  }, [loaded]);

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

  return (
    <Page title={t.title} width="narrow">
      <div className="flex flex-col gap-5" data-testid="brain-page">
        <motion.div {...appear(0)}>
          <StatusCard status={status} />
        </motion.div>
        {status.current > 0 && (
          <motion.div {...appear(1)}>
            <CrossProjectSection />
          </motion.div>
        )}
      </div>
    </Page>
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

  if (status.pending > 0 && status.current === 0 && embedder === 'model') {
    return <SetupCard />;
  }

  return <SummaryCard status={status} />;
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

function Stat({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-3xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </span>
      <span className="text-sm text-fg-secondary">{label}</span>
    </div>
  );
}

function SummaryCard({ status }: { status: EmbeddingStatus }) {
  const summary = useLiveData(() => brainRepo.linkSummary(), []);
  return (
    <Surface className="flex flex-col gap-5" data-testid="brain-summary">
      <h2 className="text-lg font-semibold text-fg">{t.summary.title}</h2>
      <div className="grid grid-cols-3 gap-4">
        <Stat value={status.current} label={t.summary.cards} />
        <Stat value={summary?.links ?? '–'} label={t.summary.links} />
        <Stat value={summary?.crossProject ?? '–'} label={t.summary.cross} accent />
      </div>
      {status.pending > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent-soft px-4 py-3">
          <span className="text-sm text-fg">{t.summary.pending(status.pending)}</span>
          <Button
            size="sm"
            variant="secondary"
            icon={Download}
            onClick={() => void brainSync.run({ allowDownload: true })}
          >
            {t.setup.action(MODEL_DOWNLOAD_MB)}
          </Button>
        </div>
      )}
      <p className="text-sm text-fg-muted">{t.summary.preview}</p>
    </Surface>
  );
}

function CardLabel({ side }: { side: CrossProjectLink['source'] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProjectAvatar color={side.project.color} icon={side.project.icon} size={22} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold text-fg">{side.card.front}</span>
        <span className="truncate text-xs text-fg-muted">{side.project.name}</span>
      </span>
    </span>
  );
}

function CrossProjectSection() {
  const links = useLiveData(() => brainRepo.topCrossProjectLinks(10), []);
  if (links === undefined) return null;
  return (
    <Surface className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-fg">{t.cross.title}</h2>
        <p className="text-sm text-fg-secondary">{t.cross.subtitle}</p>
      </div>
      {links.length === 0 ? (
        <p className="text-base text-fg-secondary">{t.cross.empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line" data-testid="brain-cross-links">
          {links.map((link) => (
            <li
              key={`${link.source.card.id}-${link.target.card.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
            >
              <CardLabel side={link.source} />
              <Link2 size={16} aria-hidden className="text-fg-muted" />
              <CardLabel side={link.target} />
              <span
                className="rounded-full bg-accent-soft px-2.5 py-1 text-sm font-semibold text-accent tabular-nums"
                title={t.cross.similarity}
              >
                {percent.format(link.weight)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
