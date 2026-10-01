import { useEffect, useState } from 'react';
import { Download, FileCheck2, Share } from 'lucide-react';
import { Button, Modal, SegmentedControl, Spinner, toast, Toggle } from '@/components/ui';
import { backupFileName, exportFileName } from '@/core/backup/schedule';
import { cardsToCsv } from '@/core/csvImport';
import { formatBytes } from '@/core/format';
import { backupRepo, cardsRepo } from '@/data/repositories';
import type { Project } from '@/data/types';
import { de } from '@/i18n/de';
import { markBackupExported } from '@/services/transfer/backups';
import { canShareFile, downloadFile, shareFile } from '@/services/transfer/share';
import { DialogActions } from './DialogActions';

const t = de.transfer.exportDialog;

export type ExportTarget =
  { kind: 'project'; project: Pick<Project, 'id' | 'name'> } | { kind: 'all' } | { kind: 'backup' };

type Format = 'json' | 'csv';

interface Options {
  format: Format;
  includeHistory: boolean;
}

async function buildFile(target: ExportTarget, { format, includeHistory }: Options): Promise<File> {
  const now = new Date();
  if (target.kind === 'backup') {
    const data = await backupRepo.collectBackup();
    return new File([JSON.stringify(data)], backupFileName(now), { type: 'application/json' });
  }
  const projectName = target.kind === 'project' ? target.project.name : null;
  if (target.kind === 'project' && format === 'csv') {
    const cards = await cardsRepo.listByProject(target.project.id);
    return new File([cardsToCsv(cards)], exportFileName(projectName, 'csv', now), {
      type: 'text/csv',
    });
  }
  const scope = target.kind === 'project' ? { projectId: target.project.id } : 'all';
  const data = await backupRepo.collectExport(scope, { includeHistory });
  return new File([JSON.stringify(data)], exportFileName(projectName, 'json', now), {
    type: 'application/json',
  });
}

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  target: ExportTarget;
}

/**
 * Builds the export file as soon as the options are set, so the share button can open the
 * share sheet directly in the tap (iPadOS requires a fresh user gesture).
 * Mount with a new `key` for every opening.
 */
export function ExportDialog({ open, onClose, target: initialTarget }: ExportDialogProps) {
  // Fixed for this opening (the parent may pass a new object on every render).
  const [target] = useState(initialTarget);
  const [options, setOptions] = useState<Options>({ format: 'json', includeHistory: true });
  const [file, setFile] = useState<{ options: Options; file: File } | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    buildFile(target, options)
      .then((built) => {
        if (!cancelled) setFile({ options, file: built });
      })
      .catch((error: unknown) => {
        console.error('Export failed', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, options]);

  const ready = file !== null && file.options === options ? file.file : null;
  const shareable = ready !== null && canShareFile(ready);

  const afterExport = async (outcome: 'shared' | 'downloaded') => {
    if (target.kind === 'backup') await markBackupExported();
    toast.success(outcome === 'shared' ? t.done : t.downloaded);
    onClose();
  };

  const share = async () => {
    if (!ready) return;
    setSharing(true);
    try {
      const outcome = await shareFile(ready);
      if (outcome !== 'cancelled') await afterExport(outcome);
    } finally {
      setSharing(false);
    }
  };

  const download = async () => {
    if (!ready) return;
    downloadFile(ready, ready.name);
    await afterExport('downloaded');
  };

  const title =
    target.kind === 'backup'
      ? t.backupTitle
      : target.kind === 'all'
        ? t.allTitle
        : t.projectTitle(target.project.name);

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="flex flex-col gap-5" data-testid="export-dialog">
        {target.kind === 'backup' ? (
          <p className="text-base text-fg-secondary">{t.backupText}</p>
        ) : (
          <>
            {target.kind === 'project' && (
              <div className="flex flex-col gap-2">
                <SegmentedControl
                  label={t.format}
                  options={(['json', 'csv'] as const).map((value) => ({
                    value,
                    label: t.formats[value],
                  }))}
                  value={options.format}
                  onChange={(format) => setOptions((o) => ({ ...o, format }))}
                  className="self-start"
                />
                <p className="text-sm text-fg-muted">
                  {options.format === 'json' ? t.jsonHint : t.csvHint}
                </p>
              </div>
            )}
            {options.format === 'json' && (
              <Toggle
                label={t.history}
                checked={options.includeHistory}
                onChange={(includeHistory) => setOptions((o) => ({ ...o, includeHistory }))}
              />
            )}
          </>
        )}

        <div
          className="flex min-h-14 items-center gap-3 rounded-lg bg-surface-sunken px-4 py-3 text-sm text-fg-secondary"
          role="status"
          data-testid="export-file"
        >
          {failed ? (
            <span className="text-danger">{t.failed}</span>
          ) : ready ? (
            <>
              <FileCheck2 size={20} aria-hidden className="shrink-0 text-success" />
              <span className="min-w-0 truncate">
                {t.file(ready.name, formatBytes(ready.size))}
              </span>
            </>
          ) : (
            <>
              <Spinner size={18} />
              {t.preparing}
            </>
          )}
        </div>

        <DialogActions info={shareable ? t.shareHint : undefined}>
          {shareable && (
            <Button variant="secondary" icon={Download} onClick={() => void download()}>
              {t.download}
            </Button>
          )}
          <Button
            icon={shareable ? Share : Download}
            disabled={!ready}
            loading={sharing}
            onClick={() => void (shareable ? share() : download())}
            data-testid="export-confirm"
          >
            {shareable ? t.share : t.download}
          </Button>
        </DialogActions>
      </div>
    </Modal>
  );
}
