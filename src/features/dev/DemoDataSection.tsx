import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button, Surface, toast } from '@/components/ui';
import { useLiveData } from '@/data/live';
import { cardsRepo, projectsRepo, sessionsRepo } from '@/data/repositories';
import { PROJECT_COLORS } from '@/data/types';
import { de } from '@/i18n/de';

const t = de.dev;

/** Demo data: creates test projects (proves that saving and reloading works). */
export function DemoDataSection() {
  const projectCount = useLiveData(() => projectsRepo.count());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function createSampleProjects() {
    setSaving(true);
    setFailed(false);
    try {
      for (const sample of t.sampleProjects) {
        const project = await projectsRepo.create({
          name: sample.name,
          description: sample.description,
          color: sample.color,
          icon: sample.icon,
        });
        await cardsRepo.bulkCreate(
          project.id,
          sample.cards.map(([front, back]) => ({ front, back })),
        );
        if (sample.studied) {
          await sessionsRepo.create({
            projectId: project.id,
            roundNumber: 1,
            mode: 'all',
            direction: 'front_to_back',
            gradingMode: 'self',
            totalCards: sample.cards.length,
          });
        }
      }
      toast.success(t.sampleProjectsCreated(t.sampleProjects.length));
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
            {failed ? t.saveFailed : t.testProjectHint}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={Sparkles}
            variant="secondary"
            disabled={saving}
            onClick={() => void createSampleProjects()}
          >
            {t.createSampleProjects}
          </Button>
          <Button icon={Plus} loading={saving} onClick={() => void createTestProject()}>
            {t.createTestProject}
          </Button>
        </div>
      </Surface>
    </section>
  );
}
