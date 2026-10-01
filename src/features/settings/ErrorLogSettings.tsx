import { useState } from 'react';
import { ClipboardCopy, Trash2 } from 'lucide-react';
import { Button, Modal, toast } from '@/components/ui';
import { logsRepo } from '@/data/repositories';
import { useLiveData } from '@/data/live';
import { de } from '@/i18n/de';
import { buildErrorReport } from '@/services/errorLog';

const t = de.settings.errorLog;

/**
 * Copies the report. Safari only allows clipboard writes during the tap: ClipboardItem with
 * a promise keeps the gesture while the log is read from IndexedDB.
 */
async function copyReport(): Promise<{ ok: boolean; text: string }> {
  const report = buildErrorReport();
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const blob = report.then((text) => new Blob([text], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    } else {
      await navigator.clipboard.writeText(await report);
    }
    return { ok: true, text: await report };
  } catch {
    return { ok: false, text: await report };
  }
}

/** Settings section: entry count, copy as text, clear. */
export function ErrorLogSettings() {
  const count = useLiveData(() => logsRepo.count());
  const [fallback, setFallback] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4" data-testid="error-log">
      <p className="text-base text-fg-secondary">{t.text}</p>
      <p className="text-sm font-medium text-fg-muted" data-testid="error-log-count">
        {count === undefined ? '…' : count === 0 ? t.empty : t.count(count)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={ClipboardCopy}
          onClick={() => {
            void copyReport().then(({ ok, text }) => {
              if (ok) toast.success(t.copied);
              else setFallback(text);
            });
          }}
        >
          {t.copy}
        </Button>
        <Button
          variant="ghost"
          icon={Trash2}
          disabled={!count}
          onClick={() => void logsRepo.clear().then(() => toast.info(t.cleared))}
        >
          {t.clear}
        </Button>
      </div>
      <Modal
        open={fallback !== null}
        onClose={() => setFallback(null)}
        title={t.fallbackTitle}
        description={t.fallbackText}
        size="lg"
        footer={<Button onClick={() => setFallback(null)}>{t.close}</Button>}
      >
        <textarea
          readOnly
          value={fallback ?? ''}
          aria-label={t.fallbackTitle}
          className="h-72 w-full resize-none rounded-lg border border-line bg-surface p-3 font-mono text-xs text-fg"
          onFocus={(event) => event.currentTarget.select()}
        />
      </Modal>
    </div>
  );
}
