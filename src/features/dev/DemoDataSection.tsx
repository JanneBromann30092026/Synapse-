import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button, Surface, toast } from '@/components/ui';
import { useLiveData } from '@/data/live';
import { projectsRepo } from '@/data/repositories';
import { PROJECT_COLORS } from '@/data/types';
import { de } from '@/i18n/de';
import { loadDemoData } from './demoData';

const t = de.dev;

/** Demo data: creates test projects (proves that saving and reloading works). */
export function DemoDataSection() {
  const projectCount = useLiveData(() => projectsRepo.count());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadDemo() {
    setSaving(true);
    setFailed(false);
    try {
      const result = await loadDemoData();
      toast.success(t.demoDataLoaded(result.projects, result.cards));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

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
    <section className="flex flex-col gap-3">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {t.demoData}
      </h2>
      <Surface className="flex flex-wrap items-center gap-4">
        <div className="flex flex-1 flex-col">
          <span className="text-base text-fg">
            {t.projectCount}:{' '}
            <span className="font-semibold tabular-nums" data-testid="project-count">
              {projectCount ?? '…'}
            </span>
          </span>
          <span className={failed ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>
            {failed ? t.saveFailed : t.demoDataHint}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={Sparkles}
            variant="secondary"
            disabled={saving}
            onClick={() => void loadDemo()}
          >
            {t.loadDemoData}
          </Button>
          <Button icon={Plus} loading={saving} onClick={() => void createTestProject()}>
            {t.createTestProject}
          </Button>
        </div>
      </Surface>
    </section>
  );
}
