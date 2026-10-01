import { lazy, Suspense } from 'react';
import type { ImportDialogProps } from './ImportDialog';

// The import dialog (parsers, mapping UI) loads on first use.
const ImportDialog = lazy(() =>
  import('./ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

export function LazyImportDialog(props: ImportDialogProps) {
  return (
    <Suspense fallback={null}>
      <ImportDialog {...props} />
    </Suspense>
  );
}
