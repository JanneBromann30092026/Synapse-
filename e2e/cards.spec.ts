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

async function loadDemoData(page: Page) {
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await expect(page.getByTestId('project-count')).toHaveText('3');
}

async function openProject(page: Page, name: string) {
  await page.goto('./#/projects');
  await page.getByRole('link', { name: `${name} öffnen` }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('quick entry: keyboard flow, IME safety, tags and duplicates', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./#/projects');
  await page.getByRole('button', { name: 'Erstes Projekt anlegen' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Japanisch');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await page.getByRole('link', { name: 'Japanisch öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Noch keine Karten' })).toBeVisible();

  await page.getByRole('button', { name: 'Erste Karte anlegen' }).click();
  const editor = page.getByRole('dialog', { name: 'Karten hinzufügen' });
  const front = editor.getByTestId('card-front');
  const back = editor.getByTestId('card-back');
  await expect(front).toBeFocused();

  // Return on the front jumps to the back, Return on the back saves and starts the next card.
  await front.fill('家');
  await front.press('Enter');
  await expect(back).toBeFocused();
  await back.fill('Haus; Heim; Zuhause');
  await editor.getByLabel('Tags').fill('Nomen');
  await editor.getByLabel('Tags').press('Enter');
  await back.press('Enter');
  await expect(editor.getByText('1 Karte in dieser Sitzung hinzugefügt')).toBeVisible();
  await expect(front).toHaveValue('');
  await expect(front).toBeFocused();
  // Tags stay for the next card.
  await expect(editor.getByRole('button', { name: 'Tag „Nomen“ entfernen' })).toBeVisible();

  // IME composition: Enter / Cmd+Enter must not act while composing Japanese text.
  await front.fill('ねこ');
  await front.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(front).toBeFocused();
  await back.fill('Katze');
  await back.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, keyCode: 229 });
  await back.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(editor.getByText('1 Karte in dieser Sitzung hinzugefügt')).toBeVisible();
  await expect(front).toHaveValue('ねこ');

  // Hardware keyboard shortcut.
  await back.press('Control+Enter');
  await expect(editor.getByText('2 Karten in dieser Sitzung hinzugefügt')).toBeVisible();

  // Katakana is a different word than hiragana: no duplicate.
  await front.fill('  ネコ ');
  await back.fill('Katze');
  await back.press('Enter');
  await expect(editor.getByText('3 Karten in dieser Sitzung hinzugefügt')).toBeVisible();
  // Duplicate warning (normalized: whitespace, case, full-/half-width).
  await front.fill(' ねこ ');
  await back.fill('Katze');
  await editor.getByRole('button', { name: 'Speichern & nächste' }).click();
  await expect(editor.getByRole('alert')).toContainText('gibt es in diesem Projekt schon');
  await editor.getByRole('button', { name: 'Trotzdem speichern' }).click();
  await expect(editor.getByText('4 Karten in dieser Sitzung hinzugefügt')).toBeVisible();

  // Validation.
  await front.fill('犬');
  await editor.getByRole('button', { name: 'Speichern & nächste' }).click();
  await expect(editor.getByText('Bitte eine Rückseite eingeben.')).toBeVisible();

  await back.fill('Hund');
  await editor.getByRole('button', { name: 'Fertig' }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('card-count')).toHaveText('5 Karten');
  await expect(rows(page).first()).toContainText('Haus · Heim · Zuhause');

  await page.reload();
  await expect(rows(page)).toHaveCount(5);
  expect(problems).toEqual([]);
});

test('demo data, search, tag filter, edit, swipe, grid and selection', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await loadDemoData(page);
  // Loading again must not create duplicates.
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await expect(page.getByText('Demo-Daten sind schon vorhanden')).toBeVisible();
  await expect(page.getByTestId('project-count')).toHaveText('3');

  await openProject(page, 'BWL-Grundbegriffe');
  await expect(page.getByTestId('card-count')).toHaveText('30 Karten');

  // Search (debounced) and tag filter.
  await page.getByRole('searchbox', { name: 'Karten durchsuchen' }).fill('eigenkapital');
  await expect.poll(() => rows(page).count()).toBeLessThan(10);
  await expect(rows(page).filter({ hasText: 'Eigenkapitalquote' })).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Karten durchsuchen' }).fill('');
  await page
    .getByRole('group', { name: 'Nach Tag filtern' })
    .getByRole('button', { name: 'Marketing' })
    .click();
  await expect.poll(() => rows(page).count()).toBe(3);
  await page
    .getByRole('group', { name: 'Nach Tag filtern' })
    .getByRole('button', { name: 'Alle' })
    .click();
  await expect.poll(() => rows(page).count()).toBe(30);

  // Edit by tapping a row.
  await rows(page)
    .filter({ has: page.getByText('Skonto', { exact: true }) })
    .getByRole('button')
    .first()
    .click();
  const editor = page.getByRole('dialog', { name: 'Karte bearbeiten' });
  await expect(editor.getByTestId('card-front')).toHaveValue('Skonto');
  await editor.getByTestId('card-back').fill('Preisnachlass bei schneller Zahlung; Skontoabzug');
  await editor.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Karte gespeichert')).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'Skontoabzug' })).toHaveCount(1);

  // Swipe left (real touch events) reveals delete.
  const row = rows(page).filter({ has: page.getByText('Fixkosten', { exact: true }) });
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (!box) throw new Error('row not visible');
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + box.width * 0.6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX - (200 * i) / 12, y }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await row.getByRole('button', { name: 'Löschen' }).click();
  await page
    .getByRole('alertdialog', { name: 'Karte löschen?' })
    .getByRole('button', { name: 'Löschen' })
    .click();
  await expect(page.getByText('Karte gelöscht')).toBeVisible();
  await expect(page.getByTestId('card-count')).toHaveText('29 Karten');

  // Grid view: tapping flips the card.
  await page.getByRole('button', { name: 'Rasteransicht' }).click();
  const tile = page.getByTestId('card-tile').first().getByRole('button').first();
  await expect(tile).toHaveAttribute('aria-pressed', 'false');
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Listenansicht' }).click();

  // Selection: move two cards, delete one.
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await rows(page).nth(0).getByRole('button').first().click();
  await rows(page).nth(1).getByRole('button').first().click();
  await expect(page.getByText('2 ausgewählt')).toBeVisible();
  await page.getByRole('button', { name: 'Verschieben' }).click();
  const move = page.getByRole('dialog', { name: '2 Karten verschieben' });
  await move.getByLabel('Zielprojekt').selectOption({ label: 'Aktien & Börse' });
  await move.getByRole('button', { name: 'Verschieben' }).click();
  await expect(page.getByText('2 Karten nach „Aktien & Börse“ verschoben')).toBeVisible();
  await expect(page.getByTestId('card-count')).toHaveText('27 Karten');

  // Moved rows animate out first.
  await expect(rows(page)).toHaveCount(27);
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await rows(page).nth(0).getByRole('button').first().click();
  await expect(page.getByText('1 ausgewählt')).toBeVisible();
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: '1 Karte löschen?' })
    .getByRole('button', { name: 'Löschen' })
    .click();
  await expect(page.getByTestId('card-count')).toHaveText('26 Karten');

  await openProject(page, 'Aktien & Börse');
  await expect(page.getByTestId('card-count')).toHaveText('32 Karten');
  expect(problems).toEqual([]);
});
