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

const cards = (page: Page) => page.getByTestId('project-card');
const cardNames = (page: Page) => cards(page).getByRole('heading', { level: 2 }).allTextContents();

async function createProject(page: Page, name: string, options: { color?: string } = {}) {
  const trigger = page
    .getByRole('button', { name: /Neues Projekt|Erstes Projekt anlegen/ })
    .first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Neues Projekt' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill(name);
  if (options.color) await dialog.getByRole('radio', { name: options.color }).click();
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`„${name}“ angelegt`)).toBeVisible();
}

async function openMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `Aktionen für ${name}`, exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('create, edit, archive and delete projects', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./#/projects');
  await expect(page.getByRole('heading', { name: 'Noch keine Projekte' })).toBeVisible();

  // Validation: the name is required.
  await page.getByRole('button', { name: 'Erstes Projekt anlegen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neues Projekt' });
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dialog.getByText('Bitte gib einen Namen ein.')).toBeVisible();

  // Create with description, color and icon; the preview follows the input.
  await dialog.getByLabel('Name').fill('Japanisch');
  await dialog.getByLabel('Beschreibung').fill('Vokabeln und Kanji');
  await dialog.getByRole('radio', { name: 'Smaragd' }).click();
  await dialog.getByRole('radio', { name: 'languages' }).click();
  await expect(
    dialog.getByRole('heading', { level: 2, name: 'Japanisch', includeHidden: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByText('„Japanisch“ angelegt')).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).getByText('Vokabeln und Kanji')).toBeVisible();
  await expect(cards(page).getByText('0 Karten')).toBeVisible();

  await page.reload();
  await expect(cards(page)).toHaveCount(1);

  // Edit via the "⋯" menu.
  await openMenu(page, 'Japanisch');
  await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
  const edit = page.getByRole('dialog', { name: 'Projekt bearbeiten' });
  await expect(edit.getByLabel('Name')).toHaveValue('Japanisch');
  await edit.getByLabel('Name').fill('Japanisch N5');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(edit).toHaveCount(0);
  await expect.poll(() => cardNames(page)).toEqual(['Japanisch N5']);

  // Archive hides the project; the filter shows it again.
  await openMenu(page, 'Japanisch N5');
  await page.getByRole('menuitem', { name: 'Archivieren' }).click();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Archivierte anzeigen/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).getByText('Archiviert')).toBeVisible();
  await openMenu(page, 'Japanisch N5');
  await page.getByRole('menuitem', { name: 'Wiederherstellen' }).click();
  await expect(cards(page).getByText('Archiviert')).toHaveCount(0);

  // Delete asks for confirmation.
  await openMenu(page, 'Japanisch N5');
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  const confirm = page.getByRole('alertdialog', { name: '„Japanisch N5“ löschen?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByText('„Japanisch N5“ gelöscht')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Noch keine Projekte' })).toBeVisible();

  expect(problems).toEqual([]);
});

test('search, open and reorder projects', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./#/projects');
  await createProject(page, 'Alpha', { color: 'Himmelblau' });
  await createProject(page, 'Beta', { color: 'Rose' });
  await createProject(page, 'Gamma');
  await expect.poll(() => cardNames(page)).toEqual(['Alpha', 'Beta', 'Gamma']);

  await page.getByRole('searchbox', { name: 'Projekte suchen' }).fill('et');
  await expect.poll(() => cardNames(page)).toEqual(['Beta']);
  await page.getByRole('searchbox', { name: 'Projekte suchen' }).fill('');
  await expect(cards(page)).toHaveCount(3);

  // Drag Gamma onto Alpha's position (mouse sensor), grabbing the lower half of the card.
  const from = await cards(page).nth(2).boundingBox();
  const to = await cards(page).nth(0).boundingBox();
  if (!from || !to) throw new Error('cards not visible');
  const grab = { x: from.x + from.width / 2, y: from.y + from.height * 0.6 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 10, grab.y + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.6, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => cardNames(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
  await page.reload();
  await expect.poll(() => cardNames(page)).toEqual(['Gamma', 'Alpha', 'Beta']);

  // Tapping a card opens the project.
  await page.getByRole('link', { name: 'Beta öffnen' }).click();
  await expect(page).toHaveURL(/#\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Beta' })).toBeVisible();

  expect(problems).toEqual([]);
});

test('touch: long press opens the menu, long press and move reorders', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./#/projects');
  await createProject(page, 'Eins');
  await createProject(page, 'Zwei');
  await expect.poll(() => cardNames(page)).toEqual(['Eins', 'Zwei']);

  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  const centerOf = async (index: number) => {
    const box = await cards(page).nth(index).boundingBox();
    if (!box) throw new Error('card not visible');
    return { x: box.x + box.width / 2, y: box.y + box.height * 0.6 };
  };

  // Long press without moving → action menu, no navigation.
  const first = await centerOf(0);
  await touch('touchStart', first.x, first.y);
  await page.waitForTimeout(600);
  await touch('touchEnd');
  await expect(page.getByRole('menu', { name: 'Aktionen für Eins' })).toBeVisible();
  await expect(page).toHaveURL(/#\/projects$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Long press, then drag the second card onto the first.
  const second = await centerOf(1);
  await touch('touchStart', second.x, second.y);
  await page.waitForTimeout(600);
  for (let i = 1; i <= 12; i += 1) {
    await touch(
      'touchMove',
      second.x + ((first.x - second.x) * i) / 12,
      second.y + ((first.y - second.y) * i) / 12,
    );
  }
  await touch('touchEnd');
  await expect.poll(() => cardNames(page)).toEqual(['Zwei', 'Eins']);
  await expect(page).toHaveURL(/#\/projects$/);

  expect(problems).toEqual([]);
});
