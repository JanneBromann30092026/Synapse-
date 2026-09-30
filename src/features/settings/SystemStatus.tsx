import type { ReactNode } from 'react';
import { formatBytes } from '@/core/format';
import { useAppStatus } from '@/app/useAppStatus';
import { de } from '@/i18n/de';

const t = de.system;

function formatBuildTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

function yesNo(value: boolean | null | undefined): string {
  if (value === undefined) return t.loading;
  if (value === null) return t.unsupported;
  return value ? t.yes : t.no;
}

function Row({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <dt className="text-fg-secondary">{label}</dt>
      <dd className="text-right font-medium text-fg" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/** Persistent storage status and usage. */
export function StorageInfo() {
  const storage = useAppStatus((s) => s.storage);
  const storageUsed =
    storage === null
      ? t.loading
      : storage.usage === null
        ? t.unsupported
        : storage.quota === null
          ? formatBytes(storage.usage)
          : `${formatBytes(storage.usage)} ${t.storageOf} ${formatBytes(storage.quota)}`;

  return (
    <>
      <dl className="divide-y divide-line">
        <Row
          label={t.persisted}
          value={yesNo(storage === null ? undefined : storage.persisted)}
          testId="persisted"
        />
        <Row label={t.storageUsed} value={storageUsed} testId="storage-used" />
      </dl>
      {storage?.persisted !== true && (
        <p className="mt-2 text-sm text-fg-muted">{de.settings.storage.persistedHint}</p>
      )}
    </>
  );
}

/** Version, build, launch mode and database state. */
export function AboutInfo() {
  const standalone = useAppStatus((s) => s.standalone);
  const database = useAppStatus((s) => s.database);
  const databaseStatus =
    database === null
      ? t.loading
      : database.ok
        ? t.databaseReady
        : de.database.errors[database.reason];

  return (
    <>
      <dl className="divide-y divide-line">
        <Row label={t.version} value={__APP_VERSION__} testId="app-version" />
        <Row label={t.buildTime} value={formatBuildTime(__BUILD_TIME__)} testId="build-time" />
        <Row
          label={t.launchMode}
          value={standalone ? t.launchStandalone : t.launchBrowser}
          testId="launch-mode"
        />
        <Row label={t.databaseStatus} value={databaseStatus} testId="database-status" />
      </dl>
      {!standalone && <p className="mt-2 text-sm text-fg-muted">{t.installHint}</p>}
    </>
  );
}
