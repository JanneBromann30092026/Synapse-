import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { DropOverlay } from './DropOverlay';
import { ImportDialog, type ImportSourceRequest } from './ImportDialog';
import { useFileDrop } from './useFileDrop';

/** File types offered by the Files app picker. */
export const IMPORT_ACCEPT =
  '.csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json';

interface DialogState {
  key: number;
  open: boolean;
  request: ImportSourceRequest | null;
}

/**
 * Import entry points of a page: file picker (Files app), drag & drop of a file onto the
 * page and pasting several cards. Render `element` once in the page.
 */
export function useImport(projectId?: string) {
  const [dialog, setDialog] = useState<DialogState>({ key: 0, open: false, request: null });
  const input = useRef<HTMLInputElement>(null);

  const start = useCallback(
    (request: ImportSourceRequest) => setDialog((d) => ({ key: d.key + 1, open: true, request })),
    [],
  );
  const onDropFile = useCallback((file: File) => start({ file }), [start]);
  const dragging = useFileDrop(onDropFile, !dialog.open);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) start({ file });
  };

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        data-testid="import-file"
        onChange={onChange}
      />
      <ImportDialog
        key={dialog.key}
        open={dialog.open}
        request={dialog.request}
        projectId={projectId}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />
      <DropOverlay visible={dragging} />
    </>
  );

  return {
    pickFile: () => input.current?.click(),
    paste: () => start({ paste: true }),
    element,
  };
}
