import { useMemo, useState } from 'react';
import { FileSpreadsheet, Sparkles } from 'lucide-react';
import { Button, cn, Input, SegmentedControl, Select, Spinner, Toggle } from '@/components/ui';
import {
  DELIMITERS,
  mapRecords,
  type ColumnMapping,
  type Delimiter,
  type ImportedCard,
  type ImportTable,
  type InvalidRow,
} from '@/core/csvImport';
import type { TextEncodingName } from '@/core/textDecode';
import { LIMITS } from '@/data/schemas';
import { de } from '@/i18n/de';
import { useProjects } from '@/features/projects/hooks';
import { DialogActions } from './DialogActions';

const t = de.transfer.csv;

const PREVIEW_ROWS = 5;
const SAMPLE_LENGTH = 24;
const NEW_PROJECT = '__new';

const ENCODING_LABELS: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16',
  'utf-16be': 'UTF-16',
  'windows-1252': 'Windows-1252',
};

export interface CsvImportRequest {
  cards: ImportedCard[];
  invalid: InvalidRow[];
  skipDuplicates: boolean;
  /** Existing project id, or a name for a new project. */
  target: { projectId: string } | { newProjectName: string };
}

export interface CsvImportPanelProps {
  table: ImportTable;
  /** File name and detected encoding (absent for pasted text). */
  source?: { name: string; encoding: TextEncodingName };
  /** Preset target project (project page, card editor). */
  projectId?: string;
  /** Re-parses the text with another delimiter. */
  onDelimiterChange: (delimiter: Delimiter) => void;
  reparsing?: boolean;
  onCancel: () => void;
  onImport: (request: CsvImportRequest) => Promise<void>;
}

function truncate(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > SAMPLE_LENGTH ? `${line.slice(0, SAMPLE_LENGTH - 1)}…` : line;
}

function fileBaseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').slice(0, LIMITS.projectName) || t.newProject;
}

/** Column mapping with live preview for CSV/TSV files and pasted lines. */
export function CsvImportPanel({
  table,
  source,
  projectId,
  onDelimiterChange,
  reparsing = false,
  onCancel,
  onImport,
}: CsvImportPanelProps) {
  const projects = useProjects();
  const [mapping, setMapping] = useState<ColumnMapping>(table.mapping);
  const [hasHeader, setHasHeader] = useState(table.headerDetected);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [target, setTarget] = useState(projectId ?? NEW_PROJECT);
  const [newName, setNewName] = useState(source ? fileBaseName(source.name) : '');
  const [busy, setBusy] = useState(false);
  // A new table (other delimiter) brings its own suggestion.
  const [tableSeen, setTableSeen] = useState(table);
  if (tableSeen !== table) {
    setTableSeen(table);
    setMapping(table.mapping);
    setHasHeader(table.headerDetected);
  }

  const mapped = useMemo(
    () => mapRecords(table, mapping, { hasHeader, maxTextLength: LIMITS.cardText }),
    [table, mapping, hasHeader],
  );
  const preview = useMemo(() => {
    const records = table.records.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + PREVIEW_ROWS);
    return records.map((record) => {
      const row = mapRecords({ ...table, records: [record] }, mapping, {
        hasHeader: false,
        maxTextLength: LIMITS.cardText,
      });
      return { line: record.line, card: row.cards[0], invalid: row.invalid[0] };
    });
  }, [table, mapping, hasHeader]);

  const header = table.records[0]?.fields ?? [];
  const sampleRow = table.records[hasHeader ? 1 : 0]?.fields ?? [];
  const columnOptions = Array.from({ length: table.columns }, (_, index) => ({
    value: String(index),
    label: t.column(index + 1, truncate((hasHeader ? header[index] : sampleRow[index]) ?? '')),
  }));
  const optionalColumns = [{ value: '', label: t.none }, ...columnOptions];
  const activeProjects = (projects ?? []).filter((p) => !p.archived || p.id === projectId);
  const targetOptions = [
    ...activeProjects.map((p) => ({ value: p.id, label: p.name })),
    { value: NEW_PROJECT, label: t.newProject },
  ];

  const setColumn = (field: keyof ColumnMapping, value: string) =>
    setMapping((m) => ({ ...m, [field]: value === '' ? null : Number(value) }));

  const isNew = target === NEW_PROJECT;
  const canImport = mapped.cards.length > 0 && !reparsing && (!isNew || newName.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    try {
      await onImport({
        cards: mapped.cards,
        invalid: mapped.invalid,
        skipDuplicates,
        target: isNew ? { newProjectName: newName.trim() } : { projectId: target },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="csv-import">
      {(source || table.anki) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          {source && (
            <span className="flex min-w-0 items-center gap-1.5">
              <FileSpreadsheet size={16} aria-hidden className="shrink-0" />
              <span className="truncate">
                {t.file(source.name, ENCODING_LABELS[source.encoding])}
              </span>
            </span>
          )}
          {table.anki && (
            <span className="flex items-center gap-1.5 font-medium text-accent">
              <Sparkles size={16} aria-hidden />
              {t.anki}
            </span>
          )}
        </div>
      )}

      {!projectId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t.target}
            options={targetOptions}
            value={target}
            onChange={setTarget}
            data-testid="import-target"
          />
          {isNew && (
            <Input
              label={t.newProjectName}
              value={newName}
              maxLength={LIMITS.projectName}
              onChange={(event) => setNewName(event.target.value)}
              data-testid="import-new-name"
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base text-fg">{t.delimiter}</span>
          <div className="flex items-center gap-2">
            {reparsing && <Spinner size={18} />}
            <SegmentedControl
              label={t.delimiter}
              options={DELIMITERS.map((value) => ({ value, label: t.delimiters[value] }))}
              value={table.delimiter}
              onChange={onDelimiterChange}
            />
          </div>
        </div>
        <Toggle label={t.header} checked={hasHeader} onChange={setHasHeader} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
          {t.mapping}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t.fields.front}
            options={columnOptions}
            value={String(mapping.front)}
            onChange={(v) => setColumn('front', v)}
            data-testid="map-front"
          />
          <Select
            label={t.fields.back}
            options={columnOptions}
            value={String(mapping.back)}
            onChange={(v) => setColumn('back', v)}
            data-testid="map-back"
          />
          <Select
            label={t.fields.notes}
            options={optionalColumns}
            value={mapping.notes === null ? '' : String(mapping.notes)}
            onChange={(v) => setColumn('notes', v)}
            data-testid="map-notes"
          />
          <Select
            label={t.fields.tags}
            options={optionalColumns}
            value={mapping.tags === null ? '' : String(mapping.tags)}
            onChange={(v) => setColumn('tags', v)}
            data-testid="map-tags"
          />
        </div>
      </fieldset>

      <section className="flex flex-col gap-2" aria-label={t.preview}>
        <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">{t.preview}</h3>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table
            className="w-full min-w-[520px] table-fixed text-left text-sm"
            data-testid="import-preview"
          >
            <thead className="bg-surface-sunken text-fg-secondary">
              <tr>
                <th className="w-[30%] px-3 py-2 font-medium">{t.fields.front}</th>
                <th className="w-[30%] px-3 py-2 font-medium">{t.fields.back}</th>
                <th className="w-[22%] px-3 py-2 font-medium">{t.fields.notes}</th>
                <th className="w-[18%] px-3 py-2 font-medium">{t.fields.tags}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.map(({ line, card, invalid }) =>
                card ? (
                  <tr key={line} className="align-top text-fg">
                    <td className="truncate px-3 py-2">{card.front}</td>
                    <td className="truncate px-3 py-2">{card.back}</td>
                    <td className="truncate px-3 py-2 text-fg-secondary">{card.notes ?? ''}</td>
                    <td className="truncate px-3 py-2 text-fg-secondary">{card.tags.join(', ')}</td>
                  </tr>
                ) : (
                  <tr key={line} className="bg-danger-soft text-danger">
                    <td colSpan={4} className="px-3 py-2">
                      {de.transfer.result.line(line)}:{' '}
                      {invalid ? de.transfer.result.reasons[invalid.reason] : ''}
                    </td>
                  </tr>
                ),
              )}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-fg-secondary">
                    {t.previewEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Toggle
        label={t.skipDuplicates}
        description={t.skipDuplicatesHint}
        checked={skipDuplicates}
        onChange={setSkipDuplicates}
      />

      <DialogActions
        info={
          <span
            data-testid="import-summary"
            className={cn(mapped.cards.length === 0 && 'text-danger')}
          >
            {t.summary(mapped.cards.length, mapped.invalid.length)}
          </span>
        }
      >
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {de.ui.cancel}
        </Button>
        <Button
          onClick={() => void submit()}
          loading={busy}
          disabled={!canImport}
          data-testid="import-confirm"
        >
          {t.confirm(mapped.cards.length)}
        </Button>
      </DialogActions>
    </div>
  );
}
