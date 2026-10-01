import { useEffect, useState } from 'react';
import { FileJson, Info } from 'lucide-react';
import { Button, SegmentedControl, Skeleton, Toggle } from '@/components/ui';
import type { FileSummary, SynapseFile } from '@/core/backup/format';
import { CONFLICT_STRATEGIES, type ConflictStrategy } from '@/core/backup/plan';
import { formatDateTime } from '@/core/format';
import { backupRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import { DialogActions } from './DialogActions';

const t = de.transfer.json;

export interface JsonImportRequest {
  strategies: Record<string, ConflictStrategy>;
  includeHistory: boolean;
}

export interface JsonImportPanelProps {
  file: SynapseFile;
  summary: FileSummary;
  fileName: string;
  onCancel: () => void;
  onImport: (request: JsonImportRequest) => Promise<void>;
}

/** Preview of a Synapse file with a strategy for every project whose name already exists. */
export function JsonImportPanel({
  file,
  summary,
  fileName,
  onCancel,
  onImport,
}: JsonImportPanelProps) {
  const [conflicts, setConflicts] = useState<Map<string, string> | null>(null);
  const [strategies, setStrategies] = useState<Record<string, ConflictStrategy>>({});
  const [includeHistory, setIncludeHistory] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void backupRepo.findConflicts(file).then((found) => {
      if (!cancelled) setConflicts(found);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const submit = async () => {
    setBusy(true);
    try {
      await onImport({ strategies, includeHistory });
    } finally {
      setBusy(false);
    }
  };

  const strategyOptions = CONFLICT_STRATEGIES.map((value) => ({
    value,
    label: t.strategies[value],
  }));

  return (
    <div className="flex flex-col gap-5" data-testid="json-import">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <FileJson size={22} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-medium text-fg" data-testid="json-summary">
            {t.summary(summary.projects.length, summary.cardCount)}
          </span>
          <span className="truncate text-sm text-fg-muted">
            {fileName} · {t.exportedAt(formatDateTime(summary.exportedAt))}
          </span>
        </div>
      </div>

      {summary.kind === 'backup' && (
        <p className="flex gap-2 rounded-lg bg-surface-sunken px-4 py-3 text-sm text-fg-secondary">
          <Info size={18} aria-hidden className="mt-px shrink-0" />
          {t.backupHint}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {summary.projects.map((project) => {
          const existing = conflicts?.get(project.id);
          return (
            <li
              key={project.id}
              className="flex flex-col gap-3 px-4 py-3"
              data-testid="json-project"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-base font-medium text-fg">
                  {project.name}
                </span>
                <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                  {t.cardCount(project.cardCount)}
                </span>
              </div>
              {conflicts === null ? (
                <Skeleton className="h-11 w-64 rounded-full" />
              ) : existing !== undefined ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-warning">{t.conflict(existing)}</span>
                  <SegmentedControl
                    label={t.conflict(existing)}
                    options={strategyOptions}
                    value={strategies[project.id] ?? 'merge'}
                    onChange={(value) => setStrategies((s) => ({ ...s, [project.id]: value }))}
                    className="self-start"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {conflicts !== null && conflicts.size > 0 && (
        <p className="-mt-3 text-sm text-fg-muted">{t.strategyHint}</p>
      )}

      {summary.answerCount > 0 && (
        <Toggle
          label={t.history}
          description={t.historyHint(summary.answerCount)}
          checked={includeHistory}
          onChange={setIncludeHistory}
        />
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {de.ui.cancel}
        </Button>
        <Button
          onClick={() => void submit()}
          loading={busy}
          disabled={conflicts === null}
          data-testid="import-confirm"
        >
          {t.confirm}
        </Button>
      </DialogActions>
    </div>
  );
}
