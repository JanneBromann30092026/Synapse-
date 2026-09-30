import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useLiveData } from '@/data/live';
import { projectsRepo } from '@/data/repositories';
import { PROJECT_COLORS } from '@/data/types';
import { de } from '@/i18n/de';
import { useAppStatus } from './useAppStatus';

const t = de.start;

/** Placeholder (step 2): proves that data is saved in IndexedDB and survives a reload. */
export function DatabaseSection() {
  const database = useAppStatus((s) => s.database);

  return (
    <section className="rounded-[28px] border border-black/[0.08] bg-white p-6 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] dark:border-white/[0.07] dark:bg-[#12151c]">
      <h3 className="text-sm font-medium tracking-wide text-black/45 uppercase dark:text-white/40">
        {t.databaseHeading}
      </h3>
      {database === null ? (
        <p className="mt-3 text-black/60 dark:text-white/60" data-testid="database-status">
          {t.loading}
        </p>
      ) : database.ok ? (
        <DatabaseReady />
      ) : (
        <p
          role="alert"
          className="mt-3 rounded-2xl bg-[#ef4444]/10 px-4 py-3 text-[#b91c1c] dark:text-[#fca5a5]"
          data-testid="database-status"
        >
          {de.database.errors[database.reason]}
        </p>
      )}
    </section>
  );
}

function DatabaseReady() {
  const projectCount = useLiveData(() => projectsRepo.count());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function createTestProject() {
    setSaving(true);
    setFailed(false);
    try {
      const n = (await projectsRepo.count()) + 1;
      await projectsRepo.create({
        name: t.testProjectName(n),
        color: PROJECT_COLORS[(n - 1) % PROJECT_COLORS.length],
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <dl className="mt-1 divide-y divide-black/[0.08] dark:divide-white/[0.07]">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <dt className="text-black/55 dark:text-white/55">{t.databaseStatus}</dt>
          <dd className="text-right font-medium" data-testid="database-status">
            {t.databaseReady}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <dt className="text-black/55 dark:text-white/55">{t.projectCount}</dt>
          <dd className="text-right font-medium tabular-nums" data-testid="project-count">
            {projectCount ?? t.loading}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={() => void createTestProject()}
          disabled={saving}
          className="flex min-h-11 items-center gap-2 rounded-full bg-[#6d5ef5] px-5 font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <Plus size={18} aria-hidden />
          {t.createTestProject}
        </button>
        <p className="text-sm text-black/50 dark:text-white/45">
          {failed ? t.saveFailed : t.testProjectHint}
        </p>
      </div>
    </>
  );
}
