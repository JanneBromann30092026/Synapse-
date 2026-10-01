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

const CARDS = [
  { front: 'Hund', back: 'dog' },
  { front: 'Katze', back: 'cat' },
  { front: 'Vogel', back: 'bird' },
];

const phase = (page: Page) => page.getByTestId('study-surface');

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

/** Self assessment of every card of the round: only `known` fronts count as known. */
async function playRound(page: Page, known: string[]) {
  for (let i = 0; i < CARDS.length; i += 1) {
    await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');
    const prompt =
      (await page.getByTestId('study-card').last().getByTestId('study-prompt').textContent()) ?? '';
    await page.getByRole('button', { name: 'Aufdecken' }).click();
    await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
    await page.keyboard.press(known.includes(prompt) ? 'r' : 'f');
    await expect(phase(page)).not.toHaveAttribute('data-phase', 'selfAssessing');
  }
  await expect(phase(page)).toHaveAttribute('data-phase', 'roundComplete');
}

test('stats: empty state, mastery after two rounds and a round with the hardest cards', async ({
  page,
}) => {
  // Two full rounds and a cross-project round take close to the default 30 s.
  test.setTimeout(60_000);
  const problems = collectConsoleProblems(page);
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });

  await page.goto('./#/stats');
  await expect(page.getByRole('heading', { name: 'Noch keine Statistik' })).toBeVisible();

  await createProject(page);
  // Unstudied cards: all "neu", gray dots.
  await expect(page.getByTestId('mastery-dot')).toHaveCount(3);
  await expect(page.locator('[data-testid="mastery-dot"][data-level="new"]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await page.getByTestId('study-setup').getByRole('radio', { name: 'Selbstbewertung' }).click();
  await page.getByTestId('study-start').click();
  await playRound(page, []);
  await page.keyboard.press('3');
  await playRound(page, ['Hund']);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/projects\//);

  // Project page: Hund wrong → right = im Aufbau; Katze and Vogel twice wrong = schwach.
  const dots = page.getByTestId('mastery-dot');
  await expect(page.locator('[data-testid="mastery-dot"][data-level="weak"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="mastery-dot"][data-level="building"]')).toHaveCount(1);
  await expect(
    page.getByRole('img', { name: /Beherrschungsgrad: Neu: 0, Schwach: 2/ }),
  ).toBeVisible();
  const hund = page.getByTestId('card-row').filter({ hasText: 'Hund' });
  await hund.getByTestId('mastery-dot').click();
  await expect(page.getByRole('tooltip')).toContainText('Im Aufbau · 59 % · 2 Antworten');
  await expect(dots).toHaveCount(3);

  await page.goto('./#/stats');
  await expect(page.getByTestId('kpi-cards')).toHaveText('3');
  await expect(page.getByTestId('kpi-today')).toHaveText('6');
  await expect(page.getByTestId('kpi-streak')).toHaveText('1 Tag');
  await expect(page.getByTestId('kpi-weak')).toContainText('2');
  await expect(page.getByTestId('kpi-building')).toContainText('1');

  // Heatmap: today has 6 answers; tapping shows date and count.
  const busy = page.locator('[data-testid="activity-heatmap"] button[data-count="6"]');
  await expect(busy).toHaveCount(1);
  await busy.click();
  await expect(page.getByTestId('activity-detail')).toContainText('6 Antworten');

  const hardest = page.getByTestId('stats-hardest');
  await expect(hardest.getByRole('listitem')).toHaveCount(3);
  await expect(hardest.getByRole('listitem').last()).toContainText('Hund');
  await expect(page.getByTestId('stats-projects')).toContainText('Tiere');

  // "Diese Karten lernen": a cross-project round with exactly these cards.
  await page.getByRole('button', { name: 'Diese Karten lernen' }).click();
  await expect(page).toHaveURL(/#\/study\/cross\?cards=/);
  const setup = page.getByTestId('study-setup');
  await expect(page.getByRole('dialog')).toContainText('3 Karten');
  await setup.getByRole('radio', { name: 'Selbstbewertung' }).click();
  await page.getByTestId('study-start').click();
  await expect(page.getByText('Schwierigste Karten')).toBeVisible();
  await playRound(page, ['Hund', 'Katze', 'Vogel']);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/stats$/);
  await expect(page.getByTestId('kpi-today')).toHaveText('9');

  const sessions = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('synapse');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const request = open.result
            .transaction('studySessions')
            .objectStore('studySessions')
            .getAll();
          request.onsuccess = () =>
            resolve((request.result as { projectId: string }[]).map((s) => s.projectId));
        };
      }),
  );
  expect(sessions.filter((id) => id === 'cross')).toHaveLength(1);
  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});
