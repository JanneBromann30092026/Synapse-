import { useRef, useState, type ChangeEvent } from 'react';
import { ArchiveRestore, DatabaseBackup, FileUp, FolderDown, History, Share } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Skeleton, toast } from '@/components/ui';
import type { SynapseFile } from '@/core/backup/format';
import { formatBytes, formatDateTime } from '@/core/format';
import { formatRelativeTime } from '@/core/relativeTime';
import { snapshotsRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import { analyzeFile } from '@/services/transfer/analyze';
import { readSnapshot, restoreBackup } from '@/services/transfer/backups';
import { ExportDialog, type ExportTarget } from './ExportDialog';
import { useBackupStatus, useSnapshots } from './hooks';
import { useImport } from './useImport';

const t = de.transfer.backups;

interface RestoreState {
  open: boolean;
  /** Text for "… durch {what} ersetzt". */
  what: string;
  load: () => Promise<SynapseFile | null>;
}

function reload() {
  window.location.reload();
}

/** Settings section "Daten & Backups": export, import, snapshots and restore. */
export function BackupSettings() {
  const status = useBackupStatus();
  const snapshots = useSnapshots();
  const imports = useImport();
  const [exportDialog, setExportDialog] = useState<{
    key: number;
    open: boolean;
    target: ExportTarget;
  }>({ key: 0, open: false, target: { kind: 'backup' } });
  const [restore, setRestore] = useState<RestoreState | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);

  const openExport = (target: ExportTarget) =>
    setExportDialog((d) => ({ key: d.key + 1, open: true, target }));

  const snapshotNow = async () => {
    setSnapshotting(true);
    try {
      await snapshotsRepo.create('manual');
      toast.success(t.snapshotCreated);
    } catch {
      toast.error(de.pages.project.toasts.failed);
    } finally {
      setSnapshotting(false);
    }
  };

  const askRestoreSnapshot = (id: string, createdAt: string) =>
    setRestore({
      open: true,
      what: t.restoreSnapshot(formatDateTime(createdAt)),
      load: async () => {
        const parsed = await readSnapshot(id);
        return parsed.ok ? parsed.file : null;
      },
    });

  const pickRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const analysis = await analyzeFile(file);
      if (analysis.kind !== 'synapse') {
        toast.error(
          analysis.kind === 'error' && analysis.code !== 'notSynapse'
            ? analysis.code === 'invalid'
              ? de.transfer.errors.invalid(analysis.path)
              : de.transfer.errors[analysis.code]
            : t.notABackup,
        );
        return;
      }
      setRestore({
        open: true,
        what: t.restoreFile(file.name),
        load: () => Promise.resolve(analysis.file),
      });
    } catch {
      toast.error(de.transfer.errors.read);
    }
  };

  const runRestore = async () => {
    if (!restore) return;
    try {
      const file = await restore.load();
      if (!file) throw new Error('Snapshot unreadable');
      await restoreBackup(file);
      reload();
    } catch (error: unknown) {
      console.error('Restore failed', error);
      toast.error(t.restoreFailed);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-fg-secondary">{t.lastExport}</span>
        <span className="font-medium text-fg" data-testid="last-export">
          {status === undefined
            ? '…'
            : status.lastExportedAt
              ? formatRelativeTime(status.lastExportedAt)
              : t.never}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={Share}
          onClick={() => openExport({ kind: 'backup' })}
          data-testid="backup-export"
        >
          {t.exportBackup}
        </Button>
        <Button variant="secondary" icon={FolderDown} onClick={() => openExport({ kind: 'all' })}>
          {t.exportAll}
        </Button>
        <Button variant="secondary" icon={FileUp} onClick={imports.pickFile}>
          {t.importFile}
        </Button>
      </div>

      <div className="h-px bg-line" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-base text-fg">{t.snapshots}</span>
            <span className="text-sm text-fg-muted">{t.snapshotsHint}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={DatabaseBackup}
            loading={snapshotting}
            onClick={() => void snapshotNow()}
            data-testid="snapshot-now"
          >
            {t.snapshotNow}
          </Button>
        </div>
        {snapshots === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.noSnapshots}</p>
        ) : (
          <ul
            className="flex flex-col divide-y divide-line rounded-lg border border-line"
            data-testid="snapshot-list"
          >
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
              >
                <History size={18} aria-hidden className="shrink-0 text-fg-muted" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-base text-fg">
                    {formatDateTime(snapshot.createdAt)}
                    <Badge tone={snapshot.reason === 'auto' ? 'neutral' : 'accent'}>
                      {t.reasons[snapshot.reason]}
                    </Badge>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {t.snapshotInfo(
                      snapshot.projectCount,
                      snapshot.cardCount,
                      formatBytes(snapshot.size),
                    )}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ArchiveRestore}
                  onClick={() => askRestoreSnapshot(snapshot.id, snapshot.createdAt)}
                >
                  {t.restore}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          icon={ArchiveRestore}
          className="self-start"
          onClick={() => restoreInput.current?.click()}
        >
          {t.restoreFromFile}
        </Button>
      </div>

      <input
        ref={restoreInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="restore-file"
        onChange={(event) => void pickRestoreFile(event)}
      />
      {imports.element}
      <ExportDialog
        key={exportDialog.key}
        open={exportDialog.open}
        target={exportDialog.target}
        onClose={() => setExportDialog((d) => ({ ...d, open: false }))}
      />
      <ConfirmDialog
        open={restore?.open ?? false}
        onClose={() => setRestore((r) => (r ? { ...r, open: false } : null))}
        onConfirm={runRestore}
        title={t.restoreTitle}
        message={restore ? t.restoreMessage(restore.what) : undefined}
        confirmLabel={t.restoreConfirm}
      />
    </div>
  );
}
