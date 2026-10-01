import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Button, Modal, ProgressBar, Textarea, toast } from '@/components/ui';
import type { Delimiter, InvalidRow } from '@/core/csvImport';
import { analyzeImport, type ImportAnalysis } from '@/core/importAnalysis';
import type { ProjectOutcome } from '@/core/backup/plan';
import { backupRepo, cardsRepo, projectsRepo } from '@/data/repositories';
import { LIMITS } from '@/data/schemas';
import { de } from '@/i18n/de';
import { analyze, analyzeFile } from '@/services/transfer/analyze';
import { CsvImportPanel, type CsvImportRequest } from './CsvImportPanel';
import { DialogActions } from './DialogActions';
import { JsonImportPanel, type JsonImportRequest } from './JsonImportPanel';

const t = de.transfer;
const MAX_LISTED_ROWS = 50;

export type ImportSourceRequest = { file: File } | { paste: true };

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  request: ImportSourceRequest | null;
  /** Target project for CSV and pasted cards (project page, card editor). */
  projectId?: string;
}

interface ImportResult {
  cardsAdded: number;
  duplicatesSkipped: number;
  invalid: InvalidRow[];
  outcomes: ProjectOutcome[];
}

type Stage =
  | { kind: 'analyzing'; progress: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; analysis: ImportAnalysis; reparsing: boolean }
  | { kind: 'result'; result: ImportResult };

function errorMessage(analysis: Extract<ImportAnalysis, { kind: 'error' }>): string {
  return analysis.code === 'invalid' ? t.errors.invalid(analysis.path) : t.errors[analysis.code];
}

function toStage(analysis: ImportAnalysis): Stage {
  return analysis.kind === 'error'
    ? { kind: 'error', message: errorMessage(analysis) }
    : { kind: 'ready', analysis, reparsing: false };
}

/** Cards as the repository expects them (tag count limited like in the editor). */
function toInputs(request: CsvImportRequest) {
  return request.cards.map((card) => ({ ...card, tags: card.tags.slice(0, LIMITS.tagsPerCard) }));
}

async function importCsv(request: CsvImportRequest): Promise<ImportResult> {
  let projectId: string;
  let createdProject: string | null = null;
  if ('projectId' in request.target) {
    projectId = request.target.projectId;
  } else {
    const project = await projectsRepo.create({ name: request.target.newProjectName });
    projectId = createdProject = project.id;
  }
  try {
    const { created, skippedDuplicates } = await cardsRepo.importMany(
      projectId,
      toInputs(request),
      {
        skipDuplicates: request.skipDuplicates,
      },
    );
    return {
      cardsAdded: created.length,
      duplicatesSkipped: skippedDuplicates,
      invalid: request.invalid,
      outcomes: [],
    };
  } catch (error: unknown) {
    if (createdProject) await projectsRepo.delete(createdProject).catch(() => undefined);
    throw error;
  }
}

/**
 * Import of a file (CSV/TSV/Anki text or Synapse JSON) or of pasted lines: analysis in a
 * worker, mapping or conflict choice, then a result with the skipped rows.
 * Mount with a new `key` for every opening.
 */
export function ImportDialog({ open, onClose, request, projectId }: ImportDialogProps) {
  const file = request && 'file' in request ? request.file : null;
  const [stage, setStage] = useState<Stage>(
    file ? { kind: 'analyzing', progress: 0 } : { kind: 'analyzing', progress: 1 },
  );
  const [pasteText, setPasteText] = useState('');
  const [pasteDelimiter, setPasteDelimiter] = useState<Delimiter | undefined>(undefined);
  const deferredPaste = useDeferredValue(pasteText);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    analyzeFile(file, (progress) => {
      if (!cancelled) setStage({ kind: 'analyzing', progress });
    })
      .then((analysis) => {
        if (!cancelled) setStage(toStage(analysis));
      })
      .catch((error: unknown) => {
        console.error('Import analysis failed', error);
        if (!cancelled) setStage({ kind: 'error', message: t.errors.read });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Pasted lines: parsed on the main thread while typing (small), never as Synapse JSON.
  const pasted = useMemo(() => {
    if (file || deferredPaste.trim() === '') return null;
    const analysis = analyzeImport(
      { text: deferredPaste },
      pasteDelimiter ? { delimiter: pasteDelimiter } : {},
    );
    return analysis.kind === 'table' ? analysis : null;
  }, [file, deferredPaste, pasteDelimiter]);

  const reparse = (analysis: Extract<ImportAnalysis, { kind: 'table' }>, delimiter: Delimiter) => {
    setStage({ kind: 'ready', analysis, reparsing: true });
    analyze({ source: { text: analysis.text }, delimiter })
      .then((next) =>
        setStage(toStage(next.kind === 'table' ? { ...next, encoding: analysis.encoding } : next)),
      )
      .catch(() => setStage({ kind: 'error', message: t.errors.read }));
  };

  const finish = (result: ImportResult) => {
    const skipped = result.duplicatesSkipped + result.invalid.length;
    toast.success(t.result.toast(result.cardsAdded, skipped));
    setStage({ kind: 'result', result });
  };

  const runCsv = async (csv: CsvImportRequest) => {
    try {
      finish(await importCsv(csv));
    } catch (error: unknown) {
      console.error('Import failed', error);
      toast.error(t.errors.failed);
    }
  };

  const runJson = async (
    json: JsonImportRequest,
    analysis: Extract<ImportAnalysis, { kind: 'synapse' }>,
  ) => {
    try {
      const result = await backupRepo.importFile(analysis.file, json);
      finish({
        cardsAdded: result.cardsAdded,
        duplicatesSkipped: result.duplicatesSkipped,
        invalid: [],
        outcomes: result.outcomes,
      });
    } catch (error: unknown) {
      console.error('Import failed', error);
      toast.error(t.errors.failed);
    }
  };

  const title = file
    ? stage.kind === 'ready' && stage.analysis.kind === 'synapse'
      ? t.json.title
      : stage.kind === 'result'
        ? t.result.title
        : t.csv.title
    : stage.kind === 'result'
      ? t.result.title
      : t.csv.pasteTitle;

  let body;
  if (stage.kind === 'result') {
    body = <ImportResultView result={stage.result} onClose={onClose} />;
  } else if (!file) {
    body = (
      <div className="flex flex-col gap-5">
        <Textarea
          label={t.csv.pasteLabel}
          hint={t.csv.pasteHint}
          placeholder={t.csv.pastePlaceholder}
          value={pasteText}
          rows={6}
          maxHeight={260}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setPasteText(event.target.value)}
          data-testid="paste-text"
          data-autofocus
        />
        {pasted ? (
          <CsvImportPanel
            table={pasted.table}
            projectId={projectId}
            onDelimiterChange={setPasteDelimiter}
            onCancel={onClose}
            onImport={runCsv}
          />
        ) : (
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              {de.ui.cancel}
            </Button>
            <Button disabled>{t.csv.confirm(0)}</Button>
          </DialogActions>
        )}
      </div>
    );
  } else if (stage.kind === 'analyzing') {
    body = (
      <div className="flex flex-col gap-3 py-6" role="status">
        <span className="text-base text-fg-secondary">{t.analyzing}</span>
        <ProgressBar value={stage.progress} label={t.analyzing} />
      </div>
    );
  } else if (stage.kind === 'error') {
    body = (
      <>
        <p
          role="alert"
          className="flex gap-3 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
          data-testid="import-error"
        >
          <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
          {stage.message}
        </p>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>
            {de.ui.close}
          </Button>
        </DialogActions>
      </>
    );
  } else if (stage.analysis.kind === 'synapse') {
    const analysis = stage.analysis;
    body = (
      <JsonImportPanel
        file={analysis.file}
        summary={analysis.summary}
        fileName={file.name}
        onCancel={onClose}
        onImport={(json) => runJson(json, analysis)}
      />
    );
  } else if (stage.analysis.kind === 'table') {
    const analysis = stage.analysis;
    body = (
      <CsvImportPanel
        table={analysis.table}
        source={{ name: file.name, encoding: analysis.encoding }}
        projectId={projectId}
        reparsing={stage.reparsing}
        onDelimiterChange={(delimiter) => reparse(analysis, delimiter)}
        onCancel={onClose}
        onImport={runCsv}
      />
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {body}
    </Modal>
  );
}

function ImportResultView({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const r = t.result;
  const listed = result.invalid.slice(0, MAX_LISTED_ROWS);
  return (
    <div className="flex flex-col gap-4" data-testid="import-result">
      <p className="flex items-center gap-3 text-lg font-medium text-fg">
        <CircleCheck size={24} aria-hidden className="shrink-0 text-success" />
        {r.imported(result.cardsAdded)}
      </p>
      {result.outcomes.length > 0 && (
        <ul className="flex flex-col gap-1 text-base text-fg-secondary">
          {result.outcomes.map((outcome, index) => (
            <li key={index}>
              {outcome.action === 'skipped'
                ? r.projects.skipped(outcome.name)
                : outcome.action === 'merged'
                  ? r.projects.merged(outcome.targetName, outcome.cardsAdded)
                  : r.projects.created(outcome.targetName, outcome.cardsAdded)}
            </li>
          ))}
        </ul>
      )}
      {result.duplicatesSkipped > 0 && (
        <p className="text-base text-fg-secondary">{r.duplicates(result.duplicatesSkipped)}</p>
      )}
      {result.invalid.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-fg-secondary">{r.invalid(result.invalid.length)}</p>
          <ul
            className="flex flex-col gap-1 rounded-lg bg-surface-sunken px-4 py-3 text-sm text-fg-secondary"
            data-testid="import-invalid"
          >
            {listed.map((row) => (
              <li key={row.line}>
                {r.line(row.line)}: {r.reasons[row.reason]}
              </li>
            ))}
            {result.invalid.length > listed.length && (
              <li>{r.more(result.invalid.length - listed.length)}</li>
            )}
          </ul>
        </div>
      )}
      <DialogActions>
        <Button onClick={onClose} data-autofocus>
          {r.done}
        </Button>
      </DialogActions>
    </div>
  );
}
