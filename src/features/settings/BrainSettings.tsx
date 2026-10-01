import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, SegmentedControl, Slider, toast } from '@/components/ui';
import { LINK_THRESHOLD, LINK_TOP_K } from '@/core/brain/links';
import { formatBytes } from '@/core/format';
import { useLiveData } from '@/data/live';
import { brainRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import {
  BRAIN_EMBEDDERS,
  brainSync,
  deleteModelCache,
  embedderModel,
  isModelCached,
  modelCacheBytes,
  useBrainSync,
} from '@/services/brain';
import { useSettings } from './settingsStore';

const t = de.settings.brain;

const decimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const embedderOptions = BRAIN_EMBEDDERS.map((value) => ({
  value,
  label: t.embedderOptions[value],
}));

/** Cached model size, or null when the model is not downloaded. Re-read after `version` changes. */
function useModelSize(version: unknown): number | null | undefined {
  const [size, setSize] = useState<{ version: unknown; bytes: number | null }>();
  useEffect(() => {
    let active = true;
    void (async () => {
      const bytes = (await isModelCached()) ? await modelCacheBytes() : null;
      if (active) setSize({ version, bytes });
    })();
    return () => {
      active = false;
    };
  }, [version]);
  return size !== undefined && size.version === version ? size.bytes : undefined;
}

export function BrainSettings() {
  const threshold = useSettings((s) => s.brainThreshold);
  const topK = useSettings((s) => s.brainTopK);
  const embedder = useSettings((s) => s.brainEmbedder);
  const devMode = useSettings((s) => s.devMode);
  const set = useSettings((s) => s.set);
  const phase = useBrainSync((s) => s.phase);
  const busy = phase === 'downloading' || phase === 'embedding' || phase === 'linking';
  const model = embedderModel(embedder);

  const status = useLiveData(
    () => brainRepo.getEmbeddingStatus(model, { threshold, topK }),
    [model, threshold, topK],
  );
  const summary = useLiveData(() => brainRepo.linkSummary(), []);
  const [deleted, setDeleted] = useState(0);
  const modelSize = useModelSize(`${phase}-${deleted}`);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recompute = async () => {
    await brainSync.run({ forceFullLinks: true });
    if (useBrainSync.getState().phase !== 'error') toast.success(t.recomputed);
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t.hint}</p>
      <div className="flex flex-col gap-2">
        <Slider
          label={t.threshold}
          value={threshold}
          min={LINK_THRESHOLD.min}
          max={LINK_THRESHOLD.max}
          step={0.01}
          format={(value) => decimal.format(value)}
          onChange={(value) => void set('brainThreshold', value)}
        />
        <p className="text-sm text-fg-muted">{t.thresholdHint}</p>
      </div>
      <div className="h-px bg-line" />
      <Slider
        label={t.topK}
        value={topK}
        min={LINK_TOP_K.min}
        max={LINK_TOP_K.max}
        step={1}
        onChange={(value) => void set('brainTopK', value)}
      />
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-secondary tabular-nums" data-testid="brain-settings-status">
          {status && summary ? t.status(status.current, status.total, summary.links) : '…'}
        </p>
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={busy}
          disabled={busy || !status || status.current === 0}
          onClick={() => void recompute()}
        >
          {t.recompute}
        </Button>
      </div>
      <div className="h-px bg-line" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-base text-fg">{t.model}</span>
          <span className="text-sm text-fg-muted" data-testid="brain-model-status">
            {modelSize === undefined
              ? '…'
              : modelSize === null
                ? t.modelMissing
                : t.modelStored(formatBytes(modelSize))}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Trash2}
          disabled={modelSize === null || modelSize === undefined || busy}
          onClick={() => setConfirmDelete(true)}
        >
          {t.deleteModel}
        </Button>
      </div>
      {devMode && (
        <>
          <div className="h-px bg-line" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-base text-fg">{t.embedder}</span>
              <SegmentedControl
                label={t.embedder}
                options={embedderOptions}
                value={embedder}
                onChange={(value) => void set('brainEmbedder', value)}
              />
            </div>
            <p className="text-sm text-fg-muted">{t.embedderHint}</p>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.deleteTitle}
        message={t.deleteText}
        confirmLabel={t.deleteModel}
        onConfirm={async () => {
          await deleteModelCache();
          setDeleted((n) => n + 1);
          toast.success(t.modelDeleted);
        }}
      />
    </div>
  );
}
