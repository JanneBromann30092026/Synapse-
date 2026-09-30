import { EmptyState } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';

const t = de.pages.study;

export function StudyPage() {
  return (
    <Page title={t.title}>
      <EmptyState title={t.emptyTitle} text={t.emptyText} />
    </Page>
  );
}
