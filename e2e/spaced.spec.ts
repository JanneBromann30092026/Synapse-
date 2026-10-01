import { expect, test, type Page } from '@playwright/test';

const DAY = 24 * 60 * 60 * 1000;
const CARDS = [
  { front: 'Hund', back: 'dog' },
  { front: 'Katze', back: 'cat' },
  { front: 'Vogel', back: 'bird' },
];

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

async function createProject(page: Page) {
  await page.goto('./#/projects');
  await page.getByRole('button', { name: 'Erstes Projekt anlegen' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Tiere');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await page.getByRole('link', { name: 'Tiere öffnen' }).click();
  await page.getByRole('button', { name: 'Erste Karte anlegen' }).click();
  const editor = page.getByRole('dialog', { name: 'Karten hinzufügen' });
  for (const card of CARDS) {
    await editor.getByTestId('card-front').fill(card.front);
    await editor.getByTestId('card-back').fill(card.back);
    await editor.getByTestId('card-back').press('Enter');
    await expect(editor.getByTestId('card-front')).toHaveValue('');
  }
  await editor.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByTestId('card-count')).toHaveText('3 Karten');
}

const phase = (page: Page) => page.getByTestId('study-surface');
const prompt = async (page: Page) =>
  (await page.getByTestId('study-card').last().getByTestId('study-prompt').textContent()) ?? '';

/** Self assessment by key: only "Katze" is not known. */
async function answerCurrent(page: Page, expected: 'presenting' | 'roundComplete') {
  const known = (await prompt(page)) !== 'Katze';
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  await page.keyboard.press(known ? 'r' : 'f');
  await expect(phase(page)).toHaveAttribute('data-phase', expected);
}

async function openSetup(page: Page) {
  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await expect(page.getByTestId('study-setup')).toBeVisible();
  await page.getByTestId('study-setup').getByRole('radio', { name: 'Selbstbewertung' }).click();
}

test('spaced repetition: new cards, due tomorrow, a due round', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  await createProject(page);
  await expect(page.getByTestId('due-summary')).toHaveText('Heute nichts fällig· 3 neu');

  // Round 1: all three cards are new, the "Fällig" round includes them.
  await openSetup(page);
  const setup = page.getByTestId('study-setup');
  await expect(setup.getByRole('radio', { name: 'Fällig (3)' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('study-scope-hint')).toContainText('0 Karten zur Wiederholung');
  await page.getByTestId('study-start').click();
  await answerCurrent(page, 'presenting');
  await answerCurrent(page, 'presenting');
  await answerCurrent(page, 'roundComplete');
  await page.getByRole('button', { name: 'Zurück zum Projekt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tiere' })).toBeVisible();
  await expect(page.getByTestId('due-summary')).toHaveText(
    'Heute nichts fällig · nächste Wiederholung morgen',
  );

  // Nothing due today: the setup offers all cards instead.
  await openSetup(page);
  await expect(setup.getByRole('radio', { name: 'Alle (3)' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await setup.getByRole('radio', { name: 'Fällig (0)' }).click();
  await expect(page.getByTestId('study-scope-hint')).toHaveText(
    'Heute ist nichts fällig. Nächste Wiederholung morgen.',
  );
  await expect(page.getByTestId('study-start')).toBeDisabled();

  // Two days later only the forgotten card is due.
  await page.clock.setSystemTime(Date.now() + 2 * DAY);
  await page.goto('./#/projects');
  await expect(page.getByTestId('project-due')).toHaveText('1 fällig');
  await page.getByRole('link', { name: 'Tiere öffnen' }).click();
  await expect(page.getByTestId('due-summary')).toHaveText('1 Karte fällig');
  await openSetup(page);
  await expect(setup.getByRole('radio', { name: 'Fällig (1)' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('study-start').click();
  await expect(page.getByTestId('study-position')).toContainText('Runde 1 · 1 / 1');
  expect(await prompt(page)).toBe('Katze');

  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});
