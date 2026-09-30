import { useParams } from 'react-router';
import { EmptyState } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { useProject } from '@/features/projects/hooks';
import { de } from '@/i18n/de';

const t = de.pages.study;

/** Placeholder: the study mode follows in steps 8–10. */
export function StudyPage() {
  const { projectId = '' } = useParams();
  const project = useProject(projectId);
  return (
    <Page title={project ? t.titleWithProject(project.name) : t.title}>
      <EmptyState title={t.emptyTitle} text={t.emptyText} />
    </Page>
  );
}
