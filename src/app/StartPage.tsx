import { useEffect, type ReactNode } from 'react';
import { formatBytes } from '@/core/format';
import { de } from '@/i18n/de';
import { DatabaseSection } from './DatabaseSection';
import { useAppStatus } from './useAppStatus';

const t = de.start;
const iconUrl = `${import.meta.env.BASE_URL}icons/favicon.svg`;

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

function StatusRow({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <dt className="text-black/55 dark:text-white/55">{label}</dt>
      <dd className="text-right font-medium" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/** Placeholder start page: proves build, PWA install, storage and database work. */
export function StartPage() {
  const storage = useAppStatus((s) => s.storage);
  const standalone = useAppStatus((s) => s.standalone);
  const init = useAppStatus((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  const storageUsed =
    storage === null
      ? t.loading
      : storage.usage === null
        ? t.unsupported
        : storage.quota === null
          ? formatBytes(storage.usage)
          : `${formatBytes(storage.usage)} ${t.storageOf} ${formatBytes(storage.quota)}`;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-8 px-6 py-10">
      <header className="flex flex-col items-center gap-5 text-center">
        <img src={iconUrl} alt="" width={88} height={88} className="rounded-[22px] shadow-xl" />
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold tracking-tight">{de.app.name}</h1>
          <p className="text-lg text-black/60 dark:text-white/60">{de.app.tagline}</p>
        </div>
      </header>

      <section className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] dark:border-white/[0.07] dark:bg-[#12151c]">
        <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
        <p className="mt-2 text-black/60 dark:text-white/60">{t.intro}</p>

        <h3 className="mt-6 text-sm font-medium tracking-wide text-black/45 uppercase dark:text-white/40">
          {t.statusHeading}
        </h3>
        <dl className="mt-1 divide-y divide-black/[0.08] dark:divide-white/[0.07]">
          <StatusRow label={t.version} value={__APP_VERSION__} testId="app-version" />
          <StatusRow
            label={t.buildTime}
            value={formatBuildTime(__BUILD_TIME__)}
            testId="build-time"
          />
          <StatusRow
            label={t.launchMode}
            value={standalone ? t.launchStandalone : t.launchBrowser}
            testId="launch-mode"
          />
          <StatusRow
            label={t.persisted}
            value={yesNo(storage === null ? undefined : storage.persisted)}
            testId="persisted"
          />
          <StatusRow label={t.storageUsed} value={storageUsed} testId="storage-used" />
        </dl>
      </section>

      <DatabaseSection />

      {!standalone && (
        <p className="text-center text-sm text-black/50 dark:text-white/45">{t.installHint}</p>
      )}
    </main>
  );
}
