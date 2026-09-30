import { EmptyState } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';

const t = de.pages.projects;

export function ProjectsPage() {
  return (
    <Page title={t.title}>
      <EmptyState title={t.emptyTitle} text={t.emptyText} />
    </Page>
  );
}
