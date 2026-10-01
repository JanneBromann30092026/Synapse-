import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { daysSince, isBackupReminderDue, snoozeUntil } from '@/core/backup/schedule';
import { REMINDER_SNOOZED_KEY, settingsRepo } from '@/data/repositories';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { ExportDialog } from './ExportDialog';
import { useBackupStatus } from './hooks';

const t = de.transfer.reminder;

/** Subtle hint on the start page when the last exported backup is older than 7 days. */
export function BackupReminder() {
  const status = useBackupStatus();
  const [now] = useState(() => new Date());
  const [dialog, setDialog] = useState({ key: 0, open: false });

  const due =
    status !== undefined &&
    isBackupReminderDue({
      hasData: status.firstCardAt !== undefined,
      lastExportedAt: status.lastExportedAt,
      snoozedUntil: status.snoozedUntil,
      firstDataAt: status.firstCardAt,
      now,
    });

  return (
    <>
      <AnimatePresence initial={false}>
        {due && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.default}
            className="overflow-hidden"
          >
            <div
              role="status"
              data-testid="backup-reminder"
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface py-2 pr-2 pl-4 shadow-soft"
            >
              <ShieldAlert size={20} aria-hidden className="shrink-0 text-warning" />
              <p className="min-w-48 flex-1 text-sm text-fg-secondary">
                {t.text(status.lastExportedAt ? daysSince(status.lastExportedAt, now) : null)}
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void settingsRepo.set(REMINDER_SNOOZED_KEY, snoozeUntil(now))}
                >
                  {t.later}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDialog((d) => ({ key: d.key + 1, open: true }))}
                >
                  {t.action}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ExportDialog
        key={dialog.key}
        open={dialog.open}
        target={{ kind: 'backup' }}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />
    </>
  );
}
