import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button, EmptyState, IconButton, ProjectAvatar, Skeleton } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';
import { useProject } from './hooks';

const t = de.pages.project;

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const back = (
    <IconButton
      icon={ArrowLeft}
      label={t.back}
      onClick={() => void navigate('/projects')}
      className="-ml-2"
    />
  );

  if (project === undefined) {
    return (
      <Page title="" leading={back}>
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }

  if (project === null) {
    return (
      <Page title={t.title} leading={back}>
        <EmptyState
          title={t.notFound}
          action={
            <Button variant="secondary" onClick={() => void navigate('/projects')}>
              {t.back}
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page
      title={project.name}
      leading={
        <>
          {back}
          <ProjectAvatar color={project.color} icon={project.icon} size={40} />
        </>
      }
    >
      <EmptyState title={t.emptyTitle} text={t.emptyText} />
    </Page>
  );
}
