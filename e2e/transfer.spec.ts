import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

const rows = (page: Page) => page.getByTestId('card-row');

/** No share sheet in Chromium: exports fall back to a download (like Safari without share). */
async function disableShare(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'share');
    Reflect.deleteProperty(Navigator.prototype, 'canShare');
  });
}

async function createProject(page: Page, name: string) {
  await page.goto('./#/projects');
  const first = page.getByRole('button', { name: 'Erstes Projekt anlegen' });
  const another = page.getByRole('button', { name: 'Neues Projekt' }).first();
  await expect(first.or(another)).toBeVisible();
  await ((await first.isVisible()) ? first : another).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await page.getByRole('link', { name: `${name} öffnen` }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function setSetting(page: Page, key: string, value: unknown) {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('synapse');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key: k, value: v });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
    [key, value] as const,
  );
}

test('csv: column mapping with live preview, header toggle and delimiter', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await createProject(page, 'Vokabeln');
  // Semicolon, no header, answers contain commas, columns in an unusual order.
  const csv = 'Nomen;Haus;house, home\nNomen;Baum;tree\n;Leer;\nVerb;gehen;to go\n';
  await page.getByTestId('import-file').setInputFiles({
    name: 'vokabeln.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  const dialog = page.getByRole('dialog', { name: 'Karten importieren' });
  await expect(dialog.getByRole('radio', { name: 'Semikolon' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByRole('switch', { name: 'Erste Zeile ist Kopfzeile' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const preview = dialog.getByTestId('import-preview');
  await expect(preview.locator('tbody tr').first()).toContainText('Nomen');

  await dialog.getByTestId('map-front').selectOption({ label: 'Spalte 2: Haus' });
  await dialog.getByTestId('map-back').selectOption({ label: 'Spalte 3: house, home' });
  await dialog.getByTestId('map-tags').selectOption({ label: 'Spalte 1: Nomen' });
  await expect(preview.locator('tbody tr').first()).toContainText('Haus');
  await expect(preview.locator('tbody tr').first()).toContainText('house, home');
  await expect(preview.locator('tbody tr').nth(2)).toContainText('Zeile 3: Rückseite fehlt');
  await expect(dialog.getByTestId('import-summary')).toHaveText(
    '3 Karten erkannt · 1 fehlerhafte Zeile',
  );

  // Another delimiter re-parses (here: nonsense, one column).
  await dialog.getByRole('radio', { name: 'Komma' }).click();
  await expect(dialog.getByTestId('import-summary')).toContainText('fehlerhafte');
  await dialog.getByRole('radio', { name: 'Semikolon' }).click();
  await expect(dialog.getByTestId('import-summary')).toHaveText(
    '3 Karten erkannt · 1 fehlerhafte Zeile',
  );
  await dialog.getByTestId('map-front').selectOption({ label: 'Spalte 2: Haus' });
  await dialog.getByTestId('map-back').selectOption({ label: 'Spalte 3: house, home' });
  await dialog.getByTestId('map-tags').selectOption({ label: 'Spalte 1: Nomen' });

  await dialog.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText('3 Karten importiert');
  await expect(page.getByText('3 Karten importiert · 1 übersprungen')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText('house, home');
  await expect(page.getByRole('group', { name: 'Nach Tag filtern' })).toContainText('Nomen');
  expect(problems).toEqual([]);
});

/** Janne's real cards (project folder of the cloud sessions, not part of the repository). */
const VWL_CSV = '/mnt/project-files/karten/vwl-makro-karten.csv';

test('csv: the real VWL file imports into a new project from the start page', async ({ page }) => {
  test.skip(!existsSync(VWL_CSV), 'VWL file only available in the cloud session');
  const problems = collectConsoleProblems(page);
  const csv = await readFile(VWL_CSV);
  await page.goto('./#/projects');
  await page.getByTestId('import-file').setInputFiles({
    name: 'vwl-makro-karten.csv',
    mimeType: 'text/csv',
    buffer: csv,
  });
  const dialog = page.getByRole('dialog', { name: 'Karten importieren' });
  await expect(dialog.getByTestId('import-target')).toHaveValue('__new');
  await expect(dialog.getByTestId('import-new-name')).toHaveValue('vwl-makro-karten');
  await dialog.getByTestId('import-new-name').fill('VWL Makro');
  await expect(dialog.getByTestId('import-summary')).toHaveText('138 Karten erkannt');
  await dialog.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText('138 Karten importiert');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await page.getByRole('link', { name: 'VWL Makro öffnen' }).click();
  await expect(rows(page)).toHaveCount(138);
  expect(problems).toEqual([]);
});

test('paste several cards from the card editor', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await createProject(page, 'Japanisch');
  await page.getByRole('button', { name: 'Erste Karte anlegen' }).click();
  await page.getByTestId('paste-many').click();
  const dialog = page.getByRole('dialog', { name: 'Mehrere Karten einfügen' });
  await dialog.getByTestId('paste-text').fill('犬\tHund\n猫\tKatze\n鳥\tVogel');
  await expect(dialog.getByRole('radio', { name: 'Tabulator' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByTestId('import-preview').locator('tbody tr')).toHaveCount(3);
  await dialog.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText('3 Karten importiert');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(rows(page)).toHaveCount(3);
  expect(problems).toEqual([]);
});

test('json: export a project and import it again as a new project', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await disableShare(page);
  await createProject(page, 'Spanisch');
  await page.getByTestId('import-file').setInputFiles({
    name: 'es.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('front,back\nhola,hallo\ngracias,danke\n'),
  });
  await page.getByTestId('import-confirm').click();
  await page.getByRole('button', { name: 'Fertig' }).click();

  await page.getByRole('button', { name: 'Exportieren' }).click();
  const exportDialog = page.getByRole('dialog', { name: '„Spanisch“ exportieren' });
  await expect(exportDialog.getByTestId('export-file')).toContainText(
    /synapse-spanisch-\d{4}-\d{2}-\d{2}\.json/,
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportDialog.getByTestId('export-confirm').click(),
  ]);
  const json = await readFile(await download.path());
  const file = JSON.parse(json.toString('utf-8')) as {
    format: string;
    cards: unknown[];
    settings: unknown[];
  };
  expect(file.format).toBe('synapse');
  expect(file.cards).toHaveLength(2);
  expect(file.settings).toEqual([]);

  // CSV export of the same project.
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await exportDialog.getByRole('radio', { name: 'CSV' }).click();
  await expect(exportDialog.getByTestId('export-file')).toContainText('.csv');
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    exportDialog.getByTestId('export-confirm').click(),
  ]);
  const csv = (await readFile(await csvDownload.path())).toString('utf-8');
  expect(csv).toContain('front,back,notes,tags');
  expect(csv).toContain('hola,hallo');

  // Import on the start page: the name exists → choose "Als neues Projekt".
  await page.goto('./#/projects');
  // The project page (with its own import input) must be gone first.
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await expect(page.getByTestId('import-file')).toHaveCount(1);
  await page.getByTestId('import-file').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: json,
  });
  const dialog = page.getByRole('dialog', { name: 'Synapse-Datei importieren' });
  await expect(dialog.getByTestId('json-summary')).toHaveText('1 Projekt · 2 Karten');
  await expect(dialog).toContainText('„Spanisch“ gibt es schon');
  await dialog.getByRole('radio', { name: 'Als neues Projekt' }).click();
  await dialog.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText(
    '„Spanisch (2)“ angelegt (2 Karten)',
  );
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('link', { name: 'Spanisch (2) öffnen' })).toBeVisible();

  // Merging the same file again adds nothing.
  await page.getByTestId('import-file').setInputFiles({
    name: 'again.json',
    mimeType: 'application/json',
    buffer: json,
  });
  await dialog.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText('0 Karten importiert');
  await expect(page.getByTestId('import-result')).toContainText('2 doppelte Karten übersprungen');
  expect(problems).toEqual([]);
});

test('broken files show a clear error', async ({ page }) => {
  await page.goto('./#/projects');
  await page.getByTestId('import-file').setInputFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"synapse","version":1,"kind":"export","cards":[]}'),
  });
  await expect(page.getByTestId('import-error')).toContainText('Die Datei ist beschädigt');
  await page.getByRole('button', { name: 'Schließen' }).last().click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'fremd.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"deck": []}'),
  });
  await expect(page.getByTestId('import-error')).toContainText('stammt nicht aus Synapse');
});

test('drag & drop of a file opens the import', async ({ page }) => {
  await page.goto('./#/projects');
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['front;back\nA;B'], 'drop.csv', { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: data, cancelable: true }));
  });
  await expect(page.getByTestId('drop-overlay')).toBeVisible();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['front;back\nA;B'], 'drop.csv', { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
  });
  await expect(page.getByTestId('drop-overlay')).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Karten importieren' })).toContainText('drop.csv');
  await expect(page.getByTestId('import-summary')).toHaveText('1 Karte erkannt');
});

test('10,000 rows: parsed in the worker with progress, UI stays responsive', async ({ page }) => {
  test.setTimeout(90_000);
  await createProject(page, 'Groß');
  const lines = ['front,back,notes,tags'];
  for (let i = 0; i < 10_000; i++) {
    lines.push(`"Frage ${i}, lang genug","Antwort ${i}","Notiz ""${i}""",Tag${i % 7}`);
  }
  lines.push('ohne Rückseite,');
  // Measure the longest gap between animation frames while parsing.
  await page.evaluate(() => {
    const w = window as unknown as { __maxGap: number };
    w.__maxGap = 0;
    let last = performance.now();
    const tick = (now: number) => {
      w.__maxGap = Math.max(w.__maxGap, now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId('import-file').setInputFiles({
    name: 'gross.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(lines.join('\n')),
  });
  await expect(page.getByTestId('import-summary')).toHaveText(
    '10000 Karten erkannt · 1 fehlerhafte Zeile',
    { timeout: 30_000 },
  );
  const parseGap = await page.evaluate(() => (window as unknown as { __maxGap: number }).__maxGap);
  expect(parseGap).toBeLessThan(500);
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-result')).toContainText('10000 Karten importiert', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('import-invalid')).toContainText('Zeile 10002: Rückseite fehlt');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByTestId('card-count')).toHaveText('10000 Karten');
});

test('backups: snapshot, export, restore and reminder', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.addInitScript(() => {
    const shared: string[] = [];
    (window as unknown as { __shared: string[] }).__shared = shared;
    Object.defineProperty(Navigator.prototype, 'canShare', {
      configurable: true,
      value: (data: { files?: File[] }) => Boolean(data.files?.length),
    });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: (data: { files: File[] }) => {
        shared.push(...data.files.map((f) => `${f.name}:${f.type}:${f.size}`));
        return Promise.resolve();
      },
    });
  });
  await createProject(page, 'Japanisch');
  await page.getByTestId('import-file').setInputFiles({
    name: 'ja.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('front;back\n犬;Hund\n猫;Katze\n'),
  });
  await page.getByTestId('import-confirm').click();
  await page.getByRole('button', { name: 'Fertig' }).click();

  // An old export makes the reminder appear on the start page.
  await setSetting(page, 'backup.lastExportedAt', '2026-01-01T00:00:00.000Z');
  await page.goto('./#/projects');
  const reminder = page.getByTestId('backup-reminder');
  await expect(reminder).toContainText('Tage alt');
  await reminder.getByRole('button', { name: 'Jetzt sichern' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Backup exportieren' });
  await expect(exportDialog.getByTestId('export-file')).toContainText(
    /synapse-backup-\d{4}-\d{2}-\d{2}\.json/,
  );
  await exportDialog.getByRole('button', { name: 'Teilen / Sichern' }).click();
  await expect(page.getByText('Datei gesichert')).toBeVisible();
  await expect(reminder).toBeHidden();
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatch(/^synapse-backup-.*\.json:application\/json:\d+$/);

  // Settings: manual snapshot, then delete the project and restore the snapshot.
  await page.goto('./#/settings');
  const section = page.getByTestId('settings-backups');
  await expect(section.getByTestId('last-export')).not.toHaveText('noch nie');
  await section.getByTestId('snapshot-now').click();
  await expect(page.getByText('Sicherung erstellt')).toBeVisible();
  const list = section.getByTestId('snapshot-list');
  await expect(list.getByRole('listitem').first()).toContainText('1 Projekt · 2 Karten');

  await page.goto('./#/projects');
  await page.getByRole('button', { name: 'Aktionen für Japanisch' }).click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('link', { name: 'Japanisch öffnen' })).toHaveCount(0);

  await page.goto('./#/settings');
  await list
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: 'Wiederherstellen' })
    .click();
  const confirm = page.getByRole('alertdialog', { name: 'Alle Daten ersetzen?' });
  await expect(confirm).toContainText('Vorher wird automatisch eine Sicherung');
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: 'Ersetzen & neu laden' }).click(),
  ]);
  await page.goto('./#/projects');
  await expect(page.getByRole('link', { name: 'Japanisch öffnen' })).toBeVisible();
  await page.goto('./#/settings');
  await expect(list).toContainText('Vor Wiederherstellung');
  expect(problems).toEqual([]);
});

test('restore from a backup file', async ({ page }) => {
  await disableShare(page);
  await createProject(page, 'Alt');
  await page.goto('./#/settings');
  await page.getByTestId('backup-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Backup exportieren' }).getByTestId('export-confirm').click(),
  ]);
  const backup = await readFile(await download.path());

  await createProject(page, 'Neu');
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: backup,
  });
  const confirm = page.getByRole('alertdialog', { name: 'Alle Daten ersetzen?' });
  await expect(confirm).toContainText(download.suggestedFilename());
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: 'Ersetzen & neu laden' }).click(),
  ]);
  await page.goto('./#/projects');
  await expect(page.getByRole('link', { name: 'Alt öffnen' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Neu öffnen' })).toHaveCount(0);
});
